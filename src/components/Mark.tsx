/**
 * The Fix Please mark: a survey-paint ring around a spot, the way road crews circle a pothole
 * before they fix it. The same hand-sprayed ring circles "broken" in the headline and the pin on the map.
 */

export const RING_PATH =
  'M37.6 12.2C31.4 5.6 18.6 5.2 11.6 11.6 4.6 18 4.8 30.6 11.8 37.2 18.8 43.8 32.4 43.4 38.8 35.4 44 28.8 42.8 17.8 35.6 12.6 32.2 10.2 27.6 9.2 23.4 9.6';

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d={RING_PATH} fill="none" stroke="var(--paint)" strokeWidth="4.6" strokeLinecap="round" />
      <circle cx="24" cy="24" r="5" fill="currentColor" />
    </svg>
  );
}

/** Wide, hand-sprayed ellipse that circles a word. Stretches to its box. */
export function PaintRing({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 90" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path
        d="M200 20C176 5 76 2 34 12 9 18 3 44 18 60c26 23 150 26 188 4 18-11 16-36-14-48C166 6 130 5 100 7"
        fill="none"
        stroke="var(--paint)"
        strokeWidth="5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
