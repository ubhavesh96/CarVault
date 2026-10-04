import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../api';
import { ErrorNote, LevelBadge, ScoreBar, Spinner, VehicleCell } from '../../components/ui';
import { ROLE_LABEL } from '../../modules';
import type { AuditRow, PortfolioVehicle, User } from '../../types';
import { fmtDateTime, fmtKm } from '../../utils';

type Kind = 'vehicles' | 'users' | 'audit';

export default function AdminTables({ kind }: { kind: Kind }) {
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyDenied, setOnlyDenied] = useState(false);
  useEffect(() => {
    setRows(null);
    const p = kind === 'vehicles' ? api.admin.vehicles() : kind === 'users' ? api.admin.users() : api.admin.audit();
    p.then((r) => setRows(r as unknown[])).catch((e) => setErr(e.message));
  }, [kind]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const s = q.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s) && (!onlyDenied || (r as AuditRow).outcome === 'denied'));
  }, [rows, q, onlyDenied]);

  if (err) return <ErrorNote error={err} />;
  if (!rows) return <div className="empty"><Spinner /></div>;
  const title = { vehicles: 'All vehicles', users: 'Users', audit: 'Audit logs' }[kind];
  const intro = {
    vehicles: 'Every vehicle across tenants. The platform operator can view tenants for support; tenants never see each other.',
    users: 'Everyone with access, by organization and role.',
    audit: 'Every licensing, branding, sharing and permission event, including denied attempts.',
  }[kind];

  return (
    <div className="stack">
      <div className="page-head"><div><p className="caption">CarVault Admin</p><h1>{title}</h1><p className="muted" style={{ marginBlockStart: 4 }}>{intro}</p></div></div>
      <section className="panel">
        <div className="row wrap" style={{ marginBlockEnd: 16 }}>
          <div className="search" style={{ flex: 1 }}><Search className="i" aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" aria-label="Filter" /></div>
          {kind === 'audit' && <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={onlyDenied} onChange={(e) => setOnlyDenied(e.target.checked)} />Denied only</label>}
        </div>
        <div className="table-wrap">
          {kind === 'vehicles' && (
            <table className="data-table">
              <thead><tr><th>Vehicle</th><th>Organization</th><th>Vehicle Confidence</th><th className="hide-sm">Mileage</th></tr></thead>
              <tbody>{(filtered as PortfolioVehicle[]).map((v) => (
                <tr key={v.id}><td><VehicleCell v={v} sub={v.ownerName} /></td><td><Link className="link" to={`/admin/orgs/${v.orgId}`}>{v.orgName}</Link></td>
                  <td><div className="row" style={{ gap: 10 }}><ScoreBar score={v.confidence.score} level={v.confidence.level} /><LevelBadge level={v.confidence.level} short /></div></td><td className="num hide-sm">{fmtKm(v.mileage)}</td></tr>
              ))}</tbody>
            </table>
          )}
          {kind === 'users' && (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Organization</th><th>Role</th><th className="hide-sm">Email</th></tr></thead>
              <tbody>{(filtered as (User & { orgName?: string })[]).map((u) => (
                <tr key={u.id}><td><b>{u.name}</b>{u.title && <><br /><span className="caption">{u.title}</span></>}</td><td><Link className="link" to={`/admin/orgs/${u.orgId}`}>{u.orgName}</Link></td><td>{ROLE_LABEL[u.role]}</td><td className="caption hide-sm">{u.email}</td></tr>
              ))}</tbody>
            </table>
          )}
          {kind === 'audit' && (
            <table className="data-table">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>Outcome</th></tr></thead>
              <tbody>{(filtered as AuditRow[]).map((e) => (
                <tr key={e.id}><td className="caption num">{fmtDateTime(e.at)}</td><td><b className="small">{e.actorName}</b><br /><span className="caption">{e.orgName}</span></td><td className="caption"><code>{e.action}</code></td><td className="small">{e.detail}</td>
                  <td><span className={`badge s-${e.outcome === 'denied' ? 'due' : 'ok'}`}>{e.outcome === 'denied' ? 'Denied' : 'OK'}</span></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <p className="caption" style={{ marginBlockStart: 12 }}>{filtered.length} of {rows.length}</p>
      </section>
    </div>
  );
}
