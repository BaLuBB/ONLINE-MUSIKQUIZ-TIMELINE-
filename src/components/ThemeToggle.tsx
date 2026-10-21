import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from './ui.tsx';

type Theme = 'light' | 'dark';

const systemTheme = (): Theme => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('timeline.theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* ignorieren */
    }
    return systemTheme();
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('timeline.theme', theme);
    } catch {
      /* ignorieren */
    }
  }, [theme]);
  return (
    <IconButton label={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}
