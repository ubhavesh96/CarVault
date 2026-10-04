import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, AdminOverview } from '../../api';
import { Arrow, ErrorNote, MetricCard, Spinner } from '../../components/ui';
import { fmtDateTime } from '../../utils';

export function AuditList({ rows }: { rows: AdminOverview['recent'] }) {
  if (!rows.length) return <p className="muted small">Nothing yet.</p>;
  return (
    <div className="status-list">
      {rows.map((e) => (
        <div key={e.id}>
          <span><b className="small">{e.detail}</b><br /><span className="caption">{e.actorName}{e.orgName ? ` · ${e.orgName}` : ''} · {fmtDateTime(e.at)}</span></span>
          <span className={`badge s-${e.outcome === 'denied' ? 'due' : e.action === 'access.request' ? 'upcoming' : 'ok'}`}>{e.outcome === 'denied' ? 'Denied' : e.action === 'access.request' ? 'Request' : 'OK'}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [d, setD] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.admin.overview().then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorNote error={err} />;
  if (!d) return <div className="empty"><Spinner /></div>;
  const maxCat = Math.max(1, ...d.byCategory.map((c) => c.tenants));
  return (
    <div className="stack">
      <div className="page-head">
        <div><p className="caption">CarVault Admin</p><h1>Platform overview</h1><p className="muted" style={{ marginBlockStart: 4 }}>North Star: trusted vehicle lifecycle coverage across every tenant.</p></div>
        <Link className="btn primary" to="/admin/orgs?new=1">Create organization</Link>
      </div>
      <div className="metrics">
        <MetricCard label="Tenants" value={d.tenants} detail={`${d.activeTenants} active`} />
        <MetricCard label="Vehicles" value={d.vehicles} detail={`${d.highConfidence} with high confidence`} />
        <MetricCard label="Average Vehicle Confidence" value={d.avgConfidence ?? '–'} detail="Across all tenants" />
        <MetricCard label="Users" value={d.users} />
        <MetricCard label="Active data rooms" value={d.dataRooms} />
      </div>
      <div className="g12">
        <section className="panel span-6" aria-labelledby="bycat">
          <h2 className="section-title" id="bycat" style={{ marginBlockEnd: 4 }}>Tenants by category</h2>
          <p className="caption" style={{ marginBlockEnd: 14 }}>Licensed categories across organizations</p>
          <div className="bars">
            {d.byCategory.map((c) => (
              <div key={c.id} className="bar-row" title={`${c.name}: ${c.tenants}`}>
                <span>{c.name}</span>
                <span className="score-bar"><span className="track"><i style={{ inlineSize: `${(c.tenants / maxCat) * 100}%`, background: 'var(--color-blue)' }} /></span><b className="num">{c.tenants}</b></span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel span-6" aria-labelledby="req">
          <div className="panel-head"><h2 className="section-title" id="req">Access requests & denied actions</h2><Link className="link" to="/admin/audit">Audit log <Arrow /></Link></div>
          <AuditList rows={d.accessRequests} />
        </section>
      </div>
      <section className="panel" aria-labelledby="rec">
        <h2 className="section-title" id="rec" style={{ marginBlockEnd: 12 }}>Recent platform activity</h2>
        <AuditList rows={d.recent} />
      </section>
    </div>
  );
}
