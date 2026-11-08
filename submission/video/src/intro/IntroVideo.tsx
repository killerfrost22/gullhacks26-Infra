import {Audio} from '@remotion/media';
import {linearTiming, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import React from 'react';
import {AbsoluteFill, Easing, Sequence, staticFile} from 'remotion';
import {C} from './brand';
import {
  Backdrop,
  BAND_TOP,
  BrandBug,
  BrowserFrame,
  captionsFor,
  EndCard,
  Kickers,
  LocationTag,
  PiecedVideo,
  paintSwipe,
  ScreenInset,
} from './parts';
import {type Scene, SCENE_STARTS, SCENES, sceneFrames, sec, type TransitionKind} from './timeline';

const transition = (key: string, kind: TransitionKind, frames: number) => {
  const timing = linearTiming({durationInFrames: frames, easing: Easing.inOut(Easing.cubic)});
  switch (kind) {
    case 'fade':
      return <TransitionSeries.Transition key={key} presentation={fade()} timing={timing} />;
    case 'paint':
      return <TransitionSeries.Transition key={key} presentation={paintSwipe()} timing={timing} />;
    case 'slide-left':
      return <TransitionSeries.Transition key={key} presentation={slide({direction: 'from-right'})} timing={timing} />;
    case 'slide-right':
      return <TransitionSeries.Transition key={key} presentation={slide({direction: 'from-left'})} timing={timing} />;
    case 'wipe':
      return <TransitionSeries.Transition key={key} presentation={wipe({direction: 'from-right'})} timing={timing} />;
  }
};

const SceneBody: React.FC<{scene: Scene}> = ({scene}) => {
  switch (scene.kind) {
    case 'human':
      return (
        <AbsoluteFill style={{background: '#000'}}>
          <PiecedVideo src={scene.src} pieces={scene.pieces} withAudio overlay={captionsFor(scene.captions)} />
          {scene.id === 'problem' ? <LocationTag /> : null}
          {scene.id === 'built' ? <BrandBug at={0.9} /> : null}
          {scene.id === 'photo-pin' ? <ScreenInset src="intro/pip_scene3.mp4" /> : null}
          {scene.kickers ? <Kickers kickers={scene.kickers} style={{left: 70, top: 600, padding: '12px 22px', borderRadius: 14, background: 'rgba(22,24,26,.82)'}} /> : null}
        </AbsoluteFill>
      );
    case 'screen':
      return (
        <AbsoluteFill>
          <Backdrop />
          <BrowserFrame url={scene.url}>
            <PiecedVideo src={scene.src} pieces={scene.pieces} />
          </BrowserFrame>
          {scene.kickers ? <Kickers kickers={scene.kickers} style={{left: 160, top: BAND_TOP + 30}} /> : null}
        </AbsoluteFill>
      );
    case 'end':
      return <EndCard />;
  }
};

export const IntroVideo: React.FC = () => (
  <AbsoluteFill style={{background: C.asphalt}}>
    <TransitionSeries>
      {SCENES.flatMap((scene) => [
        <TransitionSeries.Sequence key={scene.id} durationInFrames={sceneFrames(scene)}>
          <SceneBody scene={scene} />
        </TransitionSeries.Sequence>,
        ...(scene.transition ? [transition(`${scene.id}-out`, scene.transition.kind, scene.transition.frames)] : []),
      ])}
    </TransitionSeries>
    {SCENES.flatMap((scene, index) =>
      (scene.voice ?? []).map((cue) => (
        <Sequence key={cue.file} from={SCENE_STARTS[index] + sec(cue.at)} layout="none">
          <Audio src={staticFile(cue.file)} />
        </Sequence>
      )),
    )}
  </AbsoluteFill>
);
