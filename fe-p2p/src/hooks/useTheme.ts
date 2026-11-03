import { useState } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'peer.theme';

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null; // storage can be blocked; the system theme still applies
  }
}

/** Applies a theme picked earlier before React renders, so the page doesn't flash the other one. */
export function applyStoredTheme() {
  const t = stored();
  if (t) document.documentElement.dataset.theme = t;
}

/** The current theme and a toggle. Until the user picks one, it follows the system setting. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(
    () => stored() ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not remembered, but still applied for this visit
    }
  };

  return { theme, toggle };
}
