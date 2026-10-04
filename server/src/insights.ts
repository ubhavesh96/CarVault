import type { Confidence, DocumentRecord, Insight, InsightSource, ServiceRecord, Trust, Vehicle } from './types';

/**
 * Maintenance & records insights.
 *
 * Deliberately rule-based and grounded in the vehicle's own records: every insight cites its
 * source, states an assumption where an interval is generic, and never claims a component
 * is defective. Intervals below are TYPICAL values and must be confirmed against the
 * manufacturer schedule for the specific vehicle.
 */

export const INTERVALS = {
  serviceKm: 15000,
  serviceMonths: 12,
  brakeFluidMonths: 24,
  inspectionFreshMonths: 6,
  inspectionStaleMonths: 12,
  tyreReviewKm: 25000,
  expiryWarnDays: 60,
  mileageStaleDays: 30,
};

const DAY = 86_400_000;
export const monthsBetween = (from: string | Date, to: Date = new Date()) =>
  (to.getTime() - new Date(from).getTime()) / (DAY * 30.4375);
export const daysUntil = (date: string, from: Date = new Date()) =>
  Math.ceil((new Date(date).getTime() - from.getTime()) / DAY);

const fmtKm = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
const has = (r: ServiceRecord, re: RegExp) =>
  re.test(r.title) || r.workPerformed.some((w) => re.test(w)) || r.parts.some((p) => re.test(p.name));
const byDateDesc = (a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date);

const svcSource = (r: ServiceRecord, what = 'Service record'): InsightSource => ({
  kind: 'service', id: r.id, label: `${what} · ${fmtDate(r.date)}`,
});
const docSource = (d: DocumentRecord, what: string): InsightSource => ({ kind: 'document', id: d.id, label: `${what} document · ${d.fileName}` });

/** Confidence is a rule, not a model guess. */
function confidence(sourceTrust: Trust | undefined, usesTypicalInterval: boolean): { level: Confidence; reason: string } {
  if (!sourceTrust || sourceTrust === 'unknown') return { level: 'low', reason: 'No supporting record on file.' };
  if (sourceTrust !== 'verified') return { level: 'low', reason: 'Based on an owner-entered record, not a source document.' };
  if (usesTypicalInterval) return { level: 'medium', reason: 'Verified record, compared against a typical interval rather than the manufacturer schedule.' };
  return { level: 'high', reason: 'Read directly from a verified document.' };
}

type Base = Pick<Insight, 'id' | 'category' | 'title'>;
const unknown = (b: Base, headline: string, why: string, caveat?: string): Insight => ({
  ...b, status: 'unknown', headline, detail: 'No record on file', metric: 'Unknown', facts: [],
  summary: headline, why, evidence: [], trust: 'unknown', caveat,
  confidence: { level: 'low', reason: 'No supporting record on file.' },
});

