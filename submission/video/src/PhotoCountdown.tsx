import {Audio} from '@remotion/media';
import {getStaticFiles} from '@remotion/studio';
import React from 'react';
import {AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {
  BEATS,
  DURATION_SECONDS,
  END_CARD_SECONDS,
  FPS,
  HEIGHT,
  MUSIC_FADE_SECONDS,
  STAGE_WIDTH,
  TRACK_FILE,
  type Transition,
} from './beats';
import {pastel} from './color';
import {CreditsPanel} from './Credits';
import {Ending} from './Ending';
import {Grain, Viewfinder} from './Overlay';
import {Scene} from './Scene';

export const TOTAL_FRAMES = Math.round(DURATION_SECONDS * FPS);
const STARTS = BEATS.map((beat) => Math.round(beat.time * FPS));
const END_CARD = Math.round(END_CARD_SECONDS * FPS);
/** After the photos, the credits panel widens over them to fill the frame. */
const EXPAND_FRAMES = 14;
const MUSIC_FADE_FRAMES = Math.round(MUSIC_FADE_SECONDS * FPS);
/** The picture fades to black over the last half second. */
const BLACK_FADE_FRAMES = 15;
const TINT_FRAMES = 4;
const WIPE_FRAMES: Record<Exclude<Transition, 'tint'>, number> = {stripes: 8, band: 6, square: 8};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ease = Easing.bezier(0.7, 0, 0.3, 1);

const beatAt = (frame: number): number => {
  let index = 0;
  STARTS.forEach((start, k) => {
    if (start <= frame) index = k;
  });
  return index;
};

/** Five vertical panels; even ones drop from the top, odd ones rise from the bottom, staggered left to right. */
const stripesMask = (progress: number): React.CSSProperties => {
  const width = STAGE_WIDTH / 5;
  const rects = Array.from({length: 5}, (_, k) => {
    const panel = Math.min(1, Math.max(0, (progress - k * 0.1) / 0.6));
    const height = panel * HEIGHT;
    const y = k % 2 === 0 ? 0 : HEIGHT - height;
    return `<rect x='${k * width - 0.5}' y='${y}' width='${width + 1}' height='${height}' fill='white'/>`;
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${STAGE_WIDTH}' height='${HEIGHT}'>${rects}</svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return {maskImage: url, WebkitMaskImage: url, maskSize: '100% 100%', WebkitMaskSize: '100% 100%'};
};

/** A square that spins from a diamond while growing out of the center of the stage. */
const squareClip = (progress: number): React.CSSProperties => {
  const half = progress * 1650;
  const angle = ((45 + 90 * progress) * Math.PI) / 180;
  const corners = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([sx, sy]) => {
    const x = STAGE_WIDTH / 2 + sx * half * Math.cos(angle) - sy * half * Math.sin(angle);
    const y = HEIGHT / 2 + sx * half * Math.sin(angle) + sy * half * Math.cos(angle);
    return `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  });
  return {clipPath: `polygon(${corners.join(', ')})`};
};

export const PhotoCountdown: React.FC = () => {
  const frame = useCurrentFrame();
  const index = beatAt(frame);
  const beat = BEATS[index];
  const local = frame - STARTS[index];

  const scene = (k: number, zoom = 1) => (
    <AbsoluteFill style={{transform: `scale(${zoom})`}}>
      <Scene beat={BEATS[k]} index={k} frame={frame - STARTS[k]} length={(STARTS[k + 1] ?? END_CARD) - STARTS[k]} />
    </AbsoluteFill>
  );

  let content = scene(index);
  if (index > 0 && beat.transition !== 'tint' && local < WIPE_FRAMES[beat.transition]) {
    const progress = interpolate(local, [0, WIPE_FRAMES[beat.transition]], [0, 1], {...clamp, easing: ease});
    const incoming =
      beat.transition === 'stripes'
        ? {style: stripesMask(progress), zoom: 1}
        : beat.transition === 'band'
          ? {style: {clipPath: `inset(${(1 - progress) * 50}% 0 ${(1 - progress) * 50}% 0)`}, zoom: 1}
          : {style: squareClip(progress), zoom: 1.3 - 0.3 * progress};
    const outgoingZoom = beat.transition === 'square' ? 1 + 0.35 * progress : 1;
    content = (
      <>
        {scene(index - 1, outgoingZoom)}
        <AbsoluteFill style={incoming.style}>{scene(index, incoming.zoom)}</AbsoluteFill>
      </>
    );
  }

  const next = BEATS[index + 1];
  const tint =
    next?.transition === 'tint'
      ? interpolate(frame, [STARTS[index + 1] - TINT_FRAMES - 1, STARTS[index + 1] - 1], [0, 1], clamp)
      : 0;

  const expand = interpolate(frame, [END_CARD, END_CARD + EXPAND_FRAMES], [0, 1], {...clamp, easing: ease});
  const black = interpolate(frame, [TOTAL_FRAMES - BLACK_FADE_FRAMES, TOTAL_FRAMES - 1], [0, 1], clamp);
  const hasTrack = getStaticFiles().some((file) => file.name === TRACK_FILE);
  // Squared fade: drops quickly at first, then tails off gently, which sounds smoother than a linear ramp.
  const volume = (f: number) =>
    interpolate(f, [TOTAL_FRAMES - MUSIC_FADE_FRAMES, TOTAL_FRAMES - 1], [1, 0], {...clamp, easing: Easing.out(Easing.quad)});

  return (
    <AbsoluteFill style={{backgroundColor: '#000000'}}>
      {expand < 1 ? (
        <div style={{position: 'absolute', left: 0, top: 0, width: STAGE_WIDTH, height: HEIGHT, overflow: 'hidden'}}>
          {content}
          {tint > 0 ? <AbsoluteFill style={{backgroundColor: pastel(next.bg), opacity: tint}} /> : null}
          <Viewfinder />
        </div>
      ) : null}
      <CreditsPanel frame={frame} expand={expand}>
        <Ending frame={frame} endCardDelay={EXPAND_FRAMES} />
      </CreditsPanel>
      <Grain />
      {black > 0 ? <AbsoluteFill style={{backgroundColor: '#000000', opacity: black}} /> : null}
      {hasTrack ? <Audio src={staticFile(TRACK_FILE)} volume={volume} /> : null}
    </AbsoluteFill>
  );
};
