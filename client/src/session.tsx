import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, identity, setUnauthorizedHandler } from './api';
import type { Branding, Session } from './types';

const DEFAULT_BRAND: Branding = {
  appName: 'CarVault', logoText: 'CarVault', primaryColor: '#4da3ff', secondaryColor: '#b9c4ce', typography: 'Manrope', theme: 'dark',
  loginHeadline: '', emailSenderName: '', emailSenderAddress: '', emailFooter: '', pdfFooter: '', passportCobrand: false,
};

interface SessionCtx {
  /** The mode currently shown. */
  theme: 'dark' | 'light';
  /** Switch this person's mode on this device. */
  setTheme: (t: 'dark' | 'light') => void;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn: (userId: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  /** Whether the current organization is entitled to a module. */
  has: (moduleId: string) => boolean;
  /** Owner/consumer experience (garage-first) rather than an organization workspace. */
  isConsumer: boolean;
}

const Ctx = createContext<SessionCtx | null>(null);
export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
};

// ---------------------------------------------------------------------------------------
// Branding → design tokens. The brand colour becomes the interaction accent; semantic status
// colours and the Confidence Engine are never affected by branding.
// ---------------------------------------------------------------------------------------
const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lighten = (hex: string, amt: number) => {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};
/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const FONT_URL: Record<Branding['typography'], string> = {
  Manrope: '',
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'IBM Plex Sans': 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
};

const toHex = (rgb: number[]) => `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
const SURFACES: Record<'dark' | 'light', string[]> = {
  dark: ['#070a0d', '#0d1217', '#121820', '#17212a'],
  light: ['#f5f7f9', '#ffffff', '#f0f3f6', '#e6ebf0'],
};
/**
 * Nudge a brand colour darker (light mode) or lighter (dark mode) until it reaches the WCAG
 * contrast target on every surface of that mode. Tenants pick the hue; CarVault guarantees legibility.
 */
export function fitContrast(hex: string, theme: 'dark' | 'light', target = 4.5) {
  const surfaces = SURFACES[theme];
  const rgb = hexToRgb(hex);
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = toHex(rgb.map((v) => (theme === 'dark' ? v + (255 - v) * t : v * (1 - t))));
    if (Math.min(...surfaces.map((x) => contrast(c, x))) >= target) return c;
  }
  return theme === 'dark' ? '#ffffff' : '#000000';
}

/** Token overrides for a branding config in a given mode. Used by the app shell and White-Label Studio previews. */
export function brandVars(b: Branding, theme: 'dark' | 'light' = b.theme): Record<string, string> {
  // 5:1 on plain surfaces keeps text above 4.5:1 even on the 10% tints used by badges and chips.
  const primary = fitContrast(b.primaryColor, theme, 5);
  const secondary = fitContrast(b.secondaryColor, theme, 5);
  const [r, g, bl] = hexToRgb(primary);
  return {
    '--color-blue': primary,
    '--color-blue-bright': theme === 'dark' ? lighten(primary, 0.18) : fitContrast(primary, theme, 6),
    '--color-blue-tint': `rgba(${r}, ${g}, ${bl}, 0.09)`,
    '--color-blue-line': `rgba(${r}, ${g}, ${bl}, 0.34)`,
    '--color-platinum': secondary,
    '--font-family': `'${b.typography}', 'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif`,
  };
}

// ---------------------------------------------------------------------------------------
// Appearance: a per-person, per-device preference that overrides the organization's default mode.
// ---------------------------------------------------------------------------------------
export type ThemePref = 'dark' | 'light' | null;
const THEME_KEY = 'cv_theme';
export const themePref = {
  get(): ThemePref {
    try { const v = localStorage.getItem(THEME_KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; }
  },
  set(v: ThemePref) {
    try { v ? localStorage.setItem(THEME_KEY, v) : localStorage.removeItem(THEME_KEY); } catch { /* storage unavailable */ }
  },
};
const effectiveTheme = (b: Branding | null): 'dark' | 'light' => themePref.get() ?? b?.theme ?? 'dark';

export function applyBranding(b: Branding | null) {
  const root = document.documentElement;
  const theme = effectiveTheme(b);
  const vars = brandVars(b ?? DEFAULT_BRAND, theme);
  for (const k of ['--color-blue', '--color-blue-bright', '--color-blue-tint', '--color-blue-line', '--color-platinum', '--font-family'])
    root.style.setProperty(k, vars[k]);
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f7f9' : '#070a0d');
  document.title = b?.appName ?? 'CarVault AI';
  if (b && FONT_URL[b.typography] && !document.querySelector(`link[data-font="${b.typography}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_URL[b.typography];
    l.dataset.font = b.typography;
    document.head.appendChild(l);
  }
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? Object.assign(document.createElement('link'), { rel: 'icon' });
  icon.href = b?.logoDataUrl
    ?? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0d1217"/><text x="32" y="42" font-size="30" text-anchor="middle" font-family="sans-serif" font-weight="700" fill="${b?.primaryColor ?? '#4da3ff'}">${b?.faviconEmoji ?? (b?.logoText ?? 'C').slice(0, 1)}</text></svg>`)}`;
  if (!icon.parentNode) document.head.appendChild(icon);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!identity.get());
  const [error, setError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => effectiveTheme(null));

  const refresh = useCallback(async () => {
    if (!identity.get()) { setSession(null); setLoading(false); applyBranding(null); return; }
    setLoading(true);
    try {
      const s = await api.session();
      setSession(s);
      setError(null);
      applyBranding(s.branding);
      setThemeState(effectiveTheme(s.branding));
    } catch (e) {
      setSession(null);
      setError(e instanceof Error ? e.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { identity.set(null); setSession(null); applyBranding(null); });
    refresh();
  }, [refresh]);

  const value = useMemo<SessionCtx>(() => ({
    session, loading, error, refresh, theme,
    setTheme: (t) => { themePref.set(t); applyBranding(session?.branding ?? null); setThemeState(t); },
    signIn: async (id) => { identity.set(id); await refresh(); },
    signOut: () => { identity.set(null); setSession(null); applyBranding(null); },
    has: (m) => !!session?.entitlements.includes(m),
    isConsumer: !!session && !session.org.isPlatform && session.org.categories.length === 1 && session.org.categories[0] === 'consumer',
  }), [session, loading, error, refresh, theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
