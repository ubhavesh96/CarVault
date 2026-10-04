import { ChangeEvent, CSSProperties, ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Lock, Monitor, Smartphone, Tablet } from 'lucide-react';
import { api, ApiError } from '../api';
import { brandVars, contrast, useSession } from '../session';
import { ErrorNote, Spinner } from '../components/ui';
import type { Branding } from '../types';

/** Defined at module level so inputs keep focus while typing. */
function Field({ locked, label, children }: { locked: boolean; label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="row" style={{ gap: 6 }}>{label}{locked && <Lock className="i" aria-label="Managed by CarVault Admin" style={{ inlineSize: 12, blockSize: 12 }} />}</span>
      {children}
    </label>
  );
}

type Device = 'desktop' | 'tablet' | 'mobile';
type Screen = 'login' | 'dashboard' | 'passport';
const DEVICE_W: Record<Device, number> = { desktop: 640, tablet: 420, mobile: 260 };

/** Scaled, self-contained preview of the branded experience. Uses the same token overrides as the live app. */
function Preview({ b, device, screen }: { b: Branding; device: Device; screen: Screen }) {
  const style = { ...brandVars(b), inlineSize: DEVICE_W[device] } as CSSProperties;
  const Logo = () => (b.logoDataUrl ? <img src={b.logoDataUrl} alt="" style={{ blockSize: 16 }} /> : <b style={{ color: 'var(--color-blue)' }}>{b.logoText || b.appName}</b>);
  return (
    <div className={`wl-preview ${device}`} data-theme={b.theme} style={style} aria-label={`${screen} preview on ${device}`} role="img">
      <div className="wl-bar"><Logo /><span className="wl-dot" /></div>
      {screen === 'login' && (
        <div className="wl-body wl-login">
          <Logo />
          <h4>{b.loginHeadline || 'Verified vehicle history.'}</h4>
          <span className="wl-input" /><span className="wl-input" />
          <span className="wl-btn">Sign in</span>
          <small>Powered by CarVault</small>
        </div>
      )}
      {screen === 'dashboard' && (
        <div className="wl-body">
          <small className="wl-muted">{b.appName}</small>
          <h4>3 vehicles need attention</h4>
          <div className="wl-tiles">{['Vehicles', 'Avg confidence', 'Resale ready'].slice(0, device === 'mobile' ? 2 : 3).map((t, i) => <span key={t}><small>{t}</small><b>{[24, 82, 7][i]}</b></span>)}</div>
          <div className="wl-row"><span className="wl-ring" /><span><b>Porsche 911</b><small>High confidence · 94</small></span><span className="wl-link">Open</span></div>
          <div className="wl-row"><span className="wl-ring warn" /><span><b>Range Rover Sport</b><small>Low confidence · 41</small></span><span className="wl-link">Review</span></div>
        </div>
      )}
      {screen === 'passport' && (
        <div className="wl-body">
          <div className="wl-pp-top"><b>CARVAULT</b>{b.passportCobrand && <small>Issued via {b.appName}</small>}</div>
          <h4>BMW M5 Competition</h4>
          <small className="wl-muted">2022 · F90 · GCC spec</small>
          <div className="wl-tiles"><span><small>Confidence</small><b>80</b></span><span><small>Records</small><b>7</b></span></div>
          <small className="wl-muted">{b.pdfFooter}</small>
        </div>
      )}
    </div>
  );
}

