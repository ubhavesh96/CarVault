import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import { Arrow, ConfidenceScore, ErrorNote, LevelBadge, ScoreBar, Spinner, TrustBadge } from '../components/ui';
import type { ConfidenceResult, Dimension, MissingItem } from '../types';
import { fmtDate } from '../utils';

function ctaPath(vehicleId: string, m: MissingItem) {
  if (m.cta.to === 'documents') return `/v/${vehicleId}/documents${m.docType ? `?type=${m.docType}` : ''}`;
  if (m.cta.to === 'timeline') return `/v/${vehicleId}/timeline`;
  if (m.cta.to === 'passport') return `/v/${vehicleId}/passport`;
  return `/v/${vehicleId}`;
}

function DimensionRow({ d, vehicleId, open, onToggle }: { d: Dimension; vehicleId: string; open: boolean; onToggle: () => void }) {
  const id = `dim-${d.id}`;
  return (
    <article className={`dim${open ? ' open' : ''}`} id={id}>
      <button className="dim-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
        <span className="dim-name"><b>{d.label}</b>
          <small>{d.evidence.length} evidence item{d.evidence.length === 1 ? '' : 's'} · {d.sources.length} source{d.sources.length === 1 ? '' : 's'}{d.lastVerified ? ` · last verified ${fmtDate(d.lastVerified)}` : ''}</small>
        </span>
        <ScoreBar score={d.score} level={d.level} />
        <LevelBadge level={d.level} short />
        <ChevronDown className="i chev" aria-hidden />
      </button>
      {open && (
        <div className="dim-body" id={`${id}-body`}>
          <section>
            <p className="label">Why is this score?</p>
            <p className="dim-why">{d.why}</p>
          </section>
          <section>
            <p className="label">Evidence</p>
            {d.evidence.length === 0 ? <p className="muted small">No evidence on file for this dimension.</p> : (
              <ul className="evidence-list">
                {d.evidence.map((e, i) => (
                  <li key={i} className="evidence">
                    <span className="ev-dot" aria-hidden />
                    <span className="ev-main">
                      <span><b>{e.label}</b>{e.date && <span className="num muted"> · {fmtDate(e.date)}</span>}</span>
                      {e.detail && <small>{e.detail}</small>}
                      <small>Source: {e.source}</small>
                    </span>
                    <span className="ev-side">
                      <TrustBadge trust={e.trust} />
                      {e.ref && (
                        <Link className="link" to={e.ref.kind === 'service' ? `/v/${vehicleId}/timeline?record=${e.ref.id}` : `/v/${vehicleId}/documents?doc=${e.ref.id}`}>View <Arrow /></Link>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {d.evidence.length >= 2 && d.id === 'mileage' && <p className="caption" style={{ marginBlockStart: 8 }}>{d.evidence.length} corroborating records.</p>}
          </section>
          <section>
            <p className="label">What is missing?</p>
            {d.missing.length === 0 ? <p className="muted small">Nothing. This dimension has its core evidence.</p> : (
              <ul className="missing-list">
                {d.missing.map((m) => (
                  <li key={m.id}>
                    <span><b>{m.label}</b><small>Needs: {m.evidence}</small></span>
                    <Link className="btn sm" to={ctaPath(vehicleId, m)}>{m.cta.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

/** Lower-case only the first letter, unless it starts an acronym such as RTA. */
const lowerFirst = (t: string) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

export default function ConfidencePage() {
  const { data } = useVehicle();
  const v = data.vehicle;
  const [params] = useSearchParams();
  const [c, setC] = useState<ConfidenceResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set(params.get('dim') ? [params.get('dim')!] : []));

  useEffect(() => { api.confidence(v.id).then(setC).catch((e) => setErr(e.message)); }, [v.id, data]);
  useEffect(() => {
    const d = params.get('dim');
    if (d && c) {
      setOpen((s) => new Set([...s, d]));
      requestAnimationFrame(() => document.getElementById(`dim-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [params, c]);

  if (err) return <ErrorNote error={err} />;
  if (!c) return <div className="empty"><Spinner /></div>;
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="g12">
      <div className="span-8 stack">
        <section className="panel conf-hero" aria-labelledby="cb">
          <ConfidenceScore score={c.score} level={c.level} verifiedRecords={c.verifiedRecords} sources={c.sources} gaps={c.gaps} size={120} question={c.question} />
          <p className="caption" style={{ marginBlockStart: 16 }}>
            Vehicle Confidence measures the quality, completeness, recency and consistency of this vehicle's evidence. It is not a mechanical condition score.
          </p>
        </section>

        <section className="panel" aria-labelledby="cb">
          <div className="panel-head">
            <h2 className="section-title" id="cb">Confidence breakdown</h2>
            <button className="link muted" onClick={() => setOpen(open.size === c.dimensions.length ? new Set() : new Set(c.dimensions.map((d) => d.id)))}>
              {open.size === c.dimensions.length ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="dims">
            {c.dimensions.map((d) => <DimensionRow key={d.id} d={d} vehicleId={v.id} open={open.has(d.id)} onToggle={() => toggle(d.id)} />)}
          </div>
        </section>
      </div>

      <aside className="span-4 stack">
        <section className="panel" aria-labelledby="imp">
          <span className="label-ai"><ShieldCheck className="i" aria-hidden />Improve Vehicle Confidence</span>
          <h2 className="section-title" id="imp" style={{ marginBlock: '8px 4px' }}>
            {c.improvements.length ? `Up to +${c.improvements.reduce((a, i) => a + i.gain, 0)} available` : 'Nothing left to add'}
          </h2>
          <p className="caption" style={{ marginBlockEnd: 12 }}>Estimated by re-scoring each area as if the evidence were added.</p>
          <ol className="improve-list">
            {c.improvements.map((i) => (
              <li key={i.id}>
                <span className="gain num">+{i.gain}</span>
                <span className="imp-main"><b>{i.label}</b><small>{i.dimension} · needs {lowerFirst(i.evidence)}</small></span>
                <Link className="btn sm" to={ctaPath(v.id, i)} aria-label={`${i.cta.label}: ${i.label}`}><Plus className="i" aria-hidden />{i.cta.label.split(' ')[0]}</Link>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <p className="label" style={{ marginBlockEnd: 8 }}>How it's calculated</p>
          <p className="small muted">Each dimension is scored from its own evidence: source-backed records count fully, imported ones nearly fully, user-entered ones partly, and conflicting ones barely. The overall score is a weighted average set by CarVault; organizations can't change it.</p>
          <Link className="link" style={{ marginBlockStart: 10 }} to={`/v/${v.id}/assistant?q=${encodeURIComponent('Why is my Vehicle Confidence this score?')}`}>Ask why <Arrow /></Link>
        </section>
      </aside>
    </div>
  );
}
