import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useSession } from '../session';
import { useVehicle } from './VehicleLayout';
import { ErrorNote, Modal, Spinner, TrustBadge } from '../components/ui';
import type { DocType, DocumentRecord, ExtractedField, ServiceCategory, ServiceDraft } from '../types';
import { CATEGORY_LABEL, DOC_LABEL, daysUntil, fmtDate } from '../utils';
import { BadgeCheck, Check, ClipboardCheck, ExternalLink, FileText, Landmark, Receipt, ShieldCheck, UploadCloud } from 'lucide-react';

const DOC_ICON: Partial<Record<DocType, typeof FileText>> = {
  insurance: ShieldCheck, inspection: ClipboardCheck, service_invoice: Receipt, tyre_invoice: Receipt, parts_invoice: Receipt,
  rta_certificate: Landmark, loan_release: Landmark,
};
/** Types that can be checked against the issuer's own verification service (mirrors the server). */
const VERIFIABLE: DocType[] = ['rta_certificate', 'registration', 'insurance', 'inspection', 'claims_history', 'loan_release', 'ownership', 'warranty'];
const ISSUER_HINT: Partial<Record<DocType, string>> = {
  rta_certificate: 'Enter the certificate number on rta.ae (or the RTA app) and confirm the details match this document.',
  registration: 'Check the registration on the RTA app or the issuing emirate\'s licensing service.',
  insurance: 'Check the policy number with the insurer.',
  loan_release: 'Call the bank or check the letter\'s reference with the issuing branch.',
};
const DocIcon = ({ type }: { type: DocType }) => {
  const I = DOC_ICON[type] ?? FileText;
  return <span className="doc-icon" aria-hidden><I className="i" /></span>;
};

const CORE: DocType[] = ['registration', 'insurance', 'service_invoice', 'inspection', 'warranty'];
const HAS_DRAFT: DocType[] = ['service_invoice', 'inspection', 'tyre_invoice', 'parts_invoice'];

