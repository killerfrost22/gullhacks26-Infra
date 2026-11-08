import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile} from 'remotion';
import {BAR, DURATION_SECONDS, END_CARD_SECONDS, FPS, HEIGHT, MEMBERS_SECONDS, STACK_SECONDS, TEAM_PHOTO, TEAM_SECONDS} from './beats';
import {NAVY, RASPBERRY, TEAM, YELLOW} from './brand';
import {anton, fredoka} from './fonts';
import stackIcons from './stack-icons.json';

const END_CARD = Math.round(END_CARD_SECONDS * FPS);
const STACK = Math.round(STACK_SECONDS * FPS);
const MEMBERS = Math.round(MEMBERS_SECONDS * FPS);
const TEAM_START = Math.round(TEAM_SECONDS * FPS);
const TOTAL = Math.round(DURATION_SECONDS * FPS);
/** Each scene fades out over this many frames before the next one starts. */
const EXIT_FRAMES = 8;

/** From the README's credits table. Logos: Simple Icons 16.36.0 (CC0), in `stack-icons.json`. */
const STACK_ITEMS: {icon: keyof typeof stackIcons; role: string}[] = [
  {icon: 'react', role: 'User interface'},
  {icon: 'typescript', role: 'Types across app and server'},
  {icon: 'vite', role: 'Dev server and build'},
  {icon: 'nodedotjs', role: 'Backend runtime'},
  {icon: 'express', role: 'API server'},
  {icon: 'googlegemini', role: 'Photo reading and research'},
  {icon: 'leaflet', role: 'Interactive map'},
  {icon: 'openstreetmap', role: 'Roads, campuses, addresses'},
  {icon: 'zod', role: 'Schemas and validation'},
];

/** Member cards: a 4:5 photo in a white print border, with the name written underneath. */
const MEMBER_WIDTH = 360;
const MEMBER_BORDER = 16;
const MEMBER_PHOTO_HEIGHT = Math.round(((MEMBER_WIDTH - 2 * MEMBER_BORDER) * 5) / 4);

/** Team photo card: 2160 × 2813 photo inside a 16 px white border. */
const PHOTO_BORDER = 16;
const PHOTO_HEIGHT = 860;
const PHOTO_WIDTH = Math.round((PHOTO_HEIGHT - 2 * PHOTO_BORDER) * (2160 / 2813)) + 2 * PHOTO_BORDER;
const PHOTO_LEFT = 220;
const TEAM_TEXT_LEFT = 1010;

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Fades in while rising 30 px, starting `delay` frames in. */
const rise = (frame: number, delay: number): React.CSSProperties => {
  const progress = interpolate(frame, [delay, delay + 12], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return {opacity: progress, transform: `translateY(${(1 - progress) * 30}px)`};
};

const EndCard: React.FC<{frame: number}> = ({frame}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontFamily: fredoka, color: '#FFFFFF'}}>
    <div style={{...rise(frame, 0), fontWeight: 600, fontSize: 30, letterSpacing: 8, color: YELLOW}}>A GULLHACKS 2026 PROJECT</div>
    <div style={{...rise(frame, 4), fontFamily: anton, fontSize: 240, lineHeight: 1, letterSpacing: 5, marginTop: 24, textShadow: `11px 11px 0 ${RASPBERRY}`}}>
      FIX PLEASE
    </div>
    <div style={{...rise(frame, 10), fontWeight: 500, fontSize: 40, marginTop: 36}}>See something broken? Snap it. We’ll find who fixes it.</div>
    <div style={{...rise(frame, 14), fontWeight: 600, fontSize: 36, marginTop: 14, color: YELLOW}}>fixplease.work</div>
  </AbsoluteFill>
);

/** Logo tiles pop in one after another. */
const Stack: React.FC<{frame: number}> = ({frame}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: fredoka, color: '#FFFFFF'}}>
    <div style={{...rise(frame, 0), fontFamily: anton, fontSize: 72, letterSpacing: 2, color: YELLOW}}>BUILT WITH</div>
    <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 460px)', columnGap: 60, rowGap: 52, marginTop: 64}}>
      {STACK_ITEMS.map((item, k) => {
        const icon = stackIcons[item.icon];
        const pop = spring({frame: frame - 6 - k * 2, fps: FPS, config: {damping: 14, stiffness: 200, mass: 0.6}});
        return (
          <div key={item.icon} style={{display: 'flex', alignItems: 'center', gap: 26, opacity: Math.min(1, pop * 2), transform: `scale(${0.85 + 0.15 * pop})`}}>
            <div
              style={{
                width: 108,
                height: 108,
                flex: 'none',
                borderRadius: 26,
                background: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 12px 24px rgba(0, 0, 0, 0.25)',
              }}
            >
              <svg viewBox="0 0 24 24" width={60} height={60}>
                <path d={icon.path} fill={icon.hex} />
              </svg>
            </div>
            <div>
              <div style={{fontFamily: anton, fontSize: 40, lineHeight: 1.05, letterSpacing: 1}}>{icon.title.toUpperCase()}</div>
              <div style={{fontWeight: 500, fontSize: 22, marginTop: 6, opacity: 0.7}}>{item.role}</div>
            </div>
          </div>
        );
      })}
    </div>
  </AbsoluteFill>
);

