import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Mail, Phone, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { Investigation, LocationContext, Place, SourceLink } from '../../shared/types';
import { createEmailDraft } from '../lib/email';
import type { PreparedPhoto } from '../lib/photo';
import { ContextChips } from './ContextChips';
import { EmailComposer } from './EmailComposer';
import { SearchSuggestions } from './SearchSuggestions';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const STAMP: Record<'confirmed' | 'best_match', string> = {
  confirmed: 'Confirmed on an official site',
  best_match: 'Best match. Worth a quick check.',
};

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
      <ArrowUpRight size={16} aria-hidden="true" className="ext-icon" />
      <span className="visually-hidden"> (opens in a new tab)</span>
    </a>
  );
}

interface ResultViewProps {
  report: Investigation;
  place: Place;
  details: string;
  photo: PreparedPhoto;
  /** Map facts the app loaded for the pin, used when the report carries none. */
  pinContext: LocationContext | null;
  onStartOver: () => void;
}

export function ResultView({ report, place, details, photo, pinContext, onStartOver }: ResultViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { responsibility: r } = report;
  const draft = useMemo(
    () => createEmailDraft({ report, place, details, photoFileName: photo.fileName }),
    [report, place, details, photo.fileName],
  );
  const context = report.context ?? pinContext;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result-verdict" data-verdict={r.verdict}>
        <p className="kicker">Who fixes it</p>
        {r.verdict === 'unidentified' || r.organization === null ? (
          <>
            <h2 id="result-title" className="display result-org" tabIndex={-1} ref={headingRef}>
              We couldn’t identify the office
            </h2>
            <p className="result-reason">
              We won’t guess a name. Here’s what the map says about this spot, so you know where to start looking.
            </p>
            {context ? (
              <ContextChips context={context} />
            ) : (
              <p className="context-note">No map facts arrived for this spot either.</p>
            )}
          </>
        ) : (
          <>
            <p className="stamp" data-verdict={r.verdict}>
              {r.verdict === 'confirmed' && <ShieldCheck size={20} aria-hidden="true" />}
              {STAMP[r.verdict]}
            </p>
            <h2 id="result-title" className="display result-org" tabIndex={-1} ref={headingRef}>
              {r.organization}
            </h2>
            {r.department && <p className="result-dept">{r.department}</p>}
            <p className="result-reason">{r.reason}</p>
          </>
        )}
      </div>

      {r.evidence && (
        <figure className="result-block evidence">
          <figcaption className="block-title">The proof</figcaption>
          <blockquote cite={r.evidence.url}>
            <p>{r.evidence.quote}</p>
          </blockquote>
          <p className="evidence-source">
            Word for word on <ExternalLink href={r.evidence.url}>{hostOf(r.evidence.url)}</ExternalLink>
          </p>
        </figure>
      )}

      {(r.email || r.phone || r.reportingUrl) && (
        <section className="result-block" aria-labelledby="contact-title">
          <h3 id="contact-title" className="block-title">
            How to reach them
          </h3>
          <ul role="list" className="contacts">
            {r.reportingUrl && (
              <li className="contact contact--form">
                <ExternalLink href={r.reportingUrl} className="btn btn--ink">
                  Open their report form
                </ExternalLink>
                <span className="contact-source">on {hostOf(r.reportingUrl)}</span>
              </li>
            )}
            {r.email && (
              <li className="contact">
                <Mail size={20} aria-hidden="true" />
                <div>
                  <a href={`mailto:${r.email.value}`} className="contact-value">
                    {r.email.value}
                  </a>
                  <p className="contact-source">
                    Published on <ExternalLink href={r.email.sourceUrl}>{hostOf(r.email.sourceUrl)}</ExternalLink>
                  </p>
                </div>
              </li>
            )}
            {r.phone && (
              <li className="contact">
                <Phone size={20} aria-hidden="true" />
                <div>
                  <a href={`tel:${r.phone.value.replace(/[^\d+]/g, '')}`} className="contact-value">
                    {r.phone.value}
                  </a>
                  <p className="contact-source">
                    Published on <ExternalLink href={r.phone.sourceUrl}>{hostOf(r.phone.sourceUrl)}</ExternalLink>
                  </p>
                </div>
              </li>
            )}
          </ul>
        </section>
      )}

      <section className="result-block" aria-labelledby="issue-title">
        <h3 id="issue-title" className="block-title">
          What’s in your photo
        </h3>
        <p className="issue-title">{report.issue.title}</p>
        <p>{report.issue.summary}</p>
      </section>

      {report.warnings.length > 0 && (
        <section className="result-block warnings" aria-labelledby="warnings-title">
          <h3 id="warnings-title" className="block-title">
            Before you send
          </h3>
          <ul role="list">
            {report.warnings.map((warning) => (
              <li key={warning}>
                <TriangleAlert size={18} aria-hidden="true" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.sources.length > 0 && <Sources sources={report.sources} />}

      {report.searchSuggestionsHtml && <SearchSuggestions html={report.searchSuggestionsHtml} />}

      <EmailComposer initial={draft} photo={photo} reportingUrl={r.reportingUrl} />

      <div className="result-restart">
        <button type="button" className="btn" onClick={onStartOver}>
          <RotateCcw size={18} aria-hidden="true" />
          Start over
        </button>
        <p>Nothing is saved. Starting over, or closing this page, clears the report.</p>
      </div>
    </section>
  );
}

function Sources({ sources }: { sources: SourceLink[] }) {
  return (
    <section className="result-block" aria-labelledby="sources-title">
      <h3 id="sources-title" className="block-title">
        How we know
      </h3>
      <p className="block-lede">Every page below loaded when we checked it during your report.</p>
      <ol role="list" className="sources">
        {sources.map((source) => (
          <li key={source.url} className="source">
            <ExternalLink href={source.url} className="source-title">
              {source.title || hostOf(source.url)}
            </ExternalLink>
            <p className="source-meta">
              <span>{hostOf(source.url)}</span>
              {source.official && <span className="badge">Official site</span>}
            </p>
            {source.note && <p className="source-note">{source.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
