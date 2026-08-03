'use client';
import { useId } from 'react';

// Moon glyph: `frac` = share of kids home (0 = new moon, 1 = full moon).
export default function Moon({ frac = 1, size = 16, title }) {
  const id = useId();
  const f = Math.max(0, Math.min(1, frac));
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ verticalAlign: '-2px' }} aria-label={title}>
      {title && <title>{title}</title>}
      <circle cx="10" cy="10" r="8.5" fill="#DCE3F0" />
      <clipPath id={id}><circle cx="10" cy="10" r="8.5" /></clipPath>
      <circle cx={10 + 17 * (1 - f)} cy="10" r="8.5" fill="#171A23" clipPath={`url(#${id})`} />
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="#A9B9DC" strokeWidth="1" />
    </svg>
  );
}

export function phaseLabel(home, total) {
  if (!total) return '';
  if (home === total) return 'Full house 🌕';
  if (home === 0) return 'Quiet night 🌑';
  if (home / total >= 0.5) return `${home} of ${total} home`;
  return `${home} of ${total} home`;
}
