import { FormEvent, useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../api';
import { ErrorNote, Modal } from './ui';
import { SECTIONS, ShareResult } from './ShareResult';
import type { DataRoom, Vehicle } from '../types';

/** The same sections as a data room, grouped the way an owner thinks about their car. */
const GROUPS: { title: string; ids: string[] }[] = [
  { title: 'About the car', ids: ['passport', 'confidence'] },
  { title: 'History', ids: ['service', 'inspection', 'mileage'] },
  { title: 'Ownership and paperwork', ids: ['ownership', 'insurance', 'documents', 'transfer'] },
];
const EXPIRY = [{ h: 24, l: '24 hours' }, { h: 48, l: '48 hours' }, { h: 72, l: '72 hours' }, { h: 168, l: '7 days' }];

/**
 * Owner sharing. Nothing is pre-selected: the owner ticks exactly what the recipient may see, and
 * gets an expiring link they can revoke. Uploaded files and personal details are never included.
 */
export default function ShareDialog({ vehicle, onClose, onShared }: { vehicle: Vehicle; onClose: () => void; onShared?: (r: DataRoom) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [recipient, setRecipient] = useState('');
  const [hours, setHours] = useState(48);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [room, setRoom] = useState<DataRoom | null>(null);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const all = picked.length === SECTIONS.length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picked.length) return;
    setBusy(true); setErr(null);
    try {
      // Keep the canonical order regardless of tick order.
      const sections = SECTIONS.map((s) => s.id).filter((id) => picked.includes(id));
      const r = await api.createDataRoom(vehicle.id, { recipient: recipient.trim() || 'Link recipient', sections, expiresInHours: hours });
      setRoom(r);
      onShared?.(r);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not create the link'); }
    setBusy(false);
  };
  const revoke = async () => {
    if (!room || !confirm('Revoke access? The link stops working immediately.')) return;
    try { await api.revokeDataRoom(room.id); onClose(); } catch (x) { setErr(x instanceof Error ? x.message : 'Could not revoke'); }
  };

  const title = `Share ${vehicle.make} ${vehicle.model}`;
  if (room) {
    return (
      <Modal wide title={title} subtitle="Send this link to the person you're sharing with." onClose={onClose}>
        <ShareResult room={room} onRevoke={revoke} />
        <ErrorNote error={err} />
        <div className="actions"><button className="btn primary" onClick={onClose}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal wide title={title} subtitle="Tick the details you want to share. Nothing is selected until you choose it." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field"><span>Sharing with (optional)</span>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} maxLength={80} placeholder="e.g. Buyer, Ahmed, my garage" />
          </label>
          <label className="field"><span>Link expires after</span>
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>{EXPIRY.map((x) => <option key={x.h} value={x.h}>{x.l}</option>)}</select>
          </label>
        </div>

        <div className="share-pick-head">
          <span className="label">Details to share</span>
          <span className="caption num" aria-live="polite">{picked.length} of {SECTIONS.length} selected</span>
          <button type="button" className="link" onClick={() => setPicked(all ? [] : SECTIONS.map((s) => s.id))}>{all ? 'Clear all' : 'Select all'}</button>
        </div>
        {GROUPS.map((g) => (
          <fieldset key={g.title} className="share-group">
            <legend className="caption">{g.title}</legend>
            <div className="section-picker">
              {g.ids.map((id) => {
                const s = SECTIONS.find((x) => x.id === id)!;
                const on = picked.includes(id);
                return (
                  <label key={id} className={`pick${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(id)} />
                    <span><b>{s.label}</b><small>{s.detail}</small></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        <p className="caption" style={{ marginBlockStart: 12 }}>Your uploaded files, documents and contact details are never shared. You can revoke the link at any time.</p>
        <ErrorNote error={err} />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !picked.length}>
            <Lock className="i" aria-hidden />{busy ? 'Creating link…' : picked.length ? `Share ${picked.length} selected` : 'Select details to share'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
