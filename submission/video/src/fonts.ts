import {loadFont as loadAnton} from '@remotion/google-fonts/Anton';
import {loadFont as loadFredoka} from '@remotion/google-fonts/Fredoka';

export const fredoka = loadFredoka('normal', {weights: ['700'], subsets: ['latin']}).fontFamily;
export const anton = loadAnton('normal', {weights: ['400'], subsets: ['latin']}).fontFamily;
