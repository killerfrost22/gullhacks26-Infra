import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * What the server does for every report. The request is a single call with no progress events,
 * so this lists the steps without claiming which one is running; only the elapsed time is live.
 */
const STEPS = [
  'Gather map facts for your pin',
  'Search official sites with Google Search',
  'Open every cited page to check it',
  'Write your email',
];

export function Investigating({ onCancel }: { onCancel: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    headingRef.current?.focus();
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="investigating" aria-labelledby="investigating-title" aria-busy="true">
      <p className="kicker">Working on it</p>
      <h2 id="investigating-title" className="display investigating-title" tabIndex={-1} ref={headingRef}>
        Finding who fixes it
      </h2>
      <div className="working" role="progressbar" aria-label="Looking up who fixes it" aria-valuetext={`${seconds} seconds so far`}>
        <span className="working-bar" />
      </div>
      <p className="investigating-time" aria-hidden="true">
        <span className="investigating-seconds">{seconds}s</span> · usually 10–20 seconds
      </p>
      <h3 className="block-title">What happens now</h3>
      <ol className="steps-now" role="list">
        {STEPS.map((step, index) => (
          <li key={step}>
            <span className="steps-now-num" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <button type="button" className="btn" onClick={onCancel}>
        <X size={18} aria-hidden="true" />
        Cancel
      </button>
    </section>
  );
}
