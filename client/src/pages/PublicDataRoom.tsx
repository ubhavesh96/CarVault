import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Check, FileCheck2, KeyRound, MinusCircle, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { LevelBadge, MileageChart, ScoreBar, Spinner, TrustBadge, ConfidenceScore } from '../components/ui';
import type { PublicDataRoom as Room } from '../types';
import { CATEGORY_LABEL, DOC_LABEL, fmtDate, fmtDateTime, fmtKm } from '../utils';

export default function PublicDataRoom() {
  const { token = '' } = useParams();
  const [d, setD] = useState<Room | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.publicDataRoom(token).then(setD).catch((e) => setErr(e.message)); }, [token]);

  return (
    <>
      <header className="topbar">
        <span className="brand">CarVault <span className="ai">AI</span></span>
        <span className="caption row" style={{ gap: 6 }}><KeyRound className="i" aria-hidden style={{ inlineSize: 14, blockSize: 14 }} />Secure vehicle data room</span>
      </header>
      <main className="page" style={{ maxInlineSize: 1040 }}>
        {err && <div className="empty"><h3>Data room unavailable</h3><p>{err}</p></div>}
        {!d && !err && <div className="empty"><Spinner /></div>}
        {d && (
          <div className="stack">
            <div className="notice row" style={{ gap: 10 }}>
              <ShieldCheck className="i" aria-hidden />
              <span>Shared by <b>{d.room.sharedBy}</b> with <b>{d.room.recipient}</b>. Access expires {fmtDateTime(d.room.expiresAt)}.</span>
            </div>
            <section className="panel">
              <div className="pp-id" style={{ gridTemplateColumns: 'minmax(0,1fr) 260px' }}>
                <div>
                  <h1 style={{ font: 'var(--text-h1)', letterSpacing: '-0.02em' }}>{d.vehicle.title}</h1>
                  <p className="muted" style={{ marginBlockStart: 4 }}>{d.vehicle.subtitle}{d.vehicle.location ? ` · ${d.vehicle.location}` : ''}</p>
                </div>
                {d.vehicle.photoUrl && (
                  <div className="vehicle-visual has-photo">
                    <img src={d.vehicle.photoUrl} alt={d.vehicle.photoKind === 'reference' ? 'Reference photo of the same model (not this vehicle)' : d.vehicle.title} />
                    {d.vehicle.photoKind === 'reference' && <span className="ref-tag">Reference photo</span>}
                  </div>
                )}
              </div>
            </section>

            {d.confidence && (
              <section className="panel">
                <ConfidenceScore {...d.confidence} size={104} question="How confident are we about this vehicle's history?" />
                <div className="dims" style={{ marginBlockStart: 20 }}>
                  {d.confidence.dimensions.map((x) => (
                    <div key={x.id} className="dim"><div className="dim-head static">
                      <span className="dim-name"><b>{x.label}</b><small>{x.why}</small></span>
                      <ScoreBar score={x.score} level={x.level} /><LevelBadge level={x.level} short />
                    </div></div>
                  ))}
                </div>
              </section>
            )}

            {d.identity && (
              <section className="panel">
                <h2 className="section-title" style={{ marginBlockEnd: 16 }}>Vehicle identity</h2>
                <div className="kv">
                  {d.identity.map((f) => <div key={f.label}><div className="k">{f.label}</div><div className="v num">{f.value}</div><TrustBadge trust={f.trust} />{f.source && <div className="caption" style={{ marginBlockStart: 4 }}>{f.source}</div>}</div>)}
                </div>
              </section>
            )}

            {d.mileage && (
              <section className="panel">
                <h2 className="section-title">Mileage evidence</h2>
                <p className="muted small" style={{ marginBlock: '6px 12px' }}>{d.mileage.dimension.why}</p>
                <MileageChart points={d.mileage.timeline} />
              </section>
            )}

            {(d.serviceHistory || d.inspection) && (
              <section className="panel">
                <h2 className="section-title" style={{ marginBlockEnd: 12 }}>{d.serviceHistory ? 'Service history' : 'Inspection'}</h2>
                <div className="table-wrap"><table className="pp-table">
                  <thead><tr><th>Date</th><th>Odometer</th><th>Work</th><th>Source</th><th>Provenance</th></tr></thead>
                  <tbody>{[...(d.serviceHistory ?? d.inspection ?? [])].reverse().map((s) => (
                    <tr key={s.id}><td className="num">{fmtDate(s.date)}</td><td className="num">{fmtKm(s.mileage)}</td>
                      <td><b style={{ fontWeight: 600 }}>{s.title}</b> <span className="muted">· {CATEGORY_LABEL[s.category]}</span>{s.notes && <div className="caption">{s.notes}</div>}</td>
                      <td>{s.importedFrom ?? s.workshop}</td><td><TrustBadge trust={s.trust} /></td></tr>
                  ))}</tbody>
                </table></div>
              </section>
            )}

            {[d.ownership, d.insurance].filter(Boolean).map((x) => (
              <section className="panel" key={x!.id}>
                <div className="panel-head"><h2 className="section-title">{x!.label} evidence</h2><LevelBadge level={x!.level} short /></div>
                <p className="muted small">{x!.why}</p>
                <ul className="evidence-list" style={{ marginBlockStart: 10 }}>{x!.evidence.map((e, i) => (
                  <li key={i} className="evidence"><span className="ev-dot" aria-hidden /><span className="ev-main"><span><b>{e.label}</b>{e.date && <span className="num muted"> · {fmtDate(e.date)}</span>}</span>{e.detail && <small>{e.detail}</small>}</span><span className="ev-side"><TrustBadge trust={e.trust} /></span></li>
                ))}</ul>
              </section>
            ))}

            {d.documents && (
              <section className="panel">
                <h2 className="section-title" style={{ marginBlockEnd: 12 }}>Documents on file</h2>
                <div className="status-list">{d.documents.map((x) => (
                  <div key={x.id}><span>{DOC_LABEL[x.type]}<br /><span className="caption">{x.expiresOn ? `Valid until ${fmtDate(x.expiresOn)}` : x.issuedOn ? `Issued ${fmtDate(x.issuedOn)}` : ''}</span>
                    {x.verifiedWithIssuer && <span className="caption verified-line"><BadgeCheck className="i" aria-hidden />Checked with the issuer by {x.verifiedWithIssuer.by}, {fmtDate(x.verifiedWithIssuer.at)}</span>}
                  </span><TrustBadge trust={x.trust} /></div>
                ))}</div>
              </section>
            )}

            {d.transfer && (
              <section className="panel">
                <div className="panel-head">
                  <h2 className="section-title row" style={{ gap: 8 }}><FileCheck2 className="i" aria-hidden />UAE transfer readiness</h2>
                  <span className={`badge ${d.transfer.complete ? 's-ok' : 's-attention'}`}>{d.transfer.ready} of {d.transfer.required} ready</span>
                </div>
                <p className="caption" style={{ marginBlock: '4px 12px' }}>{d.transfer.ruleNote} Items marked as seller-confirmed are not independently verified.</p>
                <ul className="transfer-list">{d.transfer.items.map((i) => (
                  <li key={i.id} className={`transfer-item t-${i.status}`}>
                    <span className="transfer-icon" aria-hidden>{i.status === 'ready' ? <Check className="i" /> : i.status === 'not_applicable' ? <MinusCircle className="i" /> : <AlertTriangle className="i" />}</span>
                    <div className="transfer-main">
                      <div className="transfer-head"><b>{i.label}</b><span className="caption">{i.basis === 'seller' ? 'Seller-confirmed' : i.basis === 'document' ? 'From documents' : i.basis === 'records' ? 'From records' : 'UAE rule'}</span></div>
                      <p className="small">{i.detail}</p>
                    </div>
                  </li>
                ))}</ul>
              </section>
            )}

            <section className="panel">
              <h2 className="section-title" style={{ marginBlockEnd: 10 }}>Not on record</h2>
              <ul className="unknown-list">{d.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
              <p className="caption" style={{ marginBlockStart: 16 }}>{d.notice}</p>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