export function computeInsights(vehicle: Vehicle, services: ServiceRecord[], documents: DocumentRecord[]): Insight[] {
  const out: Insight[] = [];
  const recs = [...services].sort(byDateDesc);
  const docs = documents.filter((d) => d.status === 'confirmed');

  // 1. Scheduled service ---------------------------------------------------------------
  const lastService = recs.find((r) => r.category === 'service' && has(r, /oil|service/i));
  const svcBase: Base = { id: 'ins_service', category: 'maintenance', title: 'Scheduled service' };
  if (!lastService) {
    out.push(unknown(svcBase, 'No service record found.', 'CarVault has no service invoice for this vehicle yet.', 'Upload service invoices to build the history.'));
  } else {
    const km = vehicle.mileage - lastService.mileage;
    const mo = monthsBetween(lastService.date);
    const kmLeft = INTERVALS.serviceKm - km;
    const moLeft = INTERVALS.serviceMonths - mo;
    const status = km >= INTERVALS.serviceKm || mo >= INTERVALS.serviceMonths ? 'due'
      : kmLeft <= 3000 || moLeft <= 2 ? 'upcoming' : 'ok';
    const remaining = `~${fmtKm(Math.max(kmLeft, 0))} or ${plural(Math.max(Math.round(moLeft), 0), 'month')}`;
    out.push({
      ...svcBase,
      status,
      headline: status === 'due' ? 'Scheduled service is due.' : status === 'upcoming' ? 'Scheduled service is approaching.' : 'Next service is not yet due.',
      detail: `${fmtKm(km)} · ${plural(Math.round(mo), 'month')} since last service`,
      metric: status === 'due' ? 'Due' : `~${fmtKm(Math.max(kmLeft, 0))}`,
      facts: [
        { label: 'Last service', value: `${fmtDate(lastService.date)} · ${fmtKm(lastService.mileage)}` },
        { label: 'Typical interval', value: `${fmtKm(INTERVALS.serviceKm)} / ${INTERVALS.serviceMonths} months` },
        ...(status === 'due' ? [] : [{ label: 'Remaining', value: remaining }]),
      ],
      source: svcSource(lastService),
      confidence: confidence(lastService.trust, true),
      summary: `${fmtKm(km)} and ${plural(Math.round(mo), 'month')} since the last service. ${status === 'due' ? 'The typical interval has been reached.' : `Roughly ${remaining} remain on a typical interval, whichever comes first.`}`,
      why: `Last recorded service: "${lastService.title}" on ${fmtDate(lastService.date)} at ${fmtKm(lastService.mileage)}. Current mileage is ${fmtKm(vehicle.mileage)}.`,
      evidence: [`Service record ${fmtDate(lastService.date)}`, `Mileage ${fmtKm(vehicle.mileage)}`],
      trust: 'ai',
      caveat: `Assumes a typical ${fmtKm(INTERVALS.serviceKm)} / ${INTERVALS.serviceMonths}-month interval. Confirm against the manufacturer service schedule for this exact vehicle.`,
    });
  }

  // 2. Brake fluid ---------------------------------------------------------------------
  const lastBrakeFluid = recs.find((r) => has(r, /brake fluid/i));
  const bfBase: Base = { id: 'ins_brakefluid', category: 'maintenance', title: 'Brake fluid' };
  if (!lastBrakeFluid) {
    out.push(unknown(bfBase, 'No brake fluid change on record.', 'None of the uploaded records mention a brake fluid change.', 'It may have been done without a record. Ask your workshop before assuming either way.'));
  } else {
    const mo = Math.round(monthsBetween(lastBrakeFluid.date));
    const status = mo >= INTERVALS.brakeFluidMonths ? 'due' : mo >= INTERVALS.brakeFluidMonths - 3 ? 'upcoming' : 'ok';
    out.push({
      ...bfBase,
      status,
      headline: status === 'due' ? 'Brake fluid appears overdue.' : status === 'upcoming' ? 'Brake fluid change is approaching.' : 'Brake fluid is within its typical interval.',
      detail: `${plural(mo, 'month')} since replacement`,
      metric: status === 'due' ? 'Due' : `${plural(Math.max(INTERVALS.brakeFluidMonths - mo, 0), 'month')}`,
      facts: [
        { label: 'Last replaced', value: `${fmtDate(lastBrakeFluid.date)} · ${fmtKm(lastBrakeFluid.mileage)}` },
        { label: 'Typical interval', value: `~${INTERVALS.brakeFluidMonths} months` },
      ],
      source: svcSource(lastBrakeFluid),
      confidence: confidence(lastBrakeFluid.trust, true),
      summary: `Last replaced ${plural(mo, 'month')} ago (${fmtDate(lastBrakeFluid.date)}). Brake fluid is commonly renewed about every ${INTERVALS.brakeFluidMonths} months.`,
      why: 'Brake fluid absorbs moisture over time, which reduces braking performance under heavy use. It is usually replaced on a time interval regardless of mileage.',
      evidence: [`Service record ${fmtDate(lastBrakeFluid.date)}`],
      trust: 'ai',
      caveat: 'Typical interval, not a diagnosis. A workshop can test the fluid.',
    });
  }

  // 3. Tyres ---------------------------------------------------------------------------
  const lastTyres = recs.find((r) => r.category === 'tyres');
  const latestInspection = recs.find((r) => r.category === 'inspection');
  const tyreNote = recs.find((r) => r.notes && /tyre|tread/i.test(r.notes) && /wear|tread/i.test(r.notes) && r.category !== 'tyres');
  const tyBase: Base = { id: 'ins_tyres', category: 'maintenance', title: 'Front tyres' };
  if (!lastTyres) {
    out.push(unknown({ ...tyBase, title: 'Tyres' }, 'No tyre replacement on record.', 'No tyre invoice has been uploaded.'));
  } else {
    const km = vehicle.mileage - lastTyres.mileage;
    const noted = !!tyreNote && tyreNote.date >= lastTyres.date;
    const status = noted ? 'attention' : km >= INTERVALS.tyreReviewKm ? 'upcoming' : 'ok';
    out.push({
      ...tyBase,
      title: /front/i.test(lastTyres.title) ? 'Front tyres' : 'Tyres',
      status,
      headline: noted ? 'Inspection indicates increasing tread wear.' : status === 'upcoming' ? 'Tyres are due a check.' : 'No tyre wear concern on record.',
      detail: noted ? 'Latest inspection noted increasing wear' : `${fmtKm(km)} since replacement`,
      metric: status === 'attention' ? 'Check' : status === 'upcoming' ? 'Check soon' : 'Good',
      facts: [
        { label: 'Replaced', value: `${fmtDate(lastTyres.date)} · ${fmtKm(lastTyres.mileage)}` },
        { label: 'Distance since', value: fmtKm(km) },
        ...(noted ? [{ label: 'Inspection', value: fmtDate(tyreNote!.date) }] : []),
      ],
      source: noted ? svcSource(tyreNote!, 'Inspection') : svcSource(lastTyres, 'Tyre invoice'),
      confidence: noted ? confidence(tyreNote!.trust, false) : confidence(lastTyres.trust, true),
      summary: noted
        ? `Front tyres were replaced ${fmtKm(km)} ago and the latest inspection recorded increasing tread wear. Worth checking before a long drive.`
        : `Tyres last replaced ${fmtKm(km)} ago. No wear concern is recorded.`,
      why: noted
        ? `The inspection on ${fmtDate(tyreNote!.date)} noted: "${tyreNote!.notes}"`
        : `Last tyre record: "${lastTyres.title}" on ${fmtDate(lastTyres.date)}.`,
      evidence: [`Tyre record ${fmtDate(lastTyres.date)}`, ...(noted ? [`Inspection ${fmtDate(tyreNote!.date)}`] : [])],
      trust: 'ai',
      caveat: 'CarVault cannot see the tyres. This is a prompt to have them measured, not a finding that they are worn out.',
    });
  }

  // 4. Inspection freshness (resale-relevant) --------------------------------------------
  const inBase: Base = { id: 'ins_inspection', category: 'resale', title: 'Inspection report' };
  if (!latestInspection) {
    out.push(unknown(inBase, 'No inspection report on file.', 'Buyers usually look for a recent independent inspection.'));
  } else {
    const mo = Math.round(monthsBetween(latestInspection.date));
    const status = mo >= INTERVALS.inspectionStaleMonths ? 'due' : mo >= INTERVALS.inspectionFreshMonths ? 'upcoming' : 'ok';
    out.push({
      ...inBase,
      status,
      headline: status === 'ok' ? 'Inspection is current.' : status === 'upcoming' ? `Inspection is ${plural(mo, 'month')} old.` : 'Inspection is out of date.',
      detail: status === 'ok' ? `${plural(mo, 'month')} old` : 'A fresh inspection helps a buyer evaluate the car',
      metric: `${mo} mo`,
      facts: [
        { label: 'Last inspection', value: `${fmtDate(latestInspection.date)} · ${fmtKm(latestInspection.mileage)}` },
        { label: 'Driven since', value: fmtKm(vehicle.mileage - latestInspection.mileage) },
      ],
      source: svcSource(latestInspection, 'Inspection'),
      confidence: confidence(latestInspection.trust, true),
      summary: status === 'ok'
        ? `Latest inspection is ${plural(mo, 'month')} old.`
        : `Latest inspection is ${plural(mo, 'month')} old. A fresh one would make the vehicle easier for a buyer to evaluate.`,
      why: `Most recent inspection: ${fmtDate(latestInspection.date)} at ${fmtKm(latestInspection.mileage)}, ${fmtKm(vehicle.mileage - latestInspection.mileage)} ago.`,
      evidence: [`Inspection ${fmtDate(latestInspection.date)}`],
      trust: 'ai',
      caveat: `Freshness thresholds (${INTERVALS.inspectionFreshMonths}/${INTERVALS.inspectionStaleMonths} months) are a working assumption to validate with buyers and dealers.`,
    });
  }

  // 5. Insurance & registration expiry -------------------------------------------------
  for (const [type, title] of [['insurance', 'Insurance'], ['registration', 'Registration']] as const) {
    const base: Base = { id: `ins_${type}`, category: 'protection', title };
    const doc = docs.filter((d) => d.type === type && d.expiresOn).sort((a, b) => (b.expiresOn! > a.expiresOn! ? 1 : -1))[0];
    if (!doc) {
      out.push(unknown(base, `No ${title.toLowerCase()} expiry on file.`, `Upload the ${title.toLowerCase()} document so CarVault can track renewal.`));
      continue;
    }
    const days = daysUntil(doc.expiresOn!);
    const status = days < 0 ? 'due' : days <= INTERVALS.expiryWarnDays ? 'attention' : 'ok';
    out.push({
      ...base,
      status,
      headline: days < 0 ? `${title} has expired.` : `${title} expires in ${plural(days, 'day')}.`,
      detail: days < 0 ? `Expired ${fmtDate(doc.expiresOn!)}` : `Valid until ${fmtDate(doc.expiresOn!)}`,
      metric: days < 0 ? 'Expired' : `${plural(days, 'day')}`,
      facts: [{ label: 'Valid until', value: fmtDate(doc.expiresOn!) }],
      source: docSource(doc, title),
      confidence: confidence(doc.trust, false),
      summary: days < 0 ? `Expired ${plural(-days, 'day')} ago (${fmtDate(doc.expiresOn!)}).` : `Expires in ${plural(days, 'day')} (${fmtDate(doc.expiresOn!)}).`,
      why: `Expiry date read from ${doc.fileName}.`,
      evidence: [`${title} document`],
      trust: doc.trust,
    });
  }

  // 6. Warranty presence ---------------------------------------------------------------
  const warranty = docs.find((d) => d.type === 'warranty');
  const wBase: Base = { id: 'ins_warranty', category: 'protection', title: 'Warranty' };
  if (!warranty) {
    out.push(unknown(wBase, 'Warranty status unknown.', 'Add the warranty booklet or extended-warranty certificate if there is one.'));
  } else {
    out.push({
      ...wBase, status: 'ok', headline: 'Warranty document on file.', detail: warranty.summary,
      metric: warranty.expiresOn ? fmtDate(warranty.expiresOn) : 'On file',
      facts: warranty.expiresOn ? [{ label: 'Valid until', value: fmtDate(warranty.expiresOn) }] : [],
      source: docSource(warranty, 'Warranty'), confidence: confidence(warranty.trust, false),
      summary: warranty.summary, why: `From ${warranty.fileName}.`, evidence: ['Warranty document'], trust: warranty.trust,
    });
  }

  // 7. History gaps --------------------------------------------------------------------
  const svcOnly = recs.filter((r) => r.category === 'service').sort((a, b) => a.date.localeCompare(b.date));
  const gaps: string[] = [];
  for (let i = 1; i < svcOnly.length; i++) {
    const m = monthsBetween(svcOnly[i - 1].date, new Date(svcOnly[i].date));
    const km = svcOnly[i].mileage - svcOnly[i - 1].mileage;
    if (m > INTERVALS.serviceMonths + 3 || km > INTERVALS.serviceKm + 5000)
      gaps.push(`${fmtDate(svcOnly[i - 1].date)} to ${fmtDate(svcOnly[i].date)} (${fmtKm(km)})`);
  }
  const gBase: Base = { id: 'ins_gaps', category: 'records', title: 'Service history' };
  if (!svcOnly.length) {
    out.push(unknown(gBase, 'Not enough records to judge completeness.', 'Upload service invoices to check continuity.'));
  } else {
    const verified = svcOnly.every((r) => r.trust === 'verified');
    out.push({
      ...gBase,
      status: gaps.length ? 'attention' : 'ok',
      headline: gaps.length ? 'Possible gap in service history.' : 'Service history is continuous.',
      detail: gaps.length ? gaps[0] : `${svcOnly.length} scheduled services, no unexplained gaps`,
      metric: gaps.length ? `${gaps.length} gap${gaps.length > 1 ? 's' : ''}` : 'Continuous',
      facts: gaps.map((g) => ({ label: 'Gap', value: g })),
      confidence: { level: verified ? 'medium' : 'low', reason: verified ? 'All records verified; spacing compared with a typical interval.' : 'Some records are owner-entered.' },
      summary: gaps.length
        ? `Possible gap in scheduled-service records: ${gaps.join('; ')}. The work may have happened without a record being uploaded.`
        : 'No unexplained gaps between recorded scheduled services.',
      why: gaps.length ? 'Consecutive scheduled services are further apart than a typical interval plus tolerance.' : 'Checked spacing between scheduled-service records.',
      evidence: gaps,
      trust: 'ai',
      caveat: gaps.length ? 'A gap is a question, not a finding. Ask previous workshops for missing invoices.' : undefined,
    });
  }

  // 8. Mileage freshness ---------------------------------------------------------------
  const staleDays = Math.round((Date.now() - new Date(vehicle.mileageUpdatedAt).getTime()) / DAY);
  if (staleDays > INTERVALS.mileageStaleDays) {
    out.push({
      id: 'ins_mileage', category: 'records', title: 'Odometer reading', status: 'attention',
      headline: 'Odometer reading may be out of date.',
      detail: `Updated ${plural(staleDays, 'day')} ago`,
      metric: `${staleDays} days`,
      facts: [{ label: 'Last reading', value: fmtKm(vehicle.mileage) }],
      confidence: { level: 'low', reason: 'Owner-entered reading.' },
      summary: `The odometer reading was last updated ${plural(staleDays, 'day')} ago. Insights get less accurate as it ages.`,
      why: 'Service predictions use current mileage.',
      evidence: [`Mileage ${fmtKm(vehicle.mileage)}`],
      trust: 'user',
    });
  }

  const order: Record<string, number> = { due: 0, attention: 1, upcoming: 2, unknown: 3, ok: 4 };
  return out.sort((a, b) => order[a.status] - order[b.status]);
}

