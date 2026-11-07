/** Refined civic emblem: modern signal diamond with precision pin geometry. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-gold" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FBBF24" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
        <linearGradient id="logo-pin" x1="22" y1="18" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F172A" />
          <stop offset="1" stopColor="#1E293B" />
        </linearGradient>
        <filter id="logo-shadow" x="6" y="6" width="52" height="52" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#F59E0B" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect x="12" y="12" width="40" height="40" rx="9" transform="rotate(45 32 32)" fill="url(#logo-gold)" stroke="#0F172A" strokeWidth="2.5" filter="url(#logo-shadow)" />
      <path d="M32 17c-5.8 0-10 4.2-10 9.8 0 7.3 10 17.2 10 17.2s10-9.9 10-17.2c0-5.6-4.2-9.8-10-9.8Z" fill="url(#logo-pin)" />
      <circle cx="32" cy="26.8" r="3.6" fill="#FBBF24" />
    </svg>
  );
}
