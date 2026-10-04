import type { DocType, DocumentRecord, ServiceRecord, Trust, Vehicle } from './types';
import type { TransferResult } from './transfer';

/**
 * Vehicle Confidence: how confident CarVault is in a vehicle's HISTORY and RECORDS.
 * It measures evidence quality, completeness, recency and consistency. It is not a mechanical
 * condition score and never claims anything about how the car drives.
 *
 * Every dimension is scored from the evidence itself, explains itself in plain language, lists
 * what's missing, and reports how much each missing item would raise the overall score (computed
 * by re-scoring, not guessed).
 */

export const DIMENSIONS = [
  { id: 'identity', label: 'Vehicle identity' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'mileage', label: 'Mileage' },
  { id: 'service', label: 'Service history' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'inspection', label: 'Inspection' },
  { id: 'claims', label: 'Accident / claims evidence' },
  { id: 'documents', label: 'Documents' },
] as const;
export type DimensionId = (typeof DIMENSIONS)[number]['id'];

export const DEFAULT_WEIGHTS: Record<DimensionId, number> = {
  identity: 1, ownership: 1, mileage: 1.5, service: 1.5, insurance: 0.75, inspection: 1, claims: 0.75, documents: 1,
};

export type Level = 'high' | 'moderate' | 'low';
export const levelOf = (score: number): Level => (score >= 85 ? 'high' : score >= 65 ? 'moderate' : 'low');

export interface Evidence {
  label: string;
  date?: string;
  detail?: string;
  trust: Trust;
  source: string;
  ref?: { kind: 'service' | 'document'; id: string };
}

export interface MissingItem {
  id: string;
  label: string;
  /** What would satisfy it. */
  evidence: string;
  cta: { label: string; to: 'documents' | 'timeline' | 'odometer' | 'passport' };
  /** Document type to preselect when uploading. */
  docType?: DocType;
}

export interface Dimension {
  id: DimensionId;
  label: string;
  score: number;
  level: Level;
  evidence: Evidence[];
  sources: string[];
  lastVerified?: string;
  why: string;
  missing: MissingItem[];
}

export interface Improvement extends MissingItem {
  dimension: string;
  gain: number;
}

export interface ConfidenceResult {
  score: number;
  level: Level;
  verifiedRecords: number;
  sources: number;
  gaps: number;
  dimensions: Dimension[];
  improvements: Improvement[];
  question: string;
}

const DAY = 86_400_000;
const months = (d: string) => (Date.now() - new Date(d).getTime()) / (DAY * 30.44);
const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
/** Source-backed evidence counts fully; imported nearly; owner-entered partially; conflicts barely. */
const TRUST_FACTOR: Partial<Record<Trust, number>> = { verified: 1, imported: 0.85, user: 0.5, conflict: 0.2 };
const tf = (t: Trust) => TRUST_FACTOR[t] ?? 0;

const DOC_LABEL: Record<string, string> = {
  service_invoice: 'Service invoice', insurance: 'Insurance policy', registration: 'Registration card', inspection: 'Inspection report',
  warranty: 'Warranty', parts_invoice: 'Parts invoice', tyre_invoice: 'Tyre invoice', ownership: 'Ownership record',
  claims_history: 'Claims history report', rta_certificate: 'RTA Vehicle Status Certificate', loan_release: 'Loan clearance letter',
  other: 'Document',
};

function svcSourceName(s: ServiceRecord) {
  return s.importedFrom ?? s.workshop;
}
function docSourceName(d: DocumentRecord) {
  const issuer = d.fields.find((f) => ['insurer', 'provider', 'issuer'].includes(f.key))?.value;
  return issuer ?? DOC_LABEL[d.type] ?? 'Document';
}
const svcEvidence = (s: ServiceRecord, detail?: string): Evidence => ({
  label: s.category === 'inspection' ? 'Inspection record' : s.importedFrom ? 'Imported service record' : 'Service record',
  date: s.date, detail: detail ?? `${s.title} · ${km(s.mileage)}`, trust: s.trust, source: svcSourceName(s),
  ref: { kind: 'service', id: s.id },
});
const docEvidence = (d: DocumentRecord, detail?: string): Evidence => ({
  label: DOC_LABEL[d.type] ?? 'Document', date: d.issuedOn ?? d.uploadedAt.slice(0, 10), detail: detail ?? d.fileName,
  trust: d.trust, source: docSourceName(d), ref: { kind: 'document', id: d.id },
});

