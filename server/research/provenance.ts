/** Which sources, hosts, and contacts count. Pure functions; no network. */

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

const stripWww = (host: string) => host.replace(/^www\./, '');

/** Google's grounding citations point at this redirector, not at the page itself. */
export function isSearchRedirect(url: string): boolean {
  const host = hostOf(url);
  return host === 'vertexaisearch.cloud.google.com' && /^\/grounding-api-redirect\//.test(new URL(url).pathname);
}

const US_LOCAL_GOV = /(^|\.)(?:ci|co|city|cty|county|town|twp|vil|village|cog|dst)\.[a-z0-9-]+\.[a-z]{2}\.us$/;

/**
 * Public-sector hosts: `.gov`, `.mil`, `.edu`, U.S. state and locality domains (`state.md.us`, `ci.city.st.us`),
 * and common national equivalents (`gov.uk`, `gc.ca`, `ac.jp`, ...).
 */
export function isOfficialHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (/\.(?:gov|mil|edu)$/.test(h)) return true;
  if (/(^|\.)state\.[a-z]{2}\.us$/.test(h) || /(^|\.)k12\.[a-z]{2}\.us$/.test(h) || US_LOCAL_GOV.test(h)) return true;
  if (/(^|\.)(?:gov|gob|gouv|govt|gv|go|mil|edu|ac)\.[a-z]{2}$/.test(h)) return true;
  if (/(^|\.)gc\.ca$/.test(h) || /(^|\.)gov\.[a-z]{2}\.ca$/.test(h)) return true;
  return false;
}

/**
 * An email domain belongs to an office when it is the office's host (ignoring `www.`), a subdomain of it, or a
 * parent of it: `dpw.city.gov` ↔ `city.gov` match, sibling agencies `dmv.ny.gov` and `dot.ny.gov` don't.
 */
export function sameOfficeDomain(domain: string, officeHost: string): boolean {
  const d = stripWww(domain.toLowerCase().replace(/\.$/, ''));
  const h = stripWww(officeHost.toLowerCase().replace(/\.$/, ''));
  return d === h || d.endsWith(`.${h}`) || h.endsWith(`.${d}`);
}

const SHARED_PLATFORMS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'x.com',
  'twitter.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'threads.net',
  'bsky.app',
  'google.com',
  'sites.google.com',
  'wix.com',
  'wixsite.com',
  'squarespace.com',
  'wordpress.com',
  'blogspot.com',
  'weebly.com',
  'godaddysites.com',
  'medium.com',
  'tumblr.com',
  'github.io',
  'carrd.co',
  'linktr.ee',
];

/**
 * The campus website host to trust, or null. A site root on the institution's own host counts; a page on a shared
 * platform (social media, site builders, link pages) or any deeper path doesn't, because trusting its host would
 * trust everyone else on that platform.
 */
export function trustedCampusHost(website: string | null | undefined): string | null {
  if (!website) return null;
  let url: URL;
  try {
    url = new URL(website);
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.pathname !== '/') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return SHARED_PLATFORMS.some((platform) => host === platform || host.endsWith(`.${platform}`)) ? null : host;
}

/** True when `host` is the campus website's host or one of its subdomains. */
export function onCampusHost(host: string, campusHost: string | null): boolean {
  if (!campusHost) return false;
  const h = stripWww(host);
  const c = stripWww(campusHost);
  return h === c || h.endsWith(`.${c}`);
}

export interface UrlRuleContext {
  /** Hosts of pages search returned (after resolving redirects), plus hosts of direct search links. */
  searchHosts: Set<string>;
  campusHost: string | null;
}

/**
 * Whether a page the model named (search didn't return it) may count:
 * on an official domain, on a host search returned, or on the campus's own website.
 */
export function modelNamedHostAllowed(host: string, rules: UrlRuleContext): boolean {
  if (isOfficialHost(host) || onCampusHost(host, rules.campusHost)) return true;
  const bare = stripWww(host);
  for (const searchHost of rules.searchHosts) if (stripWww(searchHost) === bare) return true;
  return false;
}

/** Official = public-sector domain or the campus's own website. Only these can prove coverage or publish contacts. */
export function isOfficialPageHost(host: string, campusHost: string | null): boolean {
  return isOfficialHost(host) || onCampusHost(host, campusHost);
}

// ---------------------------------------------------------------- contacts

