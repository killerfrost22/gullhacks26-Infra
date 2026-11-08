import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowRight, LoaderCircle, Pencil, Siren, TriangleAlert, WifiOff } from 'lucide-react';
import { DETAILS_MIN_LENGTH_WITHOUT_PHOTO, type Health, type Place } from '../../shared/types';
import { ApiRequestError, fetchHealth, fetchLocationContext, requestInvestigation } from '../lib/api';
import { errorMessages, messageFor } from '../lib/messages';
import type { PreparedPhoto } from '../lib/photo';
import { PaintRing, RING_PATH } from '../components/Mark';
import { Link } from '../router';
import { ContextChips } from './ContextChips';
import { Investigating } from './Investigating';
import { NoteStep } from './NoteStep';
import { PhotoStep } from './PhotoStep';
import { PinStep, UNNAMED_PLACE_LABEL } from './PinStep';
import { ResultView } from './ResultView';
import { EMPTY_FLOW, type FlowState, type PinState, type Scene } from './state';

const OFFLINE_MESSAGE = errorMessages.RESEARCH_UNAVAILABLE;

function focusAndReveal(ref: RefObject<HTMLElement | null>) {
  requestAnimationFrame(() => {
    const element = ref.current;
    if (!element) return;
    element.focus({ preventScroll: true });
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  });
}

type StepStatus = 'active' | 'done' | 'locked';

interface StepProps {
  n: number;
  title: string;
  status: StepStatus;
  lockedText: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children: ReactNode;
}

function Step({ n, title, status, lockedText, headingRef, children }: StepProps) {
  return (
    <li className="step" data-status={status}>
      <span className="step-num" aria-hidden="true">
        {String(n).padStart(2, '0')}
      </span>
      <div className="step-body">
        <h2 className="step-title" tabIndex={-1} ref={headingRef}>
          <span className="visually-hidden">Step {n}: </span>
          {title}
        </h2>
        {status === 'locked' ? <p className="step-locked">{lockedText}</p> : children}
      </div>
    </li>
  );
}

const TRUST = [
  {
    title: 'A link counts only if it loads.',
    text: 'We open every page the answer cites, during your report. Pages that don’t load are dropped.',
  },
  {
    title: '“Confirmed” means word for word.',
    text: 'The sentence that shows who covers the spot has to be on that official page.',
  },
  {
    title: 'Real contacts only.',
    text: 'An email or phone number shows up only if an official page we read publishes it.',
  },
  {
    title: 'Nothing is kept.',
    text: 'No accounts, no database. Close the tab and the report is gone.',
  },
];

