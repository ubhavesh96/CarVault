import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { ErrorNote, Spinner } from '../../components/ui';

type Cfg = { dimensions: { id: string; label: string }[]; weights: Record<string, number>; defaults: Record<string, number> };

export default function AdminConfidence() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [w, setW] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.admin.confidence().then((c) => { setCfg(c); setW(c.weights); }).catch((e) => setErr(e.message)); }, []);
  if (err && !cfg) return <ErrorNote error={err} />;
  if (!cfg) return <div className="empty"><Spinner /></div>;
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const dirty = JSON.stringify(w) !== JSON.stringify(cfg.weights);

  const save = async (next: Record<string, number>) => {
    setBusy(true); setErr(null); setNote(null);
    try { const c = await api.admin.updateConfidence(next); setCfg(c); setW(c.weights); setNote('Weights saved and logged. Every tenant\'s Vehicle Confidence now uses them.'); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not save'); }
    setBusy(false);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="caption">CarVault Admin</p>
          <h1>Confidence Engine</h1>
          <p className="muted" style={{ maxInlineSize: 680, marginBlockStart: 4 }}>
            How much each evidence dimension contributes to Vehicle Confidence. Only CarVault Admin can change this; organizations can brand the experience but never the trust model.
          </p>
        </div>
        <div className="row">
          <button className="btn ghost" disabled={busy} onClick={() => setW(cfg.defaults)}>Restore defaults</button>
          <button className="btn primary" disabled={busy || !dirty} onClick={() => save(w)}>{busy ? 'Saving…' : 'Save weights'}</button>
        </div>
      </div>
      <ErrorNote error={err} />
      {note && <div className="notice" role="status">{note}</div>}
      <div className="g12">
        <section className="panel span-8" aria-labelledby="wt">
          <h2 className="section-title" id="wt" style={{ marginBlockEnd: 14 }}>Dimension weights</h2>
          <div className="weights">
            {cfg.dimensions.map((d) => (
              <div key={d.id} className="weight-row">
                <label htmlFor={`w-${d.id}`}>{d.label}</label>
                <input id={`w-${d.id}`} type="range" min={0} max={3} step={0.25} value={w[d.id] ?? 0} onChange={(e) => setW({ ...w, [d.id]: Number(e.target.value) })} />
                <span className="num">{(w[d.id] ?? 0).toFixed(2)}</span>
                <span className="caption num">{Math.round(((w[d.id] ?? 0) / total) * 100)}% of score</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel span-4" aria-labelledby="rules">
          <span className="label-ai"><ShieldCheck className="i" aria-hidden />Evidence rules (fixed)</span>
          <ul className="check-list" style={{ marginBlockStart: 12 }}>
            <li><span><b>Verified</b><small>Counts fully</small></span></li>
            <li><span><b>Imported</b><small>Counts at 85%</small></span></li>
            <li><span><b>User provided</b><small>Counts at 50%</small></span></li>
            <li><span><b>Conflict</b><small>Counts at 20% and flags the dimension</small></span></li>
            <li><span><b>CarVault Insight</b><small>Never counts as evidence</small></span></li>
          </ul>
          <p className="caption" style={{ marginBlockStart: 12 }}>Levels: 85+ high, 65–84 moderate, below 65 low. Every change here is written to the audit log.</p>
        </section>
      </div>
    </div>
  );
}
