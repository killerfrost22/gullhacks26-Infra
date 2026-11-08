import {loadFont as loadBigShoulders} from '@remotion/google-fonts/BigShoulders';
import {loadFont as loadPublicSans} from '@remotion/google-fonts/PublicSans';
import React from 'react';
import {Easing, interpolate, useCurrentFrame} from 'remotion';

/** The site's own type and colours (src/styles/tokens.css). */
export const display = loadBigShoulders('normal', {weights: ['800', '900'], subsets: ['latin']}).fontFamily;
export const body = loadPublicSans('normal', {weights: ['400', '600', '700'], subsets: ['latin']}).fontFamily;

export const C = {
  asphalt: '#16181a',
  asphalt2: '#212428',
  asphalt3: '#2e3236',
  onAsphalt: '#ece8df',
  onAsphaltMuted: '#aaa59b',
  centreLine: '#f2c230',
  paper: '#f4f1ea',
  paint: '#ff5b1a',
  paintOnDark: '#ff7a45',
};

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** The hand-sprayed ellipse from src/components/Mark.tsx, drawn on over `drawFrames` from `start`. */
export const PaintRing: React.FC<{start?: number; drawFrames?: number; strokeWidth?: number; style?: React.CSSProperties}> = ({
  start = 0,
  drawFrames = 14,
  strokeWidth = 5,
  style,
}) => {
  const frame = useCurrentFrame();
  const drawn = interpolate(frame, [start, start + drawFrames], [0, 1], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return (
    <svg viewBox="0 0 220 90" preserveAspectRatio="none" style={{position: 'absolute', overflow: 'visible', ...style}}>
      <path
        d="M200 20C176 5 76 2 34 12 9 18 3 44 18 60c26 23 150 26 188 4 18-11 16-36-14-48C166 6 130 5 100 7"
        fill="none"
        stroke={C.paint}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - drawn}
      />
    </svg>
  );
};

/** "FIX PLEASE" with FIX circled, as in the site header. */
export const Wordmark: React.FC<{size: number; ringStart?: number; color?: string}> = ({size, ringStart = 0, color = C.onAsphalt}) => (
  <div style={{fontFamily: display, fontWeight: 800, fontSize: size, lineHeight: 1, color, letterSpacing: 0.5, display: 'flex', gap: size * 0.28}}>
    <span style={{position: 'relative'}}>
      FIX
      <PaintRing start={ringStart} strokeWidth={size / 14} style={{left: '-30%', top: '-24%', width: '160%', height: '148%'}} />
    </span>
    <span>PLEASE</span>
  </div>
);

/** On-screen text from the script's "Overlay" lines. */
export const Kicker: React.FC<{text: string; durationInFrames: number; style?: React.CSSProperties}> = ({text, durationInFrames, style}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 12], [0, 1], {...clamp, easing: easeOut});
  const exit = interpolate(frame, [durationInFrames - 9, durationInFrames], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        opacity: enter * exit,
        transform: `translateY(${(1 - enter) * 18}px)`,
        ...style,
      }}
    >
      <div style={{width: 16, height: 16, borderRadius: 8, background: C.paint, boxShadow: `0 0 0 5px rgba(255,91,26,.25)`}} />
      <div style={{fontFamily: display, fontWeight: 800, fontSize: 42, letterSpacing: 0.6, textTransform: 'uppercase', color: C.onAsphalt, whiteSpace: 'nowrap'}}>
        {text}
      </div>
    </div>
  );
};
