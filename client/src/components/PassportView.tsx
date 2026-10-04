import { AlertTriangle, Check, ShieldCheck } from 'lucide-react';
import type { PassportData, Vehicle } from '../types';
import { ConfidenceScore, LevelBadge, MileageChart, ScoreBar, TrustBadge, VehicleVisual } from './ui';
import { CATEGORY_LABEL, DOC_LABEL, daysUntil, fmtAED, fmtDate, fmtKm } from '../utils';

type Tone = 'ok' | 'attention' | 'due' | 'unknown';
const TONE_VAR: Record<Tone, string> = {
  ok: 'var(--color-success)', attention: 'var(--color-warning)', due: 'var(--color-danger)', unknown: 'var(--color-text-secondary)',
};
const Status = ({ tone, children }: { tone: Tone; children: string }) => (
  <span className="status-text" style={{ '--c': TONE_VAR[tone] } as never}>{children}</span>
);

/** Read-only passport. Used for the owner's preview and the public share page. */
export default function PassportView({ p, qr, shareUrl }: { p: PassportData; qr?: string | null; shareUrl?: string }) {
  const insurance = p.documents.filter((d) => d.type === 'insurance' && d.expiresOn).sort((a, b) => b.expiresOn!.localeCompare(a.expiresOn!))[0];
  const insDays = insurance ? daysUntil(insurance.expiresOn!) : null;
  const inspection = [...p.serviceHistory].reverse().find((s) => s.category === 'inspection');
  const inspMonths = inspection ? Math.round((Date.now() - new Date(inspection.date).getTime()) / (30.44 * 86_400_000)) : null;
  const verifiedDocs = p.documents.filter((d) => d.trust === 'verified' || d.trust === 'imported').length;
  const visualVehicle = {
    id: p.vehicle.id, make: p.vehicle.make, model: p.vehicle.model,
    photo: p.vehicle.photoUpdatedAt ? { storedName: '', mime: '', updatedAt: p.vehicle.photoUpdatedAt, kind: p.vehicle.photoKind, credit: p.vehicle.photoCredit } : undefined,
  } as Vehicle;

  return (
    <article className="passport" aria-label="Vehicle passport">
      <div className="pp-top">
        <div className="mark"><ShieldCheck className="i" aria-hidden style={{ color: 'var(--color-platinum)' }} /><div><b>CARVAULT</b><div style={{ marginBlockStart: 4 }}>Vehicle passport{p.issuer ? ` · issued via ${p.issuer.name}` : ''}</div></div></div>
        <div className="no"><span>Passport no.</span><b className="num">{p.passportNo}</b><span>Issued {fmtDate(p.generatedAt)}</span></div>
      </div>

      <div className="pp-body">
        <div className="pp-id">
          <div>
            <h1>{p.vehicle.title}</h1>
            <p className="spec num">{p.vehicle.subtitle}{p.vehicle.location ? ` · ${p.vehicle.location}` : ''}</p>
          </div>
          <VehicleVisual vehicle={visualVehicle} src={p.vehicle.photoUrl} />
        </div>

        <div className="pp-strip">
          <div>
            <span className="k">Service history</span>
            <b className="num">{p.summary.records} records</b>
            <Status tone={p.summary.records === 0 ? 'unknown' : p.summary.verifiedRecords === p.summary.records ? 'ok' : 'attention'}>
              {`${p.summary.verifiedRecords} verified`}
            </Status>
          </div>
          <div>
            <span className="k">Documents</span>
            <b className="num">{p.summary.documents} on file</b>
            <Status tone={verifiedDocs === p.documents.length && verifiedDocs > 0 ? 'ok' : 'attention'}>{`${verifiedDocs} verified`}</Status>
          </div>
          <div>
            <span className="k">Insurance</span>
            <b className="num">{insurance ? fmtDate(insurance.expiresOn!) : 'Not on file'}</b>
            {insDays === null ? <Status tone="unknown">Unknown</Status>
              : insDays < 0 ? <Status tone="due">Expired</Status>
              : <Status tone={insDays <= 60 ? 'attention' : 'ok'}>{insDays <= 60 ? `Valid · ${insDays} days left` : 'Valid'}</Status>}
          </div>
          <div>
            <span className="k">Inspection</span>
            <b className="num">{inspection ? fmtDate(inspection.date) : 'None on file'}</b>
            {inspMonths === null ? <Status tone="unknown">Unknown</Status>
              : <Status tone={inspMonths < 6 ? 'ok' : inspMonths < 12 ? 'attention' : 'due'}>{inspMonths < 6 ? 'Current' : `${inspMonths} months old`}</Status>}
          </div>
        </div>

        <section className="pp-sec">
          <h3>Vehicle identity</h3>
          <div className="kv">
            {p.identity.map((f) => (
              <div key={f.label}><div className="k">{f.label}</div><div className="v num">{f.value}</div><TrustBadge trust={f.trust} />{f.source && <div className="caption prov">Source: {f.source}</div>}</div>
            ))}
          </div>
        </section>

        <section className="pp-sec">
          <h3>Vehicle Confidence</h3>
          <div className="pp-conf">
            <ConfidenceScore score={p.confidence.score} level={p.confidence.level} verifiedRecords={p.confidence.verifiedRecords} sources={p.confidence.sources} gaps={p.confidence.gaps} size={96} question="How confident are we about this vehicle's history?" />
            <div className="dims">
              {p.confidence.dimensions.map((d) => (
                <div key={d.id} className="dim"><div className="dim-head static">
                  <span className="dim-name"><b>{d.label}</b><small>{d.evidenceCount} evidence item{d.evidenceCount === 1 ? '' : 's'}{d.lastVerified ? ` · last verified ${fmtDate(d.lastVerified)}` : ''}</small></span>
                  <ScoreBar score={d.score} level={d.level} /><LevelBadge level={d.level} short />
                </div></div>
              ))}
            </div>
          </div>
        </section>

        {p.resale && (
          <section className="pp-sec">
            <h3>Resale readiness</h3>
            <div className="row wrap" style={{ gap: 16, alignItems: 'center' }}>
              <span className="big-num num">{p.resale.score}<span className="caption"> / 100</span></span>
              <span className="muted">{p.resale.summary}</span>
            </div>
            <div className="g12" style={{ marginBlockStart: 12 }}>
              <ul className="check-list span-6">{p.resale.ready.map((r) => <li key={r}><Check className="i ok" aria-hidden /><span>{r}</span></li>)}</ul>
              <ul className="check-list span-6">{p.resale.attention.map((r) => <li key={r}><AlertTriangle className="i warn" aria-hidden /><span>{r}</span></li>)}</ul>
            </div>
          </section>
        )}

        <section className="pp-sec">
          <h3>Ownership</h3>
          {p.ownershipTimeline.length === 0 ? <p className="muted">No ownership evidence on file.</p> : (
            <ol className="own-timeline">
              {p.ownershipTimeline.map((o, i) => (
                <li key={i}><span className="num caption">{fmtDate(o.date)}</span><span><b>{o.event}</b><small>{o.detail}</small></span><TrustBadge trust={o.trust} /></li>
              ))}
            </ol>
          )}
        </section>

        <section className="pp-sec">
          <h3>Service history</h3>
          {p.serviceHistory.length === 0 ? <p className="muted">No service records on file.</p> : (
            <div className="table-wrap">
              <table className="pp-table">
                <thead><tr><th>Date</th><th>Odometer</th><th>Work</th><th>Workshop</th><th className="r">Cost</th><th>Source</th></tr></thead>
                <tbody>
                  {[...p.serviceHistory].reverse().map((s) => (
                    <tr key={s.id}>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                      <td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtKm(s.mileage)}</td>
                      <td>
                        <b style={{ fontWeight: 600 }}>{s.title}</b> <span className="muted">· {CATEGORY_LABEL[s.category]}</span>
                        {s.parts.length > 0 && <div className="caption">Parts: {s.parts.map((x) => x.name).join(', ')}</div>}
                        {s.notes && <div className="caption">{s.notes}</div>}
                      </td>
                      <td>{s.importedFrom ?? s.workshop}</td>
                      <td className="r num">{fmtAED(s.cost)}</td>
                      <td><TrustBadge trust={s.trust} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {p.partsHistory.length > 0 && (
          <section className="pp-sec">
            <h3>Parts history</h3>
            <div className="table-wrap"><table className="pp-table">
              <thead><tr><th>Date</th><th>Part</th><th>Job</th><th>Source</th></tr></thead>
              <tbody>{[...p.partsHistory].reverse().map((x, i) => <tr key={i}><td className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDate(x.date)}</td><td>{x.name}{x.partNo && <span className="caption"> · {x.partNo}</span>}</td><td className="caption">{x.record}</td><td><TrustBadge trust={x.trust} /></td></tr>)}</tbody>
            </table></div>
          </section>
        )}

        <section className="pp-sec">
          <h3>Mileage timeline</h3>
          <MileageChart points={p.mileageTimeline} />
        </section>

        <section className="pp-sec">
          <h3>Documents on file</h3>
          <div className="table-wrap">
            <table className="pp-table">
              <thead><tr><th>Type</th><th>File</th><th>Valid until</th><th>Source</th></tr></thead>
              <tbody>
                {p.documents.map((d) => (
                  <tr key={d.id}><td>{DOC_LABEL[d.type]}</td><td style={{ overflowWrap: 'anywhere' }}>{d.fileName}</td><td className="num">{d.expiresOn ? fmtDate(d.expiresOn) : '–'}</td><td><TrustBadge trust={d.trust} />{d.verifiedWithIssuer && <div className="caption" style={{ marginBlockStart: 4 }}>Checked with issuer by {d.verifiedWithIssuer.by}, {fmtDate(d.verifiedWithIssuer.at)}</div>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="pp-sec">
          <h3>Estimated value</h3>
          {p.estimatedValue ? (
            <div className="row wrap" style={{ gap: 12 }}>
              <span className="big-num num" style={{ fontSize: 24 }}>{fmtAED(p.estimatedValue.low)} – {fmtAED(p.estimatedValue.high)}</span>
              <TrustBadge trust="estimated" />
            </div>
          ) : <p className="muted">Not available.</p>}
          <p className="caption" style={{ marginBlockStart: 8 }}>Illustrative estimate only. Not a market valuation; comparable vehicles unknown.</p>
        </section>

        <section className="pp-sec">
          <h3>Not on record</h3>
          <ul className="unknown-list">{p.unknowns.map((u) => <li key={u}>{u}</li>)}</ul>
        </section>

        <div className="pp-foot">
          <div className="seal">
            <span className="emblem" aria-hidden><ShieldCheck className="i" /></span>
            <div>
              <b>Issued by CarVault</b>
              <p className="caption" style={{ marginBlockStart: 2 }}>
                {p.summary.verifiedRecords} of {p.summary.records} service records verified from source documents. {p.notice}
              </p>
            </div>
          </div>
          {qr && (
            <div className="qr">
              <img src={qr} alt={`QR code linking to ${shareUrl ?? 'this passport'}`} />
              <span>Scan to view</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
