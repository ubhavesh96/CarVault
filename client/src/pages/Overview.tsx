import { useEffect, useState } from 'react';
import { api } from '../api';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ScanSearch } from 'lucide-react';
import { useVehicle } from './VehicleLayout';
import {
  Arrow, CarVaultInsight, ConfidenceScore, MileageChart, ScoreBar, StatusBadge, TrustBadge, insightIcon, sourcePath,
} from '../components/ui';
import type { Dimension, Insight } from '../types';
import { CATEGORY_LABEL, fmtAED, fmtDate, fmtKm } from '../utils';

const ASK = ['What needs attention?', 'What should I service next?', 'Is my car ready for a long drive?', 'Explain my service history.'];
const STATUS_VAR: Record<string, string> = {
  due: 'var(--color-danger)', attention: 'var(--color-warning)', upcoming: 'var(--color-blue)', ok: 'var(--color-success)', unknown: 'var(--color-text-secondary)',
};

function sourceVerb(i: Insight) {
  if (!i.source) return '';
  if (i.source.kind === 'document') return 'document';
  return /inspection/i.test(i.source.label) ? 'inspection' : /tyre/i.test(i.source.label) ? 'tyre invoice' : 'service record';
}

function AttentionItem({ insight, vehicleId, defaultOpen }: { insight: Insight; vehicleId: string; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = insightIcon(insight.id);
  const panelId = `why-${insight.id}`;
  return (
    <article className="att" id={`att-${insight.id}`}>
      <div className="att-head">
        <h4><Icon className="i" aria-hidden />{insight.title}</h4>
        <StatusBadge status={insight.status} />
      </div>
      <p className="detail">{insight.detail}</p>
      {insight.facts.length > 0 && (
        <dl className="facts">
          {insight.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd className="num">{f.value}</dd></div>)}
        </dl>
      )}
      <div className="att-foot">
        {insight.source && <span className="basis">Based on {insight.source.label.split(' · ')[0].toLowerCase()}</span>}
        {insight.source && <Link className="link" to={sourcePath(vehicleId, insight.source)}>View {sourceVerb(insight)} <Arrow /></Link>}
        <button className="link muted" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          Why this matters <ChevronDown className="i" aria-hidden style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }} />
        </button>
      </div>
      {open && <div className="att-more" id={panelId}><CarVaultInsight vehicleId={vehicleId} insight={insight} /></div>}
    </article>
  );
}

