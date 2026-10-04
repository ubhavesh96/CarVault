import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Blocks, Building2, Car, ChevronDown, Cpu, Database, FileClock, Gauge, LayoutDashboard, LogOut, Menu,
  Palette, Plug, Rocket, RotateCcw, Settings, ShieldCheck, Tags, UserCircle2, Users, CreditCard, X,
} from 'lucide-react';
import { api } from '../api';
import { useSession } from '../session';
import { moduleMeta, CATEGORY_LABEL, ROLE_LABEL } from '../modules';
import type { Persona } from '../types';
import ThemeToggle from './ThemeToggle';

interface NavItem { to: string; label: string; icon: typeof Car; end?: boolean }

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/orgs', label: 'Organizations', icon: Building2 },
  { to: '/admin/catalog', label: 'Categories & Products', icon: Tags },
  { to: '/admin/modules', label: 'Modules', icon: Blocks },
  { to: '/admin/vehicles', label: 'Vehicles', icon: Car },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/pilots', label: 'Pilot Programme', icon: Rocket },
  { to: '/admin/integrations', label: 'Integrations', icon: Plug },
  { to: '/admin/data-sources', label: 'Data Sources', icon: Database },
  { to: '/admin/confidence', label: 'Confidence Engine', icon: ShieldCheck },
  { to: '/admin/ai', label: 'AI Configuration', icon: Cpu },
  { to: '/admin/audit', label: 'Audit Logs', icon: FileClock },
  { to: '/admin/analytics', label: 'Platform Analytics', icon: Activity },
  { to: '/admin/settings', label: 'System Settings', icon: Settings },
];

function Brand() {
  const { session } = useSession();
  const b = session?.branding;
  const isCarVault = !b || b.appName === 'CarVault';
  return (
    <Link to="/" className="brand" aria-label={`${b?.appName ?? 'CarVault'} home`}>
      {b?.logoDataUrl ? <img src={b.logoDataUrl} alt="" className="brand-logo" /> : null}
      {isCarVault ? <>CarVault <span className="ai">AI</span></> : <span>{b!.logoText || b!.appName}</span>}
    </Link>
  );
}

/** Prototype identity switcher. Clearly labelled: there is no real authentication yet. */
function PersonaSwitcher() {
  const { session, signIn, signOut } = useSession();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open && !personas.length) api.personas().then(setPersonas).catch(() => undefined); }, [open, personas.length]);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, []);
  if (!session) return null;
  const switchTo = async (id: string) => { setOpen(false); await signIn(id); nav('/'); };
  const reset = async () => {
    if (!confirm('Reset all demo data? Every organization, vehicle, document and conversation returns to the sample state.')) return;
    await api.reset();
    setOpen(false);
    await signIn(session.user.id).catch(() => signOut());
    nav('/');
  };
  return (
    <div className="persona" ref={ref}>
      <button className="persona-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <UserCircle2 className="i" aria-hidden />
        <span className="persona-who"><b>{session.user.name}</b><small>{session.org.name}</small></span>
        <ChevronDown className="i" aria-hidden />
      </button>
      {open && (
        <div className="persona-menu" role="menu">
          <p className="persona-note">Demo sign-in. This prototype has no real authentication: choose who to act as. Permissions are enforced by the server.</p>
          {personas.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={p.id === session.user.id} className={p.id === session.user.id ? 'on' : ''} onClick={() => switchTo(p.id)}>
              <span><b>{p.name}</b><small>{ROLE_LABEL[p.role]} · {p.org}{!p.isPlatform ? ` · ${p.categories.map((c) => CATEGORY_LABEL[c]).join(' + ')}` : ''}</small></span>
            </button>
          ))}
          <hr className="divider" style={{ marginBlock: 6 }} />
          <ThemeToggle compact />
          <hr className="divider" style={{ marginBlock: 6 }} />
          <button role="menuitem" onClick={reset}><RotateCcw className="i" aria-hidden /><span>Reset demo data</span></button>
          <button role="menuitem" onClick={() => { signOut(); nav('/'); }}><LogOut className="i" aria-hidden /><span>Sign out</span></button>
        </div>
      )}
    </div>
  );
}

