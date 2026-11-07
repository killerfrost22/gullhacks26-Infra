import type {
  Coordinates,
  Investigation,
  InvestigationRequest,
  LocationContext,
  PublishedContact,
  SourceLink,
} from '../../shared/types.js';
import { ApiError } from '../errors.js';
import type { PageTransport, Resolver } from './fetch-page.js';
import {
  createInteraction,
  DEFAULT_GEMINI_MODEL,
  readInteraction,
  RecitationBlockedError,
  researchFailed,
  researchUnavailable,
  type CallOptions,
  type GroundedOutput,
} from './gemini.js';
import { FORMAT_INSTRUCTION, formatInput, RESEARCH_INSTRUCTION, researchInput } from './prompt.js';
import { hostOf, isSearchRedirect, modelNamedHostAllowed, trustedCampusHost, type UrlRuleContext } from './provenance.js';
import { draftJsonSchema, draftSchema, type Draft } from './schema.js';
import { scrubFreeText, type VerifiedValues } from './scrub.js';
import {
  cleanQuote,
  findPage,
  findRepairInbox,
  loadPages,
  quoteOnPage,
  urlKey,
  verifyEmail,
  verifyPhone,
  type LoadedPage,
  type LoadOptions,
  type PageRequest,
} from './verify.js';

export interface InvestigateOptions {
  signal?: AbortSignal;
  /** Map facts for the pin. The pipeline waits at most ~4 s for it, then continues without (context: null). */
  getContext?: (point: Coordinates, signal?: AbortSignal) => Promise<LocationContext>;
}

/** Everything the pipeline touches outside itself, so tests can run it offline. */
export interface ResearchDeps {
  env: NodeJS.ProcessEnv;
  /** Used for Gemini calls. */
  fetch: typeof fetch;
  /** DNS for the page loader's public-address checks. */
  resolve: Resolver;
  /** HTTP for loading cited pages. */
  pageTransport: PageTransport;
  now: () => Date;
  contextWaitMs: number;
  budgetMs: number;
  pageTimeoutMs: number;
  /** Optional phase timings (ms), e.g. for a smoke run. */
  onPhase?: (phase: string, ms: number) => void;
}

export const CONTEXT_WAIT_MS = 4_000;
export const BUDGET_MS = 45_000;
const MAX_SEARCH_PAGES = 10;
const MAX_NAMED_PAGES = 6;
const MAX_SOURCES = 8;

const WARN_BEST_MATCH =
  "Best match. Worth a quick check: we couldn't find a sentence on an official page that proves this office covers this exact spot.";
const WARN_DAYTIME =
  "This photo looks like it was taken in daylight, and your note doesn't say the light is out. Add when you saw it out (for example, \"dark every night this week\") so the office knows what to check.";
const WARN_NO_CONTEXT =
  "Map facts for this spot didn't load in time, so this answer is based on the photo, the address, and your note.";
const WARN_PARTIAL_CONTEXT =
  "Some map facts didn't load, so this answer may be missing road, campus, or municipal-boundary details.";
const REASON_UNIDENTIFIED =
  "We couldn't identify the office that maintains this exact spot, so we're not naming one. The map facts show the municipality, county, and road we found.";
// Used when the model's own wording had to be removed because it carried unverified contacts or links.
const REASON_CONFIRMED_NEUTRAL = 'An official page we loaded says this office covers this spot. See the sources below.';
const REASON_BEST_MATCH_NEUTRAL = 'This is our best match for the office that covers this spot. Check the sources below.';
const TITLE_NEUTRAL = 'Problem to report';
const SUMMARY_NEUTRAL = 'See the photo for what needs fixing.';

async function waitForContext(
  getContext: InvestigateOptions['getContext'],
  point: Coordinates,
  signal: AbortSignal,
  waitMs: number,
): Promise<LocationContext | null> {
  if (!getContext) return null;
  const wait = AbortSignal.any([signal, AbortSignal.timeout(waitMs)]);
  if (wait.aborted) return null;
  // tsconfig targets ES2023, so no Promise.withResolvers.
  const gaveUp = new Promise<null>((resolve) => wait.addEventListener('abort', () => resolve(null), { once: true }));
  return Promise.race([getContext(point, wait).catch(() => null), gaveUp]);
}