interface Input { vehicle: Vehicle; services: ServiceRecord[]; documents: DocumentRecord[] }

function scoreDimensions({ vehicle: v, services, documents }: Input): Dimension[] {
  const recs = [...services].sort((a, b) => a.date.localeCompare(b.date));
  const docs = documents.filter((d) => d.status === 'confirmed');
  const byType = (t: DocType) => docs.filter((d) => d.type === t).sort((a, b) => (b.issuedOn ?? '').localeCompare(a.issuedOn ?? ''));
  const dims: Dimension[] = [];
  const push = (id: DimensionId, score: number, evidence: Evidence[], why: string, missing: MissingItem[]) => {
    const dated = evidence.filter((e) => e.date && (e.trust === 'verified' || e.trust === 'imported')).map((e) => e.date!).sort();
    dims.push({
      id, label: DIMENSIONS.find((d) => d.id === id)!.label, score: clamp(score), level: levelOf(clamp(score)),
      evidence, sources: [...new Set(evidence.map((e) => e.source))], lastVerified: dated[dated.length - 1], why, missing,
    });
  };

  // Identity ------------------------------------------------------------------------------
  {
    const reg = byType('registration')[0];
    // When several documents show the VIN, the most trustworthy one counts.
    const vinOnDoc = docs.filter((d) => d.fields.some((f) => f.key === 'vin' && f.value.toUpperCase() === v.vin.toUpperCase()))
      .sort((a, b) => tf(b.trust) - tf(a.trust))[0];
    const ev: Evidence[] = [];
    let s = 0;
    if (v.vin) { s += 35; ev.push({ label: 'VIN recorded', detail: v.vin, trust: 'user', source: 'Vehicle record' }); }
    if (reg) { s += 40 * tf(reg.trust) / 1; ev.push(docEvidence(reg, 'Registration card')); }
    if (vinOnDoc) { s += 25 * tf(vinOnDoc.trust); if (vinOnDoc !== reg) ev.push(docEvidence(vinOnDoc, `VIN ${v.vin} on document`)); }
    const missing: MissingItem[] = [];
    if (!v.vin) missing.push({ id: 'vin', label: 'Add the VIN', evidence: '17-character VIN from the registration card', cta: { label: 'Add registration', to: 'documents' }, docType: 'registration' });
    if (!reg) missing.push({ id: 'registration', label: 'Upload the registration card', evidence: 'Current registration card', cta: { label: 'Upload registration', to: 'documents' }, docType: 'registration' });
    else if (!vinOnDoc && v.vin) missing.push({ id: 'vin_match', label: 'Confirm the VIN on a document', evidence: 'A document showing this VIN (registration or invoice)', cta: { label: 'Review documents', to: 'documents' } });
    push('identity', s,
      ev,
      s >= 95 ? `The VIN on file matches the ${reg ? 'registration card' : 'records'}, so identity is well established.`
        : !v.vin ? 'No VIN is recorded, so the vehicle cannot be tied to its documents.'
          : !reg ? 'The VIN is recorded but no registration card backs it up.'
            : 'The registration card is on file, but no document confirms the VIN itself.',
      missing);
  }

  // Ownership -----------------------------------------------------------------------------
  {
    const reg = byType('registration')[0];
    // The RTA Vehicle Status Certificate lists the owner history, so it counts as ownership evidence.
    const own = [...byType('ownership'), ...byType('rta_certificate')];
    const ev: Evidence[] = [];
    let s = 0;
    if (reg) { s += 55 * tf(reg.trust); ev.push(docEvidence(reg, 'Current registered owner')); }
    if (own.length) { s += 45 * Math.max(...own.map((d) => tf(d.trust))); own.forEach((d) => ev.push(docEvidence(d, 'Ownership / transfer record'))); }
    const missing: MissingItem[] = [];
    if (!reg) missing.push({ id: 'own_reg', label: 'Upload the registration card', evidence: 'Shows the current registered owner', cta: { label: 'Upload registration', to: 'documents' }, docType: 'registration' });
    if (!own.length) missing.push({ id: 'ownership_history', label: 'Add ownership history', evidence: 'RTA Vehicle Status Certificate (lists previous owners), or a purchase / transfer record', cta: { label: 'Upload certificate', to: 'documents' }, docType: 'rta_certificate' });
    push('ownership', s, ev,
      own.length && reg ? 'Current ownership and the ownership history are both documented.'
        : reg ? 'Current ownership is documented by the registration card, but earlier ownership isn\'t on record.'
          : 'No ownership evidence is on file.',
      missing);
  }

  // Mileage -------------------------------------------------------------------------------
  {
    const readings = recs.filter((r) => r.mileage > 0 && tf(r.trust) > 0);
    const strong = readings.filter((r) => r.trust === 'verified' || r.trust === 'imported');
    let monotonic = true;
    for (let i = 1; i < readings.length; i++) if (readings[i].mileage < readings[i - 1].mileage) monotonic = false;
    const conflicts = readings.filter((r) => r.trust === 'conflict' || (r.conflicts?.length ?? 0) > 0);
    const last = strong[strong.length - 1];
    const recency = last ? months(last.date) : Infinity;
    let s = Math.min(1, strong.length / 3) * 50 + (monotonic && !conflicts.length ? 30 : 5) + (recency <= 6 ? 20 : recency <= 12 ? 12 : recency <= 24 ? 6 : 0);
    if (!readings.length) s = 0;
    const missing: MissingItem[] = [];
    if (strong.length < 3) missing.push({ id: 'mileage_more', label: 'Add more dated mileage records', evidence: 'An RTA Vehicle Status Certificate (odometer at every annual test), or invoices and inspections showing the odometer', cta: { label: 'Upload certificate', to: 'documents' }, docType: 'rta_certificate' });
    if (recency > 6) missing.push({ id: 'mileage_recent', label: 'Verify a recent mileage reading', evidence: 'A recent invoice or inspection with the odometer', cta: { label: 'Upload inspection', to: 'documents' }, docType: 'inspection' });
    if (conflicts.length) missing.push({ id: 'mileage_conflict', label: 'Resolve the mileage conflict', evidence: 'Check the conflicting record against its source document', cta: { label: 'Review timeline', to: 'timeline' } });
    push('mileage', s, readings.slice(-5).reverse().map((r) => svcEvidence(r, `${km(r.mileage)} · ${r.title}`)),
      !readings.length ? 'No dated mileage readings are on file.'
        : conflicts.length || !monotonic ? `${readings.length} mileage readings are on file, but they don't agree. At least one reading conflicts with the others.`
          : !last ? `${readings.length} mileage reading${readings.length === 1 ? ' is' : 's are'} on file, but none comes from a source document, so the odometer history can't be corroborated.`
            : `${strong.length} source-backed record${strong.length === 1 ? '' : 's'} report consistent mileage. The most recent verified reading is ${km(last.mileage)} (${fdate(last.date)}).`,
      missing);
  }

  // Service history -----------------------------------------------------------------------
  {
    const svc = recs.filter((r) => r.category === 'service');
    const ageYears = Math.max(1, new Date().getFullYear() - v.year);
    const coverage = Math.min(1, svc.length / ageYears);
    const strongShare = svc.length ? svc.reduce((a, r) => a + tf(r.trust), 0) / svc.length : 0;
    const years = new Set(svc.map((r) => Number(r.date.slice(0, 4))));
    const firstYear = svc.length ? Number(svc[0].date.slice(0, 4)) : v.year;
    const missingYears: number[] = [];
    for (let y = Math.max(v.year, firstYear); y < new Date().getFullYear(); y++) if (!years.has(y) && y >= v.year) missingYears.push(y);
    const s = svc.length ? coverage * 60 + strongShare * 40 - missingYears.length * 5 : 0;
    const missing: MissingItem[] = missingYears.slice(0, 3).map((y) => ({
      id: `service_${y}`, label: `Upload the ${y} service invoice`, evidence: `Any scheduled-service invoice dated ${y}`,
      cta: { label: 'Upload invoice', to: 'documents' as const }, docType: 'service_invoice' as DocType,
    }));
    if (!svc.length) missing.push({ id: 'service_any', label: 'Upload service invoices', evidence: 'Scheduled-service invoices from any workshop', cta: { label: 'Upload invoice', to: 'documents' }, docType: 'service_invoice' });
    push('service', s, svc.slice(-5).reverse().map((r) => svcEvidence(r)),
      !svc.length ? 'No scheduled-service records are on file.'
        : missingYears.length ? `${svc.length} scheduled services are on file, but no service is recorded for ${missingYears.join(', ')}.`
          : `${svc.length} scheduled services cover every year since ${firstYear}${strongShare >= 0.95 ? ', all from source documents' : ''}.`,
      missing);
  }

  // Insurance -----------------------------------------------------------------------------
  {
    const pol = byType('insurance');
    const certHistory = byType('rta_certificate').find((d) => d.fields.some((f) => f.key === 'insurance_history' && f.value.trim()));
    const current = pol.find((d) => d.expiresOn && new Date(d.expiresOn).getTime() > Date.now());
    let s = 0;
    if (current) s += 70 * tf(current.trust);
    else if (pol.length) s += 30;
    if (pol.length >= 2) s += 30;
    else if (certHistory) s += 30 * tf(certHistory.trust);
    const missing: MissingItem[] = [];
    if (!current) missing.push({ id: 'insurance_current', label: 'Upload the current insurance policy', evidence: 'Policy schedule with the expiry date', cta: { label: 'Upload policy', to: 'documents' }, docType: 'insurance' });
    if (pol.length < 2 && !certHistory) missing.push({ id: 'insurance_history', label: 'Add insurance history', evidence: 'Previous years\' policy schedules, or the RTA Vehicle Status Certificate', cta: { label: 'Upload policy', to: 'documents' }, docType: 'insurance' });
    const insEv = pol.map((d) => docEvidence(d, d.expiresOn ? `Valid until ${fdate(d.expiresOn)}` : d.fileName));
    if (certHistory) insEv.push(docEvidence(certHistory, certHistory.fields.find((f) => f.key === 'insurance_history')!.value));
    push('insurance', s, insEv,
      current ? `A current policy is on file, valid until ${fdate(current.expiresOn!)}.${pol.length < 2 && !certHistory ? ' Earlier policies aren\'t on record.' : ''}`
        : pol.length ? 'Insurance is on file but has expired.' : 'No insurance evidence is on file.',
      missing);
  }

  // Inspection ----------------------------------------------------------------------------
  {
    const insp = recs.filter((r) => r.category === 'inspection').reverse();
    const latest = insp[0];
    const age = latest ? months(latest.date) : Infinity;
    const s = latest ? (age <= 6 ? 100 : age <= 12 ? 70 : age <= 24 ? 45 : 25) * Math.max(0.5, tf(latest.trust)) : 0;
    const missing: MissingItem[] = [];
    if (age > 6) missing.push({ id: 'inspection_latest', label: latest ? 'Add a recent inspection' : 'Add an independent inspection', evidence: 'An inspection report from the last 6 months', cta: { label: 'Add inspection', to: 'documents' }, docType: 'inspection' });
    push('inspection', s, insp.slice(0, 3).map((r) => svcEvidence(r, r.notes ?? r.title)),
      !latest ? 'No inspection is on file.'
        : age <= 6 ? `The latest inspection is ${Math.round(age)} months old, which is current.`
          : `The latest inspection is ${Math.round(age)} months old. Confidence drops as inspection evidence ages.`,
      missing);
  }

  // Accident / claims ----------------------------------------------------------------------
  {
    const claims = byType('claims_history');
    const insp = recs.filter((r) => r.category === 'inspection' && tf(r.trust) > 0);
    let s = 0;
    const ev: Evidence[] = [];
    if (claims.length) { s = 100 * Math.max(...claims.map((d) => tf(d.trust))); claims.forEach((d) => ev.push(docEvidence(d))); }
    else if (insp.length) { s = 40; ev.push(svcEvidence(insp[insp.length - 1], 'Inspection (partial evidence: not a claims history)')); }
    const missing: MissingItem[] = claims.length ? [] : [{ id: 'claims_report', label: 'Add a claims / accident history report', evidence: 'Insurer claims history or an accident history report', cta: { label: 'Upload report', to: 'documents' }, docType: 'claims_history' }];
    push('claims', s, ev,
      claims.length ? 'A claims history report is on file.'
        : insp.length ? 'An inspection is on file, but no claims or accident history report. An inspection alone can\'t rule out past accidents.'
          : 'No accident or claims evidence is on file. This is unknown, not "accident-free".',
      missing);
  }

  // Documents -----------------------------------------------------------------------------
  {
    const need: DocType[] = ['registration', 'insurance', 'service_invoice', 'inspection', 'warranty'];
    const present = need.filter((t) => docs.some((d) => d.type === t));
    const verifiedShare = docs.length ? docs.filter((d) => d.trust === 'verified' || d.trust === 'imported').length / docs.length : 0;
    const s = (present.length / need.length) * 75 + verifiedShare * 25;
    const missing: MissingItem[] = need.filter((t) => !present.includes(t)).map((t) => ({
      id: `doc_${t}`, label: `Add the ${DOC_LABEL[t].toLowerCase()}`, evidence: DOC_LABEL[t],
      cta: { label: 'Upload', to: 'documents' as const }, docType: t,
    }));
    push('documents', s, docs.slice(0, 6).map((d) => docEvidence(d)),
      `${present.length} of ${need.length} core document types are on file${docs.length ? `, ${Math.round(verifiedShare * 100)}% verified from source` : ''}.`,
      missing);
  }

  return dims;
}

