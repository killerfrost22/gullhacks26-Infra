import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Download, ExternalLink, Globe, Mail, MapPin, Phone, RotateCcw, Share2, TriangleAlert } from 'lucide-react';
import type { Investigation, PreparedPhoto } from '../../shared/types';
import { buildEmailFile, buildMailto, photoFile, type EmailDraft } from '../lib/email';
import { ContextChips } from './ContextChips';
import { shortPlace } from '../lib/place';
import SearchSuggestions from './SearchSuggestions';

interface ResultViewProps {
  report: Investigation;
  photo: PreparedPhoto;
  draft: EmailDraft;
  onDraftChange: (draft: EmailDraft) => void;
  onEdit: () => void;
  onStartOver: () => void;
}

const verdicts: Record<Investigation['responsibility']['status'], { chip: string; heading: string }> = {
  source_supported: { chip: 'Verified on Official Site', heading: 'Here’s who fixes it.' },
  needs_review: { chip: 'Best Match · Worth Checking', heading: 'Here’s who most likely fixes it.' },
  unresolved: { chip: 'Best Guess · Local Jurisdiction', heading: 'Here’s our best guess for who fixes it.' },
};

export function ResultView({ report, photo, draft, onDraftChange, onEdit, onStartOver }: ResultViewProps) {
  const [status, setStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const { responsibility: owner, issue } = report;
  const isUnresolved = owner.status === 'unresolved' || !owner.organization;
  const verdict = isUnresolved ? verdicts.unresolved : verdicts[owner.status];

  // Compute best guess if model didn't provide a specific organization
  const fallbackOrg = report.context?.campus?.name
    ? `${report.context.campus.name} Facilities Management`
    : report.location.address?.city
      ? `City of ${report.location.address.city} Public Works`
      : report.context?.place?.county || (report.location.address as Record<string, string> | null)?.county
        ? `${report.context?.place?.county || (report.location.address as Record<string, string> | null)?.county} Department of Public Works`
        : 'Local Public Works & Roads Department';

  const organizationName = owner.organization || fallbackOrg;
  const organizationReason = owner.organization
    ? owner.reason
    : `No official web page explicitly confirmed this exact spot. Based on municipal and county jurisdiction, ${fallbackOrg} is the best point of contact for repairs here.`;
  const file = useMemo(() => photoFile(photo), [photo]);
  const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const canShare = touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  let mailto = '';
  try { mailto = buildMailto(draft); } catch { /* An invalid edited recipient disables the email-app link. */ }
  // A report form gets "Report online"; a homepage, or a cited page used as a fallback, is just the office's site.
  const officeLink = owner.reportingUrl ?? (report.sources[0]?.url ?? null);
  const officeHost = officeLink ? new URL(officeLink).hostname.replace(/^www\./, '') : '';
  const officeLabel = owner.reportingUrl && new URL(owner.reportingUrl).pathname !== '/' ? `Report online at ${officeHost}` : `Official site: ${officeHost}`;

  async function share() {
    // Start the share sheet inside the tap; the recipient goes to the clipboard so it can be pasted into To.
    const sharing = navigator.share({ files: [file], title: draft.subject, text: draft.body });
    if (draft.to) void navigator.clipboard?.writeText(draft.to).catch(() => undefined);
    try {
      await sharing;
      setStatus(draft.to ? `Recipient copied. Paste ${draft.to} into the To line.` : 'Shared. Add a recipient before you send.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus('Sharing didn’t work here. Try “Mail app” and attach the photo yourself.');
    }
  }

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([buildEmailFile(draft, photo)], { type: 'message/rfc822' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'fixplease-report.eml';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Downloaded. Open it in your email app; the photo is already attached.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The email couldn’t be saved.');
    }
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
    } catch {
      setStatus('Your browser blocked copying. Select the text and copy it instead.');
    }
  }

  return (
    <section className="result" id="result" aria-labelledby="result-title">
      <div className="result-top">
        <button type="button" className="btn-link" onClick={onEdit}><ArrowLeft size={16} aria-hidden="true" />Edit report</button>
        <h1 id="result-title" ref={heading} tabIndex={-1}>{verdict.heading}</h1>
      </div>

      <div className="result-grid">
        <article className={`card owner-card ${owner.status}`} aria-labelledby="owner-name">
          <div className="verdict-banner">
            <span className="verdict-chip">
              {owner.status === 'source_supported' ? <Check size={14} aria-hidden="true" /> : <TriangleAlert size={14} aria-hidden="true" />}
              {verdict.chip}
            </span>
          </div>
          <h2 id="owner-name">{organizationName}</h2>
          {owner.department && <p className="owner-department">{owner.department}</p>}
          <div className="owner-reason-box">
            <p className="owner-reason">{organizationReason}</p>
          </div>
          {(owner.email || owner.phone || officeLink) ? (
            <ul className="contact-list">
              {owner.email && (
                <li>
                  <a href={`mailto:${owner.email}`}>
                    <Mail size={18} aria-hidden="true" />
                    <span>{owner.email}</span>
                  </a>
                  {owner.emailSourceUrl && <a className="contact-source" href={owner.emailSourceUrl} target="_blank" rel="noreferrer">source</a>}
                </li>
              )}
              {owner.phone && (
                <li>
                  <a href={`tel:${owner.phone.replace(/[^\d+]/g, '')}`}>
                    <Phone size={18} aria-hidden="true" />
                    <span>{owner.phone}</span>
                  </a>
                </li>
              )}
              {officeLink && (
                <li>
                  <a href={officeLink} target="_blank" rel="noreferrer" className="contact-link-primary">
                    <Globe size={18} aria-hidden="true" />
                    <span>{officeLabel}</span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                </li>
              )}
            </ul>
          ) : (
            <div className="contact-fallback">
              <p className="field-hint">No direct email or phone is indexed for this entity. You can search their resident portal or dial your city 311 service.</p>
              <a
                className="btn btn-ghost btn-compact"
                href={`https://www.google.com/search?q=${encodeURIComponent(`${organizationName} report maintenance problem ${report.location.address?.city || ''}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <Globe size={16} aria-hidden="true" />
                <span>Search {organizationName} Online</span>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          )}
          {!owner.email && officeLink && <p className="field-hint owner-hint">No public email listed. Use their site above, or add an address you trust to your draft.</p>}
        </article>

        <div className="result-aside">
          <article className="card email-card" aria-labelledby="email-heading">
            <h2 id="email-heading">Your email</h2>
            <div className="field">
              <label htmlFor="email-to">To</label>
              <div className="input-with-action">
                <input id="email-to" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} value={draft.to} placeholder="Add an address you trust" onChange={(event) => onDraftChange({ ...draft, to: event.target.value })} />
                {draft.to && <button type="button" className="icon-button" aria-label="Copy address" onClick={() => { void copy(draft.to, 'Address copied.'); }}><Copy size={17} aria-hidden="true" /></button>}
              </div>
            </div>
            <div className="field">
              <label htmlFor="email-subject">Subject</label>
              <input id="email-subject" value={draft.subject} maxLength={300} onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="email-body">Message</label>
              <textarea id="email-body" className="email-body" rows={11} value={draft.body} onChange={(event) => onDraftChange({ ...draft, body: event.target.value })} />
            </div>
            <div className="attachment"><img src={photo.dataUrl} alt="" width={44} height={44} /><span>report-photo.jpg<small>Location data removed</small></span></div>
            <div className="email-actions">
              {canShare
                ? <button type="button" className="btn btn-sign btn-block" onClick={() => { void share(); }}><Share2 size={19} aria-hidden="true" />Send with photo</button>
                : <button type="button" className="btn btn-sign btn-block" onClick={download}><Download size={19} aria-hidden="true" />Download email with photo</button>}
              <div className="email-actions-row">
                {mailto ? <a className="btn btn-ghost" href={mailto}><Mail size={17} aria-hidden="true" />Mail app</a> : <span className="field-hint">Fix the address to open your mail app.</span>}
                <button type="button" className="btn btn-ghost" onClick={() => { void copy(`${draft.to ? `To: ${draft.to}\n` : ''}Subject: ${draft.subject}\n\n${draft.body}`, 'Email copied. Remember to attach the photo.'); }}><Copy size={17} aria-hidden="true" />Copy</button>
              </div>
              <p className="field-hint">{canShare ? 'Pick your mail app from the share sheet.' : 'The “Mail app” button can’t attach photos, so add it yourself.'} Nothing is sent until you hit send.</p>
            </div>
            <p className="action-status" role="status" aria-live="polite">{status}</p>
          </article>

          {report.warnings.length > 0 && (
            <aside className="card before-send" aria-labelledby="before-send-title">
              <h2 id="before-send-title"><TriangleAlert size={18} aria-hidden="true" />Before you send</h2>
              <ul>{report.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </aside>
          )}
        </div>

        <article className="card issue-card" aria-labelledby="issue-title">
          <img src={photo.dataUrl} alt="Your photo of the problem" width={photo.width} height={photo.height} />
          <div className="issue-body">
            <h2 id="issue-title">{issue.title}</h2>
            <p>{issue.summary}</p>
            <p className="issue-location"><MapPin size={16} aria-hidden="true" /><span>{shortPlace(report.location)}</span></p>
            <ContextChips context={report.context} />
          </div>
        </article>

        <article className="card sources-card" aria-labelledby="sources-title">
          <h2 id="sources-title">How we know</h2>
          {report.sources.length
            ? <ol className="source-list">{report.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ExternalLink size={13} aria-hidden="true" /></a><p>{source.note}</p><small>{new URL(source.url).hostname.replace(/^www\./, '')}</small></li>)}</ol>
            : <p className="field-hint">No official page backed this up, so double-check the recipient.</p>}
          <SearchSuggestions html={report.searchSuggestionsHtml} />
        </article>
      </div>

      <button type="button" className="btn btn-ghost start-over" onClick={onStartOver}><RotateCcw size={17} aria-hidden="true" />Report something else</button>
    </section>
  );
}
