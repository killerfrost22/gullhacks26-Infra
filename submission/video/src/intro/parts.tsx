import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill, Freeze, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {body, C, clamp, display, easeOut, Kicker, PaintRing, Wordmark} from './brand';
import {CAPTIONS, type Cue} from './captions';
import {FPS, type Kicker as KickerSpec, type Piece, pieceFrames, sec} from './timeline';

/** Plays `pieces` of one file back to back: trims, speed changes, holds and punch-ins. */
export const PiecedVideo: React.FC<{
  src: string;
  pieces: Piece[];
  withAudio?: boolean;
  /** Rendered above each piece's video, given the piece (for source-timed overlays such as captions). */
  overlay?: (piece: Piece) => React.ReactNode;
}> = ({src, pieces, withAudio = false, overlay}) => {
  let offset = 0;
  return (
    <AbsoluteFill>
      {pieces.map((piece, index) => {
        const frames = pieceFrames(piece);
        const from = offset;
        offset += frames;
        const video = (
          <OffthreadVideo
            src={staticFile(src)}
            trimBefore={sec(piece.from)}
            playbackRate={piece.hold ? 1 : piece.rate ?? 1}
            muted={!withAudio || Boolean(piece.hold)}
            // Short ramps at every cut keep the jump cuts from clicking.
            volume={(f) => interpolate(f, [0, 3, frames - 3, frames], [0, 1, 1, 0], clamp)}
            style={{width: '100%', height: '100%', objectFit: 'cover'}}
          />
        );
        return (
          <Sequence key={index} from={from} durationInFrames={frames}>
            <AbsoluteFill style={{transform: `scale(${piece.zoom ?? 1})`, transformOrigin: '62% 42%'}}>
              {piece.hold ? <Freeze frame={0}>{video}</Freeze> : video}
            </AbsoluteFill>
            {overlay?.(piece)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Caption for whoever is speaking, located by the piece's position in its source file. */
export const Captions: React.FC<{cues: Cue[]; piece: Piece}> = ({cues, piece}) => {
  const frame = useCurrentFrame();
  const t = piece.from + (frame / FPS) * (piece.rate ?? 1);
  const cue = cues.find((c) => t >= c.from && t < c.to);
  if (!cue) return null;
  const fadeIn = interpolate(t, [cue.from, cue.from + 0.12], [0, 1], clamp);
  const fadeOut = interpolate(t, [cue.to - 0.1, cue.to], [1, 0], clamp);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 64}}>
      <div
        style={{
          maxWidth: 1480,
          padding: '14px 30px 16px',
          borderRadius: 16,
          background: 'rgba(22,24,26,.82)',
          color: '#ffffff',
          fontFamily: body,
          fontWeight: 600,
          fontSize: 46,
          lineHeight: 1.25,
          textAlign: 'center',
          opacity: Math.min(fadeIn, fadeOut),
          boxShadow: '0 10px 30px rgba(0,0,0,.25)',
        }}
      >
        {cue.text}
      </div>
    </AbsoluteFill>
  );
};

export const captionsFor = (key: string) => (piece: Piece) => <Captions cues={CAPTIONS[key]} piece={piece} />;

export const Kickers: React.FC<{kickers: KickerSpec[]; style: React.CSSProperties}> = ({kickers, style}) => (
  <>
    {kickers.map((k) => (
      <Sequence key={k.text} from={sec(k.from)} durationInFrames={sec(k.to - k.from)} layout="none">
        <Kicker text={k.text} durationInFrames={sec(k.to - k.from)} style={style} />
      </Sequence>
    ))}
  </>
);

/** Survey-paint backdrop shared by the screen scenes: asphalt with a dashed centre line in each margin. */
export const Backdrop: React.FC = () => (
  <AbsoluteFill style={{background: `radial-gradient(1200px 700px at 50% 38%, ${C.asphalt2}, ${C.asphalt})`}}>
    {[78, 1842].map((x) => (
      <div
        key={x}
        style={{
          position: 'absolute',
          left: x - 3,
          top: 0,
          width: 6,
          height: '100%',
          opacity: 0.32,
          background: `repeating-linear-gradient(to bottom, ${C.centreLine} 0 46px, transparent 46px 82px)`,
        }}
      />
    ))}
  </AbsoluteFill>
);

const WINDOW = {left: 160, top: 26, width: 1600, bar: 48};
/** Bottom band under the browser window, where the script overlays sit without covering the page. */
export const BAND_TOP = WINDOW.top + WINDOW.bar + 900;

/** A browser window around a recording of the site, with an address bar that follows navigation. */
export const BrowserFrame: React.FC<{url: {from: number; text: string}[]; children: React.ReactNode}> = ({url, children}) => {
  const frame = useCurrentFrame();
  const current = [...url].reverse().find((u) => frame >= sec(u.from)) ?? url[0];
  const slash = current.text.indexOf('/');
  const host = slash === -1 ? current.text : current.text.slice(0, slash);
  const path = slash === -1 ? '' : current.text.slice(slash);
  return (
    <div
      style={{
        position: 'absolute',
        left: WINDOW.left,
        top: WINDOW.top,
        width: WINDOW.width,
        height: WINDOW.bar + 900,
        borderRadius: 16,
        overflow: 'hidden',
        background: C.asphalt3,
        boxShadow: '0 30px 90px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.06)',
      }}
    >
      <div style={{height: WINDOW.bar, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{width: 14, height: 14, borderRadius: 7, background: c}} />
        ))}
        <div
          style={{
            marginLeft: 22,
            flex: 1,
            maxWidth: 1100,
            height: 32,
            borderRadius: 16,
            background: C.asphalt,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 10,
            fontFamily: body,
            fontSize: 19,
            color: C.onAsphalt,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <svg width="14" height="16" viewBox="0 0 14 16" style={{flexShrink: 0}}>
            <rect x="1" y="7" width="12" height="8.5" rx="2" fill={C.onAsphaltMuted} />
            <path d="M3.8 7V5a3.2 3.2 0 0 1 6.4 0v2" stroke={C.onAsphaltMuted} strokeWidth="1.8" fill="none" />
          </svg>
          <span style={{fontWeight: 600}}>{host}</span>
          <span style={{color: C.onAsphaltMuted, overflow: 'hidden', textOverflow: 'ellipsis'}}>{path}</span>
        </div>
      </div>
      <div style={{position: 'absolute', left: 0, top: WINDOW.bar, width: WINDOW.width, height: 900, overflow: 'hidden', background: C.paper}}>
        {children}
      </div>
    </div>
  );
};

/** Survey-paint swipe: an orange band with a dashed centre line sweeps across and swaps the scenes underneath. */
const PaintSwipe: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const entering = presentationDirection === 'entering';
  const visible = entering ? presentationProgress >= 0.5 : presentationProgress < 0.5;
  const x = interpolate(presentationProgress, [0, 1], [-2600, 2600]);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{opacity: visible ? 1 : 0}}>{children}</AbsoluteFill>
      {entering ? (
        <AbsoluteFill style={{overflow: 'hidden', pointerEvents: 'none'}}>
          <div style={{position: 'absolute', left: -340, top: -500, width: 2600, height: 2080, transform: `translateX(${x}px) rotate(-12deg)`}}>
            <div style={{position: 'absolute', inset: 0, background: C.paint}} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 1028,
                height: 22,
                background: `repeating-linear-gradient(to right, ${C.centreLine} 0 120px, transparent 120px 200px)`,
              }}
            />
            <div style={{position: 'absolute', top: 0, bottom: 0, left: -160, width: 160, background: C.asphalt}} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const paintSwipe = (): TransitionPresentation<Record<string, never>> => ({component: PaintSwipe, props: {}});

/** Where the opening scene was filmed. */
export const LocationTag: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [8, 22], [0, 1], {...clamp, easing: easeOut});
  const exit = interpolate(frame, [sec(5.2), sec(5.6)], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        left: 64,
        top: 56,
        padding: '14px 24px',
        borderRadius: 14,
        background: 'rgba(22,24,26,.78)',
        opacity: enter * exit,
        transform: `translateX(${(1 - enter) * -24}px)`,
        fontFamily: body,
        color: C.onAsphalt,
      }}
    >
      <div style={{fontFamily: display, fontWeight: 800, fontSize: 36, letterSpacing: 0.6}}>SALISBURY UNIVERSITY</div>
      <div style={{fontSize: 22, color: C.onAsphaltMuted, marginTop: 2}}>Salisbury, Maryland · after dark</div>
    </div>
  );
};