function overall(dims: Dimension[], weights: Record<string, number>) {
  const total = dims.reduce((a, d) => a + (weights[d.id] ?? 1), 0) || 1;
  return clamp(dims.reduce((a, d) => a + d.score * (weights[d.id] ?? 1), 0) / total);
}

/** Estimated overall gain from resolving one missing item: re-score its dimension as if resolved. */
function gainFor(dim: Dimension, dims: Dimension[], weights: Record<string, number>, share: number): number {
  const base = overall(dims, weights);
  const lift = Math.min(100 - dim.score, Math.max(5, (100 - dim.score) * share));
  const next = dims.map((d) => (d.id === dim.id ? { ...d, score: d.score + lift } : d));
  return Math.max(1, overall(next, weights) - base);
}

export function computeConfidence(input: Input, weights: Record<string, number> = DEFAULT_WEIGHTS): ConfidenceResult {
  const dims = scoreDimensions(input);
  const score = overall(dims, weights);
  const docs = input.documents.filter((d) => d.status === 'confirmed');
  const verifiedRecords = input.services.filter((s) => s.trust === 'verified' || s.trust === 'imported').length
    + docs.filter((d) => d.trust === 'verified' || d.trust === 'imported').length;
  const sources = new Set([...input.services.map(svcSourceName), ...docs.map(docSourceName)]).size;
  const improvements: Improvement[] = [];
  for (const d of dims) {
    d.missing.forEach((m) => {
      improvements.push({ ...m, dimension: d.label, gain: gainFor(d, dims, weights, 1 / Math.max(1, d.missing.length)) });
    });
  }
  improvements.sort((a, b) => b.gain - a.gain);
  return {
    score, level: levelOf(score), verifiedRecords, sources,
    gaps: dims.reduce((a, d) => a + d.missing.length, 0),
    dimensions: dims, improvements: improvements.slice(0, 8),
    question: 'How confident are we about this vehicle\'s history?',
  };
}