// Bounded quantifiers keep every scan linear on hostile page text (2 MB of letters must not take minutes).
export const EMAIL_PATTERN = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}/gi;
export const PHONE_PATTERN = /\+?\d[\d\s().\-\u2010-\u2013]{5,18}\d/g;

export function findEmails(text: string): string[] {
  return [...new Set([...text.matchAll(EMAIL_PATTERN)].map((match) => match[0].toLowerCase().replace(/\.$/, '')))];
}

/** A word in the mailbox name must start with one of these to count as a repair or service inbox. */
const REPAIR_PREFIXES = [
  'repair',
  'service',
  'maint',
  'publicworks',
  'works',
  'dpw',
  'street',
  'road',
  'pothole',
  'streetlight',
  'lighting',
  'facilit',
  '311',
  'request',
  'report',
  'operation',
  'transport',
  'highway',
  'signal',
  'workorder',
  'sidewalk',
  'forestry',
  'sanitation',
  'utilit',
  'customer',
  'helpdesk',
  'trouble',
  'outage',
  'traffic',
  'drainage',
  'stormwater',
  'infrastructure',
  'engineering',
];
const REPAIR_TOKENS = ['dot', 'pw', 'ops', 'tree', 'trees'];
/** General office inboxes a model may name when a page publishes them. Never used for the fallback inbox. */
const GENERIC_ROLES = ['info', 'contact', 'contactus', 'help', 'customerservice', 'service', 'services'];

const REJECT_SUBSTRINGS = [
  'press',
  'media',
  'news',
  'publicaffairs',
  'communications',
  'marketing',
  'webmaster',
  'admin',
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'postmaster',
  'hostmaster',
  'mailer-daemon',
  'abuse',
  'humanresources',
  'human.resources',
  'careers',
  'recruit',
  'employment',
  'hiring',
  'jobs',
  'personnel',
];
const REJECT_TOKENS = ['pr', 'pio', 'comms', 'hr', 'web', 'www', 'job', 'root'];

const localPart = (email: string) => email.toLowerCase().split('@')[0] ?? '';
const localTokens = (local: string) => local.split(/[._+-]+/).filter(Boolean);

function hasRepairWord(local: string): boolean {
  return localTokens(local).some(
    (token) => REPAIR_TOKENS.includes(token) || REPAIR_PREFIXES.some((prefix) => token.startsWith(prefix)),
  );
}

/** Press, media, HR, jobs, webmaster, web, admin, no-reply, or a personal-looking mailbox (`first.last`, `j.doe`). */
export function isRejectedMailbox(email: string): boolean {
  const local = localPart(email);
  if (REJECT_SUBSTRINGS.some((word) => local.includes(word))) return true;
  const tokens = localTokens(local);
  if (tokens.some((token) => REJECT_TOKENS.includes(token))) return true;
  if (tokens.length >= 2 && tokens.some((token) => /^[a-z]$/.test(token))) return true; // an initial: j.streeter
  return tokens.length === 2 && tokens.every((token) => /^[a-z]+$/.test(token)) && !hasRepairWord(local);
}

/** A shared repair or service inbox (`streetmaintenance@`, `dpw@`, `311@`), not a person or a press/HR/web desk. */
export function isRepairInbox(email: string): boolean {
  return !isRejectedMailbox(email) && hasRepairWord(localPart(email));
}

/** An email the model names may show only if it is a repair/service inbox or a general office inbox like `info@`. */
export function isAcceptableContactEmail(email: string): boolean {
  return isRepairInbox(email) || (GENERIC_ROLES.includes(localPart(email)) && !isRejectedMailbox(email));
}

export function emailDomain(email: string): string {
  return (email.split('@')[1] ?? '').toLowerCase();
}

/** Digits of a phone number with a leading U.S./Canada country code dropped, so `+1 (301) 555-0100` = `301-555-0100`. */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

/** A clean display number built only from digits: `(301) 555-0100`, `555-0100`, `311`, or `+44…`. */
export function formatPhone(value: string): string {
  const digits = phoneDigits(value);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length === 3) return digits;
  return value.trim().startsWith('+') ? `+${digits}` : digits;
}

/** Every phone-shaped run of digits in a text, reduced to digits. */
export function findPhoneDigits(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(PHONE_PATTERN)) {
    const digits = phoneDigits(match[0]);
    if (digits.length >= 7 && digits.length <= 15) found.add(digits);
  }
  for (const match of text.matchAll(/\b([2-9]11)\b/g)) found.add(match[1]); // N11 short codes like 311
  return found;
}
