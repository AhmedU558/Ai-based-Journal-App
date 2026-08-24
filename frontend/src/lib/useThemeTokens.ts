import { useEffect, useState } from 'react';

// Recharts renders raw SVG and reads its stroke/fill/tick colors from plain
// JS props - it can't resolve CSS custom properties the way className-based
// styling can, so a chart's axis/tick colors need the *actual* resolved
// color value, not a var(--x) string. This hook reads the live computed
// values of this app's index.css theme tokens and re-reads them whenever
// the theme toggles (index.css/App.jsx set/clear the data-theme attribute
// on <html>, not a React re-render this component tree would otherwise see).
export interface ThemeTokens {
  textSecondary: string;
  textMuted: string;
}

function readTokens(): ThemeTokens {
  const styles = getComputedStyle(document.documentElement);
  return {
    textSecondary: styles.getPropertyValue('--text-secondary').trim() || '#94a3b8',
    textMuted: styles.getPropertyValue('--text-muted').trim() || '#64748b',
  };
}

export function useThemeTokens(): ThemeTokens {
  const [tokens, setTokens] = useState<ThemeTokens>(() =>
    typeof document !== 'undefined' ? readTokens() : { textSecondary: '#94a3b8', textMuted: '#64748b' }
  );

  useEffect(() => {
    setTokens(readTokens());
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
