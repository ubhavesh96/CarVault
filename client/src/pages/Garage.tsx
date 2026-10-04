import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { api, photoApi } from '../api';
import type { GarageItem } from '../types';
import { Arrow, ErrorNote, HealthRing, Modal, PHOTO_ACCEPT, PHOTO_MAX_BYTES, Spinner, VehicleVisual } from '../components/ui';
import type { Vehicle } from '../types';
import { fmtKm } from '../utils';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

/** Shared add-vehicle form (garage, tenant dashboards and module pages). */
export function AddVehicle({ onClose, showOwner }: { onClose: () => void; showOwner?: boolean }) {
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const pick = (f: File) => {
    if (!PHOTO_ACCEPT.split(',').includes(f.type)) return setErr('Choose a JPG, PNG or WebP image.');
    if (f.size > PHOTO_MAX_BYTES) return setErr('That image is larger than 8 MB.');
    setErr(null);
    setPhoto(f);
    setPreview(URL.createObjectURL(f));
  };
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const fd = Object.fromEntries([...new FormData(e.currentTarget).entries()].filter(([, val]) => typeof val === 'string'));
    try {
      const v = await api.createVehicle({ ...fd, skipReference: !!photo });
      if (photo) {
        // The vehicle exists either way; a failed photo upload can be retried from its page.
        await photoApi.upload(v.id, photo).catch(() => undefined);
      }
      nav(`/v/${v.id}/documents`);
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not add the vehicle');
      setBusy(false);
    }
  };
  return (
    <Modal title="Add a vehicle" subtitle="Start with the essentials. Documents fill in the rest." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="photo-field" style={{ marginBlockEnd: 20 }}>
          <VehicleVisual vehicle={{ id: 'new', make: 'Vehicle', model: 'photo' } as Vehicle} src={preview} onPick={pick}
            onRemove={() => { setPhoto(null); setPreview(null); }} />
          <div>
            <p className="small" style={{ color: 'var(--color-text-primary)' }}>Vehicle photo</p>
            <p className="caption" style={{ marginBlockStart: 2 }}>Optional. A side or three-quarter view works best. JPG, PNG or WebP, up to 8 MB. Without one, CarVault shows a credited reference photo of the same model.</p>
          </div>
        </div>
        <div className="form-grid">
          {showOwner && <label className="field full"><span>Customer / owner or stock reference</span><input name="ownerName" maxLength={80} placeholder="e.g. Stock · ABC Motors, or the customer's name" /></label>}
          <label className="field"><span>Make *</span><input name="make" required placeholder="BMW" autoComplete="off" /></label>
          <label className="field"><span>Model *</span><input name="model" required placeholder="M5" autoComplete="off" /></label>
          <label className="field"><span>Variant</span><input name="variant" placeholder="Competition" /></label>
          <label className="field"><span>Year *</span><input name="year" type="number" required min={1950} max={new Date().getFullYear() + 1} placeholder="2022" /></label>
          <label className="field"><span>Chassis code</span><input name="chassis" placeholder="F90" style={{ textTransform: 'uppercase' }} /></label>
          <label className="field"><span>Specification</span>
            <select name="spec" defaultValue="GCC">
              {['GCC', 'US', 'European', 'Japanese', 'Other'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field"><span>Odometer (km) *</span><input name="mileage" type="number" required min={0} placeholder="48200" /></label>
          <label className="field"><span>VIN</span><input name="vin" maxLength={17} placeholder="17 characters" style={{ textTransform: 'uppercase' }} /></label>
          <label className="field"><span>Emirate</span>
            <select name="emirate" defaultValue="Dubai">{EMIRATES.map((e) => <option key={e}>{e}</option>)}</select>
          </label>
          <label className="field"><span>Plate</span><input name="plate" placeholder="A 12345" /></label>
          <label className="field"><span>Colour</span><input name="color" /></label>
          <label className="field"><span>Original price (AED)</span><input name="originalPrice" type="number" min={0} placeholder="Optional" /></label>
        </div>
        <div style={{ marginBlockStart: 14 }}><ErrorNote error={err} /></div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Adding…' : <>Add vehicle <Arrow /></>}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Garage() {
  const [items, setItems] = useState<GarageItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => {
    api.garage().then(setItems).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);


  return (
    <>
      <div className="garage-head">
        <h1>Your garage</h1>
        <p>Every vehicle has a digital passport and an intelligent history: what it has had, what it needs, and what protects its value.</p>
      </div>

      <div style={{ marginBlockStart: 20 }}><ErrorNote error={err} /></div>
      {!items && !err && <div className="empty"><Spinner /></div>}

      {items && (
        <div className="garage-grid">
          {items.map(({ vehicle: v, recordCount, documentCount, attention, confidence: conf }) => (
            <Link key={v.id} to={`/v/${v.id}`} className="vcard" aria-label={`${v.make} ${v.model}, ${attention} item${attention === 1 ? '' : 's'} need attention`}>
              <VehicleVisual vehicle={v} showCredit={false} />
              <div className="vcard-body">
                <div className="vcard-top">
                  <div style={{ minInlineSize: 0 }}>
                    <h2>{v.make} {v.model}{v.variant ? ` ${v.variant}` : ''}</h2>
                    <div className="spec num">{[String(v.year), v.chassis, v.spec && `${v.spec} spec`].filter(Boolean).join(' · ')}</div>
                    {v.emirate && <span className="loc"><MapPin className="i" style={{ inlineSize: 14, blockSize: 14 }} aria-hidden />{v.emirate}, UAE</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <HealthRing value={conf.score} size={64} label="Vehicle Confidence" />
                    <div className="caption" style={{ marginBlockStart: 4 }}>{conf.level === 'high' ? 'High' : conf.level === 'moderate' ? 'Moderate' : 'Low'} confidence</div>
                  </div>
                </div>
                <div className="vstats">
                  <div><b className="num">{fmtKm(v.mileage)}</b><span>Odometer</span></div>
                  <div><b className="num">{recordCount}</b><span>Records</span></div>
                  <div><b className="num">{documentCount}</b><span>Documents</span></div>
                  <div><b className="num" style={{ color: attention ? 'var(--color-warning)' : undefined }}>{attention}</b><span>Attention</span></div>
                </div>
              </div>
            </Link>
          ))}
          <button className="vcard add" onClick={() => setAdding(true)}>
            <div>
              <span className="plus"><Plus className="i" aria-hidden /></span>
              <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>Add a vehicle</div>
              <div className="caption" style={{ marginBlockStart: 4 }}>Create a new digital passport</div>
            </div>
          </button>
        </div>
      )}

      {adding && <AddVehicle onClose={() => setAdding(false)} />}
    </>
  );
}