const UNKNOWN = /^(?:unknown|none|n\/?a|not (?:known|found|sure)|unclear|null)\.?$/i;
const known = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed && !UNKNOWN.test(trimmed) ? trimmed : null;
};

function urlsInText(text: string): string[] {
  return [...new Set([...text.matchAll(/https?:\/\/[^\s<>"'`)\]|]+/g)].map((match) => match[0].replace(/[.,;:!?]+$/, '')))];
}

function parseDraft(text: string): Draft {
  const json = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw researchFailed();
  }
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) throw researchFailed();
  return parsed.data;
}

export async function runInvestigation(
  request: InvestigationRequest,
  options: InvestigateOptions,
  deps: ResearchDeps,
): Promise<Investigation> {
  const apiKey = deps.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw researchUnavailable();
  const model = deps.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const budget = AbortSignal.timeout(deps.budgetMs);
  const signal = options.signal ? AbortSignal.any([options.signal, budget]) : budget;
  // Every step honours `signal`, but a stuck one (a socket that never closes) must not outlive the budget either.
  const stopped = new Promise<never>((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  try {
    return await Promise.race([investigateWithin(request, options, deps, { apiKey, fetch: deps.fetch, signal }, model), stopped]);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (error instanceof ApiError) throw error;
    console.warn(
      budget.aborted
        ? `[research] gave up after ${deps.budgetMs} ms`
        : `[research] failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
    throw researchFailed();
  }
}

async function investigateWithin(
  request: InvestigationRequest,
  options: InvestigateOptions,
  deps: ResearchDeps,
  call: CallOptions,
  model: string,
): Promise<Investigation> {
  const { signal } = call;
  let mark = Date.now();
  const phase = (name: string) => {
    const now = Date.now();
    deps.onPhase?.(name, now - mark);
    mark = now;
  };

  const point = { latitude: request.location.latitude, longitude: request.location.longitude };
  const context = await waitForContext(options.getContext, point, signal, deps.contextWaitMs);
  signal.throwIfAborted();
  phase('context');

  // ---- research (search grounding + URL context); one no-quote retry if blocked for recitation
  let noQuote = false;
  const research = async (): Promise<GroundedOutput> =>
    readInteraction(
      await createInteraction(
        {
          model,
          system_instruction: RESEARCH_INSTRUCTION,
          input: researchInput(request, context, noQuote),
          tools: [{ type: 'google_search' }, { type: 'url_context' }],
          // Measured live on Nov 7: `low` answered in ~5 s; `medium` plus mandatory URL-context reads took ~44 s,
          // nearly the whole 45 s budget.
          generation_config: { thinking_level: 'low' },
        },
        call,
      ),
    );
  let grounded: GroundedOutput;
  try {
    grounded = await research();
  } catch (error) {
    if (!(error instanceof RecitationBlockedError)) throw error;
    noQuote = true;
    grounded = await research();
  }
  if (!grounded.text) throw researchFailed();
  phase('research');

  // ---- load cited pages while the format call runs
  const campusHost = trustedCampusHost(context?.campus?.website);
  const searchSources = grounded.searchSources.slice(0, MAX_SEARCH_PAGES);
  const searchKeys = new Set(searchSources.map((source) => urlKey(source.url)));
  const rules: UrlRuleContext = {
    searchHosts: new Set(
      searchSources.filter((s) => !isSearchRedirect(s.url)).flatMap((s) => hostOf(s.url) ?? []),
    ),
    campusHost,
  };
  const loadOptions: LoadOptions = {
    resolve: deps.resolve,
    transport: deps.pageTransport,
    signal,
    campusHost,
    timeoutMs: deps.pageTimeoutMs,
  };
  const attempted = new Set<string>();
  const namedRequests = (urls: string[]): PageRequest[] => {
    const requests: PageRequest[] = [];
    for (const url of urls) {
      const key = urlKey(url);
      const host = hostOf(url);
      if (!key || !host || attempted.has(key) || searchKeys.has(key)) continue;
      if (!modelNamedHostAllowed(host, rules)) continue;
      attempted.add(key);
      requests.push({ url, searchReturned: false });
      if (requests.length >= MAX_NAMED_PAGES) break;
    }
    return requests;
  };
  for (const source of searchSources) attempted.add(urlKey(source.url) ?? source.url);
  const firstRound = loadPages(
    [
      ...searchSources.map((s) => ({ url: s.url, searchReturned: true, searchTitle: s.title })),
      ...namedRequests([...urlsInText(grounded.text), ...grounded.modelNamedUrls]),
    ],
    loadOptions,
  );

  const sourceIds = searchSources.map((source, index) => ({ id: `S${index + 1}`, ...source }));
  const format = async (): Promise<Draft> => {
    const interaction = await createInteraction(
      {
        model,
        system_instruction: FORMAT_INSTRUCTION,
        input: formatInput(grounded.text, sourceIds, noQuote),
        response_format: { type: 'text', mime_type: 'application/json', schema: draftJsonSchema() },
        generation_config: { thinking_level: 'minimal' },
      },
      call,
    );
    return parseDraft(readInteraction(interaction).text);
  };
  const formatted = (async () => {
    try {
      return await format();
    } catch (error) {
      if (!(error instanceof RecitationBlockedError)) throw error;
      noQuote = true;
      return format();
    }
  })();
  // Settle both before deciding, so a format failure doesn't leave page loads running unobserved.
  const [pagesResult, draftResult] = await Promise.allSettled([firstRound, formatted]);
  if (draftResult.status === 'rejected') throw draftResult.reason;
  if (pagesResult.status === 'rejected') throw pagesResult.reason;
  const draft = draftResult.value;
  let pages = pagesResult.value;
  phase('format+pages');

  // Hosts behind Google's redirect links are known only now.
  for (const page of pages) if (page.searchReturned) rules.searchHosts.add(page.host);

  // ---- pages the draft names that weren't loaded yet
  const refUrl = (ref: string | null): string | null => {
    const value = known(ref);
    if (!value) return null;
    const id = value.match(/^S(\d+)$/i);
    if (id) return sourceIds[Number(id[1]) - 1]?.url ?? null;
    const url = urlsInText(value)[0];
    return url ?? null;
  };
  const refs = {
    coverage: refUrl(draft.coverageSource),
    reporting: refUrl(draft.reportingPage),
    website: refUrl(draft.officialWebsite),
    email: refUrl(draft.emailSource),
    phone: refUrl(draft.phoneSource),
  };
  const draftSourceUrls = draft.sources.map(refUrl).filter((url): url is string => url !== null);
  const secondRound = namedRequests(
    [...Object.values(refs), ...draftSourceUrls].filter((url): url is string => url !== null),
  );
  if (secondRound.length) {
    pages = [...pages, ...(await loadPages(secondRound, loadOptions))];
    phase('more pages');
  }

  // Search pages always count; a model-named page counts only if where it actually landed passes the URL rules.
  const kept = pages.filter((page) => page.searchReturned || modelNamedHostAllowed(page.host, rules));
  const official = kept.filter((page) => page.official);

  // ---- responsibility. Naming an office needs at least one loaded official page behind it; otherwise say we don't know.
  const organization = official.length > 0 ? known(draft.organization) : null;
  const quote = known(draft.coverageQuote);
  let evidence: Investigation['responsibility']['evidence'] = null;
  let evidencePage: LoadedPage | undefined;
  if (organization && quote && !noQuote) {
    const cited = findPage(kept, refs.coverage);
    const candidates = cited?.official ? [cited, ...official.filter((page) => page !== cited)] : official;
    evidencePage = candidates.find((page) => quoteOnPage(quote, page));
    if (evidencePage) evidence = { url: evidencePage.url, quote: cleanQuote(quote) };
  }

  // The reporting link must be an official page that loaded; a news or SEO page is not "the office's form".
  const reportingPage = organization ? findPage(official, refs.reporting) : undefined;
  const websitePage = organization ? findPage(kept, refs.website) : undefined;
  let email: PublishedContact | null = null;
  let phone: PublishedContact | null = null;
  if (organization) {
    email = verifyEmail(known(draft.email), findPage(kept, refs.email), official);
    phone = verifyPhone(known(draft.phone), findPage(kept, refs.phone), official);
    if (!email) {
      const officeHosts = [evidencePage, reportingPage, websitePage]
        .filter((page): page is LoadedPage => page?.official === true)
        .map((page) => page.host);
      const preferred = [evidencePage, reportingPage, websitePage].filter((page): page is LoadedPage => !!page);
      email = findRepairInbox([...new Set([...preferred, ...official])], officeHosts);
    }
  }

  // ---- sources: pages that loaded, most relevant first. Notes are written here, never taken from the model,
  // because a model's description of a page is a claim nobody checked.
  const notes = new Map<LoadedPage, string>();
  const note = (page: LoadedPage | undefined, text: string) => {
    if (page && !notes.has(page)) notes.set(page, text);
  };
  note(evidencePage, 'Has the sentence that shows who covers this spot.');
  note(reportingPage, reportingPage?.official ? 'Official page for reporting this.' : 'Page for reporting this.');
  const emailPage = email ? findPage(kept, email.sourceUrl) : undefined;
  const phonePage = phone ? findPage(kept, phone.sourceUrl) : undefined;
  note(emailPage, 'Lists the email address.');
  note(phonePage, 'Lists the phone number.');
  if (websitePage?.official) note(websitePage, "The office's own website.");
  const listed = draftSourceUrls.flatMap((url) => findPage(kept, url) ?? []);
  const contactPages = [emailPage, phonePage].filter((page): page is LoadedPage => !!page);
  const ordered = [
    ...new Set([
      ...[evidencePage, reportingPage, websitePage].filter((page): page is LoadedPage => !!page),
      ...contactPages,
      ...listed,
      ...kept.filter((page) => page.official),
      ...kept,
    ]),
  ];
  const seenUrls = new Set<string>();
  const sources: SourceLink[] = [];
  for (const page of ordered) {
    const key = urlKey(page.url) ?? page.url;
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    sources.push({
      title: (page.title ?? page.searchTitle ?? page.host).slice(0, 160),
      url: page.url,
      note: notes.get(page) ?? null,
      official: page.official,
    });
    if (sources.length >= MAX_SOURCES) break;
  }

  // ---- warnings
  const warnings: string[] = [];
  if (organization && !evidence) warnings.push(WARN_BEST_MATCH);
  if (draft.issue.kind === 'streetlight' && draft.photoLooksDaytime === true && draft.noteSaysLightIsOut !== true) {
    warnings.push(WARN_DAYTIME);
  }
  if (!context) warnings.push(WARN_NO_CONTEXT);
  else if (context.partial) warnings.push(WARN_PARTIAL_CONTEXT);

  // ---- model-written text may not carry contacts or links the server didn't verify
  const verified: VerifiedValues = {
    email: email?.value ?? null,
    phone: phone?.value ?? null,
    urls: [...sources.map((source) => source.url), ...(evidence ? [evidence.url] : []), ...(reportingPage ? [reportingPage.url] : [])],
  };
  const scrub = (text: string | null) => (text ? scrubFreeText(text, verified) : null);
  const observations = draft.issue.observations
    .flatMap((item) => scrub(item) ?? [])
    .slice(0, 4);
  const reason =
    scrub(draft.reason) ?? (evidence ? REASON_CONFIRMED_NEUTRAL : REASON_BEST_MATCH_NEUTRAL);
  return {
    issue: {
      kind: draft.issue.kind,
      title: scrub(draft.issue.title) ?? TITLE_NEUTRAL,
      summary: scrub(draft.issue.summary) ?? SUMMARY_NEUTRAL,
      observations,
    },
    responsibility: organization
      ? {
          verdict: evidence ? 'confirmed' : 'best_match',
          organization,
          department: scrub(known(draft.department)),
          reason,
          evidence,
          reportingUrl: reportingPage?.url ?? null,
          email,
          phone,
        }
      : {
          verdict: 'unidentified',
          organization: null,
          department: null,
          reason: REASON_UNIDENTIFIED,
          evidence: null,
          reportingUrl: null,
          email: null,
          phone: null,
        },
    sources,
    warnings,
    searchSuggestionsHtml: grounded.searchSuggestionsHtml,
    context,
    generatedAt: deps.now().toISOString(),
  };
}
