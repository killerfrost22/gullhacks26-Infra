export type Transition = 'stripes' | 'band' | 'square' | 'tint';

export interface Beat {
  /** Seconds from the start of the video. The photo cuts in on this frame. */
  time: number;
  /** Short name of the place, shown large. */
  word: string;
  /** Where it is, shown in a tag under the word. */
  where: string;
  /** Accent color: the tag behind `where`, and the pastel the `tint` transition fades to. */
  bg: string;
  /** How this beat comes in. `tint` fades the previous beat to a pastel of this beat's `bg` over its last 4 frames. */
  transition: Transition;
  /** Path inside `public/`. Credits: `src/photo-credits.json`. */
  photo: string;
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
/** The last beat runs until this point: the first 19 s of the song. */
export const DURATION_SECONDS = 19;

/** The song at `public/track.mp3`; the render picks it up automatically. */
export const TRACK_FILE = 'track.mp3';
/** Where the video starts in the song: the very beginning. */
export const TRACK_START_SECONDS = 0;

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

// Cuts follow the song's opening (138 BPM; beats every 0.435 s from ~0.0 s, kick on 1, snare on 2 and 4):
// a 3-3-2 eighth-note pattern landing on "and of 4", beat 2, and "and of 3", so photos change every
// 0.652 / 0.652 / 0.435 s (avg ~0.58 s). The 19th photo holds one bar (1.74 s); the last holds to 19 s.
export const BEATS: Beat[] = [
  {time: 0.000, word: 'MCKELDIN MALL', where: 'UMD, College Park', bg: YELLOW, transition: 'tint', photo: 'photos/umd-mckeldin-mall-autumn.jpg'},
  {time: 0.650, word: 'BAY BRIDGE', where: 'Sandy Point State Park', bg: RASPBERRY, transition: 'stripes', photo: 'photos/md-chesapeake-bay-bridge.jpg'},
  {time: 1.302, word: 'WICOMICO RIVER', where: 'Downtown Salisbury', bg: GREEN, transition: 'band', photo: 'photos/salisbury-wicomico-river.jpg'},
  {time: 1.955, word: 'HYTCHE ATHLETIC CENTER', where: 'UMES, Princess Anne', bg: VIOLET, transition: 'square', photo: 'photos/umes-hytche-athletic-center.jpg'},
  {time: 2.389, word: 'AVIATION MUSEUM', where: 'College Park', bg: AMBER, transition: 'tint', photo: 'photos/cp-aviation-museum.jpg'},
  {time: 3.041, word: 'MCKELDIN LIBRARY', where: 'UMD, College Park', bg: TEAL, transition: 'stripes', photo: 'photos/umd-mckeldin-library.jpg'},
  {time: 3.694, word: 'INNER HARBOR', where: 'Baltimore', bg: PINK, transition: 'band', photo: 'photos/md-baltimore-inner-harbor.jpg'},
  {time: 4.128, word: 'SEA GULL STADIUM', where: 'Salisbury University', bg: LIME, transition: 'square', photo: 'photos/su-sea-gull-stadium.jpg'},
  {time: 4.781, word: 'TEACKLE MANSION', where: 'Princess Anne', bg: PURPLE, transition: 'tint', photo: 'photos/princess-anne-teackle-mansion.jpg'},
  {time: 5.433, word: 'MEMORIAL CHAPEL', where: 'UMD, College Park', bg: SALMON, transition: 'stripes', photo: 'photos/umd-memorial-chapel.jpg'},
  {time: 5.868, word: 'LAKE ARTEMESIA', where: 'College Park', bg: YELLOW, transition: 'band', photo: 'photos/cp-lake-artemesia.jpg'},
  {time: 6.520, word: 'GREAT FALLS', where: 'Potomac River', bg: RASPBERRY, transition: 'square', photo: 'photos/md-great-falls-potomac.jpg'},
  {time: 7.172, word: 'COURTHOUSE', where: 'Wicomico County, Salisbury', bg: GREEN, transition: 'tint', photo: 'photos/salisbury-wicomico-county-courthouse.jpg'},
  {time: 7.607, word: 'MANOKIN CHURCH', where: 'Princess Anne', bg: VIOLET, transition: 'stripes', photo: 'photos/princess-anne-manokin-presbyterian-church.jpg'},
  {time: 8.259, word: 'MAIN ADMIN BUILDING', where: 'UMD, College Park', bg: AMBER, transition: 'band', photo: 'photos/umd-main-administration-building.jpg'},
  {time: 8.911, word: 'FORT MCHENRY', where: 'Baltimore', bg: TEAL, transition: 'square', photo: 'photos/md-fort-mchenry.jpg'},
  {time: 9.346, word: 'MAIN STREET', where: 'Downtown Salisbury', bg: PINK, transition: 'tint', photo: 'photos/salisbury-downtown-main-street.jpg'},
  {time: 9.998, word: 'BECKFORD', where: 'Princess Anne', bg: LIME, transition: 'stripes', photo: 'photos/princess-anne-beckford.jpg'},
  {time: 10.650, word: 'HOLLOWAY HALL', where: 'Salisbury University', bg: PURPLE, transition: 'square', photo: 'photos/su-holloway-hall.jpg'},
  {time: 12.389, word: 'STAMP STUDENT UNION', where: 'UMD, College Park', bg: SALMON, transition: 'tint', photo: 'photos/umd-stamp-student-union.jpg'},
  {time: 12.824, word: 'WILD PONY', where: 'Assateague Island', bg: YELLOW, transition: 'stripes', photo: 'photos/md-assateague-pony.jpg'},
  {time: 13.476, word: 'ROUTE 1', where: 'Downtown College Park', bg: RASPBERRY, transition: 'band', photo: 'photos/cp-downtown-route-1.jpg'},
  {time: 14.128, word: 'POPLAR HILL MANSION', where: 'Salisbury', bg: GREEN, transition: 'square', photo: 'photos/salisbury-poplar-hill-mansion.jpg'},
  {time: 14.563, word: 'THOMAS POINT LIGHTHOUSE', where: 'Chesapeake Bay', bg: VIOLET, transition: 'tint', photo: 'photos/md-thomas-point-shoal-lighthouse.jpg'},
  {time: 15.215, word: 'WATERLOO MANOR', where: 'Princess Anne', bg: AMBER, transition: 'stripes', photo: 'photos/princess-anne-waterloo.jpg'},
  {time: 15.868, word: 'ROSSBOROUGH INN', where: 'UMD, College Park', bg: TEAL, transition: 'band', photo: 'photos/umd-rossborough-inn.jpg'},
  {time: 16.302, word: 'MARYLAND STATE HOUSE', where: 'Annapolis', bg: PINK, transition: 'square', photo: 'photos/md-state-house-annapolis.jpg'},
];