/** Each member's card snaps in on a downbeat, one per bar, starting on the song's second drop. */
const Members: React.FC<{frame: number}> = ({frame}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', fontFamily: fredoka}}>
    <div style={{...rise(frame, 0), fontFamily: anton, fontSize: 72, letterSpacing: 2, color: YELLOW}}>MEET THE TEAM</div>
    <div style={{display: 'flex', gap: 60, marginTop: 56}}>
      {TEAM.map((member, k) => {
        const local = frame - Math.round(k * BAR * FPS);
        const enter = spring({frame: local, fps: FPS, config: {damping: 13, stiffness: 170, mass: 0.7}});
        const tilt = k % 2 === 0 ? -3 : 2.5;
        return (
          <div
            key={member.name}
            style={{
              width: MEMBER_WIDTH,
              padding: `${MEMBER_BORDER}px ${MEMBER_BORDER}px 0`,
              boxSizing: 'border-box',
              background: '#FFFFFF',
              borderRadius: 18,
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.35)',
              opacity: interpolate(local, [0, 3], [0, 1], clamp),
              transform: `translateY(${(1 - enter) * -80}px) scale(${1.2 - 0.2 * enter}) rotate(${tilt + (1 - enter) * 8}deg)`,
            }}
          >
            <div style={{height: MEMBER_PHOTO_HEIGHT, borderRadius: 10, overflow: 'hidden'}}>
              <Img src={staticFile(member.photo)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            </div>
            <div style={{padding: '16px 4px 20px', color: NAVY}}>
              <div style={{fontFamily: anton, fontSize: 40, lineHeight: 1, letterSpacing: 1}}>{member.name.toUpperCase()}</div>
              <div style={{fontWeight: 500, fontSize: 20, marginTop: 6, opacity: 0.7}}>{member.role}</div>
            </div>
          </div>
        );
      })}
    </div>
  </AbsoluteFill>
);

/** The team photo drops in as a print at the very end, with the names beside it. */
const Team: React.FC<{frame: number; length: number}> = ({frame, length}) => {
  const enter = spring({frame, fps: FPS, config: {damping: 13, stiffness: 170, mass: 0.7}});
  // Zoomed toward the lower part of the photo: past the ceiling, keeping the sign and everyone's feet.
  const drift = interpolate(frame, [0, length], [1.22, 1.28], clamp);
  return (
    <AbsoluteFill style={{fontFamily: fredoka, color: '#FFFFFF'}}>
      <div
        style={{
          position: 'absolute',
          left: PHOTO_LEFT,
          top: (HEIGHT - PHOTO_HEIGHT) / 2,
          width: PHOTO_WIDTH,
          height: PHOTO_HEIGHT,
          padding: PHOTO_BORDER,
          boxSizing: 'border-box',
          background: '#FFFFFF',
          borderRadius: 22,
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.35)',
          opacity: interpolate(frame, [0, 4], [0, 1], clamp),
          transform: `scale(${1.25 - 0.25 * enter}) rotate(${-3 + (1 - enter) * 6}deg)`,
        }}
      >
        <div style={{width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden'}}>
          <Img
            src={staticFile(TEAM_PHOTO)}
            style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${drift})`, transformOrigin: '50% 78%'}}
          />
        </div>
      </div>
      <div style={{position: 'absolute', left: TEAM_TEXT_LEFT, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
        <div style={{...rise(frame, 4), fontWeight: 600, fontSize: 26, letterSpacing: 8, color: YELLOW}}>THE TEAM</div>
        {TEAM.map((member, k) => (
          <div key={member.name} style={{...rise(frame, 8 + k * 3), marginTop: 22}}>
            <div style={{fontFamily: anton, fontSize: 76, lineHeight: 1, letterSpacing: 1}}>{member.name.toUpperCase()}</div>
            <div style={{fontWeight: 500, fontSize: 28, marginTop: 6, opacity: 0.7}}>{member.role}</div>
          </div>
        ))}
        <div style={{...rise(frame, 24), fontWeight: 600, fontSize: 30, marginTop: 44, color: YELLOW}}>fixplease.work</div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * After the photos: the Fix Please card, the tech stack, each team member, then the team photo.
 * `endCardDelay` holds the card back while the credits panel widens to fill the frame.
 */
export const Ending: React.FC<{frame: number; endCardDelay: number}> = ({frame, endCardDelay}) => {
  if (frame < END_CARD + endCardDelay) return null;
  const exit = (end: number) => interpolate(frame, [end - EXIT_FRAMES, end], [1, 0], clamp);
  if (frame < STACK) {
    return (
      <AbsoluteFill style={{opacity: exit(STACK)}}>
        <EndCard frame={frame - END_CARD - endCardDelay} />
      </AbsoluteFill>
    );
  }
  if (frame < MEMBERS) {
    return (
      <AbsoluteFill style={{opacity: exit(MEMBERS)}}>
        <Stack frame={frame - STACK} />
      </AbsoluteFill>
    );
  }
  if (frame < TEAM_START) {
    return (
      <AbsoluteFill style={{opacity: exit(TEAM_START)}}>
        <Members frame={frame - MEMBERS} />
      </AbsoluteFill>
    );
  }
  return <Team frame={frame - TEAM_START} length={TOTAL - TEAM_START} />;
};
