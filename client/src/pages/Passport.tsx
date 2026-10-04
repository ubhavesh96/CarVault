import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Link2, Printer, QrCode } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import PassportView from '../components/PassportView';
import { ErrorNote, Spinner } from '../components/ui';
import type { PassportData, Share } from '../types';

export default function Passport() {
  const { data } = useVehicle();
  const id = data.vehicle.id;
  const [p, setP] = useState<PassportData | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.passport(id).then((r) => { setP(r.passport); setShare(r.share); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load, data]);

  const url = share ? `${location.origin}/p/${share.token}` : '';
  useEffect(() => {
    if (!url) { setQr(null); return; }
    QRCode.toDataURL(url, { margin: 0, width: 208, color: { dark: '#070a0dff', light: '#ffffffff' } }).then(setQr).catch(() => setQr(null));
  }, [url]);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); }
    setBusy(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setErr('Could not copy. Select the link and copy it manually.'); }
  };

  if (!p) return err ? <ErrorNote error={err} /> : <div className="empty"><Spinner /></div>;

  return (
    <div className="stack">
      <section className="panel no-print">
        <div className="row between wrap">
          <div style={{ maxInlineSize: 520 }}>
            <h3 className="section-title" style={{ marginBlockEnd: 6 }}>Share with a buyer</h3>
            <p className="muted small">Nothing is shared until you create a link. Anyone with the link can view this passport (not your uploaded files) until you turn it off.</p>
          </div>
          <div className="row wrap">
            <button className="btn" onClick={() => window.print()}><Printer className="i" aria-hidden />Print or save PDF</button>
            {!share && <button className="btn primary" disabled={busy} onClick={() => act(() => api.share(id))}><Link2 className="i" aria-hidden />Create share link</button>}
          </div>
        </div>
        {share && (
          <div style={{ marginBlockStart: 16 }}>
            <div className="linkbox">
              <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
              <button className="btn danger" disabled={busy} onClick={() => act(() => api.unshare(id))}>Turn off</button>
            </div>
          </div>
        )}
        {share && <p className="caption row" style={{ marginBlockStart: 10, gap: 6 }}><QrCode className="i" aria-hidden style={{ inlineSize: 14, blockSize: 14 }} />A QR code for this link is printed on the passport.</p>}
        <div style={{ marginBlockStart: share ? 12 : 0 }}><ErrorNote error={err} /></div>
      </section>
      <PassportView p={p} qr={qr} shareUrl={url} />
    </div>
  );
}
