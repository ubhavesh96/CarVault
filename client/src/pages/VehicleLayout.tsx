import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Car, Coins, FileCheck2, FileText, Fingerprint, History, KeyRound, LayoutDashboard, MapPin, Palette, ScanSearch, ShieldCheck } from 'lucide-react';
import { useSession } from '../session';
import { api, photoApi } from '../api';
import type { VehicleDetail } from '../types';
import { ErrorNote, Modal, PHOTO_ACCEPT, PHOTO_MAX_BYTES, Spinner, VehicleVisual } from '../components/ui';
import { fmtKm } from '../utils';

export interface VehicleCtx {
  data: VehicleDetail;
  setData: (d: VehicleDetail) => void;
  reload: () => Promise<void>;
}
export const useVehicle = () => useOutletContext<VehicleCtx>();

/** Vehicle sections, each gated by the organization's licensed modules. */
const ALL_SECTIONS = [
  { to: '', end: true, label: 'Overview', short: 'Home', icon: LayoutDashboard, module: null, mobile: true },
  { to: '/confidence', end: false, label: 'Confidence', short: 'Confidence', icon: ShieldCheck, module: 'vehicle_confidence', mobile: false },
  { to: '/timeline', end: false, label: 'Timeline', short: 'History', icon: History, module: 'service_history', mobile: true },
  { to: '/assistant', end: false, label: 'Assistant', short: 'AI', icon: ScanSearch, module: 'assistant', mobile: true },
  { to: '/documents', end: false, label: 'Documents', short: 'Docs', icon: FileText, module: 'documents', mobile: true },
  { to: '/passport', end: false, label: 'Passport', short: 'Passport', icon: FileCheck2, module: 'vehicle_passport', mobile: true },
  { to: '/resale', end: false, label: 'Resale', short: 'Resale', icon: Coins, module: 'resale_readiness', mobile: false },
  { to: '/data-room', end: false, label: 'Data Room', short: 'Share', icon: KeyRound, module: 'data_room', mobile: false },
] as const;

function OdometerModal({ data, onSaved, onClose }: { data: VehicleDetail; onSaved: (d: VehicleDetail) => void; onClose: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const mileage = new FormData(e.currentTarget).get('mileage');
    try {
      onSaved(await api.updateVehicle(data.vehicle.id, { mileage }));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Could not update');
      setBusy(false);
    }
  };
  return (
    <Modal title="Update odometer" subtitle="Maintenance insights are calculated from this reading." onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field"><span>Odometer (km)</span><input name="mileage" type="number" min={0} required defaultValue={data.vehicle.mileage} /></label>
        <div style={{ marginBlockStart: 12 }}><ErrorNote error={err} /></div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>Save reading</button>
        </div>
      </form>
    </Modal>
  );
}