// ---------------------------------------------------------------------------------------

export interface HealthRow {
  label: string;
  value: string;
  /** Segmented indicator: filled of total. */
  filled: number;
  total: number;
  status: 'ok' | 'attention' | 'due' | 'unknown';
}

export interface RecordsHealth {
  completeness: number;
  coreOnFile: number;
  coreTotal: number;
  rows: HealthRow[];
  /** Kept for backwards compatibility with earlier clients. */
  parts: { label: string; score: number; note: string }[];
  attentionCount: number;
  verifiedShare: number;
}

/** "Record health": how complete and current the information is. Not a mechanical condition score. */
export function computeRecordsHealth(vehicle: Vehicle, services: ServiceRecord[], documents: DocumentRecord[], insights: Insight[]): RecordsHealth {
  const docs = documents.filter((d) => d.status === 'confirmed');
  const need = ['registration', 'insurance', 'inspection', 'warranty', 'service_invoice'] as const;
  const present = need.filter((t) => docs.some((d) => d.type === t)).length;
  const docScore = present / need.length;

  const svc = services.filter((s) => s.category === 'service');
  const yearsOwned = Math.max(1, new Date().getFullYear() - vehicle.year);
  const serviceScore = Math.min(1, svc.length / Math.max(1, yearsOwned));

  const gapIns = insights.find((i) => i.id === 'ins_gaps');
  const insp = insights.find((i) => i.id === 'ins_inspection');
  const freshness = (insp?.status === 'ok' ? 1 : insp?.status === 'upcoming' ? 0.6 : 0.2) * (gapIns?.status === 'attention' ? 0.7 : 1);

  const odoDays = Math.round((Date.now() - new Date(vehicle.mileageUpdatedAt).getTime()) / DAY);
  const odoFresh = odoDays <= INTERVALS.mileageStaleDays;

  const inspRow: HealthRow = !insp || insp.status === 'unknown'
    ? { label: 'Inspection', value: 'None on file', filled: 0, total: 5, status: 'unknown' }
    : insp.status === 'ok'
      ? { label: 'Inspection', value: 'Current', filled: 5, total: 5, status: 'ok' }
      : insp.status === 'upcoming'
        ? { label: 'Inspection', value: `Ageing · ${insp.metric}`, filled: 3, total: 5, status: 'attention' }
        : { label: 'Inspection', value: 'Out of date', filled: 1, total: 5, status: 'due' };

  const rows: HealthRow[] = [
    { label: 'Documents', value: `${present} / ${need.length}`, filled: present, total: need.length, status: present === need.length ? 'ok' : present >= 3 ? 'attention' : 'due' },
    { label: 'Service history', value: `${Math.round(serviceScore * 100)}%`, filled: Math.round(serviceScore * 5), total: 5, status: serviceScore >= 0.8 ? 'ok' : 'attention' },
    { label: 'Odometer', value: odoFresh ? (odoDays === 0 ? 'Updated today' : `Updated ${odoDays}d ago`) : `Stale · ${odoDays}d`, filled: odoFresh ? 5 : 2, total: 5, status: odoFresh ? 'ok' : 'attention' },
    inspRow,
  ];

  const verified = services.filter((s) => s.trust === 'verified').length;
  const parts = [
    { label: 'Documents on file', score: docScore, note: `${present} of ${need.length} core document types` },
    { label: 'Service coverage', score: serviceScore, note: `${svc.length} scheduled service${svc.length === 1 ? '' : 's'} over ${yearsOwned} year${yearsOwned === 1 ? '' : 's'}` },
    { label: 'Freshness', score: freshness, note: 'Inspection recency and history gaps' },
  ];
  return {
    completeness: Math.round((parts.reduce((s, p) => s + p.score, 0) / parts.length) * 100),
    coreOnFile: present,
    coreTotal: need.length,
    rows,
    parts: parts.map((p) => ({ ...p, score: Math.round(p.score * 100) })),
    attentionCount: insights.filter((i) => i.status === 'due' || i.status === 'attention').length,
    verifiedShare: services.length ? Math.round((verified / services.length) * 100) : 0,
  };
}

