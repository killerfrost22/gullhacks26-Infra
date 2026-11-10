import React from 'react';
import {AbsoluteFill, Img, interpolate, random, spring, staticFile} from 'remotion';
import {type Beat, FPS} from './beats';
import {luminance} from './color';
import {anton, fredoka} from './fonts';

/** Keeps the caption inside the left corner bracket (inset 4% = 77 px). */
const CAPTION_LEFT = 120;
/** Keeps the caption above the bottom corner bracket (its arm reaches up to y = 927). */
const CAPTION_BOTTOM = 160;
const WORD_MAX_SIZE = 170;
const WORD_MAX_WIDTH = 1300;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** The photo fills the frame: it settles in from a slight zoom on the cut, then drifts slowly. */
const FullPhoto: React.FC<{beat: Beat; frame: number; length: number}> = ({beat, frame, length}) => {
  const settle = spring({frame, fps: FPS, config: {damping: 20, stiffness: 140, mass: 0.7}});
  const drift = interpolate(frame, [0, length], [0, 0.05], clamp);
  return (
    <AbsoluteFill>
      <Img
        src={staticFile(beat.photo)}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + (1 - settle) * 0.12 + drift})`}}
      />
    </AbsoluteFill>
  );
};

/** Letters appear left to right over 8 frames, each flickering for a few frames as it lands. */
const Word: React.FC<{beat: Beat; index: number; frame: number}> = ({beat, index, frame}) => {
  const letters = [...beat.word.toUpperCase()];
  // Anton averages ~0.47 em per capital; long names shrink to stay on one line.
  const fontSize = Math.min(WORD_MAX_SIZE, WORD_MAX_WIDTH / (0.47 * Math.max(letters.length, 1)));
  return (
    <div
      style={{
        fontFamily: anton,
        fontSize,
        lineHeight: 1,
        color: '#FFFFFF',
        whiteSpace: 'pre',
        letterSpacing: 2,
        textShadow: '0 0 10px rgba(255, 255, 255, 0.9), 0 0 28px rgba(255, 255, 255, 0.55), 6px 6px 0 rgba(0, 0, 0, 0.45)',
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

export const Scene: React.FC<{beat: Beat; index: number; frame: number; length: number}> = ({beat, index, frame, length}) => {
  // The tag under the word slides up once the first letters have landed.
  const tagIn = spring({frame: frame - 3, fps: FPS, config: {damping: 16, stiffness: 200, mass: 0.6}});
  return (
    <AbsoluteFill style={{backgroundColor: beat.bg}}>
      <FullPhoto beat={beat} frame={frame} length={length} />
      {/* A shade along the bottom keeps the caption readable without hiding the photo. */}
      <AbsoluteFill style={{background: 'linear-gradient(0deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0.22) 28%, rgba(0, 0, 0, 0) 50%)'}} />
      <div style={{position: 'absolute', left: CAPTION_LEFT, bottom: CAPTION_BOTTOM, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
        <Word beat={beat} index={index} frame={frame} />
        <div
          style={{
            marginTop: 18,
            padding: '8px 22px',
            borderRadius: 999,
            background: beat.bg,
            color: luminance(beat.bg) > 0.35 ? '#14161F' : '#FFFFFF',
            fontFamily: fredoka,
            fontWeight: 700,
            fontSize: 40,
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.3)',
            opacity: tagIn,
            transform: `translateY(${(1 - tagIn) * 24}px)`,
          }}
        >
          {beat.where}
        </div>
      </div>
    </AbsoluteFill>
  );
};
