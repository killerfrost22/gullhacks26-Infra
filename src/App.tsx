import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check, LoaderCircle, MapPin, TriangleAlert, X } from 'lucide-react';
import type { Investigation, LocationContext, PreparedPhoto, SelectedLocation, ServiceHealth } from '../shared/types';
import { PhotoInput } from './components/PhotoInput';
import { LocationPicker } from './components/LocationPicker';
import { DetailsPrompt } from './components/DetailsPrompt';
import { ContextChips } from './components/ContextChips';
import { ResultView } from './components/ResultView';
import { LogoMark } from './components/Logo';
import { RequestError, requestJson } from './lib/api';
import { fetchLocationContext } from './lib/context';
import { createEmailDraft, type EmailDraft } from './lib/email';
import { useBotCheck } from './lib/useBotCheck';
import { shortPlace } from './lib/place';

const friendlyErrors: Record<string, string> = {
  RESEARCH_RATE_LIMITED: 'That’s a lot of reports in a short time. Give it a few minutes and try again.',
  RESEARCH_TIMEOUT: 'That took too long on our end. Try again.',
  RESEARCH_QUOTA: 'We’ve hit our lookup limit for now. Try again a bit later.',
  RESEARCH_NOT_CONFIGURED: 'Report lookup is offline right now.',
  RESEARCH_AUTH_FAILED: 'Report lookup is offline right now.',
  CAPTCHA_INVALID: 'The security check timed out. Tap the button again.',
  CAPTCHA_REQUIRED: 'The security check timed out. Tap the button again.',
  INVALID_PHOTO: 'That photo didn’t come through. Try choosing it again.',
  INVALID_INPUT: 'Something in the report didn’t look right. Check the pin and try again.',
};

/** Server messages are written for developers; people get a plain sentence and a next step. */
function describeFailure(cause: unknown): string {
  if (cause instanceof RequestError) {
    if (cause.code && friendlyErrors[cause.code]) return friendlyErrors[cause.code];
    if (cause.code?.startsWith('RESEARCH_')) return 'We couldn’t finish the lookup this time. Try again; it usually works on the second go.';
    return cause.message;
  }
  // Our own checks throw plain Errors with readable messages; anything else is a bug, not something to show people.
  if (cause instanceof Error && cause.constructor === Error) return cause.message;
  console.error(cause);
  return 'Something went wrong on our side. Try again in a moment.';
}

function StepHead({ n, id, title, subtitle, done, action }: { n: number; id: string; title: string; subtitle?: string; done: boolean; action?: ReactNode }) {
  return (
    <header className="step-head">
      <div className={`step-badge${done ? ' is-done' : ''}`} aria-hidden="true">
        {done ? <Check size={16} strokeWidth={2.5} /> : <span>0{n}</span>}
      </div>
      <div className="step-title-wrap">
        <h2 id={id}>{title}</h2>
        {subtitle && <span className="step-subtitle">{subtitle}</span>}
      </div>
      {action}
    </header>
  );
}

/** What the server is doing during the single research request, paced to its typical timing. */
function Working({ road, onCancel }: { road: string | null; onCancel: () => void }) {
  const [stage, setStage] = useState(0);
  const stages = [
    'Analyzing damage & visual hazards in photo',
    `Checking map boundaries & road records for ${road ?? 'this spot'}`,
    'Searching municipal portals & HOA registries',
    'Composing verified report & contact details',
  ];
  useEffect(() => {
    const timers = [1300, 3100, 5400].map((delay, index) => window.setTimeout(() => setStage(index + 1), delay));
    return () => timers.forEach(window.clearTimeout);
  }, []);
  return (
    <div className="working" role="status" aria-live="polite">
      <div className="scanner-glow" aria-hidden="true" />
      <div className="working-header">
        <div className="scanner-badge">
          <span className="pulse-ring" />
          <span>INVESTIGATION IN PROGRESS</span>
        </div>
        <span className="working-step-count">STEP {Math.min(stage + 1, 4)} OF 4</span>
      </div>
      <ol className="working-stages">
        {stages.map((label, index) => (
          <li key={label} className={index < stage ? 'done' : index === stage ? 'active' : ''}>
            <span className="stage-icon">
              {index < stage ? <Check size={15} strokeWidth={2.5} aria-hidden="true" /> : index === stage ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <span className="stage-dot" aria-hidden="true" />}
            </span>
            <span className="stage-label">{label}</span>
          </li>
        ))}
      </ol>
      <div className="working-footer">
        <button type="button" className="btn-link working-cancel" onClick={onCancel}>Cancel investigation</button>
      </div>
    </div>
  );
}

