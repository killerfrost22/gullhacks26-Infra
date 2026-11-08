/**
 * Edit decision list for the introduction video (`submission/video-script.md`).
 *
 * Human scenes (`scene1-3.mp4`) are the team's phone recordings, tone-mapped to SDR. Screen scenes (`w*.mp4`)
 * are captures of the live site at fixplease.work; their voiceover comes from ElevenLabs (`vo*.mp3`). All media
 * lives in `public/intro/`. Times are seconds; `from`/`to` are positions in the source file.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const sec = (seconds: number): number => Math.round(seconds * FPS);

export interface Piece {
  /** Source position, seconds. */
  from: number;
  to: number;
  /** Playback speed; above 1 compresses holds and cursor travel. */
  rate?: number;
  /** Show the `from` frame for this many seconds instead of playing. */
  hold?: number;
  /** Punch-in scale that disguises a jump cut in single-camera footage. */
  zoom?: number;
}

export const pieceSeconds = (piece: Piece): number => piece.hold ?? (piece.to - piece.from) / (piece.rate ?? 1);
export const pieceFrames = (piece: Piece): number => sec(pieceSeconds(piece));

export type TransitionKind = 'fade' | 'paint' | 'slide-left' | 'slide-right' | 'wipe';

export interface Kicker {
  text: string;
  from: number;
  to: number;
}

export interface VoiceCue {
  file: string;
  /** Seconds after the scene starts. */
  at: number;
}

interface SceneBase {
  id: string;
  /** How this scene hands over to the next one. */
  transition?: {kind: TransitionKind; frames: number};
  kickers?: Kicker[];
  voice?: VoiceCue[];
}

export interface HumanScene extends SceneBase {
  kind: 'human';
  src: string;
  pieces: Piece[];
  /** Key into `CAPTIONS`. */
  captions: string;
}

export interface ScreenScene extends SceneBase {
  kind: 'screen';
  src: string;
  pieces: Piece[];
  /** Address bar text over time (scene seconds). */
  url: {from: number; text: string}[];
}

export interface EndScene extends SceneBase {
  kind: 'end';
  seconds: number;
}

export type Scene = HumanScene | ScreenScene | EndScene;

const SITE = 'fixplease.work';

