import type { DB, DocumentRecord, ServiceRecord, ServiceDraft, DocType, ExtractedField } from './types';
import { seedTenants, OWNER_ORG_ID } from './seedTenants';

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Date `months` months (and optional extra days) before today. */
function ago(months: number, days = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setDate(d.getDate() - days);
  return iso(d);
}
function ahead(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
}

const VID = 'veh_m5';

const f = (key: string, label: string, value: string, confidence = 0.97): ExtractedField => ({
  key,
  label,
  value,
  confidence,
});

interface SeedService extends ServiceDraft {
  file: string;
}

// Sample data only. Workshop names are placeholders, not real businesses.
const seedServices: SeedService[] = [
  {
    date: ago(48),
    mileage: 9800,
    category: 'service',
    title: 'First service - engine oil & filter',
    workshop: 'Sample BMW Authorised Service Centre, Al Quoz',
    workPerformed: ['Engine oil and filter change', 'Multi-point inspection', 'Brake and tyre check'],
    parts: [
      { name: 'Engine oil 5W-30 LL-01 FE (x8L)' },
      { name: 'Oil filter element', partNo: '11428507683' },
    ],
    cost: 1850,
    file: 'invoice-first-service.pdf',
  },
  {
    date: ago(36),
    mileage: 21400,
    category: 'service',
    title: 'Oil service + brake fluid flush',
    workshop: 'Sample BMW Authorised Service Centre, Al Quoz',
    workPerformed: ['Engine oil and filter change', 'Brake fluid replaced', 'Cabin microfilter replaced'],
    parts: [
      { name: 'Engine oil 5W-30 (x8L)' },
      { name: 'Oil filter element' },
      { name: 'Brake fluid DOT4 LV (x1L)' },
      { name: 'Cabin microfilter' },
    ],
    cost: 2950,
    file: 'invoice-oil-brakefluid.pdf',
  },
  {
    date: ago(28),
    mileage: 25600,
    category: 'repair',
    title: 'Battery replacement',
    workshop: 'Sample German Auto Specialist, Al Quoz',
    workPerformed: ['Battery tested and replaced', 'Battery registered / coded to vehicle'],
    parts: [{ name: 'AGM battery 90Ah' }],
    cost: 1650,
    file: 'invoice-battery.pdf',
  },
  {
    date: ago(22),
    mileage: 29000,
    category: 'service',
    title: 'Oil service',
    workshop: 'Sample German Auto Specialist, Al Quoz',
    workPerformed: ['Engine oil and filter change', 'Air filter inspection'],
    parts: [{ name: 'Engine oil 5W-30 (x8L)' }, { name: 'Oil filter element' }],
    cost: 1780,
    file: 'invoice-oil-service-2.pdf',
  },
  {
    date: ago(21),
    mileage: 30200,
    category: 'tyres',
    title: 'Front tyres replaced',
    workshop: 'Sample Tyre Centre, Dubai Investment Park',
    workPerformed: ['Front axle tyres replaced', 'Wheel balancing', 'Four-wheel alignment'],
    parts: [{ name: 'Front tyres 275/35 R20 (x2)' }],
    cost: 4900,
    notes: 'Rear tyres not replaced at this visit.',
    file: 'invoice-front-tyres.pdf',
  },
  {
    date: ago(10),
    mileage: 39500,
    category: 'service',
    title: 'Annual service - oil, filters',
    workshop: 'Sample BMW Authorised Service Centre, Al Quoz',
    workPerformed: [
      'Engine oil and filter change',
      'Air filter replaced',
      'Cabin microfilter replaced',
      'Multi-point inspection',
    ],
    parts: [
      { name: 'Engine oil 5W-30 (x8L)' },
      { name: 'Oil filter element' },
      { name: 'Engine air filter' },
      { name: 'Cabin microfilter' },
    ],
    cost: 3250,
    file: 'invoice-annual-service.pdf',
  },
  {
    date: ago(7),
    mileage: 42600,
    category: 'inspection',
    title: 'Independent inspection',
    workshop: 'Sample Independent Inspection Centre, Dubai',
    workPerformed: ['Mechanical inspection', 'Diagnostic scan', 'Tyre and brake assessment'],
    parts: [],
    cost: 650,
    notes:
      'Front tyre tread wear increasing - recommend monitoring. Brake pads within limits. No fault codes stored at time of scan.',
    file: 'inspection-report.pdf',
  },
];

