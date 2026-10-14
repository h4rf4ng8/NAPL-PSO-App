import { useState } from 'react';
import { applyTheme, getSavedTheme } from './theme';

export function useTheme() {
  const [theme, setTheme] = useState(getSavedTheme);
  return { theme, toggleTheme: () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  } };
}