// ---------------------------------------------------------------------------------------
// Resale readiness
// ---------------------------------------------------------------------------------------

export interface ResaleItem { id: string; label: string; ready: boolean; detail: string; weight: number }
export interface ResaleAction { id: string; label: string; detail: string; to: 'documents' | 'passport' | 'dataroom' | 'assistant' | 'value' | 'transfer'; available: boolean }
export interface ResaleResult { score: number; level: Level; summary: string; items: ResaleItem[]; actions: ResaleAction[]; transfer: TransferResult }

export function computeResale(input: Input, conf: ConfidenceResult, opts: { passportShared: boolean; dataRooms: number; transfer: TransferResult }): ResaleResult {
  const dim = (id: DimensionId) => conf.dimensions.find((d) => d.id === id)!;
  const docs = input.documents.filter((d) => d.status === 'confirmed');
  const reg = docs.filter((d) => d.type === 'registration' && d.expiresOn).sort((a, b) => b.expiresOn!.localeCompare(a.expiresOn!))[0];
  const regDays = reg ? (new Date(reg.expiresOn!).getTime() - Date.now()) / DAY : -1;
  const ins = docs.filter((d) => d.type === 'insurance' && d.expiresOn).sort((a, b) => b.expiresOn!.localeCompare(a.expiresOn!))[0];
  const insValid = !!ins && new Date(ins.expiresOn!).getTime() > Date.now();
  const inspAge = (() => {
    const i = input.services.filter((s) => s.category === 'inspection').sort((a, b) => b.date.localeCompare(a.date))[0];
    return i ? months(i.date) : Infinity;
  })();

  const items: ResaleItem[] = [
    { id: 'service', label: 'Service history', weight: 2, ready: dim('service').score >= 80, detail: dim('service').why },
    { id: 'ownership', label: 'Ownership history', weight: 1.5, ready: dim('ownership').score >= 80, detail: dim('ownership').why },
    { id: 'mileage', label: 'Mileage continuity', weight: 2, ready: dim('mileage').score >= 80, detail: dim('mileage').why },
    { id: 'registration', label: 'Registration', weight: 1, ready: regDays > 30, detail: reg ? (regDays > 30 ? `Current, valid until ${fdate(reg.expiresOn!)}.` : 'Expired or expiring within 30 days.') : 'No registration card on file.' },
    { id: 'insurance', label: 'Insurance', weight: 0.75, ready: insValid, detail: insValid ? `Current until ${fdate(ins!.expiresOn!)}.` : 'No current policy on file.' },
    { id: 'inspection', label: 'Inspection', weight: 1.5, ready: inspAge <= 6, detail: inspAge === Infinity ? 'No inspection on file.' : inspAge <= 6 ? 'Recent enough for a buyer.' : `Inspection is ${Math.round(inspAge)} months old; buyers usually expect one within 6 months.` },
    { id: 'documents', label: 'Documents', weight: 1, ready: dim('documents').score >= 80, detail: dim('documents').why },
    {
      id: 'transfer', label: 'UAE transfer checklist', weight: 1.5, ready: opts.transfer.complete,
      detail: opts.transfer.complete ? 'Everything the RTA asks for at transfer is in place.' : `${opts.transfer.ready} of ${opts.transfer.required} transfer requirements ready.`,
    },
    { id: 'passport', label: 'Vehicle Passport', weight: 0.75, ready: opts.passportShared || opts.dataRooms > 0, detail: opts.passportShared || opts.dataRooms > 0 ? 'A passport share or data room is ready for buyers.' : 'Passport not yet shared with a buyer.' },
  ];
  const total = items.reduce((a, i) => a + i.weight, 0);
  // Ready items count fully; items not ready still earn partial credit from the confidence evidence behind them.
  const partial = (i: ResaleItem) => {
    const map: Partial<Record<string, DimensionId>> = { service: 'service', ownership: 'ownership', mileage: 'mileage', inspection: 'inspection', documents: 'documents' };
    const d = map[i.id];
    if (i.ready) return 1;
    if (i.id === 'transfer') return (opts.transfer.ready / Math.max(1, opts.transfer.required)) * 0.7;
    return d ? dim(d).score / 100 * 0.7 : 0;
  };
  const score = clamp((items.reduce((a, i) => a + partial(i) * i.weight, 0) / total) * 100);
  const notReady = items.filter((i) => !i.ready);
  const actions: ResaleAction[] = [];
  if (items.find((i) => i.id === 'documents' && !i.ready) || items.find((i) => i.id === 'service' && !i.ready))
    actions.push({ id: 'docs', label: 'Add missing documents', detail: conf.improvements[0]?.label ?? 'Fill documentation gaps', to: 'documents', available: true });
  if (items.find((i) => i.id === 'inspection' && !i.ready))
    actions.push({ id: 'inspect', label: 'Book an inspection', detail: 'Booking isn\'t live yet. CarVault can prepare a workshop brief.', to: 'assistant', available: true });
  const left = opts.transfer.required - opts.transfer.ready;
  if (left > 0)
    actions.push({ id: 'transfer', label: 'Complete the transfer checklist', detail: `${left} item${left === 1 ? '' : 's'} left before the RTA transfer, such as fines, loan clearance and the technical test.`, to: 'transfer', available: true });
  actions.push({ id: 'passport', label: 'Generate Vehicle Passport', detail: 'The buyer-facing record with provenance on every fact.', to: 'passport', available: true });
  actions.push({ id: 'value', label: 'Review valuation', detail: 'Illustrative estimate only. Confirm with a dealer valuation.', to: 'value', available: true });
  actions.push({ id: 'dataroom', label: 'Create a Vehicle Data Room', detail: 'Share selected evidence with a buyer through an expiring link.', to: 'dataroom', available: true });
  return {
    score, level: levelOf(score),
    summary: score >= 85 ? 'This vehicle has strong evidence for resale.'
      : score >= 65 ? `Good foundation. ${notReady.length} item${notReady.length === 1 ? '' : 's'} would strengthen it for a buyer.`
        : 'Significant evidence gaps. Address these before listing.',
    items, actions, transfer: opts.transfer,
  };
}
