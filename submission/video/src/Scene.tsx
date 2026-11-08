import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, random, staticFile} from 'remotion';
import {type Beat} from './beats';
import {shade} from './color';
import {anton} from './fonts';

const WORD_SIZE = 80;
/** Lower-left corner of the word, kept inside the corner brackets (inset 4% = 51 × 43 px). */
const WORD_LEFT = 110;
const WORD_BOTTOM = 110;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Full-frame photo: a quick zoom-out punch on the cut, then a slow push-in for the rest of the beat. */
const Photo: React.FC<{beat: Beat; frame: number; length: number}> = ({beat, frame, length}) => {
  const punch = interpolate(frame, [0, 6], [1.08, 1], {...clamp, easing: Easing.out(Easing.quad)});
  const drift = interpolate(frame, [0, length], [1.04, 1.1], clamp);
  const focus = `50% ${beat.focus ?? 50}%`;
  return (
    <Img
      src={staticFile(beat.photo)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: focus,
        transform: `scale(${punch * drift})`,
        transformOrigin: focus,
      }}
    />
  );
};

/** Letters appear left to right over 8 frames, each flickering for a few frames as it lands. */
const Word: React.FC<{beat: Beat; index: number; frame: number}> = ({beat, index, frame}) => {
  const letters = [...beat.word.toUpperCase()];
  const glow = `0 0 ${WORD_SIZE * 0.05}px rgba(255, 255, 255, 0.8), 0 0 ${WORD_SIZE * 0.14}px rgba(255, 255, 255, 0.4)`;
  const offset = Math.round(WORD_SIZE * 0.06);
  // Soft dark shadow so the white letters stay readable over bright photos.
  const lift = `0 ${WORD_SIZE * 0.06}px ${WORD_SIZE * 0.2}px rgba(0, 0, 0, 0.45)`;
  return (
    <div
      style={{
        fontFamily: anton,
        fontSize: WORD_SIZE,
        lineHeight: 1,
        color: '#FFFFFF',
        whiteSpace: 'pre',
        letterSpacing: 2,
        textShadow: `${glow}, ${offset}px ${offset}px 0 ${shade(beat.fg)}, ${lift}`,
      }}
    >
      {letters.map((letter, k) => {
        const landsAt = 1 + (k / letters.length) * 8;
        const since = frame - landsAt;
        let opacity = since < 0 ? 0 : 1;
        if (since >= 0 && since < 3) opacity = random(`flicker-${index}-${k}-${frame}`) > 0.35 ? 1 : 0.15;
        return (
          <span key={k} style={{opacity}}>
            {letter}
          </span>
        );
      })}
    </div>
  );
};

export const Scene: React.FC<{beat: Beat; index: number; frame: number; length: number}> = ({beat, index, frame, length}) => (
  <AbsoluteFill style={{backgroundColor: beat.bg}}>
    <Photo beat={beat} frame={frame} length={length} />
    <AbsoluteFill style={{background: 'linear-gradient(to top, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 42%)'}} />
    <div style={{position: 'absolute', left: WORD_LEFT, bottom: WORD_BOTTOM}}>
      <Word beat={beat} index={index} frame={frame} />
    </div>
  </AbsoluteFill>
);
