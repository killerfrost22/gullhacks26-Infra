import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {FPS, HEIGHT, WIDTH} from './beats';
import {fredoka} from './fonts';

const INSET_X = WIDTH * 0.04;
const INSET_Y = HEIGHT * 0.04;
const ARM = 110;
const RADIUS = 24;

/** One rounded corner bracket; `sx`/`sy` point the arms into the frame. */
const corner = (x: number, y: number, sx: number, sy: number) =>
  `M ${x} ${y + sy * ARM} L ${x} ${y + sy * RADIUS} Q ${x} ${y} ${x + sx * RADIUS} ${y} L ${x + sx * ARM} ${y}`;

/** Animated film grain at ~8% opacity. */
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{opacity: 0.08, pointerEvents: 'none'}}>
      <svg width={WIDTH} height={HEIGHT}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 8} stitchTiles="stitch" />
          {/* Grayscale, contrast-stretched, fully opaque noise: the layer's 8% opacity is then the grain strength. */}
          <feColorMatrix type="matrix" values="0.8 0.8 0.8 0 -0.7  0.8 0.8 0.8 0 -0.7  0.8 0.8 0.8 0 -0.7  0 0 0 0 1" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

/** Camera viewfinder: white corner brackets inset 4% and a REC light blinking at 1 Hz. */
export const Viewfinder: React.FC = () => {
  const frame = useCurrentFrame();
  const recOn = Math.floor(frame / (FPS / 2)) % 2 === 0;
  const right = WIDTH - INSET_X;
  const bottom = HEIGHT - INSET_Y;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
        <g fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
          <path d={corner(INSET_X, INSET_Y, 1, 1)} />
          <path d={corner(right, INSET_Y, -1, 1)} />
          <path d={corner(INSET_X, bottom, 1, -1)} />
          <path d={corner(right, bottom, -1, -1)} />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          top: INSET_Y + 34,
          right: INSET_X + 40,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          opacity: recOn ? 1 : 0,
          fontFamily: fredoka,
          fontWeight: 700,
          fontSize: 40,
          color: '#FFFFFF',
          letterSpacing: 2,
          textShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{width: 26, height: 26, borderRadius: '50%', background: '#FF2D2D', boxShadow: '0 0 12px rgba(255, 45, 45, 0.8)'}} />
        REC
      </div>
    </AbsoluteFill>
  );
};
