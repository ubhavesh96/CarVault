import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock, Plus, Search } from 'lucide-react';
import { api, ApiError } from '../../api';
import { useSession } from '../../session';
import { Arrow, ErrorNote, LevelBadge, ScoreBar, Spinner, StatusBadge, TrustBadge, VehicleCell } from '../../components/ui';
import { AddVehicle } from '../Garage';
import { moduleMeta } from '../../modules';
import type { Level, Portfolio, PortfolioVehicle, Trust } from '../../types';
import { daysUntil, fmtAED, fmtDate, fmtKm, monthsSince, plural } from '../../utils';

interface Col<T> { label: string; cell: (r: T) => ReactNode; sort?: (r: T) => number | string; className?: string }
interface View<T> { title: string; intro: string; rows: (p: Portfolio) => T[]; cols: Col<T>[]; empty: string; notice?: ReactNode; key: (r: T) => string; addVehicle?: boolean; search?: (r: T) => string }

const lvl = (s: number): Level => (s >= 85 ? 'high' : s >= 65 ? 'moderate' : 'low');
const vCol: Col<PortfolioVehicle> = { label: 'Vehicle', cell: (v) => <VehicleCell v={v} sub={[v.plate, v.ownerName].filter(Boolean).join(' · ')} />, sort: (v) => `${v.make} ${v.model}` };
const confCol: Col<PortfolioVehicle> = { label: 'Vehicle Confidence', cell: (v) => <div className="row" style={{ gap: 10 }}><ScoreBar score={v.confidence.score} level={v.confidence.level} /><LevelBadge level={v.confidence.level} short /></div>, sort: (v) => v.confidence.score };
const dimCol = (id: string, label: string): Col<PortfolioVehicle> => ({ label, cell: (v) => <ScoreBar score={v.confidence.dims[id] ?? 0} level={lvl(v.confidence.dims[id] ?? 0)} />, sort: (v) => v.confidence.dims[id] ?? 0 });
const kmCol: Col<PortfolioVehicle> = { label: 'Mileage', cell: (v) => <span className="num">{fmtKm(v.mileage)}</span>, sort: (v) => v.mileage, className: 'hide-sm' };
const attCol: Col<PortfolioVehicle> = { label: 'Attention', cell: (v) => (v.attention.length ? <StatusBadge status={v.attention.some((a) => a.status === 'due') ? 'due' : 'attention'}>{plural(v.attention.length, 'item')}</StatusBadge> : <span className="caption">None</span>), sort: (v) => v.attention.length };
const vSearch = (v: PortfolioVehicle) => `${v.make} ${v.model} ${v.variant} ${v.plate ?? ''} ${v.ownerName ?? ''} ${v.vin}`.toLowerCase();
const vKey = (v: PortfolioVehicle) => v.id;
const inspAge = (v: PortfolioVehicle) => (v.lastInspection ? monthsSince(v.lastInspection.date) : Infinity);
const expiryBadge = (d: string | null) => {
  if (!d) return <StatusBadge status="unknown">Not on file</StatusBadge>;
  const n = daysUntil(d);
  return n < 0 ? <StatusBadge status="due">Expired</StatusBadge> : n <= 60 ? <StatusBadge status="attention">{n} days</StatusBadge> : <span className="caption num">{fmtDate(d)}</span>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VIEWS: Record<string, View<any>> = {
  vehicles: {
    title: 'Vehicles', intro: 'Every vehicle record your organization manages.', key: vKey, search: vSearch, addVehicle: true,
    rows: (p) => p.vehicles, empty: 'No vehicles yet.', cols: [vCol, confCol, kmCol, attCol],
  } satisfies View<PortfolioVehicle>,
  inventory: {
    title: 'Inventory', intro: 'Stock vehicles with their evidence strength and resale readiness.', key: vKey, search: vSearch, addVehicle: true,
    rows: (p) => p.vehicles, empty: 'No stock vehicles.',
    cols: [vCol, confCol, { label: 'Resale readiness', cell: (v: PortfolioVehicle) => <ScoreBar score={v.resale.score} level={v.resale.level} />, sort: (v: PortfolioVehicle) => v.resale.score }, kmCol,
      { label: 'Value (est.)', cell: (v: PortfolioVehicle) => (v.value?.mid ? <span className="num">{fmtAED(v.value.mid)}</span> : <span className="caption">Unknown</span>), sort: (v: PortfolioVehicle) => v.value?.mid ?? 0, className: 'hide-sm' }],
  } satisfies View<PortfolioVehicle>,
  fleet: {
    title: 'Fleet', intro: 'Fleet vehicles with mileage, maintenance and evidence strength.', key: vKey, search: vSearch, addVehicle: true,
    rows: (p) => p.vehicles, empty: 'No fleet vehicles.', cols: [vCol, kmCol, attCol, { label: 'Upcoming', cell: (v: PortfolioVehicle) => <span className="caption">{v.upcoming.map((u) => `${u.title} ${u.metric}`).join(' · ') || 'None'}</span> }, confCol],
  } satisfies View<PortfolioVehicle>,
  customers: {
    title: 'Customers', intro: 'Customers and the vehicles linked to them.', key: (r) => r.name, search: (r) => r.name.toLowerCase(),
    rows: (p) => Object.values(p.vehicles.reduce<Record<string, { name: string; vehicles: PortfolioVehicle[] }>>((acc, v) => {
      const name = v.ownerName ?? 'Unassigned';
      (acc[name] ??= { name, vehicles: [] }).vehicles.push(v);
      return acc;
    }, {})),
    empty: 'No customers yet.',
    cols: [
      { label: 'Customer', cell: (r: { name: string }) => <b>{r.name}</b>, sort: (r: { name: string }) => r.name },
      { label: 'Vehicles', cell: (r: { vehicles: PortfolioVehicle[] }) => <div className="stack-tight">{r.vehicles.map((v) => <VehicleCell key={v.id} v={v} />)}</div> },
      { label: 'Avg confidence', cell: (r: { vehicles: PortfolioVehicle[] }) => { const s = Math.round(r.vehicles.reduce((a, v) => a + v.confidence.score, 0) / r.vehicles.length); return <ScoreBar score={s} level={lvl(s)} />; } },
      { label: 'Attention', cell: (r: { vehicles: PortfolioVehicle[] }) => <span className="num">{r.vehicles.reduce((a, v) => a + v.attention.length, 0)}</span> },
    ],
  },
  resale_readiness: {
    title: 'Resale readiness', intro: 'What is ready and what is missing before each vehicle is listed.', key: vKey, search: vSearch,
    rows: (p) => [...p.vehicles].sort((a, b) => b.resale.score - a.resale.score), empty: 'No vehicles.',
    cols: [vCol, { label: 'Resale readiness', cell: (v: PortfolioVehicle) => <ScoreBar score={v.resale.score} level={v.resale.level} />, sort: (v: PortfolioVehicle) => v.resale.score },
      { label: 'Needs attention', cell: (v: PortfolioVehicle) => <span className="caption">{v.resale.notReady.join(', ') || 'Ready to list'}</span> },
      { label: '', cell: (v: PortfolioVehicle) => <Link className="link" to={`/v/${v.id}/resale`}>Prepare <Arrow /></Link> }],
  } satisfies View<PortfolioVehicle>,
  vehicle_history: {
    title: 'Vehicle history', intro: 'History completeness and mileage confidence for insured vehicles.', key: vKey, search: vSearch,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, dimCol('service', 'Service history'), dimCol('mileage', 'Mileage'), { label: 'Records', cell: (v: PortfolioVehicle) => <span className="caption num">{v.records} · {v.imported} imported</span> },
      { label: 'Conflicts', cell: (v: PortfolioVehicle) => (v.conflicts.length ? <TrustBadge trust="conflict" /> : <span className="caption">None</span>) }],
  } satisfies View<PortfolioVehicle>,
  claims_evidence: {
    title: 'Claims evidence', intro: 'Accident and claims evidence on file. An inspection alone is partial evidence, not a claims history.', key: vKey, search: vSearch,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, dimCol('claims', 'Claims evidence'),
      { label: 'Evidence on file', cell: (v: PortfolioVehicle) => { const s = v.confidence.dims.claims ?? 0; return <span className="caption">{s >= 85 ? 'Claims history report' : s > 0 ? 'Inspection only (partial)' : 'None: unknown, not accident-free'}</span>; } },
      { label: '', cell: (v: PortfolioVehicle) => <Link className="link" to={`/v/${v.id}/confidence?dim=claims`}>Evidence <Arrow /></Link> }],
  } satisfies View<PortfolioVehicle>,
  inspection: {
    title: 'Inspection', intro: 'The latest inspection evidence for each vehicle and its age.', key: vKey, search: vSearch,
    rows: (p) => [...p.vehicles].sort((a, b) => inspAge(b) - inspAge(a)), empty: 'No vehicles.',
    cols: [vCol, { label: 'Last inspection', cell: (v: PortfolioVehicle) => (v.lastInspection ? <span className="num">{fmtDate(v.lastInspection.date)}</span> : <span className="caption">None</span>), sort: (v: PortfolioVehicle) => -inspAge(v) },
      { label: 'Status', cell: (v: PortfolioVehicle) => { const a = inspAge(v); return a === Infinity ? <StatusBadge status="unknown">None on file</StatusBadge> : a <= 6 ? <StatusBadge status="ok">Current</StatusBadge> : <StatusBadge status={a <= 12 ? 'attention' : 'due'}>{a} months old</StatusBadge>; } },
      dimCol('inspection', 'Inspection confidence')],
  } satisfies View<PortfolioVehicle>,
  inspection_queue: {
    title: 'Inspection queue', intro: 'Vehicles whose inspection evidence is missing or older than 6 months. Each new inspection report updates Vehicle Confidence.', key: vKey, search: vSearch, addVehicle: true,
    rows: (p) => p.vehicles.filter((v) => inspAge(v) > 6).sort((a, b) => inspAge(b) - inspAge(a)), empty: 'Queue is clear: every vehicle has a current inspection.',
    cols: [vCol, { label: 'Last inspection', cell: (v: PortfolioVehicle) => (v.lastInspection ? `${monthsSince(v.lastInspection.date)} months ago` : 'Never') },
      dimCol('inspection', 'Inspection confidence'),
      { label: '', cell: (v: PortfolioVehicle) => <Link className="btn sm" to={`/v/${v.id}/documents?type=inspection`}>Add inspection report</Link> }],
  } satisfies View<PortfolioVehicle>,
  inspection_reports: {
    title: 'Inspection reports', intro: 'Every inspection record and what the inspector recorded.', key: (r) => r.id, search: (r) => `${r.vehicle} ${r.shop} ${r.notes ?? ''}`.toLowerCase(),
    rows: (p) => p.vehicles.flatMap((v) => v.inspections.map((i) => ({ ...i, vehicle: `${v.year} ${v.make} ${v.model}`, vehicleId: v.id }))).sort((a, b) => b.date.localeCompare(a.date)),
    empty: 'No inspection reports yet.',
    cols: [{ label: 'Date', cell: (r: { date: string }) => <span className="num">{fmtDate(r.date)}</span>, sort: (r: { date: string }) => r.date },
      { label: 'Vehicle', cell: (r: { vehicle: string; vehicleId: string; id: string }) => <Link className="link" to={`/v/${r.vehicleId}/timeline?record=${r.id}`}>{r.vehicle}</Link> },
      { label: 'Inspector', cell: (r: { shop: string }) => r.shop },
      { label: 'Findings', cell: (r: { notes?: string }) => <span className="caption">{r.notes ?? 'No findings recorded'}</span> },
      { label: 'Provenance', cell: (r: { trust: Trust }) => <TrustBadge trust={r.trust} /> }],
  },
  ownership: {
    title: 'Ownership', intro: 'Identity, ownership and registration evidence per vehicle.', key: vKey, search: vSearch,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, dimCol('identity', 'Identity'), dimCol('ownership', 'Ownership'), { label: 'Registration', cell: (v: PortfolioVehicle) => expiryBadge(v.registrationExpires) }],
  } satisfies View<PortfolioVehicle>,
  valuation: {
    title: 'Valuation', intro: 'Illustrative value ranges with their evidence strength. Not UAE market data: confirm with a dealer valuation.', key: vKey, search: vSearch,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, { label: 'Estimated range', cell: (v: PortfolioVehicle) => (v.value ? <span className="row" style={{ gap: 8 }}><span className="num">{fmtAED(v.value.low!)} – {fmtAED(v.value.high!)}</span><TrustBadge trust="estimated" /></span> : <span className="caption">Unknown: purchase price missing</span>), sort: (v: PortfolioVehicle) => v.value?.mid ?? 0 }, confCol],
  } satisfies View<PortfolioVehicle>,
  collateral: {
    title: 'Collateral confidence', intro: 'For financed vehicles: collateral confidence is the lowest of identity, ownership and overall Vehicle Confidence, so one weak link is never hidden.', key: vKey, search: vSearch,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, { label: 'Collateral confidence', cell: (v: PortfolioVehicle) => { const s = Math.min(v.confidence.dims.identity ?? 0, v.confidence.dims.ownership ?? 0, v.confidence.score); return <ScoreBar score={s} level={lvl(s)} />; }, sort: (v: PortfolioVehicle) => Math.min(v.confidence.dims.identity ?? 0, v.confidence.dims.ownership ?? 0, v.confidence.score) },
      dimCol('identity', 'Identity'), dimCol('ownership', 'Ownership'),
      { label: 'Value (est.)', cell: (v: PortfolioVehicle) => (v.value?.mid ? <span className="num">{fmtAED(v.value.mid)}</span> : <span className="caption">Unknown</span>), className: 'hide-sm' }],
  } satisfies View<PortfolioVehicle>,
  risk_signals: {
    title: 'Risk signals', intro: 'Conflicts, expired cover and weak evidence that deserve review. These are prompts to check the source, not conclusions.', key: (r) => r.key, search: (r) => `${r.vehicle} ${r.signal}`.toLowerCase(),
    rows: (p) => p.vehicles.flatMap((v) => {
      const out: { key: string; vehicle: string; vehicleId: string; signal: string; detail: string; severity: 'due' | 'attention'; to: string }[] = [];
      const name = `${v.year} ${v.make} ${v.model}`;
      v.conflicts.forEach((c) => out.push({ key: v.id + c.id, vehicle: name, vehicleId: v.id, signal: 'Conflicting record', detail: c.detail ?? c.title, severity: 'due', to: `/v/${v.id}/timeline?record=${c.id}` }));
      if ((v.confidence.dims.mileage ?? 0) < 65) out.push({ key: v.id + 'mil', vehicle: name, vehicleId: v.id, signal: 'Low mileage confidence', detail: `${v.confidence.dims.mileage}% mileage confidence`, severity: 'attention', to: `/v/${v.id}/confidence?dim=mileage` });
      if ((v.confidence.dims.identity ?? 0) < 65) out.push({ key: v.id + 'id', vehicle: name, vehicleId: v.id, signal: 'Weak identity evidence', detail: 'VIN not confirmed by a document', severity: 'attention', to: `/v/${v.id}/confidence?dim=identity` });
      if (v.insuranceExpires && daysUntil(v.insuranceExpires) < 0) out.push({ key: v.id + 'ins', vehicle: name, vehicleId: v.id, signal: 'Insurance expired', detail: `Expired ${fmtDate(v.insuranceExpires)}`, severity: 'due', to: `/v/${v.id}/documents` });
      if (!v.insuranceExpires) out.push({ key: v.id + 'noins', vehicle: name, vehicleId: v.id, signal: 'No insurance evidence', detail: 'No current policy on file', severity: 'attention', to: `/v/${v.id}/documents?type=insurance` });
      return out;
    }).sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'due' ? -1 : 1)),
    empty: 'No risk signals across your vehicles.',
    cols: [{ label: 'Signal', cell: (r: { signal: string; severity: 'due' | 'attention' }) => <StatusBadge status={r.severity}>{r.signal}</StatusBadge> },
      { label: 'Vehicle', cell: (r: { vehicle: string; vehicleId: string }) => <Link className="link" to={`/v/${r.vehicleId}`}>{r.vehicle}</Link> },
      { label: 'Detail', cell: (r: { detail: string }) => <span className="caption">{r.detail}</span> },
      { label: '', cell: (r: { to: string }) => <Link className="link" to={r.to}>Review <Arrow /></Link> }],
  },
  maintenance_intel: {
    title: 'Maintenance', intro: 'What is due, flagged or approaching, from each vehicle\'s records and typical intervals.', key: (r) => r.key, search: (r) => `${r.vehicle} ${r.title}`.toLowerCase(),
    rows: (p) => p.vehicles.flatMap((v) => [
      ...v.attention.filter((a) => !['ins_insurance', 'ins_registration'].includes(a.id)).map((a) => ({ key: v.id + a.id, vehicle: `${v.make} ${v.model}`, plate: v.plate, vehicleId: v.id, id: a.id, title: a.title, status: a.status, metric: a.metric })),
      ...v.upcoming.map((a) => ({ key: v.id + a.id, vehicle: `${v.make} ${v.model}`, plate: v.plate, vehicleId: v.id, id: a.id, title: a.title, status: 'upcoming' as const, metric: a.metric })),
    ]).sort((a, b) => ['due', 'attention', 'upcoming'].indexOf(a.status) - ['due', 'attention', 'upcoming'].indexOf(b.status)),
    empty: 'Nothing due or approaching.',
    cols: [{ label: 'Item', cell: (r: { title: string }) => <b>{r.title}</b> },
      { label: 'Vehicle', cell: (r: { vehicle: string; plate?: string; vehicleId: string }) => <Link className="link" to={`/v/${r.vehicleId}`}>{r.vehicle}{r.plate ? ` · ${r.plate}` : ''}</Link> },
      { label: 'Status', cell: (r: { status: 'due' | 'attention' | 'upcoming'; metric: string }) => <StatusBadge status={r.status}>{r.metric}</StatusBadge> },
      { label: '', cell: (r: { vehicleId: string; id: string }) => <Link className="link" to={`/v/${r.vehicleId}#att-${r.id}`}>Why <Arrow /></Link> }],
  },
  alerts: {
    title: 'Alerts', intro: 'Due maintenance and expiring registration or insurance across the fleet.', key: (r) => r.key, search: (r) => `${r.vehicle} ${r.alert}`.toLowerCase(),
    rows: (p) => p.vehicles.flatMap((v) => {
      const name = `${v.make} ${v.model}${v.plate ? ` · ${v.plate}` : ''}`;
      const out: { key: string; vehicle: string; vehicleId: string; alert: string; status: 'due' | 'attention'; metric: string }[] = [];
      v.attention.forEach((a) => out.push({ key: v.id + a.id, vehicle: name, vehicleId: v.id, alert: a.title, status: a.status === 'due' ? 'due' : 'attention', metric: a.metric }));
      for (const [label, d] of [['Registration', v.registrationExpires], ['Insurance', v.insuranceExpires]] as const)
        if (d && daysUntil(d) <= 60 && !v.attention.some((a) => a.title === label)) out.push({ key: v.id + label, vehicle: name, vehicleId: v.id, alert: `${label} expiring`, status: daysUntil(d) < 0 ? 'due' : 'attention', metric: daysUntil(d) < 0 ? 'Expired' : `${daysUntil(d)} days` });
      return out;
    }),
    empty: 'No alerts.',
    cols: [{ label: 'Alert', cell: (r: { alert: string }) => <b>{r.alert}</b> },
      { label: 'Vehicle', cell: (r: { vehicle: string; vehicleId: string }) => <Link className="link" to={`/v/${r.vehicleId}`}>{r.vehicle}</Link> },
      { label: 'Status', cell: (r: { status: 'due' | 'attention'; metric: string }) => <StatusBadge status={r.status}>{r.metric}</StatusBadge> }],
  },
  parts_history: {
    title: 'Parts history', intro: 'Parts fitted across customer vehicles, from service records.', key: (r) => r.key, search: (r) => `${r.name} ${r.vehicle}`.toLowerCase(),
    rows: (p) => p.vehicles.flatMap((v) => v.parts.map((x, i) => ({ ...x, key: `${v.id}-${i}`, vehicle: `${v.year} ${v.make} ${v.model}`, vehicleId: v.id }))).sort((a, b) => b.date.localeCompare(a.date)),
    empty: 'No parts recorded yet.',
    cols: [{ label: 'Date', cell: (r: { date: string }) => <span className="num">{fmtDate(r.date)}</span>, sort: (r: { date: string }) => r.date },
      { label: 'Part', cell: (r: { name: string }) => <b>{r.name}</b> },
      { label: 'Job', cell: (r: { title: string; vehicleId: string; recordId: string }) => <Link className="link" to={`/v/${r.vehicleId}/timeline?record=${r.recordId}`}>{r.title}</Link> },
      { label: 'Vehicle', cell: (r: { vehicle: string }) => r.vehicle }],
  },
  service_costs: {
    title: 'Service costs', intro: 'Recorded spend per vehicle, from invoices on file. Costs without an invoice are not included.', key: vKey, search: vSearch,
    rows: (p) => [...p.vehicles].sort((a, b) => b.spend - a.spend), empty: 'No vehicles.',
    cols: [vCol, { label: 'Recorded spend', cell: (v: PortfolioVehicle) => <span className="num">{fmtAED(v.spend)}</span>, sort: (v: PortfolioVehicle) => v.spend },
      { label: 'Per 1,000 km', cell: (v: PortfolioVehicle) => <span className="num">{v.mileage ? fmtAED((v.spend / v.mileage) * 1000) : '–'}</span>, sort: (v: PortfolioVehicle) => (v.mileage ? v.spend / v.mileage : 0) },
      { label: 'Records', cell: (v: PortfolioVehicle) => <span className="num">{v.records}</span> }],
  } satisfies View<PortfolioVehicle>,
  utilization: {
    title: 'Utilization', intro: 'Usage and downtime.', key: vKey, search: vSearch,
    notice: <><b>Telematics not connected.</b> Utilization and downtime need a telematics or fleet-system integration, which isn't connected for your organization. The average below is only the current odometer divided by the vehicle's age.</>,
    rows: (p) => p.vehicles, empty: 'No vehicles.',
    cols: [vCol, kmCol, { label: 'Avg km / month (odometer ÷ age)', cell: (v: PortfolioVehicle) => { const m = Math.max(1, (Date.now() - new Date(`${v.year}-01-01`).getTime()) / 2.63e9); return <span className="num">{fmtKm(v.mileage / m)}</span>; } },
      { label: 'Downtime', cell: () => <span className="caption">Unknown: needs telematics</span> }],
  } satisfies View<PortfolioVehicle>,
};