function ProviderChip() {
  const [p, setP] = useState<'mock' | 'claude' | null>(null);
  useEffect(() => { api.status().then((s) => setP(s.provider)).catch(() => setP(null)); }, []);
  if (!p) return null;
  return (
    <span className={`chip-ai ${p === 'claude' ? 'live' : ''}`} title={p === 'mock' ? 'Using built-in demo AI. Add ANTHROPIC_API_KEY to .env for live Claude.' : 'Live Claude'}>
      <span className="dot" />{p === 'claude' ? 'Live AI' : 'Demo AI'}
    </span>
  );
}

function useNavItems(): { primary: NavItem[]; secondary: NavItem[] } {
  const { session } = useSession();
  if (!session) return { primary: [], secondary: [] };
  if (session.org.isPlatform) return { primary: ADMIN_NAV, secondary: [] };
  const primary = session.nav.map((m) => {
    const meta = moduleMeta(m);
    return { to: meta.path, label: meta.label, icon: meta.icon, end: meta.path === '/app' || meta.path === '/garage' };
  });
  const secondary: NavItem[] = [
    { to: '/app/modules', label: 'Available modules', icon: Blocks },
    { to: '/app/white-label', label: 'White-Label Studio', icon: Palette },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ];
  return { primary, secondary };
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useSession();
  const { primary, secondary } = useNavItems();
  if (!session) return null;
  return (
    <>
      <nav aria-label={session.org.isPlatform ? 'CarVault Admin' : 'Main'} className="side-nav">
        {session.org.isPlatform && <p className="side-label">CarVault Admin</p>}
        {primary.map((n) => (
          <NavLink key={n.to + n.label} to={n.to} end={n.end} onClick={onNavigate}><n.icon className="i" aria-hidden />{n.label}</NavLink>
        ))}
        {secondary.length > 0 && <>
          <p className="side-label" style={{ marginBlockStart: 20 }}>Workspace</p>
          {secondary.map((n) => <NavLink key={n.to} to={n.to} onClick={onNavigate}><n.icon className="i" aria-hidden />{n.label}</NavLink>)}
        </>}
      </nav>
      <div className="side-foot">
        <b>{session.org.name}</b>
        <div className="side-cats">
          {session.org.isPlatform
            ? <span className="tag">Platform owner</span>
            : session.org.categories.map((c) => <span className="tag" key={c}>{CATEGORY_LABEL[c]}</span>)}
        </div>
        <small>{session.org.plan}</small>
      </div>
    </>
  );
}

function MobileNav() {
  const { primary, secondary } = useNavItems();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const first = primary.slice(0, 4);
  return (
    <>
      <nav className="app-bottom-nav" aria-label="Main">
        {first.map((n) => <NavLink key={n.to + n.label} to={n.to} end={n.end}><n.icon className="i" aria-hidden />{n.label.split(' ')[0]}</NavLink>)}
        <button onClick={() => setOpen(true)} aria-haspopup="dialog"><Menu className="i" aria-hidden />More</button>
      </nav>
      {open && (
        <div className="overlay sheet-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="All sections">
            <div className="row between" style={{ marginBlockEnd: 8 }}>
              <b>All sections</b>
              <button className="btn ghost sm" onClick={() => setOpen(false)} aria-label="Close"><X className="i" aria-hidden /></button>
            </div>
            <nav className="side-nav">
              {[...primary, ...secondary].map((n) => <NavLink key={n.to + n.label} to={n.to} end={n.end}><n.icon className="i" aria-hidden />{n.label}</NavLink>)}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const { session, isConsumer } = useSession();
  // Owners get the garage-first layout; organizations and CarVault Admin get a workspace with a sidebar.
  if (!session || isConsumer) {
    return (
      <>
        <header className="topbar">
          <Brand />
          <div className="row" style={{ gap: 10 }}><ProviderChip /><PersonaSwitcher /></div>
        </header>
        <main className="page">{children}</main>
        <p className="footer-note">CarVault AI prototype. Sample organizations, people and workshops are fictional.</p>
      </>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand"><Brand /></div>
        <Sidebar />
      </aside>
      <div className="app-main">
        <header className="topbar app-topbar">
          <div className="row" style={{ gap: 10 }}>
            <span className="mobile-brand"><Brand /></span>
            {session.org.isPlatform && <span className="tag admin-tag"><Gauge className="i" aria-hidden style={{ inlineSize: 12, blockSize: 12 }} />Platform console</span>}
          </div>
          <div className="row" style={{ gap: 10 }}><ProviderChip /><PersonaSwitcher /></div>
        </header>
        <main className="page app-page">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}

