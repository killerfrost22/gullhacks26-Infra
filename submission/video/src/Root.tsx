import React from 'react';
import {Composition} from 'remotion';
import {FPS, HEIGHT, WIDTH} from './beats';
import {PhotoCountdown, TOTAL_FRAMES} from './PhotoCountdown';
import {IntroVideo} from './intro/IntroVideo';
import {FPS as INTRO_FPS, HEIGHT as INTRO_HEIGHT, TOTAL_FRAMES as INTRO_FRAMES, WIDTH as INTRO_WIDTH} from './intro/timeline';

export const Root: React.FC = () => (
  <>
    <Composition
      id="PhotoCountdown"
      component={PhotoCountdown}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="IntroVideo"
      component={IntroVideo}
      durationInFrames={INTRO_FRAMES}
      fps={INTRO_FPS}
      width={INTRO_WIDTH}
      height={INTRO_HEIGHT}
    />
  </>
);
