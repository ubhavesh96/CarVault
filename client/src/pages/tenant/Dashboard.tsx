import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api';
import { useSession } from '../../session';
import { Arrow, ErrorNote, LevelBadge, MetricCard, ScoreBar, Spinner, StatusBadge, TrustBadge, VehicleCell } from '../../components/ui';
import { AddVehicle } from '../Garage';
import type { Portfolio, PortfolioVehicle } from '../../types';
import { fmtDate, plural } from '../../utils';
import { CATEGORY_LABEL } from '../../modules';

/** A category-specific headline KPI, so each industry sees what matters to it first. */
function categoryKpi(cats: string[], vs: PortfolioVehicle[]) {
  const c = cats.includes('full') ? 'full' : cats[0];
  switch (c) {
    case 'dealership': return { label: 'Resale ready (≥85)', value: vs.filter((v) => v.resale.score >= 85).length, detail: 'Ready to list with strong evidence' };
    case 'insurance': return { label: 'Low mileage confidence', value: vs.filter((v) => (v.confidence.dims.mileage ?? 0) < 65).length, detail: 'Mileage evidence below 65%', tone: 'attention' as const };
    case 'finance': return { label: 'Weak collateral evidence', value: vs.filter((v) => Math.min(v.confidence.dims.identity ?? 0, v.confidence.dims.ownership ?? 0) < 65).length, detail: 'Identity or ownership below 65%', tone: 'attention' as const };
    case 'service': return { label: 'Maintenance due', value: vs.filter((v) => v.attention.some((a) => a.status === 'due')).length, detail: 'Customer vehicles with items due', tone: 'attention' as const };
    case 'inspection': return { label: 'Inspection queue', value: vs.filter((v) => !v.lastInspection || (Date.now() - new Date(v.lastInspection.date).getTime()) / 2.63e9 > 6).length, detail: 'Missing or older than 6 months' };
    case 'fleet': return { label: 'Upcoming maintenance', value: vs.reduce((a, v) => a + v.upcoming.length + v.attention.length, 0), detail: 'Items due or approaching across the fleet' };
    default: return { label: 'High confidence', value: vs.filter((v) => v.confidence.level === 'high').length, detail: 'Vehicles scoring 85+' };
  }
}

