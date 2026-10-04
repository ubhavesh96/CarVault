import type {
  Branding, CategoryId, DocType, DocumentRecord, Organization, ServiceCategory, ServiceRecord, Trust, User, Vehicle,
} from './types';
import { DEFAULT_WEIGHTS } from './confidence';

/**
 * Sample tenants for the multi-tenant prototype. All organizations, people, workshops and
 * insurers are fictional. Vehicles have deliberately different evidence quality so Vehicle
 * Confidence varies: strong, gappy, conflicting, imported-only and near-empty histories.
 */

export const PLATFORM_ORG_ID = 'org_carvault';
export const OWNER_ORG_ID = 'org_owner_alex';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ago = (months: number) => { const d = new Date(); d.setMonth(d.getMonth() - months); return iso(d); };
const ahead = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };

export const brand = (over: Partial<Branding> = {}): Branding => ({
  appName: 'CarVault', logoText: 'CarVault', primaryColor: '#4da3ff', secondaryColor: '#b9c4ce',
  typography: 'Manrope', theme: 'dark', loginHeadline: 'Verified vehicle history.',
  emailSenderName: 'CarVault', emailSenderAddress: 'no-reply@carvault.example', emailFooter: 'Sent by CarVault.',
  pdfFooter: 'Vehicle Passport issued by CarVault.', passportCobrand: false, ...over,
});

function org(id: string, name: string, categories: CategoryId[], plan: string, b: Partial<Branding>, extra: Partial<Organization> = {}): Organization {
  return {
    id, name, categories, moduleOverrides: { add: [], remove: [] }, plan, status: 'active',
    branding: brand({ appName: name, logoText: name, emailSenderName: name, ...b }), brandingSelfServe: true,
    branches: [], integrations: [], createdAt: ago(8) + 'T09:00:00.000Z', ...extra,
  };
}

// ---------------------------------------------------------------------------------------

interface Hist {
  m: number; km: number; cat: ServiceCategory; title: string; shop: string; cost: number;
  trust?: Trust; importedFrom?: string; notes?: string; conflicts?: string[]; parts?: string[];
}
interface DocSpec { type: DocType; m: number; expiresIn?: number; trust?: Trust; fields?: [string, string, string][] }

function build(v: Omit<Vehicle, 'createdAt' | 'mileageUpdatedAt'>, hist: Hist[], docs: DocSpec[]) {
  const services: ServiceRecord[] = [];
  const documents: DocumentRecord[] = [];
  hist.forEach((h, i) => {
    const trust = h.trust ?? 'verified';
    const id = `svc_${v.id}_${i}`;
    let sourceDocId: string | undefined;
    if (trust === 'verified' || trust === 'conflict') {
      sourceDocId = `doc_${v.id}_h${i}`;
      documents.push({
        id: sourceDocId, vehicleId: v.id,
        type: h.cat === 'inspection' ? 'inspection' : h.cat === 'tyres' ? 'tyre_invoice' : 'service_invoice',
        fileName: `${h.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ago(h.m).slice(0, 7)}.pdf`,
        size: 150_000 + i * 9_000, uploadedAt: ago(h.m) + 'T09:00:00.000Z', status: 'confirmed', extractedBy: 'sample',
        summary: `${h.title} at ${h.km.toLocaleString('en-US')} km.`,
        fields: [
          { key: 'date', label: 'Date', value: ago(h.m), confidence: 0.97 },
          { key: 'mileage', label: 'Mileage (km)', value: String(h.km), confidence: 0.95 },
          { key: 'workshop', label: 'Workshop', value: h.shop, confidence: 0.95 },
        ],
        conflicts: h.conflicts ?? [], issuedOn: ago(h.m), trust: trust === 'conflict' ? 'conflict' : 'verified',
      });
    }
    services.push({
      id, vehicleId: v.id, date: ago(h.m), mileage: h.km, category: h.cat, title: h.title, workshop: h.shop,
      workPerformed: [h.title], parts: (h.parts ?? []).map((name) => ({ name })), cost: h.cost, notes: h.notes,
      trust, sourceDocId, importedFrom: h.importedFrom, conflicts: h.conflicts,
    });
  });
  docs.forEach((d, i) => {
    const issued = ago(d.m);
    const expires = d.expiresIn !== undefined ? ahead(d.expiresIn) : undefined;
    documents.push({
      id: `doc_${v.id}_d${i}`, vehicleId: v.id, type: d.type,
      fileName: `${d.type.replace('_', '-')}-${issued.slice(0, 7)}.pdf`, size: 90_000 + i * 7_000,
      uploadedAt: issued + 'T09:00:00.000Z', status: 'confirmed', extractedBy: 'sample',
      summary: d.type === 'registration' ? `Vehicle registration card (${v.emirate ?? 'UAE'}).` : `${d.type.replace('_', ' ')} document.`,
      fields: [
        ...(d.fields ?? []).map(([key, label, value]) => ({ key, label, value, confidence: 0.96 })),
        ...(expires ? [{ key: 'expires', label: 'Expires', value: expires, confidence: 0.96 }] : []),
      ],
      conflicts: [], issuedOn: issued, expiresOn: expires, trust: d.trust ?? 'verified',
    });
  });
  const vehicle: Vehicle = { ...v, createdAt: ago(6) + 'T09:00:00.000Z', mileageUpdatedAt: new Date().toISOString(), isSample: true };
  return { vehicle, services, documents };
}

