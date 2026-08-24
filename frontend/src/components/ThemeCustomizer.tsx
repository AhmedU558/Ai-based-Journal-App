import { useEffect, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccentTheme {
  id: string;
  name: string;
  primary: string;
  purple: string;
}

const ACCENT_THEMES: AccentTheme[] = [
  { id: 'indigo', name: 'Neon Indigo', primary: '#6366f1', purple: '#a855f7' },
  { id: 'cyan', name: 'Cyberpunk Cyan', primary: '#06b6d4', purple: '#3b82f6' },
  { id: 'emerald', name: 'Emerald Forest', primary: '#10b981', purple: '#059669' },
  { id: 'rose', name: 'Sunset Rose', primary: '#f43f5e', purple: '#ec4899' },
];

export default function ThemeCustomizer() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('aura_theme') || 'indigo');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const selected = ACCENT_THEMES.find((t) => t.id === theme);
    if (selected) {
      document.documentElement.style.setProperty('--accent-indigo', selected.primary);
      document.documentElement.style.setProperty('--accent-purple', selected.purple);
    }
  }, [theme]);

  const selectTheme = (themeId: string) => {
    setTheme(themeId);
    localStorage.setItem('aura_theme', themeId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn-secondary py-2 px-[0.85rem] text-[0.85rem]"
        title="Customize Theme Palette"
      >
        <Palette size={16} color="#c084fc" />
        <span>Theme</span>
      </button>

      {isOpen && (
        <div className="glass-panel animate-fade-in absolute top-[2.8rem] right-0 z-[999] p-4 w-[200px] flex flex-col gap-2">
          <div className="text-xs text-[var(--text-secondary)] font-semibold mb-[0.2rem]">ACCENT PALETTE</div>
          {ACCENT_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => selectTheme(t.id)}
              className={cn(
                'flex items-center justify-between py-[0.45rem] px-3 rounded-lg border-0 text-[var(--text-primary)] text-[0.85rem] cursor-pointer',
                theme === t.id ? 'bg-[var(--text-primary)]/10' : 'bg-transparent'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ background: t.primary }} />
                <span>{t.name}</span>
              </div>
              {theme === t.id && <Check size={14} color="#4ade80" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
