import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Rocket } from 'lucide-react';
import { api } from '../../api';
import { ErrorNote, MetricCard, Modal, ScoreBar, Spinner } from '../../components/ui';
import { CATEGORY_LABEL } from '../../modules';
import type { Pilot, PilotRow, PilotStage } from '../../types';
import { daysUntil, fmtDate } from '../../utils';

const STAGES: { id: PilotStage; label: string; cls: string }[] = [
  { id: 'pilot', label: 'In pilot', cls: 's-upcoming' },
  { id: 'prospect', label: 'Prospect', cls: 's-unknown' },
  { id: 'converted', label: 'Converted', cls: 's-ok' },
  { id: 'ended', label: 'Ended', cls: 's-due' },
];
const stageOf = (s: PilotStage) => STAGES.find((x) => x.id === s)!;
const level = (n: number) => (n >= 85 ? 'high' : n >= 65 ? 'moderate' : 'low') as 'high' | 'moderate' | 'low';

function EditPilot({ row, onClose }: { row: PilotRow; onClose: () => void }) {
  const p = row.pilot;
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const pilot: Partial<Pilot> = {
      stage: f.stage as PilotStage, goal: f.goal, startedAt: f.startedAt, endsAt: f.endsAt,
      targetHighConfidence: f.target === '' ? undefined : Number(f.target),
    };
    try { await api.admin.updateOrg(row.id, { pilot }); onClose(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not save'); setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Remove ${row.name} from the pilot programme?`)) return;
    try { await api.admin.updateOrg(row.id, { pilot: null }); onClose(); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not remove'); }
  };
  return (
    <Modal title={p ? `Pilot · ${row.name}` : `Add ${row.name} to the pilot programme`} subtitle="Agree the goal with the partner before the pilot starts. The North Star target is the share of their vehicles at Vehicle Confidence 85+." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Stage</span>
            <select name="stage" defaultValue={p?.stage ?? 'prospect'}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          </label>
          <label className="field"><span>North Star target (% of vehicles at 85+)</span>
            <input name="target" type="number" min={0} max={100} defaultValue={p?.targetHighConfidence ?? ''} placeholder="e.g. 60" />
          </label>
          <label className="field"><span>Start</span><input name="startedAt" type="date" defaultValue={p?.startedAt ?? ''} /></label>
          <label className="field"><span>End</span><input name="endsAt" type="date" defaultValue={p?.endsAt ?? ''} /></label>
          <label className="field full"><span>Success looks like</span>
            <textarea name="goal" maxLength={240} defaultValue={p?.goal ?? ''} placeholder="In the partner's words: what must the pilot prove for them to buy?" />
          </label>
        </div>
        <div style={{ marginBlockStart: 12 }}><ErrorNote error={err} /></div>
        <div className="actions">
          {p && <button type="button" className="btn ghost danger" onClick={remove} style={{ marginInlineEnd: 'auto' }}>Remove from programme</button>}
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminPilots() {
  const [rows, setRows] = useState<PilotRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<PilotRow | null>(null);
  const load = useCallback(() => api.admin.pilots().then(setRows).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (err) return <ErrorNote error={err} />;
  if (!rows) return <div className="empty"><Spinner /></div>;

  const inProgramme = rows.filter((r) => r.pilot);
  const others = rows.filter((r) => !r.pilot);
  const active = inProgramme.filter((r) => r.pilot!.stage === 'pilot');
  const pilotVehicles = active.reduce((a, r) => a + r.metrics.vehicles, 0);
  const pilotHigh = active.reduce((a, r) => a + Math.round(((r.metrics.highConfidenceShare ?? 0) / 100) * r.metrics.vehicles), 0);
  const order = (r: PilotRow) => STAGES.findIndex((s) => s.id === r.pilot!.stage);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="caption">CarVault Admin · Go-to-market</p>
          <h1>Pilot programme</h1>
          <p className="muted" style={{ marginBlockStart: 4, maxInlineSize: 720 }}>Business-first launch: dealers, fleets and inspection partners run a time-boxed pilot with an agreed goal. These numbers decide whether each one converts. The playbook is in <code>docs/gtm/pilot-playbook.md</code>.</p>
        </div>
      </div>

      <div className="metrics">
        <MetricCard label="Pilots running" value={active.length} detail={`${inProgramme.filter((r) => r.pilot!.stage === 'prospect').length} prospects in the pipeline`} />
        <MetricCard label="Converted" value={inProgramme.filter((r) => r.pilot!.stage === 'converted').length} detail="Paying after a pilot" />
        <MetricCard label="North Star across pilots" value={pilotVehicles ? `${Math.round((pilotHigh / pilotVehicles) * 100)}%` : '–'} detail={`${pilotHigh} of ${pilotVehicles} pilot vehicles at confidence 85+`} />
        <MetricCard label="Buyer views" value={active.reduce((a, r) => a + r.metrics.buyerViews, 0)} detail="Data room opens by buyers and partners" />
      </div>

      <section className="panel">
        <h2 className="section-title" style={{ marginBlockEnd: 12 }}>In the programme</h2>
        {!inProgramme.length ? <p className="muted small">No organizations in the programme yet. Add one below.</p> : (
          <div className="table-wrap">
            <table className="data-table pilot-table">
              <thead><tr>
                <th>Organization</th><th>Stage</th><th>North Star vs target</th>
                <th className="r hide-sm">Data rooms (30d)</th><th className="r hide-sm">Buyer views</th><th className="r hide-sm">Transfer-ready</th><th className="r hide-sm">Issuer-checked docs</th><th />
              </tr></thead>
              <tbody>
                {[...inProgramme].sort((a, b) => order(a) - order(b)).map((r) => {
                  const p = r.pilot!;
                  const st = stageOf(p.stage);
                  const left = p.endsAt ? daysUntil(p.endsAt) : null;
                  const share = r.metrics.highConfidenceShare;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link className="link" to={`/admin/orgs/${r.id}`}>{r.name}</Link>
                        <div className="caption">{r.categories.map((c) => CATEGORY_LABEL[c]).join(' · ')} · {r.metrics.vehicles} vehicles</div>
                        {p.goal && <div className="caption pilot-goal">{p.goal}</div>}
                      </td>
                      <td>
                        <span className={`badge ${st.cls}`}>{st.label}</span>
                        {p.stage === 'pilot' && <div className="caption" style={{ marginBlockStart: 4 }}>{p.startedAt ? `Since ${fmtDate(p.startedAt)}` : ''}{left !== null ? ` · ${left >= 0 ? `${left} days left` : 'overdue for a decision'}` : ''}</div>}
                      </td>
                      <td style={{ minInlineSize: 180 }}>
                        {share === null ? <span className="caption">No vehicles yet</span> : <ScoreBar score={share} level={level(share)} />}
                        <div className="caption">{share === null ? '' : `${share}% at 85+`}{p.targetHighConfidence !== undefined ? ` · target ${p.targetHighConfidence}%` : ''}
                          {share !== null && p.targetHighConfidence !== undefined && <b className={share >= p.targetHighConfidence ? 'hit' : 'miss'}>{share >= p.targetHighConfidence ? ' · on target' : ' · below target'}</b>}
                        </div>
                      </td>
                      <td className="r num hide-sm">{r.metrics.dataRooms30d}</td>
                      <td className="r num hide-sm">{r.metrics.buyerViews}</td>
                      <td className="r num hide-sm">{r.metrics.transferReady}/{r.metrics.vehicles}</td>
                      <td className="r num hide-sm">{r.metrics.verifiedDocs}</td>
                      <td className="r"><button className="btn sm ghost" onClick={() => setEditing(r)}>Edit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section className="panel">
          <h2 className="section-title" style={{ marginBlockEnd: 12 }}>Not yet in the programme</h2>
          <div className="status-list">
            {others.map((r) => (
              <div key={r.id}>
                <span><b>{r.name}</b><br /><span className="caption">{r.categories.map((c) => CATEGORY_LABEL[c]).join(' · ')} · {r.metrics.vehicles} vehicles · {r.plan}</span></span>
                <button className="btn sm" onClick={() => setEditing(r)}><Plus className="i" aria-hidden />Add</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title row" style={{ gap: 8, marginBlockEnd: 8 }}><Rocket className="i" aria-hidden />How a pilot converts</h2>
        <ol className="small muted pilot-steps">
          <li>Agree one goal and a North Star target with the partner before starting (60 days is typical).</li>
          <li>Onboard their live stock or fleet and ask owners for the RTA Vehicle Status Certificate: it lifts mileage, ownership and insurance evidence in one upload.</li>
          <li>Every car they sell gets a data room; listings carry the badge. Buyer views show whether buyers use it.</li>
          <li>At the end date, compare against the target and decide: convert, extend once, or end.</li>
        </ol>
      </section>

      {editing && <EditPilot row={editing} onClose={() => { setEditing(null); load(); }} />}
    </div>
  );
}
