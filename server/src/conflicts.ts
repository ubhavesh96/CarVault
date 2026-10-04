import type { ExtractedField, ServiceDraft, ServiceRecord, Vehicle } from './types';

const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;

/**
 * Flags inconsistencies instead of silently picking a value.
 * `existing` must exclude the record being checked.
 */
export function detectConflicts(
  vehicle: Vehicle,
  draft: ServiceDraft | undefined,
  fields: ExtractedField[],
  existing: ServiceRecord[],
): string[] {
  const out: string[] = [];

  const vin = fields.find((f) => f.key === 'vin')?.value?.trim();
  if (vin && vehicle.vin && vin.toUpperCase() !== vehicle.vin.toUpperCase())
    out.push(`VIN on this document (${vin}) does not match the vehicle's VIN (${vehicle.vin}). It may belong to a different car.`);

  if (!draft) return out;

  if (Number.isNaN(Date.parse(draft.date))) {
    out.push('The document date could not be read as a valid date.');
    return out;
  }
  if (new Date(draft.date).getTime() > Date.now() + 86_400_000)
    out.push(`Date ${fdate(draft.date)} is in the future.`);

  if (draft.mileage > vehicle.mileage)
    out.push(`Mileage on this document (${km(draft.mileage)}) is higher than the vehicle's current odometer (${km(vehicle.mileage)}). One of them is wrong.`);

  const dupe = existing.find((r) => r.date === draft.date && r.mileage === draft.mileage);
  if (dupe) out.push(`A record already exists for ${fdate(draft.date)} at ${km(draft.mileage)} ("${dupe.title}"). This may be a duplicate.`);

  const before = existing.filter((r) => r.date < draft.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const after = existing.filter((r) => r.date > draft.date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (before && before.mileage > draft.mileage)
    out.push(`Mileage ${km(draft.mileage)} is lower than an earlier record (${km(before.mileage)} on ${fdate(before.date)}). Odometer readings should not go down.`);
  if (after && after.mileage < draft.mileage)
    out.push(`Mileage ${km(draft.mileage)} is higher than a later record (${km(after.mileage)} on ${fdate(after.date)}).`);

  return out;
}
