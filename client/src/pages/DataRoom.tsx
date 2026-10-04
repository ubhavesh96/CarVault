import { FormEvent, useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Code2, Copy, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import { ErrorNote, Spinner } from '../components/ui';
import type { DataRoom } from '../types';
import { fmtDateTime } from '../utils';

export const SECTIONS: { id: string; label: string; detail: string }[] = [
  { id: 'passport', label: 'Vehicle Passport', detail: 'Identity, VIN and registration with provenance' },
  { id: 'confidence', label: 'Vehicle Confidence', detail: 'Score and breakdown by dimension' },
  { id: 'service', label: 'Service history', detail: 'Every service and repair record' },
  { id: 'inspection', label: 'Inspection', detail: 'Inspection records and findings' },
  { id: 'ownership', label: 'Ownership evidence', detail: 'Registration and ownership records' },
  { id: 'mileage', label: 'Mileage evidence', detail: 'Dated odometer readings and their sources' },
  { id: 'insurance', label: 'Insurance evidence', detail: 'Policy validity' },
  { id: 'documents', label: 'Documents list', detail: 'Which documents are on file (not the files themselves)' },
  { id: 'transfer', label: 'UAE transfer readiness', detail: 'Registration, insurance, fines, loan clearance and test status' },
];

/** Who the room is for. Each preset picks sensible sections and an expiry; everything stays editable. */
const PRESETS: { id: string; label: string; detail: string; recipient: string; sections: string[]; hours: number }[] = [
  { id: 'buyer', label: 'Private buyer', detail: 'Someone viewing the car', recipient: 'Buyer', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection', 'transfer'], hours: 48 },
  { id: 'instant', label: 'Car-buying service', detail: 'Instant-offer buyer or trade-in', recipient: 'Car-buying service', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection', 'ownership', 'insurance', 'transfer'], hours: 72 },
  { id: 'listing', label: 'Online listing', detail: 'Badge and link on a marketplace ad', recipient: 'Marketplace listing', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection'], hours: 168 },
  { id: 'insurer', label: 'Insurer', detail: 'Quote or claim', recipient: 'Insurer', sections: ['passport', 'confidence', 'inspection', 'ownership', 'insurance'], hours: 72 },
  { id: 'lender', label: 'Lender', detail: 'Car finance application', recipient: 'Lender', sections: ['passport', 'confidence', 'ownership', 'mileage', 'insurance', 'transfer'], hours: 72 },
];
const EXPIRY = [{ h: 24, l: '24 hours' }, { h: 48, l: '48 hours' }, { h: 72, l: '72 hours' }, { h: 168, l: '7 days' }];

const status = (r: DataRoom) => (r.revokedAt ? 'Revoked' : new Date(r.expiresAt).getTime() < Date.now() ? 'Expired' : 'Active');
const linkFor = (r: DataRoom) => `${location.origin}/d/${r.token}`;
const badgeFor = (r: DataRoom) => `${location.origin}/api/public/dataroom/${r.token}/badge.svg`;
const embedFor = (r: DataRoom) => `<a href="${linkFor(r)}" target="_blank" rel="noopener"><img src="${badgeFor(r)}" width="320" height="64" alt="CarVault verified vehicle history"></a>`;

function ShareResult({ room, onRevoke }: { room: DataRoom; onRevoke: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { QRCode.toDataURL(linkFor(room), { margin: 0, width: 200 }).then(setQr).catch(() => setQr(null)); }, [room]);
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(linkFor(room)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* manual copy */ }
  };
  const copyEmbed = async () => {
    try { await navigator.clipboard.writeText(embedFor(room)); setCopiedEmbed(true); setTimeout(() => setCopiedEmbed(false), 1600); } catch { /* manual copy */ }
  };
  return (
    <section className="panel share-result" aria-live="polite">
      <span className="label-ai" style={{ color: 'var(--color-success)' }}><ShieldCheck className="i" aria-hidden />Secure link ready</span>
      <h3 className="section-title" style={{ marginBlock: '8px 4px' }}>{room.recipient} access</h3>
      <p className="caption">Expires {fmtDateTime(room.expiresAt)} · {room.sections.length} sections</p>
      <div className="share-grid">
        <div>
          <div className="linkbox" style={{ marginBlockStart: 12 }}>
            <input readOnly value={linkFor(room)} aria-label="Secure link" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn" onClick={copy}><Copy className="i" aria-hidden />{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="caption" style={{ marginBlockStart: 10 }}>Anyone with this link can view the selected sections until it expires or you revoke it. Uploaded files are never shared.</p>
          <button className="btn danger sm" style={{ marginBlockStart: 12 }} onClick={onRevoke}>Revoke access</button>
        </div>
        {qr && <div className="qr"><img src={qr} alt="QR code for the secure link" /><span>Scan to open</span></div>}
      </div>
      <details className="embed" open={room.recipient === 'Marketplace listing'}>
        <summary className="row" style={{ gap: 8 }}><Code2 className="i" aria-hidden />Add to a listing or partner system</summary>
        <div className="embed-body">
          <img className="badge-preview" src={badgeFor(room)} width={320} height={64} alt="Preview of the listing badge" />
          <p className="caption">Paste this into a listing or dealer website. The badge links to this data room, shows the Vehicle Confidence score only if you included that section, and stops working when access ends.</p>
          <textarea readOnly rows={3} value={embedFor(room)} aria-label="Embed code" onFocus={(e) => e.currentTarget.select()} />
          <button className="btn sm" onClick={copyEmbed}><Copy className="i" aria-hidden />{copiedEmbed ? 'Copied' : 'Copy embed code'}</button>
          <p className="caption">Partner systems can read the same information as JSON from <code>{`${location.origin}/api/public/dataroom/${room.token}`}</code>.</p>
        </div>
      </details>
    </section>
  );
}

export default function DataRoomPage() {
  const { data } = useVehicle();
  const v = data.vehicle;
  const [rooms, setRooms] = useState<DataRoom[] | null>(null);
  const [sections, setSections] = useState<string[]>(PRESETS[0].sections);
  const [recipient, setRecipient] = useState('Buyer');
  const [hours, setHours] = useState(48);
  const [preset, setPreset] = useState('buyer');
  const choose = (p: (typeof PRESETS)[number]) => { setPreset(p.id); setRecipient(p.recipient); setSections(p.sections); setHours(p.hours); };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<DataRoom | null>(null);

  const load = useCallback(() => api.dataRooms(v.id).then(setRooms).catch((e) => setErr(e.message)), [v.id]);
  useEffect(() => { load(); }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.createDataRoom(v.id, { recipient, sections, expiresInHours: hours });
      setCreated(r);
      load();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not create the data room'); }
    setBusy(false);
  };
  const revoke = async (id: string) => {
    if (!confirm('Revoke access? The link stops working immediately.')) return;
    await api.revokeDataRoom(id);
    if (created?.id === id) setCreated(null);
    load();
  };
  const toggle = (id: string) => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="g12">
      <div className="span-8 stack">
        {created && <ShareResult room={created} onRevoke={() => revoke(created.id)} />}
        <form className="panel" onSubmit={create} aria-labelledby="dr">
          <span className="label-ai"><KeyRound className="i" aria-hidden />Vehicle Data Room</span>
          <h2 className="section-title" id="dr" style={{ marginBlock: '8px 4px' }}>Share verified information securely</h2>
          <p className="caption" style={{ marginBlockEnd: 16 }}>Choose exactly what {v.make} {v.model} information a buyer, dealer, insurer or lender can see, and for how long.</p>
          <fieldset className="preset-picker">
            <legend className="label">Who is it for?</legend>
            <div className="presets" role="radiogroup">
              {PRESETS.map((p) => (
                <button type="button" key={p.id} role="radio" aria-checked={preset === p.id} className={`preset${preset === p.id ? ' on' : ''}`} onClick={() => choose(p)}>
                  <b>{p.label}</b><small>{p.detail}</small>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-grid">
            <label className="field"><span>Recipient</span><input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={80} placeholder="Buyer · name or company" /></label>
            <label className="field"><span>Access expires after</span>
              <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{EXPIRY.map((x) => <option key={x.h} value={x.h}>{x.l}</option>)}</select>
            </label>
          </div>
          <fieldset className="section-picker">
            <legend className="label">Information to include</legend>
            {SECTIONS.map((s) => (
              <label key={s.id} className={`pick${sections.includes(s.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} />
                <span><b>{s.label}</b><small>{s.detail}</small></span>
              </label>
            ))}
          </fieldset>
          <ErrorNote error={err} />
          <div className="actions" style={{ justifyContent: 'flex-start', marginBlockStart: 16 }}>
            <button className="btn primary" disabled={busy || !sections.length}><Lock className="i" aria-hidden />{busy ? 'Creating…' : 'Share securely'}</button>
          </div>
        </form>
      </div>

      <aside className="span-4">
        <section className="panel" aria-labelledby="rooms">
          <h3 className="section-title" id="rooms" style={{ marginBlockEnd: 12 }}>Access granted</h3>
          {!rooms ? <Spinner /> : rooms.length === 0 ? <p className="muted small">No data rooms yet.</p> : (
            <div className="status-list">
              {rooms.map((r) => {
                const st = status(r);
                return (
                  <div key={r.id}>
                    <span>
                      <b>{r.recipient}</b><br />
                      <span className="caption">{st === 'Active' ? `Expires ${fmtDateTime(r.expiresAt)}` : st} · {r.views} view{r.views === 1 ? '' : 's'} · by {r.createdBy}</span>
                    </span>
                    {st === 'Active'
                      ? <button className="btn sm danger" onClick={() => revoke(r.id)}>Revoke</button>
                      : <span className={`badge s-${st === 'Revoked' ? 'due' : 'unknown'}`}>{st}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