export interface VehicleHealth {
  /** null when the records can't support a score. */
  score: number | null;
  label: 'Healthy' | 'Needs attention' | 'Action required' | 'Not enough records';
  status: 'ok' | 'attention' | 'due' | 'unknown';
  basis: string;
  unknowns: number;
}

/** A score needs evidence: at least this many maintenance items must be known from records. */
const MIN_KNOWN_FOR_SCORE = 2;

/**
 * Maintenance status score. Derived ONLY from maintenance insights (due/attention/upcoming),
 * so it reflects what the records say is outstanding. It is not a physical condition assessment,
 * and with too few records it is withheld rather than defaulting to a perfect score.
 */
export function computeVehicleHealth(insights: Insight[]): VehicleHealth {
  const m = insights.filter((i) => i.category === 'maintenance');
  const unknowns = m.filter((i) => i.status === 'unknown').length;
  const known = m.length - unknowns;
  if (known < MIN_KNOWN_FOR_SCORE) {
    return {
      score: null,
      label: 'Not enough records',
      status: 'unknown',
      basis: 'Add service and tyre invoices to see a maintenance score.',
      unknowns,
    };
  }
  const penalty = m.reduce((s, i) => s + (i.status === 'due' ? 12 : i.status === 'attention' ? 6 : i.status === 'upcoming' ? 2 : 0), 0);
  const score = Math.max(0, 100 - penalty);
  const label = score >= 85 ? 'Healthy' : score >= 70 ? 'Needs attention' : 'Action required';
  return {
    score,
    label,
    status: label === 'Healthy' ? 'ok' : label === 'Needs attention' ? 'attention' : 'due',
    basis: unknowns
      ? `Based on maintenance status in your records (${unknowns} item${unknowns > 1 ? 's' : ''} unknown). Not a physical inspection.`
      : 'Based on maintenance status in your records. Not a physical inspection.',
    unknowns,
  };
}