export const SCENES: Scene[] = [
  {
    // The problem, on location at Salisbury University.
    id: 'problem',
    kind: 'human',
    src: 'intro/scene1.mp4',
    pieces: [{from: 0.6, to: 15.5}],
    captions: 'scene1',
    transition: {kind: 'fade', frames: 12},
  },
  {
    id: 'built',
    kind: 'human',
    src: 'intro/scene2.mp4',
    pieces: [{from: 0, to: 2.6}],
    captions: 'scene2',
    transition: {kind: 'paint', frames: 20},
  },
  {
    // Script screen 1: the promise.
    id: 'promise',
    kind: 'screen',
    src: 'intro/w1_home_photo_pin.mp4',
    pieces: [{from: 0, to: 5.2}],
    url: [{from: 0, text: SITE}],
    kickers: [{text: 'From “someone should fix this” to a report.', from: 0.6, to: 5.2}],
    voice: [{file: 'intro/vo1_promise.mp3', at: 0.4}],
    transition: {kind: 'paint', frames: 20},
  },
  {
    // Script screens 2-3: photo and pin, demonstrated on an iPad. Cuts drop a network aside and a read-aloud
    // stage direction.
    id: 'photo-pin',
    kind: 'human',
    src: 'intro/scene3.mp4',
    pieces: [
      {from: 0, to: 27.7},
      {from: 31.85, to: 36.6, zoom: 1.12},
      {from: 40.3, to: 47.2},
      {from: 57.0, to: 59.55, zoom: 1.12},
      {from: 61.85, to: 64.9},
    ],
    captions: 'scene3',
    kickers: [
      {text: 'Photo first. Hidden metadata removed.', from: 7, to: 16},
      {text: 'Exact location changes who is responsible.', from: 22.5, to: 39},
    ],
    transition: {kind: 'paint', frames: 20},
  },
  {
    // Script screens 4-5: note, then the real (unshortened) lookup.
    id: 'note-investigate',
    kind: 'screen',
    src: 'intro/w2_note_investigate.mp4',
    pieces: [
      {from: 1.0, to: 6.5},
      {from: 6.5, to: 15.5, rate: 2},
      {from: 15.5, to: 31.8},
    ],
    url: [{from: 0, text: SITE}],
    kickers: [
      {text: 'A small detail can change the destination.', from: 0.8, to: 10.8},
      {text: 'Photo + location + context + official sources.', from: 11.2, to: 24.6},
    ],
    voice: [
      {file: 'intro/vo2_note.mp3', at: 0.3},
      {file: 'intro/vo3_investigate.mp3', at: 11.0},
    ],
    transition: {kind: 'fade', frames: 10},
  },
  {
    // Script screen 6: verdict, warnings, sources.
    id: 'evidence',
    kind: 'screen',
    src: 'intro/w3_result.mp4',
    pieces: [
      {from: 0.5, to: 6.0},
      {from: 6.0, to: 6.0, hold: 2.5},
      {from: 6.0, to: 17.6},
      {from: 17.6, to: 22.9, rate: 1.8},
      {from: 22.9, to: 24.5},
    ],
    url: [{from: 0, text: SITE}],
    kickers: [{text: 'Evidence visible. Uncertainty visible.', from: 0.8, to: 23.5}],
    voice: [
      {file: 'intro/vo4a.mp3', at: 0.3},
      {file: 'intro/vo4b.mp3', at: 4.1},
      // "...so the warning says so" lands as the warnings scroll into view.
      {file: 'intro/vo4c.mp3', at: 12.5},
      // "...one click away" lands on the hover and click.
      {file: 'intro/vo4d.mp3', at: 20.8},
    ],
    transition: {kind: 'slide-left', frames: 15},
  },
  {
    // The first returned source, opened.
    id: 'source',
    kind: 'screen',
    src: 'intro/w4_source.mp4',
    pieces: [{from: 1.8, to: 8.3}],
    url: [{from: 0, text: 'salisbury.edu/administration/administration-and-finance-offices/physical-plant/service-center.aspx'}],
    voice: [{file: 'intro/vo4e_source.mp3', at: 0.6}],
    transition: {kind: 'slide-right', frames: 15},
  },
  {
    // Script screen 7: the editable email and the download.
    id: 'email',
    kind: 'screen',
    src: 'intro/w5_email.mp4',
    pieces: [
      {from: 1.0, to: 9.5},
      {from: 9.5, to: 12.5, rate: 2},
      {from: 12.5, to: 14.0},
      {from: 14.0, to: 17.5, rate: 2},
      {from: 17.5, to: 20.5},
      {from: 20.5, to: 24.0, rate: 2.5},
      {from: 24.0, to: 28.0},
    ],
    url: [{from: 0, text: SITE}],
    kickers: [{text: 'Review first. You stay in control.', from: 0.8, to: 21}],
    voice: [
      {file: 'intro/vo5a.mp3', at: 1.2},
      {file: 'intro/vo5b.mp3', at: 8.0},
      {file: 'intro/vo5c.mp3', at: 14.3},
      {file: 'intro/vo5d.mp3', at: 19.3},
    ],
    transition: {kind: 'wipe', frames: 18},
  },
  {
    // Script screens 8-9: privacy and the stack, then Back to the intact report.
    id: 'privacy-back',
    kind: 'screen',
    src: 'intro/w6_privacy_back.mp4',
    pieces: [
      {from: 2.5, to: 29.2},
      {from: 29.2, to: 29.2, hold: 1.5},
    ],
    url: [
      {from: 0, text: SITE},
      {from: 2.69, text: `${SITE}/privacy`},
      {from: 18.43, text: SITE},
    ],
    kickers: [{text: 'React · TypeScript · Node.js · Gemini · OpenStreetMap', from: 0.8, to: 17.6}],
    voice: [
      {file: 'intro/vo6_privacy.mp3', at: 0.6},
      // Runs on into the end card: "See something broken? Snap it. We'll find who fixes it."
      {file: 'intro/vo7_close.mp3', at: 18.5},
    ],
    transition: {kind: 'fade', frames: 18},
  },
  {id: 'end', kind: 'end', seconds: 6.5},
];

export const sceneFrames = (scene: Scene): number =>
  scene.kind === 'end' ? sec(scene.seconds) : scene.pieces.reduce((sum, piece) => sum + pieceFrames(piece), 0);

/** First frame of each scene on the final timeline: transitions overlap neighbouring scenes. */
export const SCENE_STARTS: number[] = [0];
for (let index = 1; index < SCENES.length; index++) {
  const previous = SCENES[index - 1];
  SCENE_STARTS.push(SCENE_STARTS[index - 1] + sceneFrames(previous) - (previous.transition?.frames ?? 0));
}

export const TOTAL_FRAMES = SCENE_STARTS[SCENES.length - 1] + sceneFrames(SCENES[SCENES.length - 1]);
