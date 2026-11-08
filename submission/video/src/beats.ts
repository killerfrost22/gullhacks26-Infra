export type Transition = 'stripes' | 'band' | 'square' | 'tint';

export interface Beat {
  /** Seconds from the start of the video. The beat's photo cuts in on this frame. */
  time: number;
  /** The place in the photo, shown in Anton at the lower left. */
  word: string;
  /** Behind the photo; also the source of the `tint` transition's pastel. */
  bg: string;
  /** Darkened for the word's offset shadow. */
  fg: string;
  /** How this beat comes in. `tint` fades the previous beat to a pastel of this beat's `bg` over its last 4 frames. */
  transition: Transition;
  /** Path inside `public/`. Credits: `src/photo-credits.json`. */
  photo: string;
  /** Vertical crop anchor for the full-frame photo, 0 (top) to 100 (bottom). Defaults to 50. */
  focus?: number;
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** The photos fill the left two-thirds of the frame; the credits roll in the right third. */
export const STAGE_WIDTH = 1280;

/** The song at `public/track.mp3`, played from its start; the render picks it up automatically. */
export const TRACK_FILE = 'track.mp3';
/** One bar of the 138 BPM track, in seconds. */
export const BAR = (4 * 60) / 138;
/** The song's first downbeat, after a two-beat lead-in (measured onset, 138 BPM grid). */
const FIRST_DOWNBEAT = 1.061;

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

const PHOTOS: Omit<Beat, 'time'>[] = [
  {word: 'McKeldin Mall', bg: YELLOW, fg: NAVY_FG, transition: 'tint', photo: 'photos/umd-mckeldin-mall-autumn.jpg'},
  {word: 'Bay Bridge', bg: RASPBERRY, fg: LIME_FG, transition: 'stripes', photo: 'photos/md-chesapeake-bay-bridge.jpg'},
  {word: 'Wicomico River', bg: GREEN, fg: NAVY_FG, transition: 'band', photo: 'photos/salisbury-wicomico-river.jpg'},
  {word: 'Hytche Center', bg: VIOLET, fg: CORAL_FG, transition: 'square', photo: 'photos/umes-hytche-athletic-center.jpg', focus: 15},
  {word: 'Aviation Museum', bg: AMBER, fg: OLIVE_FG, transition: 'tint', photo: 'photos/cp-aviation-museum.jpg'},
  {word: 'McKeldin Library', bg: TEAL, fg: LIME_FG, transition: 'stripes', photo: 'photos/umd-mckeldin-library.jpg'},
  {word: 'Inner Harbor', bg: PINK, fg: MAROON_FG, transition: 'band', photo: 'photos/md-baltimore-inner-harbor.jpg'},
  {word: 'Sea Gull Stadium', bg: LIME, fg: TEAL_FG, transition: 'square', photo: 'photos/su-sea-gull-stadium.jpg', focus: 10},
  {word: 'Teackle Mansion', bg: PURPLE, fg: LIME_FG, transition: 'tint', photo: 'photos/princess-anne-teackle-mansion.jpg'},
  {word: 'Memorial Chapel', bg: SALMON, fg: NAVY_FG, transition: 'stripes', photo: 'photos/umd-memorial-chapel.jpg'},
  {word: 'Lake Artemesia', bg: YELLOW, fg: NAVY_FG, transition: 'band', photo: 'photos/cp-lake-artemesia.jpg'},
  {word: 'Great Falls', bg: RASPBERRY, fg: LIME_FG, transition: 'square', photo: 'photos/md-great-falls-potomac.jpg'},
  {word: 'Courthouse', bg: GREEN, fg: NAVY_FG, transition: 'tint', photo: 'photos/salisbury-wicomico-county-courthouse.jpg', focus: 20},
  {word: 'Manokin Church', bg: VIOLET, fg: CORAL_FG, transition: 'stripes', photo: 'photos/princess-anne-manokin-presbyterian-church.jpg'},
  {word: 'Reflecting Pool', bg: AMBER, fg: OLIVE_FG, transition: 'band', photo: 'photos/umd-main-administration-building.jpg'},
  {word: 'Fort McHenry', bg: TEAL, fg: LIME_FG, transition: 'square', photo: 'photos/md-fort-mchenry.jpg'},
  {word: 'Main Street', bg: PINK, fg: MAROON_FG, transition: 'tint', photo: 'photos/salisbury-downtown-main-street.jpg'},
  {word: 'Beckford', bg: LIME, fg: TEAL_FG, transition: 'stripes', photo: 'photos/princess-anne-beckford.jpg'},
  {word: 'Holloway Hall', bg: PURPLE, fg: LIME_FG, transition: 'square', photo: 'photos/su-holloway-hall.jpg', focus: 0},
  {word: 'Stamp Union', bg: SALMON, fg: NAVY_FG, transition: 'tint', photo: 'photos/umd-stamp-student-union.jpg', focus: 10},
  {word: 'Assateague Pony', bg: YELLOW, fg: NAVY_FG, transition: 'stripes', photo: 'photos/md-assateague-pony.jpg'},
  {word: 'Route 1', bg: RASPBERRY, fg: LIME_FG, transition: 'band', photo: 'photos/cp-downtown-route-1.jpg'},
  {word: 'Poplar Hill', bg: GREEN, fg: NAVY_FG, transition: 'square', photo: 'photos/salisbury-poplar-hill-mansion.jpg', focus: 25},
  {word: 'Thomas Point', bg: VIOLET, fg: CORAL_FG, transition: 'tint', photo: 'photos/md-thomas-point-shoal-lighthouse.jpg'},
  {word: 'Waterloo', bg: AMBER, fg: OLIVE_FG, transition: 'stripes', photo: 'photos/princess-anne-waterloo.jpg'},
  {word: 'Rossborough Inn', bg: TEAL, fg: LIME_FG, transition: 'band', photo: 'photos/umd-rossborough-inn.jpg'},
  {word: 'State House', bg: PINK, fg: MAROON_FG, transition: 'square', photo: 'photos/md-state-house-annapolis.jpg'},
];

// Each photo holds one bar (1.74 s), cutting on the downbeat; the first also covers the lead-in.
// The song's first drop (28.9 s) lands on the 17th photo.
export const BEATS: Beat[] = PHOTOS.map((photo, k) => ({...photo, time: k === 0 ? 0 : FIRST_DOWNBEAT + k * BAR}));

/** The Fix Please end card starts on the downbeat after the last photo, as the song eases into a calmer section. */
export const END_CARD_SECONDS = FIRST_DOWNBEAT + BEATS.length * BAR;
/** The tech stack follows three bars later. */
export const STACK_SECONDS = END_CARD_SECONDS + 3 * BAR;
/** Four bars after that, on the song's second drop (60.19 s), the team members land one per bar. */
export const MEMBERS_SECONDS = STACK_SECONDS + 4 * BAR;
/** Then the team photo, which holds four bars while the music fades out. */
export const TEAM_SECONDS = MEMBERS_SECONDS + 4 * BAR;
export const DURATION_SECONDS = TEAM_SECONDS + 4 * BAR;
/** The team photo, in `public/`. */
export const TEAM_PHOTO = 'team/teampic.jpg';
/** The music fades out over the last two bars. */
export const MUSIC_FADE_SECONDS = 2 * BAR;
