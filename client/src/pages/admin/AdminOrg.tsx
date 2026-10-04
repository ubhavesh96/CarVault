import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Palette } from 'lucide-react';
import { api, AdminOrgDetail } from '../../api';
import { Arrow, ErrorNote, LevelBadge, MetricCard, ScoreBar, Spinner, VehicleCell } from '../../components/ui';
import { AuditList } from './AdminDashboard';
import { CATEGORY_LABEL, ROLE_LABEL, moduleMeta } from '../../modules';
import type { CategoryId } from '../../types';

const CATS: CategoryId[] = ['dealership', 'insurance', 'finance', 'service', 'inspection', 'fleet', 'consumer'];

export default function AdminOrg() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<AdminOrgDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.admin.org(id).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  if (err && !d) return <ErrorNote error={err} />;
  if (!d) return <div className="empty"><Spinner /></div>;
  const o = d.org;

  const update = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true); setErr(null); setNote(null);
    try { await api.admin.updateOrg(id, body); await load(); setNote(msg); } catch (e) { setErr(e instanceof Error ? e.message : 'Update failed'); }
    setBusy(false);
  };
  const isFull = o.categories.includes('full');
  const toggleCat = (c: CategoryId) => {
    const has = o.categories.includes(c);
    const next = has ? o.categories.filter((x) => x !== c) : [...o.categories.filter((x) => x !== 'full'), c];
    if (!next.length) return setErr('An organization needs at least one category.');
    update({ categories: next }, `${has ? 'Removed' : 'Added'} ${CATEGORY_LABEL[c]}. ${o.name}'s navigation and modules updated.`);
  };
  const groups = [...new Set(d.catalog.modules.map((m) => m.group))];
  const del = async () => {
    if (!confirm(`Delete ${o.name}? This removes the organization and its users.`)) return;
    try { await api.admin.deleteOrg(id); nav('/admin/orgs'); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete'); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <Link to="/admin/orgs" className="crumb"><ArrowLeft className="i flip-rtl" aria-hidden />Organizations</Link>
          <h1>{o.name}</h1>
          <p className="muted" style={{ marginBlockStart: 4 }}>
            <span className="tags" style={{ display: 'inline-flex' }}>{o.categories.map((c) => <span key={c} className="tag">{CATEGORY_LABEL[c]}</span>)}</span> · {o.plan}
          </p>
        </div>
        <div className="row wrap">
          <Link className="btn" to={`/admin/orgs/${id}/white-label`}><Palette className="i" aria-hidden />White-Label Studio</Link>
          {o.status === 'active'
            ? <button className="btn danger" disabled={busy} onClick={() => confirm(`Suspend ${o.name}? Its users lose access until reactivated.`) && update({ status: 'suspended' }, `${o.name} suspended.`)}>Suspend</button>
            : <button className="btn primary" disabled={busy} onClick={() => update({ status: 'active' }, `${o.name} reactivated.`)}>Activate</button>}
        </div>
      </div>
      <ErrorNote error={err} />
      {note && <div className="notice" role="status">{note}</div>}

      <div className="metrics">
        <MetricCard label="Status" value={o.status === 'active' ? 'Active' : 'Suspended'} tone={o.status === 'active' ? 'ok' : 'due'} />
        <MetricCard label="Vehicles" value={d.summary.vehicles} />
        <MetricCard label="Users" value={d.summary.users} detail={`${o.branches.length} branches`} />
        <MetricCard label="Modules" value={d.summary.modules} />
        <MetricCard label="Avg Vehicle Confidence" value={d.summary.avgConfidence ?? '–'} />
      </div>

      <section className="panel" aria-labelledby="cat">
        <div className="panel-head">
          <div>
            <h2 className="section-title" id="cat">Category licensing</h2>
            <p className="caption">Only CarVault Admin can assign, change, add or remove categories. The tenant sees the result immediately.</p>
          </div>
          {isFull
            ? <button className="btn" disabled={busy} onClick={() => update({ categories: ['dealership'] }, 'Downgraded to Dealership.')}>Downgrade to Dealership</button>
            : <button className="btn primary" disabled={busy} onClick={() => update({ categories: ['full'] }, `${o.name} upgraded to Full platform. Every category and module is now available.`)}>Upgrade to Full platform</button>}
        </div>
        <div className="module-grid">
          {CATS.map((c) => {
            const on = isFull || o.categories.includes(c);
            return (
              <button key={c} className={`module-card cat-toggle${on ? ' active' : ''}`} aria-pressed={on} disabled={busy || isFull} onClick={() => toggleCat(c)}>
                <span className="row between"><b>{CATEGORY_LABEL[c]}</b>{on ? <span className="badge s-ok has-icon"><Check className="i" aria-hidden />{isFull ? 'Via Full' : 'Licensed'}</span> : <span className="badge s-unknown has-icon"><Lock className="i" aria-hidden />Not licensed</span>}</span>
                <span className="caption">{on ? (isFull ? 'Included in Full platform' : 'Click to remove') : 'Click to add'}</span>
              </button>
            );
          })}
        </div>
        <label className="field" style={{ maxInlineSize: 360, marginBlockStart: 16 }}>
          <span>Plan name</span>
          <input defaultValue={o.plan} onBlur={(e) => e.target.value.trim() && e.target.value !== o.plan && update({ plan: e.target.value }, 'Plan updated.')} />
        </label>
      </section>

      <div className="g12">
        <section className="panel span-8" aria-labelledby="mods">
          <h2 className="section-title" id="mods" style={{ marginBlockEnd: 4 }}>Module entitlements</h2>
          <p className="caption" style={{ marginBlockEnd: 14 }}>Modules come from categories. Enable a single module without a category change, or remove one from a category. Core modules can't be removed.</p>
          {groups.map((g) => (
            <div key={g} style={{ marginBlockEnd: 14 }}>
              <p className="label" style={{ marginBlockEnd: 6 }}>{g}</p>
              <div className="status-list">
                {d.catalog.modules.filter((m) => m.group === g).map((m) => (
                  <div key={m.id}>
                    <span><b className="small">{m.name}</b>{m.core && <span className="caption"> · core</span>}<br /><span className="caption">{m.description}</span></span>
                    {m.core ? <span className="badge s-ok has-icon"><Check className="i" aria-hidden />Core</span>
                      : m.entitled
                        ? <button className="btn sm ghost danger" disabled={busy} onClick={() => update({ removeModule: m.id }, `${m.name} removed.`)}>Remove</button>
                        : <button className="btn sm" disabled={busy} onClick={() => update({ addModule: m.id }, `${m.name} enabled.`)}>Enable</button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div className="span-4 stack">
          <section className="panel" aria-labelledby="navp">
            <h2 className="section-title" id="navp" style={{ marginBlockEnd: 4 }}>What this tenant sees</h2>
            <p className="caption" style={{ marginBlockEnd: 12 }}>Primary navigation, generated from its licence</p>
            <nav className="side-nav preview-nav" aria-label="Tenant navigation preview">
              {d.nav.map((m) => { const meta = moduleMeta(m); return <span key={m} className="nav-item"><meta.icon className="i" aria-hidden />{meta.label}</span>; })}
            </nav>
          </section>
          <section className="panel" aria-labelledby="usr">
            <h2 className="section-title" id="usr" style={{ marginBlockEnd: 12 }}>Users</h2>
            <div className="status-list">
              {d.users.map((u) => <div key={u.id}><span><b className="small">{u.name}</b><br /><span className="caption">{u.email}</span></span><span className="caption">{ROLE_LABEL[u.role]}</span></div>)}
            </div>
          </section>
        </div>
      </div>

      <section className="panel" aria-labelledby="veh">
        <h2 className="section-title" id="veh" style={{ marginBlockEnd: 12 }}>Vehicles ({d.vehicles.length})</h2>
        {d.vehicles.length === 0 ? <p className="muted small">No vehicles yet.</p> : (
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Vehicle</th><th>Vehicle Confidence</th><th className="hide-sm">Owner / status</th></tr></thead>
            <tbody>{d.vehicles.map((v) => (
              <tr key={v.id}><td><VehicleCell v={v} /></td><td><div className="row" style={{ gap: 10 }}><ScoreBar score={v.confidence.score} level={v.confidence.level} /><LevelBadge level={v.confidence.level} short /></div></td><td className="hide-sm caption">{v.ownerName}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="panel" aria-labelledby="aud">
        <div className="panel-head"><h2 className="section-title" id="aud">Activity</h2><Link className="link" to="/admin/audit">Full audit log <Arrow /></Link></div>
        <AuditList rows={d.audit} />
      </section>
      {d.vehicles.length === 0 && <p><button className="link danger" onClick={del}>Delete organization</button></p>}
    </div>
  );
}
