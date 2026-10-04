import type { DocType, DocumentRecord, ServiceRecord, TransferCheckId, Vehicle } from './types';

/**
 * UAE ownership-transfer checklist.
 *
 * Based on Dubai RTA requirements for a private used-car transfer (2026): original Emirates ID and
 * Mulkiya, valid insurance, all traffic fines paid, any car loan cleared with a bank release letter,
 * a passing technical test for cars over 3 years old, and the buyer insured in their own name.
 * Other emirates follow a similar process through their own authority; the checklist says so rather
 * than pretending the rules are identical.
 *
 * Items come from two places: documents CarVault already holds (registration, insurance, inspection,
 * loan release) and things only the seller can confirm (fines paid, Emirates ID ready). Seller
 * confirmations are labelled as such, and the fines confirmation goes stale after 7 days because
 * new fines can arrive at any time.
 */

export type TransferStatus = 'ready' | 'action' | 'recheck' | 'not_applicable';

export interface TransferItem {
  id: string;
  label: string;
  status: TransferStatus;
  detail: string;
  /** How to complete it in the UAE. */
  how: string;
  /** Where the status comes from. */
  basis: 'document' | 'seller' | 'records' | 'rule';
  /** Upload this document type to complete it. */
  docType?: DocType;
  /** The seller can tick it off: which confirmation the API accepts. */
  confirm?: { check: TransferCheckId; as: 'done' | 'not_applicable'; label: string };
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface TransferResult {
  emirate: string;
  ruleNote: string;
  items: TransferItem[];
  ready: number;
  required: number;
  complete: boolean;
}

const DAY = 86_400_000;
const FINES_FRESH_DAYS = 7;
/** Conservative window for "recent" pre-transfer test evidence; the testing centre confirms actual validity. */
const TEST_WINDOW_DAYS = 30;
const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const daysSince = (d: string) => (Date.now() - new Date(d).getTime()) / DAY;

interface Input { vehicle: Vehicle; services: ServiceRecord[]; documents: DocumentRecord[] }

/**
 * `audience: 'public'` is for buyers and partners in a data room: seller confirmations read "confirmed
 * by the seller" without naming who at the seller's side ticked them.
 */
export function computeTransfer({ vehicle: v, services, documents }: Input, audience: 'owner' | 'public' = 'owner'): TransferResult {
  const who = (by: string) => (audience === 'public' ? 'the seller' : by);
  const docs = documents.filter((d) => d.status === 'confirmed');
  const latest = (t: DocType) => docs.filter((d) => d.type === t && d.expiresOn).sort((a, b) => b.expiresOn!.localeCompare(a.expiresOn!))[0];
  const checks = v.transferChecks ?? {};
  const items: TransferItem[] = [];

  // Registration (Mulkiya) ---------------------------------------------------------------
  const reg = latest('registration');
  const regValid = !!reg && new Date(reg.expiresOn!).getTime() > Date.now();
  items.push({
    id: 'registration', label: 'Registration card (Mulkiya) valid', basis: 'document', docType: 'registration',
    status: regValid ? 'ready' : 'action',
    detail: regValid ? `Valid until ${fdate(reg!.expiresOn!)}.` : reg ? 'The registration on file has expired.' : 'No registration card on file.',
    how: 'The seller brings the original Mulkiya. An expired registration has to be renewed before the car can be transferred.',
  });

  // Seller's insurance --------------------------------------------------------------------
  const ins = latest('insurance');
  const insValid = !!ins && new Date(ins.expiresOn!).getTime() > Date.now();
  items.push({
    id: 'insurance', label: 'Seller\'s insurance valid', basis: 'document', docType: 'insurance',
    status: insValid ? 'ready' : 'action',
    detail: insValid ? `Current until ${fdate(ins!.expiresOn!)}.` : 'No current insurance policy on file.',
    how: 'The car must be insured in the seller\'s name up to the transfer.',
  });

  // Traffic fines -------------------------------------------------------------------------
  const fines = checks.fines;
  const finesAge = fines ? daysSince(fines.at) : Infinity;
  items.push({
    id: 'fines', label: 'Traffic fines paid', basis: 'seller',
    status: !fines ? 'action' : finesAge <= FINES_FRESH_DAYS ? 'ready' : 'recheck',
    detail: !fines ? 'Not yet confirmed by the seller.'
      : finesAge <= FINES_FRESH_DAYS ? `Confirmed clear by ${who(fines.by)} on ${fdate(fines.at)}.`
        : `Last confirmed ${fdate(fines.at)}. New fines can arrive at any time, so check again within ${FINES_FRESH_DAYS} days of the transfer.`,
    how: 'Look up and pay fines by plate number in the RTA, Dubai Police or MOI UAE app. Ownership can\'t be transferred while fines are outstanding.',
    confirm: { check: 'fines', as: 'done', label: 'I checked: no fines outstanding' },
    confirmedBy: fines?.by, confirmedAt: fines?.at,
  });

  // Car loan ------------------------------------------------------------------------------
  const release = docs.filter((d) => d.type === 'loan_release').sort((a, b) => (b.issuedOn ?? b.uploadedAt).localeCompare(a.issuedOn ?? a.uploadedAt))[0];
  const noLoan = checks.loan?.status === 'not_applicable' ? checks.loan : undefined;
  items.push({
    id: 'loan', label: 'No car loan, or loan cleared', basis: release ? 'document' : 'seller', docType: 'loan_release',
    status: release || noLoan ? 'ready' : 'action',
    detail: release ? `Bank clearance letter on file${release.issuedOn ? `, dated ${fdate(release.issuedOn)}` : ''}.`
      : noLoan ? audience === 'public' ? `Seller confirmed the car was never financed (${fdate(noLoan.at)}).` : `Seller confirmed the car was never financed (${noLoan.by}, ${fdate(noLoan.at)}).`
        : 'Not yet known whether the car is financed.',
    how: 'If the car was financed, settle the loan and get a clearance (release) letter from the bank; the bank also lifts the mortgage on the registration.',
    confirm: release ? undefined : { check: 'loan', as: 'not_applicable', label: 'This car has no loan' },
    confirmedBy: noLoan?.by, confirmedAt: noLoan?.at,
  });

  // Technical test ------------------------------------------------------------------------
  const ageYears = new Date().getFullYear() - v.year;
  const lastTest = services.filter((s) => s.category === 'inspection').sort((a, b) => b.date.localeCompare(a.date))[0];
  const testRecent = !!lastTest && daysSince(lastTest.date) <= TEST_WINDOW_DAYS;
  items.push({
    id: 'test', label: 'Technical test passed', basis: ageYears > 3 ? 'records' : 'rule', docType: 'inspection',
    status: ageYears <= 3 ? 'not_applicable' : testRecent ? 'ready' : 'action',
    detail: ageYears <= 3 ? `Not required: the car is ${Math.max(0, ageYears)} year${ageYears === 1 ? '' : 's'} old (Dubai requires a test for cars over 3 years).`
      : testRecent ? `Test or inspection recorded on ${fdate(lastTest!.date)}.`
        : lastTest ? `Latest test on file is from ${fdate(lastTest.date)}. Plan a new test close to the transfer date.` : 'No recent test on file.',
    how: `Cars over 3 years old need a passing test at an RTA-approved centre (such as Tasjeel or Shamil) unless the current test is still valid. CarVault counts a test from the last ${TEST_WINDOW_DAYS} days; the centre confirms validity.`,
  });

  // Seller's Emirates ID ------------------------------------------------------------------
  const sid = checks.seller_id;
  items.push({
    id: 'seller_id', label: 'Seller\'s original Emirates ID ready', basis: 'seller',
    status: sid ? 'ready' : 'action',
    detail: sid ? `Confirmed by ${who(sid.by)} on ${fdate(sid.at)}.` : 'Not yet confirmed.',
    how: 'Both parties attend the transfer with their original Emirates ID. CarVault never stores the ID number.',
    confirm: { check: 'seller_id', as: 'done', label: 'Emirates ID is ready' },
    confirmedBy: sid?.by, confirmedAt: sid?.at,
  });

  // Buyer's insurance ---------------------------------------------------------------------
  const bi = checks.buyer_insurance;
  items.push({
    id: 'buyer_insurance', label: 'Buyer has insurance in their name', basis: 'seller',
    status: bi ? 'ready' : 'action',
    detail: bi ? `Confirmed by ${who(bi.by)} on ${fdate(bi.at)}.` : 'Ask the buyer to arrange cover before the transfer appointment.',
    how: 'The buyer needs a policy in their own name for the new registration.',
    confirm: { check: 'buyer_insurance', as: 'done', label: 'Buyer confirmed their insurance' },
    confirmedBy: bi?.by, confirmedAt: bi?.at,
  });

  const emirate = v.emirate?.trim() || 'Dubai';
  const isDubai = /dubai/i.test(emirate);
  const required = items.filter((i) => i.status !== 'not_applicable');
  const ready = required.filter((i) => i.status === 'ready').length;
  return {
    emirate,
    ruleNote: isDubai
      ? 'Based on Dubai RTA transfer requirements. Final transfer is completed with the RTA, with both parties present or through its digital channels.'
      : `Based on Dubai RTA requirements. ${emirate} follows a similar process through its own licensing authority${/abu dhabi/i.test(emirate) ? ' (ITC, via the TAMM platform)' : ''}; confirm the details there.`,
    items, ready, required: required.length, complete: ready === required.length,
  };
}
