import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Code2, Copy, ShieldCheck } from 'lucide-react';
import type { DataRoom } from '../types';
import { fmtDateTime } from '../utils';

/** Everything an owner or business can choose to share about a vehicle. */
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

export const roomStatus = (r: DataRoom) => (r.revokedAt ? 'Revoked' : new Date(r.expiresAt).getTime() < Date.now() ? 'Expired' : 'Active');
const linkFor = (r: DataRoom) => `${location.origin}/d/${r.token}`;
const badgeFor = (r: DataRoom) => `${location.origin}/api/public/dataroom/${r.token}/badge.svg`;
const embedFor = (r: DataRoom) => `<a href="${linkFor(r)}" target="_blank" rel="noopener"><img src="${badgeFor(r)}" width="320" height="64" alt="CarVault verified vehicle history"></a>`;

export function ShareResult({ room, onRevoke }: { room: DataRoom; onRevoke: () => void }) {
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
