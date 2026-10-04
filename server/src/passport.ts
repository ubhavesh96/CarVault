import type { DocumentRecord, ServiceRecord, Trust, Vehicle } from './types';
import type { ConfidenceResult, ResaleResult } from './confidence';
import { estimateValue } from './value';
import { createHash } from 'crypto';

/** Stable, human-readable passport number derived from the vehicle id. */
const passportNo = (id: string) => {
  const h = createHash('sha256').update(id).digest('hex').toUpperCase();
  return `CV-${h.slice(0, 4)}-${h.slice(4, 8)}`;
};

export interface PassportField {
  label: string;
  value: string;
  trust: Trust;
  /** Where this fact comes from. */
  source?: string;
}

const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Options {
  confidence: ConfidenceResult;
  resale: ResaleResult | null;
  photoUrl: string | null;
  /** Co-branding: the issuing organization, when it opted in. CarVault attribution always remains. */
  issuer: { name: string } | null;
}

/** Owner-shareable summary. Anything CarVault cannot support with a record is listed as unknown, never guessed. */
export function buildPassport(vehicle: Vehicle, services: ServiceRecord[], documents: DocumentRecord[], opts: Options) {
  const recs = [...services].sort((a, b) => a.date.localeCompare(b.date));
  const docs = documents.filter((d) => d.status === 'confirmed');
  const verified = recs.filter((r) => r.trust === 'verified' || r.trust === 'imported').length;
  const reg = docs.filter((d) => d.type === 'registration').sort((a, b) => (b.issuedOn ?? '').localeCompare(a.issuedOn ?? ''))[0];
  const strength: Partial<Record<Trust, number>> = { verified: 3, imported: 2, user: 1 };
  const vinDoc = docs.filter((d) => d.fields.some((f) => f.key === 'vin' && f.value.toUpperCase() === vehicle.vin.toUpperCase()))
    .sort((a, b) => (strength[b.trust] ?? 0) - (strength[a.trust] ?? 0))[0];
  const ownershipDocs = docs.filter((d) => d.type === 'ownership' || d.type === 'rta_certificate');
  const loanCleared = docs.some((d) => d.type === 'loan_release') || vehicle.transferChecks?.loan?.status === 'not_applicable';
  const claims = docs.find((d) => d.type === 'claims_history');
  const conf = opts.confidence;
  const mileageDim = conf.dimensions.find((d) => d.id === 'mileage')!;

  const identity: PassportField[] = [
    { label: 'Make', value: vehicle.make, trust: 'user', source: 'Vehicle record' },
    { label: 'Model', value: `${vehicle.model} ${vehicle.variant}`.trim(), trust: 'user', source: 'Vehicle record' },
    { label: 'Year', value: String(vehicle.year), trust: 'user', source: 'Vehicle record' },
    {
      label: 'VIN', value: vehicle.vin || 'Not provided',
      trust: !vehicle.vin ? 'unknown' : vinDoc ? vinDoc.trust : 'user',
      source: vinDoc ? `${vinDoc.fileName}` : vehicle.vin ? 'Entered by owner' : undefined,
    },
    {
      label: 'Mileage', value: `${vehicle.mileage.toLocaleString('en-US')} km`, trust: 'user',
      source: `Owner-reported · ${mileageDim.evidence.length} dated record${mileageDim.evidence.length === 1 ? '' : 's'} (confidence ${mileageDim.score}%)`,
    },
  ];
  if (vehicle.plate) identity.push({ label: 'Registration', value: `${vehicle.emirate ?? ''} ${vehicle.plate}`.trim(), trust: reg ? reg.trust : 'user', source: reg ? reg.fileName : 'Entered by owner' });
  if (reg?.expiresOn) identity.push({ label: 'Registration valid until', value: fdate(reg.expiresOn), trust: reg.trust, source: reg.fileName });
  if (vehicle.color) identity.push({ label: 'Colour', value: vehicle.color, trust: 'user', source: 'Vehicle record' });
  if (vehicle.spec) identity.push({ label: 'Specification', value: vehicle.spec, trust: 'user', source: 'Vehicle record' });

  const ownershipTimeline = [
    ...ownershipDocs.map((d) => {
      const owners = d.fields.find((f) => f.key === 'owners')?.value;
      return {
        date: d.issuedOn ?? d.uploadedAt.slice(0, 10),
        event: d.type === 'rta_certificate' ? 'RTA Vehicle Status Certificate' : 'Ownership record',
        detail: [d.fields.find((f) => f.key === 'issuer')?.value ?? d.fileName, owners && `${owners} registered owner${owners === '1' ? '' : 's'} to date`].filter(Boolean).join(' · '),
        trust: d.trust,
      };
    }),
    ...(reg ? [{ date: reg.issuedOn ?? reg.uploadedAt.slice(0, 10), event: 'Current registration', detail: reg.fileName, trust: reg.trust }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const unknowns: string[] = [];
  if (!docs.some((d) => d.type === 'inspection') && !recs.some((r) => r.category === 'inspection')) unknowns.push('Independent inspection result');
  if (!docs.some((d) => d.type === 'warranty')) unknowns.push('Warranty status');
  if (!ownershipDocs.length) unknowns.push('Previous owners and ownership history');
  if (!claims) unknowns.push('Accident and claims history');
  if (!loanCleared) unknowns.push('Outstanding finance or liens');
  unknowns.push('Original specification and factory options', 'Live UAE market comparables');

  const value = estimateValue(vehicle);

  return {
    generatedAt: new Date().toISOString(),
    passportNo: passportNo(vehicle.id),
    issuer: opts.issuer,
    vehicle: {
      id: vehicle.id,
      title: `${vehicle.make} ${vehicle.model} ${vehicle.variant}`.trim(),
      subtitle: [String(vehicle.year), vehicle.chassis, vehicle.spec && `${vehicle.spec} spec`].filter(Boolean).join(' · '),
      location: vehicle.emirate ? `${vehicle.emirate}, UAE` : undefined,
      make: vehicle.make,
      model: vehicle.model,
      photoUpdatedAt: vehicle.photo?.updatedAt,
      photoUrl: opts.photoUrl,
      photoKind: vehicle.photo?.kind,
      photoCredit: vehicle.photo?.kind === 'reference' ? vehicle.photo.credit : undefined,
    },
    identity,
    confidence: {
      score: conf.score, level: conf.level, verifiedRecords: conf.verifiedRecords, sources: conf.sources, gaps: conf.gaps,
      dimensions: conf.dimensions.map((d) => ({ id: d.id, label: d.label, score: d.score, level: d.level, sources: d.sources, lastVerified: d.lastVerified, evidenceCount: d.evidence.length })),
    },
    resale: opts.resale ? { score: opts.resale.score, level: opts.resale.level, summary: opts.resale.summary, ready: opts.resale.items.filter((i) => i.ready).map((i) => i.label), attention: opts.resale.items.filter((i) => !i.ready).map((i) => i.label) } : null,
    ownershipTimeline,
    summary: {
      records: recs.length,
      documents: docs.length,
      verifiedRecords: verified,
      totalSpend: recs.reduce((s, r) => s + r.cost, 0),
      firstRecord: recs[0]?.date,
      lastRecord: recs[recs.length - 1]?.date,
    },
    serviceHistory: recs.map((r) => ({
      id: r.id, date: r.date, mileage: r.mileage, category: r.category, title: r.title, workshop: r.workshop,
      workPerformed: r.workPerformed, parts: r.parts, cost: r.cost, notes: r.notes, trust: r.trust, importedFrom: r.importedFrom,
    })),
    partsHistory: recs.flatMap((r) => r.parts.map((p) => ({ date: r.date, name: p.name, partNo: p.partNo, record: r.title, trust: r.trust }))),
    mileageTimeline: recs.map((r) => ({ date: r.date, mileage: r.mileage })),
    documents: docs.map((d) => ({
      id: d.id, type: d.type, fileName: d.fileName, issuedOn: d.issuedOn, expiresOn: d.expiresOn, trust: d.trust,
      // Buyers see who checked it with the issuer and when; the reference number stays with the owner.
      verifiedWithIssuer: d.verification ? { by: d.verification.checkedByOrg, at: d.verification.checkedAt } : undefined,
    })),
    estimatedValue: value.available ? { low: value.low, mid: value.mid, high: value.high, method: value.method } : null,
    unknowns,
    notice:
      'Built from records uploaded or connected by the owner. Every fact shows its source: Verified (read from a source document), User provided, Imported (from a connected system), CarVault Insight (interpretation), or Conflict. CarVault does not physically inspect vehicles.',
  };
}