export default function Dashboard() {
  const { session, has } = useSession();
  const [p, setP] = useState<Portfolio | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { api.portfolio().then(setP).catch((e) => setErr(e.message)); }, []);
  if (!session) return null;
  if (err) return <ErrorNote error={err} />;
  if (!p) return <div className="empty"><Spinner /></div>;

  const vs = p.vehicles;
  const avg = vs.length ? Math.round(vs.reduce((a, v) => a + v.confidence.score, 0) / vs.length) : null;
  const attention = vs.filter((v) => v.attention.length);
  const gaps = vs.reduce((a, v) => a + v.confidence.gaps, 0);
  const kpi = categoryKpi(session.org.categories, vs);
  const byId = Object.fromEntries(vs.map((v) => [v.id, v]));
  const missing = vs.filter((v) => v.confidence.topGap).sort((a, b) => a.confidence.score - b.confidence.score).slice(0, 5);
  const resaleOpp = has('resale_readiness') ? [...vs].sort((a, b) => b.resale.score - a.resale.score).slice(0, 4) : [];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="caption">{session.org.categories.map((c) => CATEGORY_LABEL[c]).join(' + ')} workspace</p>
          <h1>{session.org.name}</h1>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}><Plus className="i" aria-hidden />Add vehicle</button>
      </div>

      <div className="metrics">
        <MetricCard label="Vehicles" value={vs.length} detail={`${vs.reduce((a, v) => a + v.records, 0)} records on file`} />
        <MetricCard label="Average Vehicle Confidence" value={avg ?? '–'} detail={avg === null ? 'No vehicles yet' : `${vs.filter((v) => v.confidence.level === 'high').length} high · ${vs.filter((v) => v.confidence.level === 'low').length} low`} />
        <MetricCard label="Need attention" value={attention.length} detail="Due or flagged items" tone={attention.length ? 'attention' : undefined} />
        <MetricCard label="Missing evidence" value={gaps} detail="Open evidence gaps" />
        <MetricCard label={kpi.label} value={kpi.value} detail={kpi.detail} tone={kpi.tone} />
      </div>

      <div className="g12">
        <section className="panel span-8" aria-labelledby="veh">
          <div className="panel-head">
            <h2 className="section-title" id="veh">Vehicles by confidence</h2>
            <Link className="link" to={has('inventory') ? '/app/m/inventory' : has('fleet') ? '/app/m/fleet' : '/app/m/vehicles'}>All {vs.length} <Arrow /></Link>
          </div>
          {vs.length === 0 ? <p className="muted">No vehicles yet. Add the first one to start building its passport.</p> : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Vehicle</th><th>Vehicle Confidence</th><th>Attention</th><th className="hide-sm">Last activity</th></tr></thead>
                <tbody>
                  {[...vs].sort((a, b) => a.confidence.score - b.confidence.score).slice(0, 8).map((v) => (
                    <tr key={v.id}>
                      <td><VehicleCell v={v} sub={v.ownerName} /></td>
                      <td><div className="row" style={{ gap: 10 }}><ScoreBar score={v.confidence.score} level={v.confidence.level} /><LevelBadge level={v.confidence.level} short /></div></td>
                      <td>{v.attention.length ? <StatusBadge status={v.attention.some((a) => a.status === 'due') ? 'due' : 'attention'}>{plural(v.attention.length, 'item')}</StatusBadge> : <span className="caption">None</span>}</td>
                      <td className="caption num hide-sm">{fmtDate(v.lastActivity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="span-4 stack">
          <section className="panel" aria-labelledby="miss">
            <h2 className="section-title" id="miss" style={{ marginBlockEnd: 12 }}>Missing evidence</h2>
            {missing.length === 0 ? <p className="muted small">No open gaps.</p> : (
              <div className="status-list">
                {missing.map((v) => (
                  <Link key={v.id} to={`/v/${v.id}/confidence`}>
                    <span><b>{v.make} {v.model}</b><br /><span className="caption">{v.confidence.topGap}</span></span>
                    <span className="caption num">{v.confidence.gaps} gaps</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
          {resaleOpp.length > 0 && (
            <section className="panel" aria-labelledby="opp">
              <h2 className="section-title" id="opp" style={{ marginBlockEnd: 12 }}>Resale opportunities</h2>
              <div className="status-list">
                {resaleOpp.map((v) => (
                  <Link key={v.id} to={`/v/${v.id}/resale`}>
                    <span><b>{v.make} {v.model}</b><br /><span className="caption">{v.resale.notReady.length ? `Needs: ${v.resale.notReady.slice(0, 2).join(', ')}` : 'Ready to list'}</span></span>
                    <ScoreBar score={v.resale.score} level={v.resale.level} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="g12">
        <section className="panel span-8" aria-labelledby="att">
          <h2 className="section-title" id="att" style={{ marginBlockEnd: 12 }}>Needs attention</h2>
          {attention.length === 0 ? <p className="muted small">Nothing flagged across your vehicles.</p> : (
            <div className="status-list">
              {attention.flatMap((v) => v.attention.map((a) => (
                <Link key={v.id + a.id} to={`/v/${v.id}#att-${a.id}`}>
                  <span><b>{a.title}</b> <span className="muted">· {v.make} {v.model}{v.plate ? ` · ${v.plate}` : ''}</span></span>
                  <StatusBadge status={a.status}>{a.metric}</StatusBadge>
                </Link>
              )))}
            </div>
          )}
        </section>
        <section className="panel span-4" aria-labelledby="rec">
          <h2 className="section-title" id="rec" style={{ marginBlockEnd: 12 }}>Recent activity</h2>
          <div className="status-list">
            {p.recent.slice(0, 7).map((r, i) => (
              <Link key={i} to={`/v/${r.vehicleId}/${r.kind === 'record' ? 'timeline' : 'documents'}`}>
                <span><span className="small">{r.text}</span><br /><span className="caption">{byId[r.vehicleId]?.make} {byId[r.vehicleId]?.model} · {fmtDate(r.at)}</span></span>
                <TrustBadge trust={r.trust} />
              </Link>
            ))}
            {!p.recent.length && <p className="muted small">No activity yet.</p>}
          </div>
        </section>
      </div>
      {adding && <AddVehicle onClose={() => setAdding(false)} showOwner />}
    </div>
  );
}