export function ReportFlow({ scene }: { scene?: Scene }) {
  const [state, setState] = useState<FlowState>(() => ({ ...EMPTY_FLOW, ...scene?.flow }));
  const [health, setHealth] = useState<Health | null>(scene?.health ?? null);
  const requestAbort = useRef<AbortController | null>(null);
  const contextAbort = useRef<AbortController | null>(null);
  const photoHeading = useRef<HTMLHeadingElement>(null);
  const pinHeading = useRef<HTMLHeadingElement>(null);
  const noteHeading = useRef<HTMLHeadingElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (scene?.health) return;
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch(() => {
        // Unknown health: let the user try; a failed request explains itself.
      });
    return () => controller.abort();
  }, [scene?.health]);

  useEffect(
    () => () => {
      requestAbort.current?.abort();
      contextAbort.current?.abort();
    },
    [],
  );

  const offline = health?.researchConfigured === false;
  const { photo, withoutPhoto, pin, details, phase, report, error } = state;
  // Without a photo the note is the only description of the problem, so it must say something.
  const noteMissing = !photo && details.trim().length < DETAILS_MIN_LENGTH_WITHOUT_PHOTO;

  function setPin(update: Partial<PinState>) {
    setState((current) => ({ ...current, pin: { ...current.pin, ...update } }));
  }

  function choosePhoto(next: PreparedPhoto) {
    setState((current) => ({ ...current, photo: next, withoutPhoto: false, error: null }));
    if (!pin.confirmed) focusAndReveal(pinHeading);
  }

  function skipPhoto() {
    setState((current) => ({ ...current, withoutPhoto: true, error: null }));
    focusAndReveal(pin.confirmed ? noteHeading : pinHeading);
  }

  function addPhotoAfterAll() {
    setState((current) => ({ ...current, withoutPhoto: false }));
    focusAndReveal(photoHeading);
  }

  const onPlaceResolved = useCallback((place: Place | null) => {
    setState((current) => ({ ...current, pin: { ...current.pin, place, placeResolved: true } }));
  }, []);

  function confirmPin() {
    const point = pin.point;
    if (!point) return;
    const place: Place = pin.place
      ? { ...pin.place, latitude: point.latitude, longitude: point.longitude }
      : { latitude: point.latitude, longitude: point.longitude, label: UNNAMED_PLACE_LABEL, address: null };
    setPin({ place, confirmed: true, context: null, contextLoading: true });
    focusAndReveal(noteHeading);

    contextAbort.current?.abort();
    const controller = new AbortController();
    contextAbort.current = controller;
    fetchLocationContext(point, controller.signal)
      .then((context) => setPin({ context, contextLoading: false }))
      .catch(() => {
        if (!controller.signal.aborted) setPin({ context: null, contextLoading: false });
      });
  }

  function changePin() {
    contextAbort.current?.abort();
    setPin({ confirmed: false, context: null, contextLoading: false });
    focusAndReveal(pinHeading);
  }

  async function submit() {
    if ((!photo && !withoutPhoto) || noteMissing || !pin.confirmed || !pin.place || offline) return;
    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setCancelled(false);
    setState((current) => ({ ...current, phase: 'investigating', error: null }));
    try {
      const result = await requestInvestigation(
        { photoDataUrl: photo?.dataUrl ?? null, location: pin.place, details: details.trim() },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setState((current) => ({ ...current, phase: 'result', report: result }));
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiRequestError && caught.code === 'RESEARCH_UNAVAILABLE') {
        setHealth({ researchConfigured: false });
      }
      const message = messageFor(caught);
      setState((current) => ({ ...current, phase: 'compose', error: message }));
      focusAndReveal(submitButton);
    }
  }

  function cancel() {
    requestAbort.current?.abort();
    setCancelled(true);
    setState((current) => ({ ...current, phase: 'compose', error: null }));
    focusAndReveal(submitButton);
  }

  function startOver() {
    requestAbort.current?.abort();
    contextAbort.current?.abort();
    setCancelled(false);
    setState(EMPTY_FLOW);
    window.scrollTo({ top: 0 });
    focusAndReveal(photoHeading);
  }

  const photoDone = photo !== null || withoutPhoto;
  const photoStatus: StepStatus = photoDone ? 'done' : 'active';
  const pinStatus: StepStatus = !photoDone ? 'locked' : pin.confirmed ? 'done' : 'active';
  const noteStatus: StepStatus = photoDone && pin.confirmed ? 'active' : 'locked';

  return (
    <div className="home" data-phase={phase}>
      <div className="street on-dark">
        {phase === 'compose' ? (
          <header className="hero">
            <p className="kicker hero-kicker">Potholes · streetlights · sidewalks</p>
            <h1 className="display hero-title" tabIndex={-1} data-route-heading>
              Something{' '}
              <span className="nowrap">
                <span className="ringed">
                  broken
                  <PaintRing className="ringed-paint" />
                </span>
                ?
              </span>{' '}
              Find who fixes it.
            </h1>
            <p className="hero-lede">
              Pin the spot and say what’s wrong; a photo is optional. We look up which office covers it, show our
              sources, and write the email. You send it.
            </p>
          </header>
        ) : (
          pin.place && (
            <header className="case" data-photo={photo ? 'yes' : 'no'}>
              <h1 className="visually-hidden">Your report</h1>
              {photo ? (
                <figure className="case-photo">
                  <img src={photo.dataUrl} alt="Your photo of the problem" width={photo.width} height={photo.height} />
                  {phase === 'investigating' && <PaintRing className="case-ring" />}
                </figure>
              ) : (
                // No photo: the spot itself is the picture. The survey mark circles it while the lookup runs.
                <div className="case-spot" aria-hidden="true">
                  <svg viewBox="0 0 48 48" className={phase === 'investigating' ? 'case-spot-mark is-working' : 'case-spot-mark'}>
                    <path d={RING_PATH} fill="none" stroke="var(--paint)" strokeWidth="3.6" strokeLinecap="round" />
                    <circle cx="24" cy="24" r="4.5" fill="var(--on-asphalt)" />
                  </svg>
                </div>
              )}
              <div className="case-meta">
                <p className="kicker">The spot</p>
                <p className="case-place">{pin.place.label}</p>
                {/* An unidentified result already shows the map facts as its answer. */}
                {pin.context && report?.responsibility.verdict !== 'unidentified' && (
                  <div className="case-extra">
                    <ContextChips context={pin.context} />
                  </div>
                )}
                {details.trim() && (
                  // Without a photo the note is the description of the problem, so it stays on phones too.
                  <div className={photo ? 'case-extra' : 'case-problem'}>
                    <p className="kicker">Your note</p>
                    <p className={photo ? 'case-note' : 'case-note case-note--problem'}>{details.trim()}</p>
                  </div>
                )}
              </div>
            </header>
          )
        )}
      </div>

      <div className="sheet">
        {offline && (
          <div className="notice notice--warn offline" role="status">
            <WifiOff size={20} aria-hidden="true" />
            <div>
              <p>
                <strong>{OFFLINE_MESSAGE}</strong>
              </p>
              <p>You can still pin the spot and write your note, but we can’t look up who fixes it until it’s back.</p>
            </div>
          </div>
        )}

        {phase === 'compose' && (
          <ol className="steps" role="list" aria-label="Report a problem">
            <Step n={1} title="The photo" status={photoStatus} lockedText="" headingRef={photoHeading}>
              <PhotoStep
                photo={photo}
                withoutPhoto={withoutPhoto}
                onPhoto={choosePhoto}
                onRemove={() => setState((current) => ({ ...current, photo: null }))}
                onSkip={skipPhoto}
                onAddAfterAll={addPhotoAfterAll}
                initialError={scene?.photoError}
              />
            </Step>

            <Step
              n={2}
              title="The exact spot"
              status={pinStatus}
              lockedText="Next, you’ll pin where it is."
              headingRef={pinHeading}
            >
              {pin.confirmed && pin.place ? (
                <div className="pin-done">
                  <p className="pin-done-label">{pin.place.label}</p>
                  {pin.contextLoading ? (
                    <p className="context-note" role="status">
                      <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading map facts for this spot…
                    </p>
                  ) : pin.context ? (
                    <ContextChips context={pin.context} />
                  ) : (
                    <p className="context-note">Map facts didn’t load. The lookup will try again.</p>
                  )}
                  <button type="button" className="btn btn--sm btn--quiet" onClick={changePin}>
                    <Pencil size={16} aria-hidden="true" />
                    Change the spot
                  </button>
                </div>
              ) : (
                <PinStep
                  pin={pin}
                  photoGps={photo?.gps ?? null}
                  onPin={setPin}
                  onPlaceResolved={onPlaceResolved}
                  onConfirm={confirmPin}
                  initialUi={scene?.pinUi}
                />
              )}
            </Step>

            <Step
              n={3}
              title={photo || !withoutPhoto ? 'Anything that helps' : 'What’s broken'}
              status={noteStatus}
              lockedText={withoutPhoto ? 'Then, tell us what’s broken.' : 'Then, add a clue if you have one.'}
              headingRef={noteHeading}
            >
              <NoteStep
                value={details}
                required={!photo}
                onChange={(value) => setState((current) => ({ ...current, details: value }))}
              />
            </Step>

            {noteStatus === 'active' && (
              <li className="step step--send">
                <span className="step-num" aria-hidden="true">
                  04
                </span>
                <div className="step-body">
                  {error && (
                    <div className="notice notice--error" role="alert">
                      <TriangleAlert size={20} aria-hidden="true" />
                      <p>
                        <strong>That didn’t work.</strong> {error}
                      </p>
                    </div>
                  )}
                  {cancelled && !error && (
                    <p className="send-fine" role="status">
                      Cancelled. Nothing was kept. Your {photo ? 'photo, pin, and note are' : 'pin and note are'} still
                      here.
                    </p>
                  )}
                  <button
                    ref={submitButton}
                    type="button"
                    className="btn btn--primary btn--lg btn--block send-button"
                    // Missing note: stay focusable (aria-disabled) so keyboard and screen-reader users reach the
                    // button, hear why it's off, and land in the note when they press it.
                    onClick={noteMissing ? () => document.getElementById('note')?.focus() : submit}
                    disabled={offline}
                    aria-disabled={noteMissing || undefined}
                    aria-describedby={noteMissing ? 'send-needs-note send-emergency' : 'send-emergency'}
                  >
                    Find who fixes it
                    <ArrowRight size={22} aria-hidden="true" />
                  </button>
                  {noteMissing && !offline && (
                    <p className="send-needs-note" id="send-needs-note">
                      Without a photo, write a few words above about what’s broken, so the office knows what to fix.
                    </p>
                  )}
                  {offline ? (
                    <p className="send-fine">{OFFLINE_MESSAGE} Try again later.</p>
                  ) : (
                    <p className="send-fine">
                      Your {photo ? 'photo, pin, and note go' : 'pin and note go'} to Google Gemini to look this up.{' '}
                      <Link to="/privacy">What we share and why</Link>
                    </p>
                  )}
                  <p className="send-emergency" id="send-emergency">
                    <Siren size={18} aria-hidden="true" />
                    <span>
                      <strong>Not for emergencies.</strong> If someone is hurt, or wires are down, call your local
                      emergency number.
                    </span>
                  </p>
                </div>
              </li>
            )}
          </ol>
        )}

        {phase === 'investigating' && (
          <Investigating onCancel={cancel} />
        )}

        {phase === 'result' && report && pin.place && (
          <ResultView
            report={report}
            place={pin.place}
            details={details.trim()}
            photo={photo}
            pinContext={pin.context}
            onStartOver={startOver}
          />
        )}
      </div>
      <aside className="trust on-dark" aria-labelledby="trust-title">
        <h2 id="trust-title" className="kicker">
          Why you can trust the answer
        </h2>
        <ul role="list">
          {TRUST.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong> {item.text}
            </li>
          ))}
        </ul>
        <Link to="/tech" className="trust-link">
          How it’s built <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
