import type { DocType, Level, ServiceCategory, Trust } from './types';

export const fmtKm = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;
export const fmtAED = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`;
export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
export const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
export const monthsSince = (d: string) => Math.round((Date.now() - new Date(d).getTime()) / (30.44 * 86_400_000));

export const CATEGORY_LABEL: Record<ServiceCategory, string> = {
  service: 'Service', repair: 'Repair', tyres: 'Tyres', brakes: 'Brakes', inspection: 'Inspection', other: 'Other',
};
export const DOC_LABEL: Record<DocType, string> = {
  service_invoice: 'Service invoice', insurance: 'Insurance', registration: 'Registration', inspection: 'Inspection report',
  warranty: 'Warranty', parts_invoice: 'Parts invoice', tyre_invoice: 'Tyre invoice', ownership: 'Ownership record',
  claims_history: 'Claims history', rta_certificate: 'RTA Vehicle Status Certificate', loan_release: 'Loan clearance letter',
  other: 'Other',
};

/** The data trust model. AI interpretation is never styled like verified evidence. */
export const TRUST_LABEL: Record<Trust, string> = {
  verified: 'Verified', user: 'User provided', imported: 'Imported', ai: 'CarVault Insight', estimated: 'Estimated',
  unverified: 'Unverified', conflict: 'Conflict', unknown: 'Unknown',
};
export const TRUST_HELP: Record<Trust, string> = {
  verified: 'Source-backed: read from a document.',
  user: 'Entered or uploaded by a person, not yet backed by a source document.',
  imported: 'Obtained from a connected system.',
  ai: 'Interpretation by CarVault based on the available evidence. The source is always shown.',
  estimated: 'A model-based estimate, not a confirmed fact.',
  unverified: 'Awaiting review and confirmation.',
  conflict: 'Contradicts other evidence. Check it against the source.',
  unknown: 'No evidence on file.',
};

export const LEVEL_LABEL: Record<Level, string> = { high: 'High confidence', moderate: 'Moderate confidence', low: 'Low confidence' };
export const LEVEL_SHORT: Record<Level, string> = { high: 'High', moderate: 'Moderate', low: 'Low' };
/** Level → status class used by badges (s-ok / s-attention / s-due). */
export const LEVEL_STATUS: Record<Level, 'ok' | 'attention' | 'due'> = { high: 'ok', moderate: 'attention', low: 'due' };
