export const LIGHT_PALETTE = {
  navy: '#ffffff',          // primary surface
  navyDeep: '#f4f6fb',      // page background
  navyLight: '#dfe4f0',     // subtle border / muted surface
  green: '#2d7a4a',
  greenLight: '#3fa05f',
  red: '#a8243a',
  redLight: '#c93852',
  cream: '#1c4788',         // primary text (ASL blue on light bg)
  gold: '#a8892e',
  goldLight: '#c0a038',
  white: '#ffffff',         // card background
  black: '#000000',
  brandNavy: '#3068b0',
  brandNavyDeep: '#185090',
  onColor: '#ffffff',
};
export const DARK_PALETTE = {
  navy: '#1a2235',          // primary surface
  navyDeep: '#0f1522',      // page background (near-black navy)
  navyLight: '#2a3447',     // borders, muted surfaces
  green: '#3fa05f',         // slightly brighter to pop on dark
  greenLight: '#5cc080',
  red: '#d04863',
  redLight: '#e57d8b',
  cream: '#e4e9f0',         // primary text (near-white on dark bg)
  gold: '#d8b858',          // brighter gold on dark
  goldLight: '#e5c87e',
  white: '#1a2235',         // card background matches 'navy' surface
  black: '#000000',
  brandNavy: '#5c90d4',     // lighter so it reads on dark bg
  brandNavyDeep: '#3068b0',
  onColor: '#ffffff',
};

// Shared mutable palette object. Every component reads from C.* at render
// time, so swapping values here + forcing a re-render recolors the whole
// app without touching individual component code.
export const C = { ...LIGHT_PALETTE };

// Read saved theme preference from localStorage so dark users stay dark across
// visits. Falls back to 'light' when unset or storage is unavailable.
export const getSavedTheme = (): ThemeMode => {
  try { return localStorage.getItem('asl_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
};
// Mutate C in place to match the requested theme + save the choice.
export type ThemeMode = 'light' | 'dark';
export const applyTheme = (mode: ThemeMode) => {
  const palette = mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  Object.assign(C, palette);
  try { localStorage.setItem('asl_theme', mode); } catch { /* Theme persistence is optional when storage is unavailable. */ }
  // Also set data-theme on <html> so any CSS rules in index.css that need to
  // respond to theme (e.g. the pitch background texture) can hook into it.
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = mode;
  }
};
// Apply saved theme immediately so first render matches user preference.