/** The wordmark lands as the speaker names the app. */
export const BrandBug: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [sec(at), sec(at) + 10], [0, 1], {...clamp, easing: easeOut});
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        top: 60,
        padding: '22px 34px',
        borderRadius: 18,
        background: 'rgba(22,24,26,.86)',
        opacity: enter,
        transform: `scale(${0.9 + enter * 0.1})`,
        transformOrigin: 'left top',
      }}
    >
      <Wordmark size={64} ringStart={sec(at) + 4} />
    </div>
  );
};

/** Screen recording of the same steps, shown beside the on-camera demo where the iPad is too small to read. */
export const ScreenInset: React.FC<{src: string}> = ({src}) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [6, 20], [0, 1], {...clamp, easing: easeOut});
  return (
    <div
      style={{
        position: 'absolute',
        left: 56,
        top: 56,
        width: 768,
        opacity: enter,
        transform: `translateY(${(1 - enter) * -20}px)`,
      }}
    >
      <div
        style={{
          display: 'inline-block',
          marginBottom: 10,
          padding: '6px 14px',
          borderRadius: 10,
          background: C.paint,
          color: '#fff',
          fontFamily: display,
          fontWeight: 800,
          fontSize: 26,
          letterSpacing: 0.8,
        }}
      >
        ON SCREEN · FIXPLEASE.WORK
      </div>
      <div style={{width: 768, height: 432, borderRadius: 14, overflow: 'hidden', boxShadow: '0 18px 50px rgba(0,0,0,.45)', border: `3px solid ${C.asphalt}`}}>
        <OffthreadVideo src={staticFile(src)} muted style={{width: '100%', height: '100%'}} />
      </div>
    </div>
  );
};

