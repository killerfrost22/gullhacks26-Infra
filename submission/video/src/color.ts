const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Linear blend of two `#RRGGBB` colors: `amount` 0 returns `from`, 1 returns `to`. */
export const mix = (from: string, to: string, amount: number): string => {
  const target = channels(to);
  const blended = channels(from).map((c, i) => Math.round(c + (target[i] - c) * amount));
  return `#${blended.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** WCAG relative luminance of a `#RRGGBB` color, 0 (black) to 1 (white). */
export const luminance = (hex: string): number => {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The tint the "tint" transition fades to before cutting to `hex`. */
export const pastel = (hex: string): string => mix(hex, '#FFFFFF', 0.65);