export default function Overview() {
  const { data } = useVehicle();
  const nav = useNavigate();
  const { vehicle: v, insights, value, services, documents } = data;
  const [weakest, setWeakest] = useState<Dimension[]>([]);
  useEffect(() => {
    api.confidence(v.id).then((c) => setWeakest([...c.dimensions].sort((a, b) => a.score - b.score).slice(0, 3))).catch(() => setWeakest([]));
  }, [v.id, data]);

  const urgent = insights.filter((i) => i.status === 'due' || i.status === 'attention');
  const upcoming = insights.filter((i) => i.status === 'upcoming');
  const unknown = insights.filter((i) => i.status === 'unknown');
  // Summary: everything urgent, then the next scheduled service if it isn't already listed.
  const nextService = insights.find((i) => i.id === 'ins_service' && !urgent.includes(i));
  const summary = [...urgent, ...(nextService ? [nextService] : [])].slice(0, 4);
  const actionable = [...urgent, ...upcoming];
  const pending = documents.filter((d) => d.status === 'needs_review');
  const recent = services.slice(0, 4);
  const protection = insights.filter((i) => i.category === 'protection');

  const ask = (q: string) => nav(`/v/${v.id}/assistant?q=${encodeURIComponent(q)}`);
  // With no records, "nothing needs attention" would claim a check that never happened.
  const noData = urgent.length === 0 && data.services.length === 0;
  const headline = noData
    ? 'Add records so CarVault can assess this car'
    : urgent.length === 0
      ? 'Nothing in your records needs attention'
      : `${urgent.length} ${urgent.length === 1 ? 'thing needs' : 'things need'} your attention`;

  return (
    <div className="stack">
      {pending.length > 0 && (
        <div className="notice warn" role="status">
          {pending.length} document{pending.length > 1 ? 's are' : ' is'} waiting for review before {pending.length > 1 ? 'they' : 'it'} can enter the passport.{' '}
          <Link className="link" to={`/v/${v.id}/documents`}>Review <Arrow /></Link>
        </div>
      )}

      {/* 1. CarVault Insight + vehicle status */}
      <div className="g12">
        <aside className="panel span-4 conf-panel" aria-labelledby="vc">
          <h2 className="sr-only" id="vc">Vehicle Confidence</h2>
          <ConfidenceScore score={data.confidence.score} level={data.confidence.level} verifiedRecords={data.confidence.verifiedRecords} sources={data.confidence.sources} gaps={data.confidence.gaps} size={92} compact />
          <p className="caption" style={{ marginBlock: '12px 14px' }}>{data.confidence.question}</p>
          {weakest.length > 0 && (
            <>
              <p className="label" style={{ marginBlockEnd: 8 }}>Weakest evidence</p>
              <div className="status-list">
                {weakest.map((d) => (
                  <Link key={d.id} to={`/v/${v.id}/confidence?dim=${d.id}`}>
                    <span className="small">{d.label}</span>
                    <ScoreBar score={d.score} level={d.level} />
                  </Link>
                ))}
              </div>
            </>
          )}
          <Link className="link" style={{ marginBlockStart: 14 }} to={`/v/${v.id}/confidence`}>Confidence breakdown <Arrow /></Link>
        </aside>
        <section className="panel span-8" aria-labelledby="cv-summary">
          <span className="label-ai"><ScanSearch className="i" aria-hidden />CarVault Insight</span>
          <h2 className="summary-title" id="cv-summary">{headline}</h2>
          <div className="summary-list">
            {summary.map((i) => {
              const Icon = insightIcon(i.id);
              return (
                <a key={i.id} className="summary-row" href={`#att-${i.id}`} style={{ '--c': STATUS_VAR[i.status] } as never}>
                  <span className="ico" aria-hidden><Icon className="i" /></span>
                  <span><b>{i.title}</b><span className="sub">{i.detail}</span></span>
                  <span className="status-text num">{i.metric}</span>
                </a>
              );
            })}
          </div>
          <div style={{ marginBlockStart: 16 }}>
            {noData
              ? <Link className="link" to={`/v/${v.id}/documents`}>Upload service invoices and documents <Arrow /></Link>
              : <a className="link" href="#attention">View insights <Arrow /></a>}
          </div>

          <hr className="divider" />
          <p className="small" style={{ marginBlockEnd: 12 }}>Ask CarVault about your vehicle</p>
          <div className="chips">
            {ASK.map((q) => <button key={q} className="chip" onClick={() => ask(q)}>{q}</button>)}
          </div>
        </section>

      </div>

      {/* 2. Attention + supporting data */}
      <div className="g12">
        <section className="panel span-8" id="attention" aria-labelledby="att-title" style={{ scrollMarginBlockStart: 80 }}>
          <div className="panel-head">
            <h3 className="section-title" id="att-title">What needs your attention</h3>
            <span className="caption">{actionable.length} item{actionable.length === 1 ? '' : 's'}</span>
          </div>
          {actionable.length === 0 && <p className="muted">Nothing in your records needs attention right now.</p>}
          {actionable.map((i, idx) => <AttentionItem key={i.id} insight={i} vehicleId={v.id} defaultOpen={idx === 0} />)}
          {unknown.length > 0 && (
            <>
              <hr className="divider" />
              <p className="label" style={{ marginBlockEnd: 10 }}>Not enough information yet</p>
              <div className="unknown-list-compact">
                {unknown.map((i) => <div key={i.id}><b>{i.title}.</b> {i.why}</div>)}
              </div>
            </>
          )}
        </section>

        <div className="span-4 stack">
          <section className="panel" aria-labelledby="val">
            <div className="panel-head">
              <h3 className="label" id="val">Estimated value</h3>
              <TrustBadge trust={value.available ? 'estimated' : 'unknown'} />
            </div>
            {value.available ? (
              <>
                <div className="big-num num">{fmtAED(value.mid!)}</div>
                <div className="value-bar" aria-hidden><i /></div>
                <div className="range num"><span>{fmtAED(value.low!)}</span><span>{fmtAED(value.high!)}</span></div>
                <p className="caption" style={{ marginBlockStart: 12 }}>Illustrative model, not UAE market data. Comparable vehicles unknown.</p>
              </>
            ) : <p className="muted">{value.basis[0]}</p>}
          </section>

          <section className="panel" aria-labelledby="prot">
            <div className="panel-head">
              <h3 className="label" id="prot">Registration & cover</h3>
              <Link className="link" to={`/v/${v.id}/documents`}>Documents <Arrow /></Link>
            </div>
            <div className="status-list">
              {protection.map((i) => (
                <div key={i.id}>
                  <span><span className="k">{i.title}</span><br /><span className="caption">{i.status === 'unknown' ? 'No document on file' : i.detail}</span></span>
                  <StatusBadge status={i.status}>{i.status === 'ok' ? 'Valid' : undefined}</StatusBadge>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 3. Vehicle history */}
      <section className="panel" aria-labelledby="hist">
        <div className="panel-head wrap">
          <h3 className="section-title" id="hist">Vehicle history</h3>
          <Link className="link" to={`/v/${v.id}/timeline`}>Full timeline · {services.length} records <Arrow /></Link>
        </div>
        <div className="g12">
          <div className="span-8">
            <p className="caption" style={{ marginBlockEnd: 8 }}>Odometer over time</p>
            <MileageChart points={services.map((s) => ({ date: s.date, mileage: s.mileage }))} current={{ date: v.mileageUpdatedAt.slice(0, 10), mileage: v.mileage }} />
          </div>
          <div className="span-4">
            <p className="caption" style={{ marginBlockEnd: 8 }}>Recent</p>
            <div className="status-list">
              {recent.length === 0 && <p className="muted">No records yet. Upload an invoice to start the timeline.</p>}
              {recent.map((s) => (
                <Link key={s.id} to={`/v/${v.id}/timeline?record=${s.id}`}>
                  <span><b style={{ fontWeight: 600 }}>{s.title}</b><br /><span className="caption num">{fmtDate(s.date)} · {fmtKm(s.mileage)} · {CATEGORY_LABEL[s.category]}</span></span>
                  <span className="small num muted">{fmtAED(s.cost)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
