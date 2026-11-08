import React from 'react';
import {AbsoluteFill, interpolate} from 'remotion';
import {BEATS, END_CARD_SECONDS, FPS, HEIGHT, STAGE_WIDTH, WIDTH} from './beats';
import {NAVY, REPO, TEAM, YELLOW} from './brand';
import {pastel} from './color';
import {anton, fredoka} from './fonts';
import photoCredits from './photo-credits.json';

const PANEL_WIDTH = WIDTH - STAGE_WIDTH;
const PAD_X = 48;
/** The team and music credits above the photo credits. Fixed, like the slots, so the roll can be placed by arithmetic. */
const INTRO_HEIGHT = 600;
/** Every photo credit gets the same height; the longest title wraps to two lines. */
const SLOT = 140;
/** Where the current photo's credit sits, from the top of the panel, halfway through that photo. */
const READ_Y = 600;
const EDGE_FADE = 'linear-gradient(to bottom, transparent 0px, #000 90px, #000 990px, transparent 1080px)';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

const STARTS = BEATS.map((beat) => beat.time);
const ENDS = BEATS.map((_, k) => BEATS[k + 1]?.time ?? END_CARD_SECONDS);
const MIDS = STARTS.map((start, k) => (start + ENDS[k]) / 2);

/** One credit per photo, in the order the photos appear. */
const CREDITS = BEATS.map((beat) => {
  const credit = photoCredits.find((c) => c.file === beat.photo);
  if (!credit) throw new Error(`No credit for ${beat.photo} in photo-credits.json`);
  return {
    word: beat.word,
    color: pastel(beat.bg),
    title: credit.title.replace(/^File:/, '').replace(/\.jpe?g$/i, ''),
    author: credit.author,
    license: credit.license,
    source: new URL(credit.sourceUrl).hostname.endsWith('flickr.com') ? 'Flickr' : 'Wikimedia Commons',
  };
});

const Label: React.FC<{children: React.ReactNode; marginTop?: number}> = ({children, marginTop = 0}) => (
  <div style={{fontWeight: 600, fontSize: 17, letterSpacing: 5, color: YELLOW, marginTop}}>{children}</div>
);

const Intro: React.FC = () => (
  <div style={{height: INTRO_HEIGHT, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 26, boxSizing: 'border-box'}}>
    {/* Fix Please itself waits for the end card. */}
    <Label>TEAM</Label>
    {TEAM.map((member) => (
      <div key={member.name} style={{marginTop: 10}}>
        <span style={{fontFamily: anton, fontSize: 30, letterSpacing: 1}}>{member.name.toUpperCase()}</span>
        <span style={{fontWeight: 500, fontSize: 19, marginLeft: 14, opacity: 0.7}}>{member.role}</span>
      </div>
    ))}
    <Label marginTop={40}>MUSIC</Label>
    <div style={{fontWeight: 500, fontSize: 19, lineHeight: 1.35, marginTop: 10}}>“Beauty And A Beat” by Justin Bieber feat. Nicki Minaj</div>
    <div style={{fontFamily: anton, fontSize: 40, letterSpacing: 1, color: YELLOW, marginTop: 50}}>PHOTO CREDITS</div>
  </div>
);

const PhotoCredit: React.FC<{credit: (typeof CREDITS)[number]; highlight: number}> = ({credit, highlight}) => (
  <div
    style={{
      height: SLOT,
      boxSizing: 'border-box',
      paddingLeft: 20,
      borderLeft: `4px solid rgba(235, 250, 31, ${highlight})`,
      opacity: 0.4 + 0.6 * highlight,
    }}
  >
    <div style={{fontFamily: anton, fontSize: 28, lineHeight: 1.1, letterSpacing: 1, color: credit.color}}>{credit.word.toUpperCase()}</div>
    <div style={{fontWeight: 500, fontSize: 18, lineHeight: 1.35, marginTop: 6}}>
      “{credit.title}” by {credit.author}
    </div>
    <div style={{fontWeight: 500, fontSize: 18, lineHeight: 1.35, opacity: 0.65}}>
      {credit.license} · {credit.source}
    </div>
  </div>
);

/**
 * Credits rolling up the right third in step with the photos: each photo's credit lights up while
 * that photo is on screen and crosses `READ_Y` halfway through it.
 */
const CreditsRoll: React.FC<{frame: number}> = ({frame}) => {
  const seconds = frame / FPS;
  const position = interpolate(seconds, MIDS, MIDS.map((_, k) => k));
  const highlight = (k: number) =>
    interpolate(seconds, [STARTS[k], STARTS[k] + 0.2], [0, 1], clamp) * interpolate(seconds, [ENDS[k], ENDS[k] + 0.2], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: PANEL_WIDTH,
        height: HEIGHT,
        overflow: 'hidden',
        fontFamily: fredoka,
        color: '#FFFFFF',
        maskImage: EDGE_FADE,
        WebkitMaskImage: EDGE_FADE,
      }}
    >
      <div style={{position: 'absolute', left: PAD_X, right: PAD_X, top: 0, transform: `translateY(${READ_Y - INTRO_HEIGHT - position * SLOT}px)`}}>
        <Intro />
        {CREDITS.map((credit, k) => (
          <PhotoCredit key={credit.word} credit={credit} highlight={highlight(k)} />
        ))}
        <div style={{paddingTop: 20, fontWeight: 500, fontSize: 18, lineHeight: 1.5, opacity: 0.65}}>
          Photos resized and cropped.
          <br />
          Every source link: submission/video/CREDITS.md
          <br />
          Code: {REPO}
        </div>
      </div>
    </div>
  );
};

/**
 * The navy credits panel. It holds the roll in the right third during the photos; after them it
 * widens over the photos (`expand` 0 → 1), the roll fades, and `children` (the ending) take over.
 */
export const CreditsPanel: React.FC<{frame: number; expand: number; children: React.ReactNode}> = ({frame, expand, children}) => (
  <div
    style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: STAGE_WIDTH * (1 - expand), overflow: 'hidden', backgroundColor: NAVY}}
  >
    {expand < 1 ? (
      <AbsoluteFill style={{opacity: 1 - expand}}>
        <CreditsRoll frame={frame} />
      </AbsoluteFill>
    ) : null}
    {children}
  </div>
);
