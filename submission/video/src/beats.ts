export type Transition = 'stripes' | 'band' | 'square' | 'tint';

export interface Beat {
  /** Seconds from the start of the video. The beat's number pops in on this frame. */
  time: number;
  number: number;
  /** Shown in Anton over the left half of the number. */
  word: string;
  bg: string;
  /** Number color. */
  fg: string;
  /** How this beat comes in. `tint` fades the previous beat to a pastel of this beat's `bg` over its last 4 frames. */
  transition: Transition;
  /** Path inside `public/`. Credits: `src/photo-credits.json`. */
  photo: string;
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** Beat 27 runs until this point: 11 bars of the 138 BPM track. */
export const DURATION_SECONDS = 19.13;

/** The song at `public/track.mp3`; the render picks it up automatically. */
export const TRACK_FILE = 'track.mp3';
/** Where the video starts in the song: the drop's downbeat (measured onset, 138 BPM grid). */
export const TRACK_START_SECONDS = 60.216;

const YELLOW = '#EBFA1F';
const AMBER = '#FAC832';
const GREEN = '#58D928';
const PINK = '#FA87BD';
const LIME = '#D6FB40';
const RASPBERRY = '#E03F6D';
const TEAL = '#0C8CA1';
const PURPLE = '#A133C3';
const VIOLET = '#7544AD';
const SALMON = '#EE6D76';

const NAVY_FG = '#1B2559';
const OLIVE_FG = '#4F5B0B';
const MAROON_FG = '#7A1131';
const TEAL_FG = '#0A4F5C';
const CORAL_FG = '#FF7A5C';
const LIME_FG = '#C9F53B';

// Cuts follow the song (138 BPM, starting at the drop): a 3-3-2 eighth-note pattern per bar,
// so beats are 0.652 / 0.652 / 0.435 s (avg ~0.58 s). #19 lands on a downbeat and holds one bar (1.74 s);
// #27 holds to the end of bar 11.
export const BEATS: Beat[] = [
  {time: 0.000, number: 1, word: '[WORD]', bg: YELLOW, fg: NAVY_FG, transition: 'tint', photo: 'photos/umd-mckeldin-mall-autumn.jpg'},
  {time: 0.652, number: 2, word: '[WORD]', bg: RASPBERRY, fg: LIME_FG, transition: 'stripes', photo: 'photos/md-chesapeake-bay-bridge.jpg'},
  {time: 1.304, number: 3, word: '[WORD]', bg: GREEN, fg: NAVY_FG, transition: 'band', photo: 'photos/salisbury-wicomico-river.jpg'},
  {time: 1.739, number: 4, word: '[WORD]', bg: VIOLET, fg: CORAL_FG, transition: 'square', photo: 'photos/umes-hytche-athletic-center.jpg'},
  {time: 2.391, number: 5, word: '[WORD]', bg: AMBER, fg: OLIVE_FG, transition: 'tint', photo: 'photos/cp-aviation-museum.jpg'},
  {time: 3.043, number: 6, word: '[WORD]', bg: TEAL, fg: LIME_FG, transition: 'stripes', photo: 'photos/umd-mckeldin-library.jpg'},
  {time: 3.478, number: 7, word: '[WORD]', bg: PINK, fg: MAROON_FG, transition: 'band', photo: 'photos/md-baltimore-inner-harbor.jpg'},
  {time: 4.130, number: 8, word: '[WORD]', bg: LIME, fg: TEAL_FG, transition: 'square', photo: 'photos/su-sea-gull-stadium.jpg'},
  {time: 4.783, number: 9, word: '[WORD]', bg: PURPLE, fg: LIME_FG, transition: 'tint', photo: 'photos/princess-anne-teackle-mansion.jpg'},
  {time: 5.217, number: 10, word: '[WORD]', bg: SALMON, fg: NAVY_FG, transition: 'stripes', photo: 'photos/umd-memorial-chapel.jpg'},
  {time: 5.870, number: 11, word: '[WORD]', bg: YELLOW, fg: NAVY_FG, transition: 'band', photo: 'photos/cp-lake-artemesia.jpg'},
  {time: 6.522, number: 12, word: '[WORD]', bg: RASPBERRY, fg: LIME_FG, transition: 'square', photo: 'photos/md-great-falls-potomac.jpg'},
  {time: 6.957, number: 13, word: '[WORD]', bg: GREEN, fg: NAVY_FG, transition: 'tint', photo: 'photos/salisbury-wicomico-county-courthouse.jpg'},
  {time: 7.609, number: 14, word: '[WORD]', bg: VIOLET, fg: CORAL_FG, transition: 'stripes', photo: 'photos/princess-anne-manokin-presbyterian-church.jpg'},
  {time: 8.261, number: 15, word: '[WORD]', bg: AMBER, fg: OLIVE_FG, transition: 'band', photo: 'photos/umd-main-administration-building.jpg'},
  {time: 8.696, number: 16, word: '[WORD]', bg: TEAL, fg: LIME_FG, transition: 'square', photo: 'photos/md-fort-mchenry.jpg'},
  {time: 9.348, number: 17, word: '[WORD]', bg: PINK, fg: MAROON_FG, transition: 'tint', photo: 'photos/salisbury-downtown-main-street.jpg'},
  {time: 10.000, number: 18, word: '[WORD]', bg: LIME, fg: TEAL_FG, transition: 'stripes', photo: 'photos/princess-anne-beckford.jpg'},
  {time: 10.435, number: 19, word: '[WORD]', bg: PURPLE, fg: LIME_FG, transition: 'square', photo: 'photos/su-holloway-hall.jpg'},
  {time: 12.174, number: 20, word: '[WORD]', bg: SALMON, fg: NAVY_FG, transition: 'tint', photo: 'photos/umd-stamp-student-union.jpg'},
  {time: 12.826, number: 21, word: '[WORD]', bg: YELLOW, fg: NAVY_FG, transition: 'stripes', photo: 'photos/md-assateague-pony.jpg'},
  {time: 13.478, number: 22, word: '[WORD]', bg: RASPBERRY, fg: LIME_FG, transition: 'band', photo: 'photos/cp-downtown-route-1.jpg'},
  {time: 13.913, number: 23, word: '[WORD]', bg: GREEN, fg: NAVY_FG, transition: 'square', photo: 'photos/salisbury-poplar-hill-mansion.jpg'},
  {time: 14.565, number: 24, word: '[WORD]', bg: VIOLET, fg: CORAL_FG, transition: 'tint', photo: 'photos/md-thomas-point-shoal-lighthouse.jpg'},
  {time: 15.217, number: 25, word: '[WORD]', bg: AMBER, fg: OLIVE_FG, transition: 'stripes', photo: 'photos/princess-anne-waterloo.jpg'},
  {time: 15.652, number: 26, word: '[WORD]', bg: TEAL, fg: LIME_FG, transition: 'band', photo: 'photos/umd-rossborough-inn.jpg'},
  {time: 16.304, number: 27, word: '[WORD]', bg: PINK, fg: MAROON_FG, transition: 'square', photo: 'photos/md-state-house-annapolis.jpg'},
];
