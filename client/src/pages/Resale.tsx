import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CheckCircle2, Coins, FileCheck2, MinusCircle, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import { Arrow, ErrorNote, HealthRing, Spinner, TrustBadge } from '../components/ui';
import type { ResaleAction, ResaleResult, TransferItem, TransferResult } from '../types';
import { fmtAED } from '../utils';

const STATUS_BADGE: Record<TransferItem['status'], { cls: string; label: string }> = {
  ready: { cls: 's-ok', label: 'Ready' },
  action: { cls: 's-attention', label: 'To do' },
  recheck: { cls: 's-attention', label: 'Check again' },
  not_applicable: { cls: 's-unknown', label: 'Not needed' },
};
const BASIS: Record<TransferItem['basis'], string> = {
  document: 'From documents on file', seller: 'Seller confirms this', records: 'From the service timeline', rule: 'UAE rule',
};

/** Everything the RTA asks for at transfer, with what CarVault can see and what only the seller can confirm. */
function TransferChecklist({ vehicleId, initial }: { vehicleId: string; initial: TransferResult }) {
  const [t, setT] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setT(initial), [initial]);

  const act = async (i: TransferItem, clear = false) => {
    if (!i.confirm) return;
    setBusy(i.id); setErr(null);
    try { setT(await api.setTransferCheck(vehicleId, i.confirm.check, clear)); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not save'); }
    setBusy(null);
  };

  return (
    <section className="panel" id="transfer" aria-labelledby="transfer-title">
      <div className="panel-head">
        <h3 className="section-title row" id="transfer-title" style={{ gap: 8 }}><FileCheck2 className="i" aria-hidden />UAE transfer checklist</h3>
        <span className={`badge ${t.complete ? 's-ok' : 's-attention'}`}>{t.ready} of {t.required} ready</span>
      </div>
      <p className="caption" style={{ marginBlock: '4px 14px' }}>{t.ruleNote}</p>
      <ErrorNote error={err} />
      <ul className="transfer-list">
        {t.items.map((i) => {
          const b = STATUS_BADGE[i.status];
          const sellerConfirmed = !!i.confirmedAt && i.status !== 'action';
          return (
            <li key={i.id} className={`transfer-item t-${i.status}`}>
              <span className="transfer-icon" aria-hidden>
                {i.status === 'ready' ? <Check className="i" /> : i.status === 'not_applicable' ? <MinusCircle className="i" /> : <AlertTriangle className="i" />}
              </span>
              <div className="transfer-main">
                <div className="transfer-head"><b>{i.label}</b><span className={`badge ${b.cls}`}>{b.label}</span></div>
                <p className="small">{i.detail}</p>
                <p className="caption">{i.how}</p>
                <div className="transfer-actions">
                  <span className="caption">{BASIS[i.basis]}</span>
                  {i.confirm && i.status !== 'ready' && (
                    <button className="btn sm" disabled={busy === i.id} onClick={() => act(i)}>{busy === i.id ? 'Saving…' : i.confirm.label}</button>
                  )}
                  {i.confirm && sellerConfirmed && (
                    <button className="btn sm ghost" disabled={busy === i.id} onClick={() => act(i, true)}><RotateCcw className="i" aria-hidden />Undo</button>
                  )}
                  {i.docType && i.status === 'action' && (
                    <Link className="link" to={`/v/${vehicleId}/documents?type=${i.docType}`}>Upload document <Arrow /></Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="caption" style={{ marginBlockStart: 12 }}>Items the seller confirms are labelled as such and are not independently verified. CarVault never stores Emirates ID numbers.</p>
    </section>
  );
}

export default function Resale() {
  const { data } = useVehicle();
  const v = data.vehicle;
  const [r, setR] = useState<ResaleResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.resale(v.id).then(setR).catch((e) => setErr(e.message)); }, [v.id, data]);
  if (err) return <ErrorNote error={err} />;
  if (!r) return <div className="empty"><Spinner /></div>;

  const ready = r.items.filter((i) => i.ready);
  const attention = r.items.filter((i) => !i.ready);
  const path = (a: ResaleAction) => ({
    documents: `/v/${v.id}/confidence`, passport: `/v/${v.id}/passport`, dataroom: `/v/${v.id}/data-room`,
    assistant: `/v/${v.id}/assistant?q=${encodeURIComponent('Find someone who can inspect it')}`, value: '#valuation', transfer: '#transfer',
  })[a.to];
  const done = (a: ResaleAction) => (a.id === 'passport' || a.id === 'dataroom') && r.items.find((i) => i.id === 'passport')?.ready;

  return (
    <div className="g12">
      <div className="span-8 stack">
        <section className="panel">
          <span className="label-ai"><Coins className="i" aria-hidden />Resale readiness</span>
          <div className="vh" style={{ marginBlockStart: 16 }}>
            <HealthRing value={r.score} size={112} label="Resale readiness" color="var(--color-blue)" />
            <div>
              <h2 className="summary-title" style={{ margin: 0 }}>{r.summary}</h2>
              <p className="caption" style={{ marginBlockStart: 6 }}>Built on Vehicle Confidence {r.confidence.score}/100 plus current registration, cover, buyer-facing records and the UAE transfer requirements.</p>
            </div>
          </div>
        </section>

        <div className="g12">
          <section className="panel span-6" aria-labelledby="ready">
            <h3 className="section-title row" id="ready" style={{ gap: 8, marginBlockEnd: 12 }}><CheckCircle2 className="i" aria-hidden style={{ color: 'var(--color-success)' }} />Ready ({ready.length})</h3>
            <ul className="check-list">
              {ready.map((i) => <li key={i.id}><Check className="i ok" aria-hidden /><span><b>{i.label}</b><small>{i.detail}</small></span></li>)}
              {!ready.length && <li className="muted small">Nothing is ready yet.</li>}
            </ul>
          </section>
          <section className="panel span-6" aria-labelledby="needs">
            <h3 className="section-title row" id="needs" style={{ gap: 8, marginBlockEnd: 12 }}><AlertTriangle className="i" aria-hidden style={{ color: 'var(--color-warning)' }} />Needs attention ({attention.length})</h3>
            <ul className="check-list">
              {attention.map((i) => <li key={i.id}><AlertTriangle className="i warn" aria-hidden /><span><b>{i.label}</b><small>{i.detail}</small></span></li>)}
              {!attention.length && <li className="muted small">Nothing outstanding.</li>}
            </ul>
          </section>
        </div>

        <TransferChecklist vehicleId={v.id} initial={r.transfer} />
      </div>

      <aside className="span-4 stack">
        <section className="panel" aria-labelledby="prep">
          <h3 className="section-title" id="prep" style={{ marginBlockEnd: 4 }}>Prepare for resale</h3>
          <p className="caption" style={{ marginBlockEnd: 12 }}>Work through these in order.</p>
          <ol className="steps">
            {r.actions.map((a, i) => (
              <li key={a.id} className={done(a) ? 'done' : ''}>
                <span className="step-n num" aria-hidden>{done(a) ? <Check className="i" /> : i + 1}</span>
                <span className="step-main">
                  <b>{a.label}</b><small>{a.detail}</small>
                  {a.to === 'value' || a.to === 'transfer'
                    ? <a className="link" href={path(a)}>{a.to === 'value' ? 'Review' : 'Open checklist'} <Arrow /></a>
                    : <Link className="link" to={path(a)}>{done(a) ? 'Open' : 'Start'} <Arrow /></Link>}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="panel" id="valuation" aria-labelledby="val">
          <div className="panel-head"><h3 className="label" id="val">Valuation</h3><TrustBadge trust={r.value.available ? 'estimated' : 'unknown'} /></div>
          {r.value.available ? (
            <>
              <div className="big-num num">{fmtAED(r.value.mid!)}</div>
              <p className="caption num" style={{ marginBlockStart: 4 }}>Range {fmtAED(r.value.low!)} – {fmtAED(r.value.high!)}</p>
              <p className="caption" style={{ marginBlockStart: 10 }}>Illustrative age-and-mileage model, not UAE market data. Get a dealer valuation before pricing.</p>
            </>
          ) : <p className="muted small">{r.value.basis[0]}</p>}
        </section>
      </aside>
    </div>
  );
}
