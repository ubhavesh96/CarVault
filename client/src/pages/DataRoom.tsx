import { FormEvent, useCallback, useEffect, useState } from 'react';
import { KeyRound, Lock, Share2 } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import { ErrorNote, Spinner } from '../components/ui';
import { SECTIONS, ShareResult, roomStatus as status } from '../components/ShareResult';
import ShareDialog from '../components/ShareDialog';
import { useSession } from '../session';
import type { DataRoom } from '../types';
import { fmtDateTime } from '../utils';


/** Who the room is for. Each preset picks sensible sections and an expiry; everything stays editable. */
const PRESETS: { id: string; label: string; detail: string; recipient: string; sections: string[]; hours: number }[] = [
  { id: 'buyer', label: 'Private buyer', detail: 'Someone viewing the car', recipient: 'Buyer', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection', 'transfer'], hours: 48 },
  { id: 'instant', label: 'Car-buying service', detail: 'Instant-offer buyer or trade-in', recipient: 'Car-buying service', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection', 'ownership', 'insurance', 'transfer'], hours: 72 },
  { id: 'listing', label: 'Online listing', detail: 'Badge and link on a marketplace ad', recipient: 'Marketplace listing', sections: ['passport', 'confidence', 'service', 'mileage', 'inspection'], hours: 168 },
  { id: 'insurer', label: 'Insurer', detail: 'Quote or claim', recipient: 'Insurer', sections: ['passport', 'confidence', 'inspection', 'ownership', 'insurance'], hours: 72 },
  { id: 'lender', label: 'Lender', detail: 'Car finance application', recipient: 'Lender', sections: ['passport', 'confidence', 'ownership', 'mileage', 'insurance', 'transfer'], hours: 72 },
];
const EXPIRY = [{ h: 24, l: '24 hours' }, { h: 48, l: '48 hours' }, { h: 72, l: '72 hours' }, { h: 168, l: '7 days' }];


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
  const { isConsumer } = useSession();
  const [sharing, setSharing] = useState(false);

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
        {isConsumer ? (
          <section className="panel" aria-labelledby="dr">
            <span className="label-ai"><KeyRound className="i" aria-hidden />Share your car</span>
            <h2 className="section-title" id="dr" style={{ marginBlock: '8px 4px' }}>Share selected details with a buyer, garage or insurer</h2>
            <p className="caption" style={{ marginBlockEnd: 16 }}>You choose every section yourself; nothing is pre-selected. Each link expires, and you can revoke it at any time.</p>
            <button className="btn primary" onClick={() => setSharing(true)}><Share2 className="i" aria-hidden />Share car details</button>
          </section>
        ) : (
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
        )}
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
      {sharing && <ShareDialog vehicle={v} onClose={() => { setSharing(false); load(); }} onShared={() => load()} />}
    </div>
  );
}