export default function VehicleLayout() {
  const { has, isConsumer, session } = useSession();
  const sections = ALL_SECTIONS.filter((s) => !s.module || has(s.module));
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<VehicleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [odo, setOdo] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<false | 'upload' | 'reference'>(false);

  const reload = useCallback(async () => {
    try {
      setData(await api.vehicle(id));
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load vehicle');
    }
  }, [id]);
  useEffect(() => { setData(null); reload(); }, [reload]);

  if (err && !data) {
    return (
      <div className="empty">
        <h3>We couldn't open this vehicle</h3>
        <p>{err}</p>
        <div className="row" style={{ justifyContent: 'center', marginBlockStart: 16 }}>
          <button className="btn primary" onClick={() => { setErr(null); reload(); }}>Try again</button>
          <Link className="btn" to="/">Back to garage</Link>
        </div>
      </div>
    );
  }
  if (!data) return <div className="empty"><Spinner /></div>;

  const v = data.vehicle;
  const pending = data.documents.filter((d) => d.status === 'needs_review').length;
  const spec = [String(v.year), v.chassis, v.spec && `${v.spec} spec`].filter(Boolean).join(' · ');

  const remove = async () => {
    if (!confirm(`Delete ${v.make} ${v.model} and all of its records, documents and conversations? This can't be undone.`)) return;
    await api.deleteVehicle(v.id);
    nav('/');
  };
  const pickPhoto = async (f: File) => {
    if (!PHOTO_ACCEPT.split(',').includes(f.type)) { setErr('Choose a JPG, PNG or WebP image.'); return; }
    if (f.size > PHOTO_MAX_BYTES) { setErr('That image is larger than 8 MB.'); return; }
    setPhotoBusy('upload');
    setErr(null);
    try { setData(await photoApi.upload(v.id, f)); } catch (e) { setErr(e instanceof Error ? e.message : 'Photo upload failed'); }
    setPhotoBusy(false);
  };
  const findReference = async () => {
    setPhotoBusy('reference');
    setErr(null);
    try { setData(await photoApi.reference(v.id)); } catch (e) { setErr(e instanceof Error ? e.message : 'No reference photo found'); }
    setPhotoBusy(false);
  };
  const removePhoto = async () => {
    const isRef = v.photo?.kind === 'reference';
    if (!confirm(isRef ? 'Remove the reference photo? A neutral drawing will be shown instead.' : 'Remove your photo? CarVault will show a reference photo of the same model instead.')) return;
    try { setData(await photoApi.remove(v.id)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove the photo'); }
  };

  return (
    <div className={isConsumer ? 'with-bottom-nav' : undefined}>
      <Link to={isConsumer ? '/garage' : session?.org.isPlatform ? '/admin/vehicles' : '/app'} className="crumb"><ArrowLeft className="i flip-rtl" aria-hidden />{isConsumer ? 'Garage' : session?.org.isPlatform ? 'All vehicles' : 'Dashboard'}</Link>

      <header className="vhead">
        <VehicleVisual vehicle={v} onPick={pickPhoto} onRemove={removePhoto} onFindReference={findReference} busy={photoBusy} />
        <div className="vhead-id">
          <div className="spec num">{spec}{v.isSample ? ' · Sample vehicle' : ''}</div>
          <h1>{v.make} {v.model}{v.variant ? ` ${v.variant}` : ''}</h1>
          <div className="vhead-meta">
            {v.emirate && <span><MapPin className="i" aria-hidden />{v.emirate}, UAE{v.plate ? ` · ${v.plate}` : ''}</span>}
            {v.color && <span><Palette className="i" aria-hidden />{v.color}</span>}
            <span className="vin num"><Fingerprint className="i" aria-hidden />VIN {v.vin || 'not provided'}</span>
          </div>
        </div>
        <div className="vhead-side">
          <div className="odo">
            <b className="num">{fmtKm(v.mileage)}</b>
            <div className="caption"><Car className="i" style={{ inlineSize: 13, blockSize: 13 }} aria-hidden />Odometer · owner-reported</div>
          </div>
          <button className="btn sm" onClick={() => setOdo(true)}>Update reading</button>
        </div>
      </header>

      <nav className={`tabs${isConsumer ? ' has-bottom-nav' : ''}`} aria-label="Vehicle sections">
        {sections.map((s) => (
          <NavLink key={s.to} end={s.end} to={`/v/${id}${s.to}`}>
            <s.icon className="i" aria-hidden />{s.label}
            {s.to === '/documents' && pending > 0 && <span className="count" aria-label={`${pending} to review`}>{pending}</span>}
          </NavLink>
        ))}
      </nav>

      <ErrorNote error={err} />
      <Outlet context={{ data, setData, reload } satisfies VehicleCtx} />

      <p style={{ marginBlockStart: 48 }}><button className="link muted" onClick={remove}>Delete this vehicle</button></p>

      {isConsumer && <nav className="bottom-nav" aria-label="Vehicle sections">
        {sections.filter((s) => s.mobile).map((s) => (
          <NavLink key={s.to} end={s.end} to={`/v/${id}${s.to}`}>
            <s.icon className="i" aria-hidden />{s.short}
            {s.to === '/documents' && pending > 0 && <span className="dot" aria-label={`${pending} to review`} />}
          </NavLink>
        ))}
      </nav>}
      {odo && <OdometerModal data={data} onClose={() => setOdo(false)} onSaved={(d) => { setData(d); setOdo(false); }} />}
    </div>
  );
}