export function buildSeed(): DB {
  const services: ServiceRecord[] = [];
  const documents: DocumentRecord[] = [];

  seedServices.forEach((s, i) => {
    const { file, ...draft } = s;
    const docId = `doc_seed_${i + 1}`;
    services.push({ ...draft, id: `svc_seed_${i + 1}`, vehicleId: VID, sourceDocId: docId, trust: 'verified' });
    const type: DocType =
      draft.category === 'inspection' ? 'inspection' : draft.category === 'tyres' ? 'tyre_invoice' : 'service_invoice';
    documents.push({
      id: docId,
      vehicleId: VID,
      type,
      fileName: file,
      size: 180_000 + i * 12_345,
      uploadedAt: draft.date + 'T09:00:00.000Z',
      status: 'confirmed',
      extractedBy: 'sample',
      summary: `${draft.title} at ${draft.mileage.toLocaleString('en-US')} km.`,
      fields: [
        f('date', 'Date', draft.date),
        f('mileage', 'Mileage (km)', String(draft.mileage)),
        f('workshop', 'Workshop', draft.workshop),
        f('cost', 'Total (AED)', String(draft.cost)),
      ],
      draft,
      conflicts: [],
      issuedOn: draft.date,
      trust: 'verified',
    });
  });

  documents.push(
    {
      id: 'doc_seed_ins',
      vehicleId: VID,
      type: 'insurance',
      fileName: 'insurance-policy-2025-26.pdf',
      size: 412_000,
      uploadedAt: ago(10, 15) + 'T09:00:00.000Z',
      status: 'confirmed',
      extractedBy: 'sample',
      summary: 'Comprehensive motor policy, agency repair.',
      fields: [
        f('insurer', 'Insurer', 'Sample Insurance Co.'),
        f('cover', 'Cover', 'Comprehensive - agency repair'),
        f('issued', 'Issued', ago(10, 15)),
        f('expires', 'Expires', ahead(45)),
      ],
      conflicts: [],
      issuedOn: ago(10, 15),
      expiresOn: ahead(45),
      trust: 'verified',
    },
    {
      id: 'doc_seed_reg',
      vehicleId: VID,
      type: 'registration',
      fileName: 'registration-card.pdf',
      size: 96_000,
      uploadedAt: ago(7, 20) + 'T09:00:00.000Z',
      status: 'confirmed',
      extractedBy: 'sample',
      summary: 'Vehicle registration card (Dubai).',
      fields: [
        f('plate', 'Plate', 'Dubai A 12345'),
        f('vin', 'VIN', 'WBSXXXXXXNCXXXXXX'),
        f('expires', 'Registration expires', ahead(160)),
      ],
      conflicts: [],
      issuedOn: ago(7, 20),
      expiresOn: ahead(160),
      trust: 'verified',
    },
  );

  const tenants = seedTenants();
  return {
    vehicles: [
      {
        id: VID,
        orgId: OWNER_ORG_ID,
        ownerName: 'Alex Morgan',
        make: 'BMW',
        model: 'M5',
        variant: 'Competition',
        year: 2022,
        vin: 'WBSXXXXXXNCXXXXXX',
        mileage: 48200,
        mileageUpdatedAt: new Date().toISOString(),
        plate: 'A 12345',
        chassis: 'F90',
        spec: 'GCC',
        emirate: 'Dubai',
        color: 'Marina Bay Blue',
        originalPrice: 520000,
        createdAt: ago(9) + 'T09:00:00.000Z',
        isSample: true,
      },
      ...tenants.vehicles,
    ],
    documents: [...documents, ...tenants.documents],
    services: [...services, ...tenants.services],
    chats: [],
    shares: [],
    orgs: tenants.orgs,
    users: tenants.users,
    dataRooms: [],
    audit: [],
    settings: tenants.settings,
  };
}