export default function WhiteLabelStudio() {
  const { id: adminOrgId } = useParams();
  const { session, refresh } = useSession();
  const [orgName, setOrgName] = useState('');
  const [saved, setSaved] = useState<Branding | null>(null);
  const [b, setB] = useState<Branding | null>(null);
  const [selfServe, setSelfServe] = useState(true);
  const [device, setDevice] = useState<Device>('desktop');
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPlatform = !!session?.permissions.isPlatformAdmin;
  const editingAsAdmin = isPlatform && !!adminOrgId;

  useEffect(() => {
    (async () => {
      try {
        if (editingAsAdmin) {
          const d = await api.admin.org(adminOrgId!);
          setOrgName(d.org.name); setSaved(d.org.branding); setB(d.org.branding); setSelfServe(d.org.brandingSelfServe);
        } else {
          const d = await api.org();
          setOrgName(d.org.name); setSaved(d.org.branding); setB(d.org.branding); setSelfServe(d.org.brandingSelfServe);
        }
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not load branding'); }
    })();
  }, [adminOrgId, editingAsAdmin]);

  const tenantFields = useMemo(() => new Set(session?.permissions.tenantBrandFields ?? []), [session]);
  if (!session) return null;
  if (err && !b) return <ErrorNote error={err} />;
  if (!b || !saved) return <div className="empty"><Spinner /></div>;

  const tenantCanEdit = session.permissions.isTenantAdmin && selfServe;
  /** Whether the current user may edit this field. */
  const can = (k: keyof Branding) => editingAsAdmin || (tenantCanEdit && tenantFields.has(k));
  const dirty = JSON.stringify(b) !== JSON.stringify(saved);
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setB({ ...b, [k]: v });
  const lowContrast = contrast(b.primaryColor, b.theme === 'light' ? '#ffffff' : '#070a0d') < 3;

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(f.type)) return setErr('Logo must be PNG, JPG, WebP or SVG');
    if (f.size > 200 * 1024) return setErr('Logo must be under 200 KB');
    const r = new FileReader();
    r.onload = () => set('logoDataUrl', String(r.result));
    r.readAsDataURL(f);
  };

  const save = async () => {
    setBusy(true); setErr(null); setNote(null);
    const changed = (Object.keys(b) as (keyof Branding)[]).filter((k) => b[k] !== saved[k]);
    const patch = Object.fromEntries(changed.map((k) => [k, b[k] ?? ''])) as Partial<Branding>;
    try {
      if (editingAsAdmin) {
        const r = await api.admin.updateOrg(adminOrgId!, { branding: patch, brandingSelfServe: selfServe });
        setSaved(r.org.branding); setB(r.org.branding);
      } else {
        const r = await api.updateBranding(patch);
        setSaved(r.branding); setB(r.branding);
        await refresh(); // re-theme the live app
      }
      setNote('Branding saved. The Confidence Engine and trust model are unchanged.');
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); }
    setBusy(false);
  };

  const txt = (k: keyof Branding, label: string, max = 80, placeholder?: string) => (
    <Field locked={!can(k)} label={label}>
      <input value={String(b[k] ?? '')} maxLength={max} placeholder={placeholder} disabled={!can(k)} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          {editingAsAdmin && <Link to={`/admin/orgs/${adminOrgId}`} className="crumb"><ArrowLeft className="i flip-rtl" aria-hidden />{orgName}</Link>}
          <p className="caption">Settings · White-Label Studio</p>
          <h1>{orgName} branding</h1>
          <p className="muted" style={{ maxInlineSize: 680, marginBlockStart: 4 }}>
            Organizations can brand the experience. CarVault controls the intelligence and trust model: branding never changes how Vehicle Confidence is calculated or how evidence is labelled.
          </p>
        </div>
        {(editingAsAdmin || tenantCanEdit) && <button className="btn primary" onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save branding'}</button>}
      </div>

      {!editingAsAdmin && !tenantCanEdit && (
        <div className="notice row" style={{ gap: 8 }}>
          <Lock className="i" aria-hidden />
          {session.permissions.isTenantAdmin
            ? 'Branding for your organization is managed by CarVault Admin. You can view the current configuration.'
            : 'Only your organization admin can change branding. You can view the current configuration.'}
        </div>
      )}
      <ErrorNote error={err} />
      {note && <div className="notice" role="status">{note}</div>}

      <div className="g12">
        <div className="span-6 stack">
          <section className="panel">
            <h2 className="section-title" style={{ marginBlockEnd: 14 }}>Identity</h2>
            <div className="form-grid">
              {txt('appName', 'App name', 60)}
              {txt('logoText', 'Logo text', 40)}
              <Field locked={!can('logoDataUrl')} label="Logo">
                <div className="row" style={{ gap: 8 }}>
                  {b.logoDataUrl && <img src={b.logoDataUrl} alt="Current logo" style={{ blockSize: 32, borderRadius: 6 }} />}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!can('logoDataUrl')} onChange={onLogo} aria-label="Upload logo" />
                  {b.logoDataUrl && can('logoDataUrl') && <button className="btn sm ghost" onClick={() => set('logoDataUrl', undefined)}>Remove</button>}
                </div>
              </Field>
              {txt('faviconEmoji', 'Favicon (character or emoji)', 4, 'A')}
            </div>
          </section>

          <section className="panel">
            <h2 className="section-title" style={{ marginBlockEnd: 14 }}>Look</h2>
            <div className="form-grid">
              <Field locked={!can('primaryColor')} label="Primary colour">
                <div className="color-field">
                  <input type="color" value={b.primaryColor} disabled={!can('primaryColor')} onChange={(e) => set('primaryColor', e.target.value)} aria-label="Primary colour picker" />
                  <input value={b.primaryColor} disabled={!can('primaryColor')} onChange={(e) => set('primaryColor', e.target.value)} aria-label="Primary colour hex" />
                </div>
              </Field>
              <Field locked={!can('secondaryColor')} label="Secondary colour">
                <div className="color-field">
                  <input type="color" value={b.secondaryColor} disabled={!can('secondaryColor')} onChange={(e) => set('secondaryColor', e.target.value)} aria-label="Secondary colour picker" />
                  <input value={b.secondaryColor} disabled={!can('secondaryColor')} onChange={(e) => set('secondaryColor', e.target.value)} aria-label="Secondary colour hex" />
                </div>
              </Field>
              <Field locked={!can('typography')} label="Typography">
                <select value={b.typography} disabled={!can('typography')} onChange={(e) => set('typography', e.target.value as Branding['typography'])}>
                  {['Manrope', 'Inter', 'IBM Plex Sans'].map((f) => <option key={f}>{f}</option>)}
                </select>
              </Field>
              <Field locked={!can('theme')} label="Mode">
                <select value={b.theme} disabled={!can('theme')} onChange={(e) => set('theme', e.target.value as Branding['theme'])}>
                  <option value="dark">Dark</option><option value="light">Light</option>
                </select>
              </Field>
            </div>
            {lowContrast && <p className="small row" style={{ gap: 6, color: 'var(--color-warning)', marginBlockStart: 10 }}><AlertTriangle className="i" aria-hidden />This primary colour is below 3:1 contrast on the {b.theme} background, so links and focus rings may be hard to see.</p>}
            <p className="caption" style={{ marginBlockStart: 10 }}>Status colours (verified, attention, conflict) stay fixed so their meaning never changes between organizations.</p>
          </section>

          <section className="panel">
            <h2 className="section-title" style={{ marginBlockEnd: 14 }}>Login, email & documents</h2>
            <div className="form-grid">
              <div className="full">{txt('loginHeadline', 'Login screen headline', 120)}</div>
              {txt('emailSenderName', 'Email sender name', 60)}
              {txt('emailSenderAddress', 'Email sender address', 120)}
              <div className="full">{txt('emailFooter', 'Email footer', 240)}</div>
              <div className="full">{txt('pdfFooter', 'PDF footer', 240)}</div>
            </div>
          </section>

          <section className="panel">
            <h2 className="section-title" style={{ marginBlockEnd: 14 }}>Domain & passport</h2>
            <div className="form-grid">
              <div className="full">{txt('customDomain', 'Custom domain', 120, 'vehicles.example.ae')}</div>
              <Field locked={!can('passportCobrand')} label="Vehicle Passport branding">
                <select value={b.passportCobrand ? 'yes' : 'no'} disabled={!can('passportCobrand')} onChange={(e) => set('passportCobrand', e.target.value === 'yes')}>
                  <option value="no">CarVault only</option><option value="yes">Co-branded (CarVault + organization)</option>
                </select>
              </Field>
            </div>
            <p className="caption" style={{ marginBlockStart: 10 }}>CarVault attribution always remains on passports so buyers know who issued the trust model.</p>
            {editingAsAdmin && (
              <label className="row" style={{ gap: 8, marginBlockStart: 14 }}>
                <input type="checkbox" checked={selfServe} onChange={(e) => setSelfServe(e.target.checked)} />
                <span className="small">Let this organization's admins edit their own identity, colours, mode and footers</span>
              </label>
            )}
            {editingAsAdmin && selfServe !== undefined && <p className="caption" style={{ marginBlockStart: 6 }}>Locked fields (<Lock className="i" aria-hidden style={{ inlineSize: 11, blockSize: 11 }} />) are CarVault-controlled for tenants.</p>}
          </section>
        </div>

        <section className="span-6 panel wl-stage" aria-labelledby="pv">
          <div className="panel-head">
            <h2 className="section-title" id="pv">Live preview</h2>
            <div className="seg-control" role="group" aria-label="Device">
              {([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([d, Icon]) => (
                <button key={d} aria-pressed={device === d} className={device === d ? 'on' : ''} onClick={() => setDevice(d)}><Icon className="i" aria-hidden /><span className="sr-only">{d}</span></button>
              ))}
            </div>
          </div>
          <div className="pills" role="group" aria-label="Screen" style={{ marginBlockEnd: 16 }}>
            {(['login', 'dashboard', 'passport'] as Screen[]).map((s) => <button key={s} className={`pill${screen === s ? ' on' : ''}`} aria-pressed={screen === s} onClick={() => setScreen(s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
          </div>
          <div className="wl-frame"><Preview b={b} device={device} screen={screen} /></div>
          {dirty && <p className="caption" style={{ marginBlockStart: 12 }}>Previewing unsaved changes.</p>}
        </section>
      </div>
    </div>
  );
}