/** Closing card: the promise, the address, and the script's sign-off line. */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  // Lines land with the closing voiceover: "See something broken? / Snap it. / We'll find who fixes it."
  const line = (start: number) => {
    const p = interpolate(frame, [start, start + 12], [0, 1], {...clamp, easing: easeOut});
    return {opacity: p, transform: `translateY(${(1 - p) * 30}px)`};
  };
  const fadeOut = interpolate(frame, [sec(6.0), sec(6.5)], [1, 0], clamp);
  const dot = interpolate(frame, [10, 26], [0, 1], {...clamp, easing: easeOut});
  return (
    <AbsoluteFill style={{background: C.asphalt, opacity: fadeOut}}>
      <div
        style={{
          position: 'absolute',
          left: 1795,
          top: 0,
          width: 10,
          height: '100%',
          background: `repeating-linear-gradient(to bottom, ${C.centreLine} 0 60px, transparent 60px 104px)`,
        }}
      />
      <div style={{position: 'absolute', left: 1800 - 18, top: 520, width: 36, height: 36, borderRadius: 18, background: C.onAsphalt, transform: `scale(${dot})`}} />
      <PaintRing start={22} drawFrames={16} strokeWidth={9} style={{left: 1800 - 80, top: 538 - 70, width: 160, height: 140}} />
      <div style={{position: 'absolute', left: 140, top: 110}}>
        <Wordmark size={72} ringStart={8} />
      </div>
      <div style={{position: 'absolute', left: 140, top: 300, fontFamily: display, fontWeight: 900, fontSize: 132, lineHeight: 1, color: '#fff'}}>
        <div style={line(48)}>
          SEE SOMETHING{' '}
          <span style={{position: 'relative', display: 'inline-block'}}>
            BROKEN?
            <PaintRing start={58} drawFrames={16} strokeWidth={8} style={{left: '-7%', top: '-10%', width: '112%', height: '124%'}} />
          </span>
        </div>
        <div style={line(96)}>SNAP IT.</div>
        <div style={line(128)}>WE’LL FIND WHO FIXES IT.</div>
      </div>
      <div style={{position: 'absolute', left: 140, top: 820, ...line(140)}}>
        <div style={{fontFamily: body, fontWeight: 700, fontSize: 58, color: C.paintOnDark}}>fixplease.work</div>
        <div style={{fontFamily: body, fontSize: 30, color: C.onAsphaltMuted, marginTop: 10}}>
          Fix Please — less searching, more reporting. · Built at GullHacks 2026
        </div>
      </div>
    </AbsoluteFill>
  );
};
