// Read saved theme preference from localStorage so dark users stay dark across
// visits. Falls back to 'light' when unset or storage is unavailable.
export const getSavedTheme = (): ThemeMode => {
  try { return localStorage.getItem('asl_theme') === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
};
// CSS variables own the palette; the preference remains local to this browser.
export type ThemeMode = 'light' | 'dark';
export const applyTheme = (mode: ThemeMode) => {
  try { localStorage.setItem('asl_theme', mode); } catch { /* Theme persistence is optional when storage is unavailable. */ }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = mode;
  }
};