function ReviewModal({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  const { setData } = useVehicle();
  const [type, setType] = useState<DocType>(doc.type);
  const [fields, setFields] = useState<ExtractedField[]>(doc.fields);
  const [draft, setDraft] = useState<ServiceDraft | undefined>(doc.draft);
  const [conflicts, setConflicts] = useState<string[]>(doc.conflicts);
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setField = (key: string, value: string) => {
    setFields(fields.map((f) => (f.key === key ? { ...f, value } : f)));
    if (draft && (key === 'date' || key === 'mileage' || key === 'workshop' || key === 'cost'))
      setDraft({ ...draft, [key]: key === 'mileage' || key === 'cost' ? Number(value) : value } as ServiceDraft);
  };
  const patch = (p: Partial<ServiceDraft>) => draft && setDraft({ ...draft, ...p });
  const wantsDraft = HAS_DRAFT.includes(type);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const d = wantsDraft ? draft : undefined;
      setData(await api.confirmDoc(doc.id, { type, fields, draft: d, acknowledgeConflicts: ack }));
      onClose();
    } catch (x) {
      if (x instanceof ApiError && x.status === 409) setConflicts(x.conflicts ?? []);
      else setErr(x instanceof Error ? x.message : 'Could not save');
      setBusy(false);
    }
  };

  return (
    <Modal wide title="Review extracted details" subtitle={doc.fileName} onClose={onClose}>
      {doc.extractedBy === 'mock' && (
        <div className="notice warn" style={{ marginBlockEnd: 16 }}>
          <b>Demo extraction.</b> This prototype is not reading your file yet, so these values are simulated. Correct anything that doesn't match your document. Live extraction switches on when an API key is added.
        </div>
      )}
      <p className="muted small" style={{ marginBlockEnd: 16 }}>{doc.summary}</p>
      {type === 'rta_certificate' && (
        <div className="notice" style={{ marginBlockEnd: 16 }}>
          Each odometer reading below becomes a dated entry on the timeline. The certificate also counts as ownership and insurance-history evidence. It shows as <b>User provided</b> until someone checks the certificate number with the RTA.
        </div>
      )}

      <label className="field" style={{ maxInlineSize: 260, marginBlockEnd: 18 }}>
        <span>Document type</span>
        <select value={type} onChange={(e) => setType(e.target.value as DocType)}>
          {Object.entries(DOC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>

      {fields.length > 0 && (
        <div style={{ marginBlockEnd: 18 }}>
          <p className="eyebrow" style={{ marginBlockEnd: 10 }}>Extracted fields</p>
          {fields.map((f) => (
            <div className="field-row" key={f.key}>
              <label htmlFor={`f-${f.key}`} className="small muted">{f.label}</label>
              <input id={`f-${f.key}`} value={f.value} onChange={(e) => setField(f.key, e.target.value)} />
              <span className={`confv num${f.confidence < 0.8 ? ' low' : ''}`} title="Extraction confidence">
                {f.confidence < 0.8 ? 'Check · ' : ''}{Math.round(f.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {wantsDraft && draft && (
        <div>
          <p className="eyebrow" style={{ marginBlockEnd: 10 }}>Timeline entry</p>
          <div className="form-grid">
            <label className="field full"><span>Title</span><input value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></label>
            <label className="field"><span>Date</span><input type="date" value={draft.date.slice(0, 10)} onChange={(e) => { patch({ date: e.target.value }); setField('date', e.target.value); }} /></label>
            <label className="field"><span>Odometer (km)</span><input type="number" min={0} value={draft.mileage} onChange={(e) => { patch({ mileage: Number(e.target.value) }); setField('mileage', e.target.value); }} /></label>
            <label className="field"><span>Type</span>
              <select value={draft.category} onChange={(e) => patch({ category: e.target.value as ServiceCategory })}>
                {Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="field"><span>Cost (AED)</span><input type="number" min={0} value={draft.cost} onChange={(e) => { patch({ cost: Number(e.target.value) }); setField('cost', e.target.value); }} /></label>
            <label className="field full"><span>Workshop</span><input value={draft.workshop} onChange={(e) => { patch({ workshop: e.target.value }); setField('workshop', e.target.value); }} /></label>
            <label className="field full"><span>Work performed (one per line)</span>
              <textarea value={draft.workPerformed.join('\n')} onChange={(e) => patch({ workPerformed: e.target.value.split('\n') })} />
            </label>
            <label className="field full"><span>Parts (one per line)</span>
              <textarea value={draft.parts.map((p) => p.name).join('\n')} onChange={(e) => patch({ parts: e.target.value.split('\n').map((name) => ({ name })) })} />
            </label>
            <label className="field full"><span>Notes</span><textarea value={draft.notes ?? ''} onChange={(e) => patch({ notes: e.target.value })} /></label>
          </div>
        </div>
      )}
      {wantsDraft && !draft && <p className="notice">This type normally becomes a timeline entry, but no work details were extracted. Choose a different type, or add the record manually on the Timeline tab.</p>}

      {conflicts.length > 0 && (
        <div className="notice warn" style={{ marginBlockStart: 16 }} role="alert">
          <b>CarVault found something that doesn't add up:</b>
          <ul style={{ margin: '6px 0 8px', paddingInlineStart: 18 }}>{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={ack} onChange={(e) => setAck(e.target.checked)} /> I've checked. Save it anyway.</label>
        </div>
      )}
      <div style={{ marginBlockStart: 12 }}><ErrorNote error={err} /></div>
      <div className="actions">
        <button className="btn ghost" onClick={onClose}>Decide later</button>
        <button className="btn primary" onClick={save} disabled={busy || (conflicts.length > 0 && !ack) || (wantsDraft && !draft)}>
          {busy ? 'Saving…' : 'Confirm and add to passport'}
        </button>
      </div>
    </Modal>
  );
}

function VerifyModal({ doc, onClose }: { doc: DocumentRecord; onClose: () => void }) {
  const { setData } = useVehicle();
  const certNo = doc.fields.find((f) => f.key === 'certificate_no')?.value ?? '';
  const [reference, setReference] = useState(certNo);
  const [attest, setAttest] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { setData(await api.verifyDoc(doc.id, { reference, attest, note })); onClose(); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not verify'); setBusy(false); }
  };
  return (
    <Modal title="Verify with the issuer" subtitle={`${DOC_LABEL[doc.type]} · ${doc.fileName}`} onClose={onClose}>
      <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
        <p className="small muted">{ISSUER_HINT[doc.type] ?? 'Check the document\'s reference number with the organization that issued it.'} CarVault records who checked it and when; it doesn't contact the issuer itself.</p>
        {doc.type === 'rta_certificate' && (
          <a className="link row" style={{ gap: 6 }} href="https://www.rta.ae" target="_blank" rel="noreferrer">Open rta.ae <ExternalLink className="i" aria-hidden style={{ inlineSize: 14, blockSize: 14 }} /></a>
        )}
        <label className="field"><span>Certificate or reference number you checked</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} maxLength={60} />
        </label>
        <label className="field"><span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Details match; 2 owners listed" />
        </label>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" style={{ width: 'auto', marginBlockStart: 3 }} checked={attest} onChange={(e) => setAttest(e.target.checked)} />
          <span className="small">I checked this reference on the issuer's official service and the details match this document.</span>
        </label>
        <ErrorNote error={err} />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !attest || reference.trim().length < 4}><BadgeCheck className="i" aria-hidden />{busy ? 'Saving…' : 'Mark as verified'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Documents() {
  const { data, setData } = useVehicle();
  const { session, isConsumer } = useSession();
  // Owners can't verify their own paperwork; business admins and CarVault's team can (the server enforces this too).
  const canVerify = !!session && (session.permissions.isPlatformAdmin || (session.permissions.isTenantAdmin && !isConsumer));
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [params] = useSearchParams();
  // Deep links from confidence gaps preselect the document type they need (?type=inspection).
  const [type, setType] = useState<DocType | 'auto'>(() => (params.get('type') as DocType) || 'auto');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const target = params.get('doc');
  useEffect(() => {
    if (target) requestAnimationFrame(() => document.getElementById(`doc-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [target]);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    setErr(null);
    setNote(null);
    let last: DocumentRecord | undefined;
    for (const file of Array.from(files)) {
      setBusy(file.name);
      try {
        const r = await api.upload(data.vehicle.id, file, type);
        last = r.document;
        if (r.fallbackReason) setNote('Live AI was unavailable for a file, so the demo extractor was used instead.');
      } catch (e) {
        setErr(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`);
      }
    }
    setBusy(null);
    setData(await api.vehicle(data.vehicle.id));
    if (last) setReviewId(last.id);
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); };

  const remove = async (d: DocumentRecord) => {
    const linked = data.services.some((s) => s.sourceDocId === d.id);
    if (!confirm(`Delete "${d.fileName}"?${linked ? ' Its timeline entry will be removed too.' : ''}`)) return;
    try { setData(await api.deleteDoc(d.id)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not delete'); }
  };

  const confirmed = data.documents.filter((x) => x.status === 'confirmed');
  const pending = data.documents.filter((x) => x.status === 'needs_review');
  const review = data.documents.find((d) => d.id === reviewId && d.status === 'needs_review');
  const verifying = data.documents.find((d) => d.id === verifyId && d.status === 'confirmed');
  const hasCert = confirmed.some((d) => d.type === 'rta_certificate');

  return (
    <div className="grid g2">
      <div className="stack">
        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          {busy ? (
            <div><Spinner /> <span style={{ marginInlineStart: 10 }}>Reading {busy}…</span></div>
          ) : (
            <>
              <div className="drop-icon" aria-hidden><UploadCloud className="i" style={{ width: 20, height: 20 }} /></div>
              <p style={{ fontSize: 16, fontWeight: 600, marginBlockEnd: 4 }}>Drop invoices, insurance, registration, inspection reports or an RTA certificate</p>
              <p className="muted small" style={{ marginBlockEnd: 16 }}>PDF or image, up to 15 MB. You review everything before it's saved.</p>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <select style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value as DocType | 'auto')} aria-label="Document type">
                  <option value="auto">Detect type automatically</option>
                  {Object.entries(DOC_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="btn primary" onClick={() => input.current?.click()}>Choose files</button>
              </div>
              <input ref={input} type="file" multiple hidden accept=".pdf,image/*" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
            </>
          )}
        </div>
        <ErrorNote error={err} />
        {note && <div className="notice">{note}</div>}

        {pending.length > 0 && (
          <section className="panel">
            <h3>Waiting for your review</h3>
            {pending.map((d) => (
              <div className={`doc${target === d.id ? ' highlight' : ''}`} key={d.id} id={`doc-${d.id}`}>
                <DocIcon type={d.type} />
                <div><h4>{d.fileName}</h4><div className="muted small">{DOC_LABEL[d.type]} · {d.summary}</div></div>
                <div className="row"><button className="btn sm primary" onClick={() => setReviewId(d.id)}>Review</button><button className="btn sm ghost danger" onClick={() => remove(d)}>Delete</button></div>
              </div>
            ))}
          </section>
        )}

        <section className="panel">
          <h3>All documents ({confirmed.length})</h3>
          {confirmed.length === 0 && <p className="muted">Nothing here yet. Upload your first document above.</p>}
          {confirmed.map((d) => {
            const days = d.expiresOn ? daysUntil(d.expiresOn) : null;
            return (
              <div className={`doc${target === d.id ? ' highlight' : ''}`} key={d.id} id={`doc-${d.id}`}>
                <DocIcon type={d.type} />
                <div>
                  <h4>{d.fileName}</h4>
                  <div className="muted small">
                    {DOC_LABEL[d.type]}
                    {d.expiresOn && <> · {days! < 0 ? 'expired' : 'expires'} {fmtDate(d.expiresOn)}{days! >= 0 && days! <= 60 ? ` (${days} days)` : ''}</>}
                  </div>
                  {d.verification && (
                    <div className="caption verified-line"><BadgeCheck className="i" aria-hidden />Checked with the issuer by {d.verification.checkedByOrg} ({d.verification.checkedBy}), {fmtDate(d.verification.checkedAt)} · ref {d.verification.reference}</div>
                  )}
                </div>
                <div className="row">
                  <TrustBadge trust={d.trust} />
                  {canVerify && !d.verification && d.trust !== 'conflict' && VERIFIABLE.includes(d.type) && (
                    <button className="btn sm" onClick={() => setVerifyId(d.id)}>Verify</button>
                  )}
                  {d.storedName && <a className="btn sm ghost" href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer">View</a>}
                  <button className="btn sm ghost danger" onClick={() => remove(d)}>Delete</button>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <aside className="stack" style={{ alignSelf: 'start' }}>
       {!hasCert && (
        <section className="panel official-cta">
          <span className="label-ai"><Landmark className="i" aria-hidden />Strongest single document</span>
          <h3 style={{ marginBlock: '8px 6px' }}>RTA Vehicle Status Certificate</h3>
          <p className="small muted">Lists the owner history, insurance history and the odometer reading at every annual test. Order it on rta.ae or the RTA app with UAE PASS (about AED 120), then upload the PDF here.</p>
          <button className="btn sm" style={{ marginBlockStart: 12 }} onClick={() => { setType('rta_certificate'); input.current?.click(); }}>Upload certificate</button>
        </section>
       )}
       <section className="panel">
        <h3>Core documents</h3>
        <div className="checklist">
          {CORE.map((t) => {
            const done = confirmed.some((d) => d.type === t);
            return (
              <div className="item" key={t}>
                <span className={`tick${done ? ' done' : ''}`} aria-hidden><Check className="i" /></span>
                <span className={done ? '' : 'muted'}>{DOC_LABEL[t]}<span className="sr-only">{done ? ' (on file)' : ' (missing)'}</span></span>
              </div>
            );
          })}
        </div>
        <p className="muted small" style={{ marginBlockStart: 16 }}>A complete set makes maintenance insights more accurate and your vehicle passport easier for a buyer to trust.</p>
       </section>
      </aside>
      {review && <ReviewModal key={review.id} doc={review} onClose={() => setReviewId(null)} />}
      {verifying && <VerifyModal key={verifying.id} doc={verifying} onClose={() => setVerifyId(null)} />}
    </div>
  );
}
