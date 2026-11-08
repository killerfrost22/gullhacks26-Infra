import { useMemo, useState } from 'react';
import { Copy, Download, ImageDown, LoaderCircle, Mail, Share2 } from 'lucide-react';
import { buildEmlFile, buildMailto, type EmailDraft } from '../lib/email';
import type { PreparedPhoto } from '../lib/photo';

function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface EmailComposerProps {
  initial: EmailDraft;
  /** `null` when the user reported without a photo: nothing here then mentions one. */
  photo: PreparedPhoto | null;
  reportingUrl: string | null;
}

export function EmailComposer({ initial, photo, reportingUrl }: EmailComposerProps) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);

  const photoFile = useMemo(
    () => (photo ? new File([photo.blob], photo.fileName, { type: photo.blob.type || 'image/jpeg' }) : null),
    [photo],
  );
  // With a photo, sharing needs file support; without one, any Web Share works for the text.
  const canShare = useMemo(() => {
    try {
      if (photoFile) return typeof navigator.canShare === 'function' && navigator.canShare({ files: [photoFile] });
      return typeof navigator.share === 'function';
    } catch {
      return false;
    }
  }, [photoFile]);

  function update(field: keyof EmailDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function share() {
    setBusy('share');
    setStatus('');
    try {
      await navigator.share(
        photoFile
          ? { files: [photoFile], title: draft.subject, text: draft.body }
          : { title: draft.subject, text: draft.body },
      );
      setStatus(draft.to ? `Shared. Check the To line says ${draft.to}.` : 'Shared.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setStatus('Sharing didn’t work on this device. Download the email instead.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy('download');
    setStatus('');
    try {
      saveFile(await buildEmlFile(draft, photo ? { blob: photo.blob, fileName: photo.fileName } : null));
      setStatus(
        photo
          ? 'Email downloaded. Open the .eml file in your mail app; the photo is attached.'
          : 'Email downloaded. Open the .eml file in your mail app.',
      );
    } catch {
      setStatus('We couldn’t build the email file. Copy the text instead.');
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    const text = `${draft.to ? `To: ${draft.to}\n` : ''}Subject: ${draft.subject}\n\n${draft.body}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(
        photo ? 'Copied the email. The photo isn’t included; save it and attach it yourself.' : 'Copied the email.',
      );
    } catch {
      setStatus('Your browser blocked copying. Select the message and copy it yourself.');
    }
  }

  return (
    <section className="result-block composer" aria-labelledby="composer-title">
      <h3 id="composer-title" className="block-title">
        Your email
      </h3>
      <p className="block-lede">Read it, change anything you like, then send it yourself. We never send it for you.</p>

      <div className="composer-fields">
        <div className="field">
          <label className="field-label" htmlFor="mail-to">
            To
          </label>
          <input
            id="mail-to"
            className="input"
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={draft.to}
            aria-describedby={draft.to ? undefined : 'mail-to-hint'}
            onChange={(event) => update('to', event.target.value)}
          />
          {!draft.to && (
            <p className="field-hint" id="mail-to-hint">
              We didn’t find a published email for this office.
              {reportingUrl ? ' Their report form is linked above.' : ''} Add an address only if you found it on their
              own site.
            </p>
          )}
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mail-subject">
            Subject
          </label>
          <input
            id="mail-subject"
            className="input"
            type="text"
            value={draft.subject}
            onChange={(event) => update('subject', event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mail-body">
            Message
          </label>
          <textarea
            id="mail-body"
            className="textarea composer-body"
            rows={12}
            value={draft.body}
            onChange={(event) => update('body', event.target.value)}
          />
        </div>
      </div>

      <ul role="list" className="send-options">
        {canShare && (
          <li>
            <button type="button" className="btn btn--primary btn--lg" onClick={share} disabled={busy !== null}>
              {busy === 'share' ? (
                <LoaderCircle size={22} className="spin" aria-hidden="true" />
              ) : (
                <Share2 size={22} aria-hidden="true" />
              )}
              {photo ? 'Send with photo' : 'Share'}
            </button>
            <p>
              {photo
                ? 'Opens your share sheet with the photo attached. Pick your mail app and check the To line.'
                : 'Opens your share sheet with the email text. Pick your mail app and check the To line.'}
            </p>
          </li>
        )}
        <li>
          <button
            type="button"
            className={canShare ? 'btn' : 'btn btn--primary btn--lg'}
            onClick={download}
            disabled={busy !== null}
          >
            {busy === 'download' ? (
              <LoaderCircle size={22} className="spin" aria-hidden="true" />
            ) : (
              <Download size={22} aria-hidden="true" />
            )}
            Download email
          </button>
          <p>
            {photo
              ? 'A ready-to-send .eml file with the photo attached. Open it in your mail app.'
              : 'A ready-to-send .eml file. Open it in your mail app.'}
          </p>
        </li>
        <li>
          <a className="btn" href={buildMailto(draft)}>
            <Mail size={22} aria-hidden="true" />
            Open mail app
          </a>
          {photoFile ? (
            <p>
              The photo won’t be attached this way.{' '}
              <button type="button" className="inline-link" onClick={() => saveFile(photoFile)}>
                <ImageDown size={16} aria-hidden="true" />
                Save the photo
              </button>{' '}
              and add it yourself.
            </p>
          ) : (
            <p>Starts a new email in your mail app with the To line, subject, and message filled in.</p>
          )}
        </li>
        <li>
          <button type="button" className="btn" onClick={copy}>
            <Copy size={22} aria-hidden="true" />
            Copy
          </button>
          <p>Copies the To line, subject, and message as text.</p>
        </li>
      </ul>
      <p className="composer-status" role="status">
        {status}
      </p>
    </section>
  );
}
