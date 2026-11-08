import React from 'react';
import {Composition} from 'remotion';
import {FPS, HEIGHT, WIDTH} from './beats';
import {PhotoCountdown, TOTAL_FRAMES} from './PhotoCountdown';

export const Root: React.FC = () => (
  <Composition
    id="PhotoCountdown"
    component={PhotoCountdown}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