export function App() {
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [context, setContext] = useState<LocationContext | null>(null);
  const [details, setDetails] = useState('');
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Investigation | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const privacyDialog = useRef<HTMLDialogElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const locationStep = useRef<HTMLElement>(null);
  const detailsStep = useRef<HTMLElement>(null);
  const hasPhoto = Boolean(photo);
  const confirmed = Boolean(photo && location?.confirmed);
  const { takeToken, warmUp } = useBotCheck(confirmed);

  useEffect(() => {
    const controller = new AbortController();
    requestJson<ServiceHealth>('/api/health', { signal: controller.signal })
      .then((health) => setOffline(!health.researchConfigured))
      .catch(() => undefined);
    return () => { controller.abort(); requestController.current?.abort(); };
  }, []);

  const confirmedLatitude = location?.confirmed ? location.latitude : undefined;
  const confirmedLongitude = location?.confirmed ? location.longitude : undefined;
  useEffect(() => {
    setContext(null);
    if (confirmedLatitude === undefined || confirmedLongitude === undefined) return;
    const controller = new AbortController();
    fetchLocationContext(confirmedLatitude, confirmedLongitude, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setContext(value); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [confirmedLatitude, confirmedLongitude]);

  useEffect(() => { if (hasPhoto) locationStep.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [hasPhoto]);
  useEffect(() => { if (confirmed) detailsStep.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [confirmed]);

  const updatePhoto = useCallback((value: PreparedPhoto | null) => {
    setPhoto(value);
    setLocation(null);
    setError('');
    setReport(null);
    setDraft(null);
  }, []);

  const updateLocation = useCallback((value: SelectedLocation | null) => {
    setLocation(value);
    setError('');
    setReport(null);
    setDraft(null);
  }, []);

  async function investigate() {
    if (!photo || !location?.confirmed || busy) return;
    const controller = new AbortController();
    requestController.current = controller;
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({
        photoDataUrl: photo.dataUrl,
        location: { latitude: location.latitude, longitude: location.longitude, label: location.label, address: location.address },
        details: details.trim(),
      });
      let result: Investigation | null = null;
      for (let attempt = 0; !result; attempt += 1) {
        const token = await takeToken();
        controller.signal.throwIfAborted();
        try {
          result = await requestJson<Investigation>('/api/investigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Captcha-Token': token },
            signal: controller.signal,
            body,
          });
        } catch (cause) {
          // A warm proof goes stale if the server restarted; one fresh proof fixes that.
          if (attempt === 0 && cause instanceof RequestError && cause.code === 'CAPTCHA_INVALID') continue;
          throw cause;
        }
      }
      setReport(result);
      setDraft(createEmailDraft(result, details));
      window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(controller.signal.aborted ? 'Stopped. Everything you entered is still here.' : describeFailure(cause));
    } finally {
      setBusy(false);
      requestController.current = null;
      warmUp();
    }
  }

  function startOver() {
    updatePhoto(null);
    setDetails('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="container header-inner">
          <a className="brand" href="/" aria-label="fixplease.app, start over" onClick={(event) => { event.preventDefault(); startOver(); }}>
            <LogoMark size={36} />
            <div className="brand-text">
              <span className="wordmark">fixplease<span>.app</span></span>
              <span className="brand-badge">CIVIC AI</span>
            </div>
          </a>
          <nav className="header-nav" aria-label="Site">
            <div className="nav-status-pill fine-only">
              <span className="status-dot-active" />
              <span>AI Grounding Active</span>
            </div>
            <button type="button" className="btn-link" onClick={() => privacyDialog.current?.showModal()}>Privacy & Transparency</button>
          </nav>
        </div>
      </header>

      {offline && <p className="offline-banner" role="status">Report lookup is offline right now: the server has no Gemini API key.</p>}

      <main id="main">
        {report && draft && photo ? (
          <div className="container">
            <ResultView
              report={report}
              photo={photo}
              draft={draft}
              onDraftChange={setDraft}
              onEdit={() => { setReport(null); setDraft(null); }}
              onStartOver={startOver}
            />
          </div>
        ) : (
          <div className="container landing">
            <section className="intro" aria-labelledby="intro-title">
              <div className="hero-eyebrow">
                <span className="eyebrow-dot" />
                <span>CIVIC INFRASTRUCTURE INTELLIGENCE · GEMINI POWERED</span>
              </div>
              <h1 id="intro-title">See something broken? <mark>Snap it.</mark> We’ll find who fixes it.</h1>
              <p className="lede">Potholes, broken streetlights, cracked walkways, or HOA common area hazards. Drop a photo and pin — our AI searches live municipal records, highway divisions, and HOA registries to locate who is responsible and draft your report.</p>
              <ol className="how">
                <li><span><strong>Capture</strong> a clear photo from safety.</span></li>
                <li><span><strong>Pinpoint</strong> the exact coordinates on the map.</span></li>
                <li><span><strong>Dispatch</strong> our AI-drafted report to the right team.</span></li>
              </ol>
            </section>

            <div className="flow">
              <section className="card step" aria-labelledby="step-photo">
                <StepHead n={1} id="step-photo" title="Snap the problem" subtitle="Photo evidence stripped of private tracking" done={hasPhoto} />
                <PhotoInput value={photo} onChange={updatePhoto} disabled={busy} />
              </section>

              {photo && (
                <section ref={locationStep} className="card step" aria-labelledby="step-where">
                  <StepHead
                    n={2} id="step-where" title="Pin the spot" subtitle="Match coordinates to municipal & highway jurisdictions" done={confirmed}
                    action={location?.confirmed && !busy ? <button type="button" className="btn-link step-action" onClick={() => updateLocation({ ...location, confirmed: false })}>Change spot</button> : undefined}
                  />
                  {location?.confirmed ? (
                    <div className="confirmed-spot">
                      <p className="location-label"><MapPin size={18} aria-hidden="true" /><span>{shortPlace(location)}</span></p>
                      <ContextChips context={context} />
                    </div>
                  ) : (
                    <LocationPicker value={location} onChange={updateLocation} photoGps={photo.gps} disabled={busy} />
                  )}
                </section>
              )}

              {confirmed && (
                <>
                  <section ref={detailsStep} className="card step" aria-labelledby="step-details">
                    <StepHead n={3} id="step-details" title="Guide the AI" subtitle="Optional hints, HOA names, or landmarks to aid research" done={false} />
                    <DetailsPrompt value={details} onChange={setDetails} context={context} disabled={busy} />
                  </section>

                  <div className="submit-area">
                    {busy ? (
                      <Working road={context?.road?.name || context?.road?.ref || location?.address?.street || null} onCancel={() => requestController.current?.abort()} />
                    ) : (
                      <>
                        {error && <div className="notice notice-error" role="alert"><TriangleAlert size={18} aria-hidden="true" /><span>{error}</span></div>}
                        <button type="button" className="btn btn-sign btn-block btn-xl btn-cta" onClick={() => { void investigate(); }}>
                          <span>Investigate & Find Office</span>
                          <ArrowRight size={22} aria-hidden="true" />
                        </button>
                        <p className="fine-print">
                          Your photo, pin, and note go to Google Gemini to identify the problem and search official sites. For adults 18+.{' '}
                          <button type="button" className="btn-link" onClick={() => privacyDialog.current?.showModal()}>How we handle it</button>
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <p>fixplease.app · Map data © OpenStreetMap contributors</p>
        </div>
      </footer>

      <dialog ref={privacyDialog} className="privacy-dialog" aria-labelledby="privacy-title" onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
        <div className="dialog-body">
          <div className="dialog-head">
            <h2 id="privacy-title">How we handle your report</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={() => privacyDialog.current?.close()}><X size={20} aria-hidden="true" /></button>
          </div>
          <dl>
            <dt>Your photo</dt>
            <dd>We shrink it on your phone and strip its hidden data (including location) before it leaves your device.</dd>
            <dt>What gets sent</dt>
            <dd>The photo, your pin, and your note go to Google Gemini, which identifies the problem and searches official sites. Google may keep search-backed requests for up to 30 days under its API terms. Don’t include anything private.</dd>
            <dt>What we keep</dt>
            <dd>Nothing. No accounts and no database. Close the tab and it’s gone.</dd>
            <dt>Maps</dt>
            <dd>Address lookup and map tiles come from OpenStreetMap, which sees your IP address and the area you’re viewing.</dd>
            <dt>Bot check</dt>
            <dd>A small puzzle runs quietly on your device. No third-party CAPTCHA, no tracking.</dd>
            <dt>Sending</dt>
            <dd>We never send email for you. You review it and send it from your own account.</dd>
          </dl>
          <button type="button" className="btn btn-primary btn-block" onClick={() => privacyDialog.current?.close()}>Got it</button>
        </div>
      </dialog>
    </>
  );
}
