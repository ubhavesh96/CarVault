import type { DocType, DocumentRecord, ExtractedField, Organization, ServiceDraft, User } from './types';

/**
 * Official evidence.
 *
 * CarVault has no live connection to a government registry. What it can do today is take an
 * official document the owner obtained themselves (for example the RTA Technical Vehicle Status
 * Certificate, ordered on rta.ae with UAE PASS) and turn it into structured evidence. A person
 * then checks the certificate number on the issuer's own verification service, and only that
 * check upgrades the document to Verified. The check is recorded and audited; CarVault never
 * claims it contacted the issuer itself.
 */

export const OFFICIAL_ISSUER: Partial<Record<DocType, string>> = {
  rta_certificate: 'Roads & Transport Authority (RTA), Dubai',
};

/** Document types a person may verify against the issuer's own service. */
export const VERIFIABLE: DocType[] = ['rta_certificate', 'registration', 'insurance', 'inspection', 'claims_history', 'loan_release', 'ownership', 'warranty'];

/**
 * Who may record an issuer check. An owner checking their own paperwork adds nothing, so consumer
 * accounts rely on CarVault's own verification desk (platform admin). Business tenants' admins
 * may verify, and buyers see which organization did.
 */
export function canVerify(user: User, org: Organization): boolean {
  if (user.role === 'platform_admin') return true;
  const consumerOnly = org.categories.length === 1 && org.categories[0] === 'consumer';
  return user.role === 'tenant_admin' && !consumerOnly;
}

/** Odometer readings on a certificate travel as fields "odometer_1..n" with values like "2024-03-12 · 45,210 km". */
export function odometerReadings(fields: ExtractedField[]): { date: string; mileage: number; field: string }[] {
  const out: { date: string; mileage: number; field: string }[] = [];
  for (const f of fields) {
    if (!/^odometer_\d+$/.test(f.key)) continue;
    const m = /(\d{4}-\d{2}-\d{2}).*?([\d][\d,.\s]*)\s*km/i.exec(f.value);
    if (!m || Number.isNaN(Date.parse(m[1]))) continue;
    const mileage = Number(m[2].replace(/[,.\s]/g, ''));
    if (Number.isFinite(mileage)) out.push({ date: m[1], mileage, field: f.label });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Timeline entries for each odometer reading on an official certificate. */
export function certificateDrafts(doc: Pick<DocumentRecord, 'type' | 'fields'>): ServiceDraft[] {
  if (doc.type !== 'rta_certificate') return [];
  const test = doc.fields.find((f) => f.key === 'last_test_result')?.value;
  const readings = odometerReadings(doc.fields);
  return readings.map((r, i) => ({
    date: r.date, mileage: r.mileage, category: 'inspection' as const,
    title: 'RTA technical test · odometer reading',
    workshop: 'RTA Vehicle Status Certificate',
    workPerformed: ['Odometer reading recorded at the annual technical test'],
    parts: [], cost: 0,
    notes: i === readings.length - 1 && test ? `Latest test result on the certificate: ${test}.` : undefined,
  }));
}