/** Sample go-to-market state: design partners in the business-first pilot programme (fictional). */
export function applySamplePilots(orgs: Organization[]) {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const pilots: Record<string, Organization['pilot']> = {
    org_abc: { stage: 'pilot', startedAt: day(-24), endsAt: day(36), goal: 'Show that documented stock sells faster: every used car listed with a data room link and badge.', targetHighConfidence: 60 },
    org_meridian: { stage: 'pilot', startedAt: day(-10), endsAt: day(50), goal: 'Remarketing: hand buyers a transfer-ready file for every de-fleeted car.', targetHighConfidence: 50 },
    org_clearcheck: { stage: 'prospect', goal: 'Attach inspection results to a shareable, verifiable passport.' },
  };
  for (const o of orgs) if (pilots[o.id] && !o.pilot) o.pilot = pilots[o.id];
}

export function seedTenants() {
  const orgs: Organization[] = [
    org(PLATFORM_ORG_ID, 'CarVault', ['full'], 'Platform', {}, { isPlatform: true, brandingSelfServe: false }),
    org('org_abc', 'ABC Motors', ['dealership'], 'Dealership · Growth', { logoText: 'ABC Motors', loginHeadline: 'Every car, fully documented.' }, {
      branches: [{ id: 'br_abc_dxb', name: 'Al Quoz showroom', city: 'Dubai' }, { id: 'br_abc_auh', name: 'Mussafah showroom', city: 'Abu Dhabi' }],
      integrations: ['dms'],
    }),
    org('org_xyz', 'XYZ Insurance', ['insurance'], 'Insurance · Standard', { logoText: 'XYZ Insurance' }, {
      branches: [{ id: 'br_xyz_dxb', name: 'Claims centre', city: 'Dubai' }],
    }),
    org('org_harbor', 'Harbor Auto Finance', ['finance'], 'Finance · Standard', { logoText: 'Harbor Finance' }),
    org('org_pas', 'Premium Auto Service', ['service'], 'Service · Standard', { logoText: 'Premium Auto Service' }, {
      branches: [{ id: 'br_pas_1', name: 'Al Quoz workshop', city: 'Dubai' }],
    }),
    org('org_meridian', 'Meridian Fleet', ['fleet'], 'Fleet · Standard', { logoText: 'Meridian Fleet' }),
    org('org_clearcheck', 'ClearCheck Inspections', ['inspection'], 'Inspection · Standard', { logoText: 'ClearCheck' }),
    org(OWNER_ORG_ID, "Alex Morgan's garage", ['consumer'], 'Owner · Premium', { appName: 'CarVault', logoText: 'CarVault' }, { brandingSelfServe: false }),
  ];
  applySamplePilots(orgs);

  const users: User[] = [
    { id: 'u_admin', name: 'Noor Haddad', email: 'noor@carvault.example', role: 'platform_admin', orgId: PLATFORM_ORG_ID, title: 'CarVault platform admin' },
    { id: 'u_abc_admin', name: 'Omar Rahman', email: 'omar@abcmotors.example', role: 'tenant_admin', orgId: 'org_abc', branchId: 'br_abc_dxb', title: 'Head of used cars' },
    { id: 'u_abc_user', name: 'Sara Ali', email: 'sara@abcmotors.example', role: 'tenant_user', orgId: 'org_abc', branchId: 'br_abc_dxb', title: 'Sales executive' },
    { id: 'u_xyz_admin', name: 'Daniel Price', email: 'daniel@xyzinsurance.example', role: 'tenant_admin', orgId: 'org_xyz', title: 'Underwriting lead' },
    { id: 'u_harbor_admin', name: 'Priya Nair', email: 'priya@harborfinance.example', role: 'tenant_admin', orgId: 'org_harbor', title: 'Collateral manager' },
    { id: 'u_pas_admin', name: 'Hassan Karimi', email: 'hassan@premiumautoservice.example', role: 'tenant_admin', orgId: 'org_pas', title: 'Service manager' },
    { id: 'u_meridian_admin', name: 'Lena Fischer', email: 'lena@meridianfleet.example', role: 'tenant_admin', orgId: 'org_meridian', title: 'Fleet manager' },
    { id: 'u_clearcheck_admin', name: 'Yusuf Demir', email: 'yusuf@clearcheck.example', role: 'tenant_admin', orgId: 'org_clearcheck', title: 'Inspection lead' },
    { id: 'u_owner', name: 'Alex Morgan', email: 'alex@example.com', role: 'tenant_admin', orgId: OWNER_ORG_ID, title: 'Vehicle owner' },
  ];

  const W = { abc: 'ABC Motors workshop, Al Quoz', dms: 'ABC Motors DMS (sample integration)', ind: 'Sample Independent Inspection Centre', tyre: 'Sample Tyre Centre' };
  const ins = (m: number, exp: number): DocSpec => ({ type: 'insurance', m, expiresIn: exp, fields: [['insurer', 'Insurer', 'Sample Insurance Co.']] });
  const reg = (m: number, exp: number, vin: string): DocSpec => ({ type: 'registration', m, expiresIn: exp, fields: [['vin', 'VIN', vin]] });

  const built = [
    // ABC Motors: a strong, resale-ready car (imported dealer history + verified inspection)
    build({ id: 'veh_abc_911', orgId: 'org_abc', ownerName: 'Stock · ABC Motors', make: 'Porsche', model: '911', variant: 'Carrera S', year: 2021, chassis: '992', spec: 'GCC', vin: 'WP0ZZZ99ZMS200001', mileage: 31500, emirate: 'Dubai', plate: 'T 40211', color: 'GT Silver', originalPrice: 560000 }, [
      { m: 52, km: 3100, cat: 'service', title: 'Pre-delivery inspection', shop: W.abc, cost: 0, trust: 'imported', importedFrom: W.dms },
      { m: 40, km: 10200, cat: 'service', title: 'Annual service', shop: W.abc, cost: 2400, trust: 'imported', importedFrom: W.dms },
      { m: 28, km: 17900, cat: 'service', title: 'Annual service + brake fluid', shop: W.abc, cost: 3100, parts: ['Brake fluid'] },
      { m: 16, km: 24800, cat: 'service', title: 'Annual service', shop: W.abc, cost: 2600 },
      { m: 4, km: 30200, cat: 'service', title: 'Annual service', shop: W.abc, cost: 2750 },
      { m: 2, km: 31300, cat: 'inspection', title: 'Independent pre-sale inspection', shop: W.ind, cost: 650, notes: 'No fault codes. No evidence of structural repair observed.' },
    ], [reg(3, 290, 'WP0ZZZ99ZMS200001'), ins(3, 300), ins(15, -60), { type: 'ownership', m: 6, fields: [['issuer', 'Issuer', 'ABC Motors trade-in file']] }, { type: 'warranty', m: 6, expiresIn: 380, fields: [['provider', 'Provider', 'Sample Warranty Provider']] }]),

    // ABC Motors: a trade-in with gaps and a mileage conflict
    build({ id: 'veh_abc_rrs', orgId: 'org_abc', ownerName: 'Trade-in · K. Mansour', make: 'Range Rover', model: 'Sport', variant: 'HSE Dynamic', year: 2021, chassis: 'L494', spec: 'GCC', vin: 'SALWA2AE1MA000002', mileage: 58900, emirate: 'Dubai', plate: 'H 88120', color: 'Santorini Black', originalPrice: 420000 }, [
      { m: 44, km: 9800, cat: 'service', title: 'First service', shop: 'Sample Land Rover Service Centre', cost: 1900 },
      { m: 20, km: 41200, cat: 'service', title: 'Oil service', shop: 'Sample Independent Garage', cost: 1350, trust: 'user' },
      { m: 11, km: 38600, cat: 'repair', title: 'Suspension air spring', shop: 'Sample Independent Garage', cost: 4200, trust: 'conflict', conflicts: ['Mileage 38,600 km is lower than an earlier record (41,200 km). Odometer readings should not go down.'] },
      { m: 6, km: 55400, cat: 'tyres', title: 'Four tyres replaced', shop: W.tyre, cost: 5600 },
    ], [reg(9, 40, 'SALWA2AE1MA000002')]),

    // ABC Motors: decent history, inspection ageing
    build({ id: 'veh_abc_g63', orgId: 'org_abc', ownerName: 'Stock · ABC Motors', make: 'Mercedes-AMG', model: 'G 63', variant: '', year: 2020, chassis: 'W463', spec: 'GCC', vin: 'W1NYC7HJ1LX000003', mileage: 44100, emirate: 'Dubai', plate: 'T 51770', color: 'Obsidian Black', originalPrice: 780000 }, [
      { m: 60, km: 4800, cat: 'service', title: 'Service A', shop: 'Sample Mercedes-Benz Service Centre', cost: 2100 },
      { m: 48, km: 13900, cat: 'service', title: 'Service B', shop: 'Sample Mercedes-Benz Service Centre', cost: 3900 },
      { m: 36, km: 22400, cat: 'service', title: 'Service A', shop: 'Sample Mercedes-Benz Service Centre', cost: 2300 },
      { m: 24, km: 30100, cat: 'service', title: 'Service B + brake fluid', shop: 'Sample Mercedes-Benz Service Centre', cost: 4400 },
      { m: 12, km: 38800, cat: 'service', title: 'Service A', shop: 'Sample Mercedes-Benz Service Centre', cost: 2500 },
      { m: 10, km: 40100, cat: 'inspection', title: 'Independent inspection', shop: W.ind, cost: 650, notes: 'Minor stone chips on bonnet. No fault codes.' },
    ], [reg(4, 250, 'W1NYC7HJ1LX000003'), ins(4, 260)]),

    // XYZ Insurance: insured vehicles
    build({ id: 'veh_xyz_patrol', orgId: 'org_xyz', ownerName: 'Policy XYZ-40112 · R. Al Hashimi', make: 'Nissan', model: 'Patrol', variant: 'LE Platinum', year: 2023, chassis: 'Y62', spec: 'GCC', vin: 'JN8AY2NY5P9000004', mileage: 21000, emirate: 'Sharjah', plate: '3 20914', color: 'Pearl White', originalPrice: 330000 }, [
      { m: 14, km: 9900, cat: 'service', title: 'First service', shop: 'Sample Nissan Service Centre', cost: 950 },
    ], [reg(10, 200, 'JN8AY2NY5P9000004'), ins(2, 360), { type: 'claims_history', m: 2, fields: [['issuer', 'Issuer', 'XYZ Insurance claims system']] }]),
    build({ id: 'veh_xyz_lc', orgId: 'org_xyz', ownerName: 'Policy XYZ-38817 · M. Saleh', make: 'Toyota', model: 'Land Cruiser', variant: 'GXR', year: 2022, chassis: 'J300', spec: 'GCC', vin: 'JTMHV09J6N4000005', mileage: 38200, emirate: 'Abu Dhabi', plate: '12 55310', color: 'Graphite', originalPrice: 310000 }, [
      { m: 30, km: 9700, cat: 'service', title: 'Service', shop: 'Sample Toyota Service Centre', cost: 900 },
      { m: 18, km: 21300, cat: 'service', title: 'Service', shop: 'Sample Toyota Service Centre', cost: 1100 },
      { m: 5, km: 34600, cat: 'service', title: 'Service', shop: 'Sample Toyota Service Centre', cost: 1200, trust: 'user' },
    ], [ins(1, 330)]),

    // Harbor Auto Finance: financed vehicle
    build({ id: 'veh_harbor_s', orgId: 'org_harbor', ownerName: 'Loan HAF-7781 · J. Whitfield', make: 'Mercedes-Benz', model: 'S 500', variant: '4MATIC', year: 2022, chassis: 'W223', spec: 'GCC', vin: 'W1K6G6DB9NA000006', mileage: 27400, emirate: 'Dubai', plate: 'P 60021', color: 'Selenite Grey', originalPrice: 610000 }, [
      { m: 30, km: 9600, cat: 'service', title: 'Service A', shop: 'Sample Mercedes-Benz Service Centre', cost: 1900 },
      { m: 18, km: 17800, cat: 'service', title: 'Service B', shop: 'Sample Mercedes-Benz Service Centre', cost: 3600 },
      { m: 6, km: 25200, cat: 'service', title: 'Service A', shop: 'Sample Mercedes-Benz Service Centre', cost: 2000 },
    ], [reg(6, 180, 'W1K6G6DB9NA000006'), ins(6, 190), { type: 'ownership', m: 30, fields: [['issuer', 'Issuer', 'Sale agreement']] }]),

    // Premium Auto Service: a customer vehicle
    build({ id: 'veh_pas_x5', orgId: 'org_pas', ownerName: 'Customer · T. Okafor', make: 'BMW', model: 'X5', variant: 'xDrive40i', year: 2020, chassis: 'G05', spec: 'GCC', vin: 'WBACR6106L9000007', mileage: 67300, emirate: 'Dubai', plate: 'L 70442', color: 'Carbon Black', originalPrice: 360000 }, [
      { m: 54, km: 11200, cat: 'service', title: 'Oil service', shop: 'Premium Auto Service, Al Quoz', cost: 1400, parts: ['Oil filter', 'Engine oil 0W-30'] },
      { m: 40, km: 26800, cat: 'service', title: 'Oil service + microfilter', shop: 'Premium Auto Service, Al Quoz', cost: 1700, parts: ['Oil filter', 'Cabin microfilter'] },
      { m: 26, km: 41000, cat: 'brakes', title: 'Front pads and discs', shop: 'Premium Auto Service, Al Quoz', cost: 3900, parts: ['Front brake pads', 'Front brake discs'] },
      { m: 14, km: 55200, cat: 'service', title: 'Oil service + spark plugs', shop: 'Premium Auto Service, Al Quoz', cost: 2600, parts: ['Spark plugs (x6)', 'Oil filter'] },
      { m: 3, km: 66100, cat: 'repair', title: 'Water pump replaced', shop: 'Premium Auto Service, Al Quoz', cost: 3300, parts: ['Electric water pump', 'Coolant'] },
    ], [reg(8, 120, 'WBACR6106L9000007')]),

    // Meridian Fleet: high-mileage fleet cars
    build({ id: 'veh_mer_camry1', orgId: 'org_meridian', ownerName: 'Fleet unit MF-014', make: 'Toyota', model: 'Camry', variant: 'SE', year: 2023, chassis: 'XV70', spec: 'GCC', vin: 'JTNB11HK0P3000008', mileage: 96400, emirate: 'Dubai', plate: 'F 11014', color: 'White', originalPrice: 115000 }, [
      { m: 26, km: 10100, cat: 'service', title: '10k service', shop: 'Sample Toyota Service Centre', cost: 450, trust: 'imported', importedFrom: 'Meridian fleet system (sample integration)' },
      { m: 18, km: 40300, cat: 'service', title: '40k service', shop: 'Sample Toyota Service Centre', cost: 780, trust: 'imported', importedFrom: 'Meridian fleet system (sample integration)' },
      { m: 10, km: 70100, cat: 'service', title: '70k service', shop: 'Sample Toyota Service Centre', cost: 820, trust: 'imported', importedFrom: 'Meridian fleet system (sample integration)' },
      { m: 5, km: 85600, cat: 'tyres', title: 'Four tyres replaced', shop: W.tyre, cost: 1600 },
    ], [reg(11, 30, 'JTNB11HK0P3000008'), ins(11, 25)]),
    build({ id: 'veh_mer_camry2', orgId: 'org_meridian', ownerName: 'Fleet unit MF-021', make: 'Toyota', model: 'Camry', variant: 'SE', year: 2023, chassis: 'XV70', spec: 'GCC', vin: 'JTNB11HK0P3000009', mileage: 71200, emirate: 'Dubai', plate: 'F 11021', color: 'White', originalPrice: 115000 }, [
      { m: 20, km: 20400, cat: 'service', title: '20k service', shop: 'Sample Toyota Service Centre', cost: 520, trust: 'imported', importedFrom: 'Meridian fleet system (sample integration)' },
      { m: 7, km: 60200, cat: 'service', title: '60k service', shop: 'Sample Toyota Service Centre', cost: 760, trust: 'imported', importedFrom: 'Meridian fleet system (sample integration)' },
    ], [reg(11, 30, 'JTNB11HK0P3000009'), ins(11, 25)]),

    // ClearCheck Inspections: a car awaiting inspection
    build({ id: 'veh_cc_rs6', orgId: 'org_clearcheck', ownerName: 'Booking CC-2291 · private seller', make: 'Audi', model: 'RS 6', variant: 'Avant', year: 2021, chassis: 'C8', spec: 'European', vin: 'WUAZZZF27MN000010', mileage: 42800, emirate: 'Dubai', plate: 'N 33019', color: 'Nardo Grey', originalPrice: 520000 }, [
      { m: 34, km: 14100, cat: 'service', title: 'Service', shop: 'Sample Audi Service Centre', cost: 2100, trust: 'user' },
      { m: 15, km: 31800, cat: 'service', title: 'Service', shop: 'Sample Audi Service Centre', cost: 2600, trust: 'user' },
    ], []),
  ];

  return {
    orgs,
    users,
    vehicles: built.map((b) => b.vehicle),
    services: built.flatMap((b) => b.services),
    documents: built.flatMap((b) => b.documents),
    settings: { confidenceWeights: { ...DEFAULT_WEIGHTS }, samplePilotsApplied: true },
  };
}