function Analytics({ p }: { p: Portfolio }) {
  const vs = p.vehicles;
  const dims = ['identity', 'ownership', 'mileage', 'service', 'insurance', 'inspection', 'claims', 'documents'];
  const DIM_LABEL: Record<string, string> = { identity: 'Identity', ownership: 'Ownership', mileage: 'Mileage', service: 'Service history', insurance: 'Insurance', inspection: 'Inspection', claims: 'Accident / claims', documents: 'Documents' };
  const avg = (id: string) => (vs.length ? Math.round(vs.reduce((a, v) => a + (v.confidence.dims[id] ?? 0), 0) / vs.length) : 0);
  const dist = (['high', 'moderate', 'low'] as Level[]).map((l) => ({ l, n: vs.filter((v) => v.confidence.level === l).length }));
  return (
    <div className="g12">
      <section className="panel span-6" aria-labelledby="an-dist">
        <h2 className="section-title" id="an-dist">Vehicle Confidence distribution</h2>
        <p className="caption" style={{ marginBlockEnd: 16 }}>{vs.length} vehicles</p>
        <div className="dist" role="img" aria-label={dist.map((d) => `${d.l}: ${d.n}`).join(', ')}>
          {dist.map((d) => d.n > 0 && <span key={d.l} className={`s-${d.l === 'high' ? 'ok' : d.l === 'moderate' ? 'attention' : 'due'}`} style={{ flexGrow: d.n }} title={`${d.l}: ${d.n}`} />)}
        </div>
        <div className="status-list" style={{ marginBlockStart: 16 }}>
          {dist.map((d) => <div key={d.l}><span><LevelBadge level={d.l} /></span><b className="num">{d.n}</b></div>)}
        </div>
      </section>
      <section className="panel span-6" aria-labelledby="an-dim">
        <h2 className="section-title" id="an-dim">Average evidence strength by dimension</h2>
        <p className="caption" style={{ marginBlockEnd: 16 }}>Where your records are strongest and weakest</p>
        <div className="bars">
          {dims.map((d) => <div key={d} className="bar-row" title={`${DIM_LABEL[d]}: ${avg(d)}%`}><span>{DIM_LABEL[d]}</span><ScoreBar score={avg(d)} /></div>)}
        </div>
      </section>
      <section className="panel span-12" aria-labelledby="an-tbl">
        <h2 className="section-title" id="an-tbl" style={{ marginBlockEnd: 12 }}>Table view</h2>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Vehicle</th><th className="r">Overall</th>{dims.map((d) => <th key={d} className="r">{DIM_LABEL[d]}</th>)}</tr></thead>
          <tbody>{vs.map((v) => <tr key={v.id}><td><Link className="link" to={`/v/${v.id}/confidence`}>{v.make} {v.model}</Link></td><td className="r num">{v.confidence.score}</td>{dims.map((d) => <td key={d} className="r num">{v.confidence.dims[d]}</td>)}</tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}

export function Locked({ moduleId }: { moduleId: string }) {
  const { session } = useSession();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = session?.catalog.modules.find((x) => x.id === moduleId);
  const tryActivate = async () => {
    setErr(null);
    try { await api.activateModule(moduleId); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Not available'); }
  };
  const request = async () => {
    try { setMsg((await api.requestAccess({ module: moduleId })).message); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send'); }
  };
  return (
    <div className="panel locked-panel">
      <Lock className="i" aria-hidden style={{ inlineSize: 28, blockSize: 28, color: 'var(--color-text-secondary)' }} />
      <h1 className="section-title" style={{ fontSize: 22 }}>{m?.name ?? moduleMeta(moduleId).label}</h1>
      <p className="muted">{m?.description}</p>
      <p className="small">Available with {m?.unlockedBy.length ? m.unlockedBy.map((c) => session?.catalog.categories.find((x) => x.id === c)?.name).join(' or ') : 'a custom plan'}.</p>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={tryActivate}>Activate</button>
        <button className="btn primary" onClick={request}>Contact CarVault Admin</button>
      </div>
      <ErrorNote error={err} />
      {msg && <div className="notice" role="status">{msg}</div>}
    </div>
  );
}

export default function ModulePage() {
  const { module = 'vehicles' } = useParams();
  const { has } = useSession();
  const [p, setP] = useState<Portfolio | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setP(null); api.portfolio().then(setP).catch((e) => setErr(e.message)); }, [module]);
  const view = VIEWS[module];

  const rows = useMemo(() => {
    if (!p || !view) return [];
    let r = view.rows(p);
    if (q && view.search) r = r.filter((x) => view.search!(x).includes(q.toLowerCase()));
    if (sort && view.cols[sort.i].sort) {
      const f = view.cols[sort.i].sort!;
      r = [...r].sort((a, b) => (f(a) > f(b) ? 1 : f(a) < f(b) ? -1 : 0) * sort.dir);
    }
    return r;
  }, [p, view, q, sort]);

  if (!has(module) && module !== 'vehicles') return <Locked moduleId={module} />;
  if (err) return <ErrorNote error={err} />;
  if (!p) return <div className="empty"><Spinner /></div>;
  const meta = moduleMeta(module);
  if (module === 'analytics') {
    return <div className="stack"><div className="page-head"><div><p className="caption">Analytics</p><h1>Evidence coverage</h1></div></div><Analytics p={p} /></div>;
  }
  if (!view) return <div className="empty"><h3>{meta.label}</h3><p>This module has no dedicated view yet.</p></div>;

  return (
    <div className="stack">
      <div className="page-head">
        <div><p className="caption row" style={{ gap: 6 }}><meta.icon className="i" aria-hidden style={{ inlineSize: 14, blockSize: 14 }} />{meta.label}</p><h1>{view.title}</h1><p className="muted" style={{ maxInlineSize: 680, marginBlockStart: 4 }}>{view.intro}</p></div>
        {view.addVehicle && <button className="btn primary" onClick={() => setAdding(true)}><Plus className="i" aria-hidden />Add vehicle</button>}
      </div>
      {view.notice && <div className="notice warn">{view.notice}</div>}
      <section className="panel">
        {view.search && (
          <div className="search" style={{ marginBlockEnd: 16 }}>
            <Search className="i" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vehicles, plates, VINs, customers…" aria-label="Search" />
          </div>
        )}
        {rows.length === 0 ? <p className="muted">{q ? 'No matches.' : view.empty}</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr>{view.cols.map((c, i) => (
                <th key={i} className={c.className} aria-sort={sort?.i === i ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
                  {c.sort ? <button className="th-sort" onClick={() => setSort(sort?.i === i ? { i, dir: sort.dir === 1 ? -1 : 1 } : { i, dir: -1 })}>{c.label}{sort?.i === i ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button> : c.label}
                </th>
              ))}</tr></thead>
              <tbody>{rows.map((r) => <tr key={view.key(r)}>{view.cols.map((c, i) => <td key={i} className={c.className}>{c.cell(r)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="caption" style={{ marginBlockStart: 12 }}>{rows.length} row{rows.length === 1 ? '' : 's'}</p>
      </section>
      {adding && <AddVehicle onClose={() => setAdding(false)} showOwner />}
    </div>
  );
}
