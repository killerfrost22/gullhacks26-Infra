const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Linear blend of two `#RRGGBB` colors: `amount` 0 returns `from`, 1 returns `to`. */
export const mix = (from: string, to: string, amount: number): string => {
  const target = channels(to);
  const blended = channels(from).map((c, i) => Math.round(c + (target[i] - c) * amount));
  return `#${blended.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** The extruded side of the fake-3D number. */
export const shade = (hex: string): string => mix(hex, '#000000', 0.45);

/** The tint the "tint" transition fades to before cutting to `hex`. */
export const pastel = (hex: string): string => mix(hex, '#FFFFFF', 0.65);
