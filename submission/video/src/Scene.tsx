import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, random, spring, staticFile} from 'remotion';
import {type Beat, FPS} from './beats';
import {shade} from './color';
import {anton, fredoka} from './fonts';

const NUMBER_SIZE = 690;
const NUMBER_DEPTH = 20;
/** The number is centered in the left part of the frame. */
const NUMBER_CENTER_X = 530;
/** Fredoka 700 digit advance, measured from a render (~0.54 em). */
const DIGIT_WIDTH = 0.54 * NUMBER_SIZE;
/** Keeps the word inside the left corner bracket (inset 4% = 77 px). */
const WORD_MIN_X = 120;
const WORD_MAX_WIDTH = 900;
const WORD_CENTER_Y = 585;
const CARD_WIDTH = 860;
const CARD_HEIGHT = 600;
const CARD_BORDER = 14;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Pop-in: 0.8 → 1.05 → 1 over 6 frames. */
const popScale = (frame: number) =>
  interpolate(frame, [0, 3, 6], [0.8, 1.05, 1], {...clamp, easing: Easing.out(Easing.quad)});

const PhotoCard: React.FC<{beat: Beat; index: number; frame: number; length: number}> = ({beat, index, frame, length}) => {
  const enter = spring({frame, fps: FPS, config: {damping: 15, stiffness: 190, mass: 0.6}});
  const tilt = index % 2 === 0 ? -3 : 2.5;
  const drift = interpolate(frame, [0, length], [1.04, 1.1], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 1385 - CARD_WIDTH / 2,
        top: 545 - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        padding: CARD_BORDER,
        boxSizing: 'border-box',
        background: '#FFFFFF',
        borderRadius: 22,
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.28)',
        transform: `translateX(${(1 - enter) * 160}px) rotate(${tilt + (1 - enter) * 4}deg) scale(${0.9 + enter * 0.1})`,
      }}
    >
      <div style={{width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden'}}>
        <Img
          src={staticFile(beat.photo)}
          style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${drift})`}}
        />
      </div>
    </div>
  );
};

/** Letters appear left to right over 8 frames, each flickering for a few frames as it lands. */
const Word: React.FC<{beat: Beat; index: number; frame: number}> = ({beat, index, frame}) => {
  const letters = [...beat.word.toUpperCase()];
  const fontSize = Math.min(200, WORD_MAX_WIDTH / (0.47 * Math.max(letters.length, 1)));
  const glow = '0 0 10px rgba(255, 255, 255, 0.9), 0 0 28px rgba(255, 255, 255, 0.55)';
  return (
    <div
      style={{
        fontFamily: anton,
        fontSize,
        lineHeight: 1,
        color: '#FFFFFF',
        whiteSpace: 'pre',
        letterSpacing: 2,
        textShadow: `${glow}, 7px 7px 0 ${shade(beat.fg)}`,
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
  const digits = String(beat.number);
  // Starts a little left of the number so it overlaps the number's left half, but never past the bracket.
  const wordX = Math.max(WORD_MIN_X, NUMBER_CENTER_X - (digits.length * DIGIT_WIDTH) / 2 - 110);
  return (
    <AbsoluteFill style={{backgroundColor: beat.bg}}>
      <PhotoCard beat={beat} index={index} frame={frame} length={length} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: NUMBER_CENTER_X * 2,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{position: 'relative'}}>
          <div
            style={{
              transform: `scale(${popScale(frame)})`,
              transformOrigin: '50% 60%',
              filter: 'drop-shadow(0 28px 36px rgba(0, 0, 0, 0.35))',
            }}
          >
            <div style={{position: 'relative', fontFamily: fredoka, fontWeight: 700, fontSize: NUMBER_SIZE, lineHeight: 1, color: beat.fg}}>
              <span style={{position: 'absolute', left: 0, top: 0, color: shade(beat.fg), transform: `translate(${NUMBER_DEPTH}px, ${NUMBER_DEPTH}px)`}}>
                {digits}
              </span>
              <span style={{position: 'relative'}}>{digits}</span>
            </div>
          </div>
          <div
            style={{
              position: 'absolute',
              left: 8,
              top: 40,
              fontFamily: fredoka,
              fontWeight: 700,
              fontSize: 46,
              color: '#FFFFFF',
              letterSpacing: 1,
              textShadow: `3px 3px 0 ${shade(beat.fg)}`,
            }}
          >
            photo_
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: wordX, top: WORD_CENTER_Y, transform: 'translateY(-50%)'}}>
        <Word beat={beat} index={index} frame={frame} />
      </div>
    </AbsoluteFill>
  );
};
