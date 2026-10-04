import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api';
import { ErrorNote, Modal, ScoreBar, Spinner } from '../../components/ui';
import { CATEGORY_LABEL } from '../../modules';
import type { CategoryId, OrgSummary } from '../../types';
import { fmtDate } from '../../utils';

const CATS: CategoryId[] = ['dealership', 'insurance', 'finance', 'service', 'inspection', 'fleet', 'consumer', 'full'];

function CreateOrg({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    try {
      const o = await api.admin.createOrg({ name: f.name, category: f.category as CategoryId, plan: f.plan, adminName: f.adminName, adminEmail: f.adminEmail });
      nav(`/admin/orgs/${o.id}`);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not create'); setBusy(false); }
  };
  return (
    <Modal title="Create organization" subtitle="The category decides which modules and navigation this tenant receives. Only CarVault Admin can change it later." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field full"><span>Organization name *</span><input name="name" required maxLength={80} placeholder="ABC Motors" /></label>
          <label className="field"><span>Category *</span>
            <select name="category" defaultValue="dealership">{CATS.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
          </label>
          <label className="field"><span>Plan</span><input name="plan" placeholder="e.g. Dealership · Growth" /></label>
          <label className="field"><span>Admin name</span><input name="adminName" placeholder="First administrator" /></label>
          <label className="field"><span>Admin email</span><input name="adminEmail" type="email" placeholder="admin@company.ae" /></label>
        </div>
        <div style={{ marginBlockStart: 12 }}><ErrorNote error={err} /></div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create organization'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminOrgs({ subscriptions }: { subscriptions?: boolean }) {
  const [params, setParams] = useSearchParams();
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.admin.orgs().then(setOrgs).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const creating = params.get('new') === '1';
  if (err) return <ErrorNote error={err} />;
  if (!orgs) return <div className="empty"><Spinner /></div>;
  const tenants = orgs.filter((o) => !o.isPlatform);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="caption">CarVault Admin</p>
          <h1>{subscriptions ? 'Subscriptions & licensing' : 'Organizations'}</h1>
          <p className="muted" style={{ marginBlockStart: 4 }}>{subscriptions ? 'What each tenant has purchased: categories, plan and module count.' : 'Every tenant on the platform. Open one to change its category, modules, status or branding.'}</p>
        </div>
        <button className="btn primary" onClick={() => setParams({ new: '1' })}><Plus className="i" aria-hidden />Create organization</button>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Organization</th><th>Categories</th><th>Plan</th>
              {subscriptions ? <><th className="r">Modules</th><th className="hide-sm">Custom domain</th></> : <><th className="r">Vehicles</th><th className="r hide-sm">Users</th><th>Avg confidence</th></>}
              <th>Status</th>
            </tr></thead>
            <tbody>
              {tenants.map((o) => (
                <tr key={o.id}>
                  <td><Link className="link" to={`/admin/orgs/${o.id}`}>{o.name}</Link><br /><span className="caption">Since {fmtDate(o.createdAt)}</span></td>
                  <td><span className="tags">{o.categories.map((c) => <span key={c} className="tag">{CATEGORY_LABEL[c]}</span>)}</span></td>
                  <td className="small">{o.plan}</td>
                  {subscriptions
                    ? <><td className="r num">{o.modules}</td><td className="hide-sm caption">{o.customDomain ?? '–'}</td></>
                    : <><td className="r num">{o.vehicles}</td><td className="r num hide-sm">{o.users}</td><td>{o.avgConfidence === null ? <span className="caption">No vehicles</span> : <ScoreBar score={o.avgConfidence} level={o.avgConfidence >= 85 ? 'high' : o.avgConfidence >= 65 ? 'moderate' : 'low'} />}</td></>}
                  <td><span className={`badge s-${o.status === 'active' ? 'ok' : 'due'}`}>{o.status === 'active' ? 'Active' : 'Suspended'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {creating && <CreateOrg onClose={() => { setParams({}); load(); }} />}
    </div>
  );
}
