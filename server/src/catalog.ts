import type { CategoryId, Organization } from './types';

/**
 * CarVault product catalog: the master list of categories and modules.
 * Owned by the platform. Tenants can read it (to see what exists) but never change it.
 */

export interface ModuleDef {
  id: string;
  name: string;
  group: 'Automotive intelligence' | 'Dealership' | 'Insurance' | 'Auto finance' | 'Service centre' | 'Inspection' | 'Fleet' | 'Owner';
  description: string;
  /** Included in every category (the CarVault core). */
  core?: boolean;
}

export const MODULES: ModuleDef[] = [
  // Core: every tenant gets the intelligence layer
  { id: 'dashboard', name: 'Dashboard', group: 'Automotive intelligence', core: true, description: 'Portfolio view of vehicles, confidence and what needs attention.' },
  { id: 'vehicles', name: 'Vehicles', group: 'Automotive intelligence', core: true, description: 'Every vehicle record the organization manages.' },
  { id: 'vehicle_confidence', name: 'Vehicle Confidence', group: 'Automotive intelligence', core: true, description: 'Evidence-based confidence in each vehicle\'s history, with a transparent breakdown.' },
  { id: 'vehicle_passport', name: 'Vehicle Passport', group: 'Automotive intelligence', core: true, description: 'The shareable, provenance-labelled record of a vehicle.' },
  { id: 'service_history', name: 'Service History', group: 'Automotive intelligence', core: true, description: 'Chronological, source-linked service and repair timeline.' },
  { id: 'documents', name: 'Documents', group: 'Automotive intelligence', core: true, description: 'Upload, extract, review and verify vehicle documents.' },
  { id: 'assistant', name: 'CarVault Assistant', group: 'Automotive intelligence', core: true, description: 'Ask questions answered from the vehicle\'s evidence.' },
  { id: 'maintenance_intel', name: 'Maintenance Intelligence', group: 'Automotive intelligence', description: 'What is due, upcoming or unknown across vehicles.' },
  { id: 'analytics', name: 'Analytics', group: 'Automotive intelligence', description: 'Coverage, confidence and activity metrics.' },

  // Dealership
  { id: 'inventory', name: 'Inventory', group: 'Dealership', description: 'Stock vehicles with confidence and resale readiness.' },
  { id: 'customers', name: 'Customers', group: 'Dealership', description: 'Customers and the vehicles linked to them.' },
  { id: 'resale_readiness', name: 'Resale Readiness', group: 'Dealership', description: 'What is ready, what is missing, and the steps to list a vehicle.' },
  { id: 'data_room', name: 'Vehicle Data Room', group: 'Dealership', description: 'Share selected, verified vehicle information through an expiring secure link.' },

  // Insurance
  { id: 'vehicle_history', name: 'Vehicle History', group: 'Insurance', description: 'History completeness and mileage confidence for insured vehicles.' },
  { id: 'claims_evidence', name: 'Claims Evidence', group: 'Insurance', description: 'Accident and claims evidence on file, and what is missing.' },
  { id: 'risk_signals', name: 'Risk Signals', group: 'Insurance', description: 'Conflicts, gaps and low-confidence areas that deserve review.' },
  { id: 'inspection', name: 'Inspection', group: 'Insurance', description: 'Latest inspection evidence and its age.' },

  // Auto finance
  { id: 'ownership', name: 'Ownership', group: 'Auto finance', description: 'Ownership and registration evidence per vehicle.' },
  { id: 'valuation', name: 'Valuation', group: 'Auto finance', description: 'Illustrative value ranges with their basis.' },
  { id: 'collateral', name: 'Collateral Confidence', group: 'Auto finance', description: 'Identity, ownership, valuation and evidence strength for financed vehicles.' },

  // Service centre
  { id: 'parts_history', name: 'Parts History', group: 'Service centre', description: 'Parts fitted across customer vehicles.' },

  // Inspection
  { id: 'inspection_queue', name: 'Inspection Queue', group: 'Inspection', description: 'Vehicles whose inspection evidence is missing or out of date.' },
  { id: 'inspection_reports', name: 'Inspection Reports', group: 'Inspection', description: 'All inspection records and their findings.' },

  // Fleet
  { id: 'fleet', name: 'Fleet', group: 'Fleet', description: 'Fleet vehicles with mileage, maintenance and confidence.' },
  { id: 'service_costs', name: 'Service Costs', group: 'Fleet', description: 'Recorded spend per vehicle.' },
  { id: 'alerts', name: 'Alerts', group: 'Fleet', description: 'Due maintenance and expiring cover across the fleet.' },
  { id: 'utilization', name: 'Utilization', group: 'Fleet', description: 'Usage and downtime. Needs a telematics integration.' },

  // Owner
  { id: 'garage', name: 'Garage', group: 'Owner', description: 'The owner\'s vehicles.' },
];

export interface CategoryDef {
  id: CategoryId;
  name: string;
  description: string;
  modules: string[];
  /** Primary navigation for this category, in order (module ids). */
  nav: string[];
}

const CORE = MODULES.filter((m) => m.core).map((m) => m.id);

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'dealership', name: 'Dealership', description: 'Inventory provenance, trade-ins, resale preparation and buyer sharing.',
    modules: [...CORE, 'inventory', 'customers', 'resale_readiness', 'data_room', 'analytics'],
    nav: ['dashboard', 'inventory', 'customers', 'vehicles', 'resale_readiness', 'analytics'],
  },
  {
    id: 'insurance', name: 'Insurance', description: 'History, mileage confidence, inspection and claims evidence.',
    modules: [...CORE, 'vehicle_history', 'claims_evidence', 'risk_signals', 'inspection', 'analytics'],
    nav: ['dashboard', 'vehicles', 'vehicle_history', 'claims_evidence', 'inspection', 'risk_signals', 'analytics'],
  },
  {
    id: 'finance', name: 'Auto finance / Banking', description: 'Identity, ownership, valuation and collateral confidence.',
    modules: [...CORE, 'ownership', 'valuation', 'collateral', 'risk_signals', 'analytics'],
    nav: ['dashboard', 'vehicles', 'ownership', 'valuation', 'collateral', 'risk_signals', 'analytics'],
  },
  {
    id: 'service', name: 'Service centre', description: 'Customer vehicles, maintenance due and parts history.',
    modules: [...CORE, 'customers', 'maintenance_intel', 'parts_history', 'analytics'],
    nav: ['dashboard', 'customers', 'vehicles', 'maintenance_intel', 'parts_history', 'analytics'],
  },
  {
    id: 'inspection', name: 'Vehicle inspection', description: 'Inspection queue, reports and evidence that updates confidence.',
    modules: [...CORE, 'inspection_queue', 'inspection_reports', 'analytics'],
    nav: ['dashboard', 'inspection_queue', 'vehicles', 'inspection_reports', 'analytics'],
  },
  {
    id: 'fleet', name: 'Fleet management', description: 'Fleet maintenance, mileage, costs and alerts.',
    modules: [...CORE, 'fleet', 'maintenance_intel', 'service_costs', 'alerts', 'utilization', 'analytics'],
    nav: ['dashboard', 'fleet', 'maintenance_intel', 'service_costs', 'alerts', 'utilization', 'analytics'],
  },
  {
    id: 'consumer', name: 'Consumer / Vehicle owner', description: 'An owner managing their own vehicles.',
    modules: [...CORE, 'garage', 'maintenance_intel', 'resale_readiness', 'data_room'],
    nav: ['garage'],
  },
  {
    id: 'full', name: 'Full platform', description: 'Every category and module.',
    modules: MODULES.map((m) => m.id),
    nav: ['dashboard', 'vehicles', 'inventory', 'customers', 'maintenance_intel', 'risk_signals', 'inspection_queue', 'fleet', 'resale_readiness', 'analytics'],
  },
];

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;
export const isCategory = (id: unknown): id is CategoryId => CATEGORIES.some((c) => c.id === id);
export const isModule = (id: unknown): id is string => MODULES.some((m) => m.id === id);

/** Modules an organization is entitled to: its categories, plus admin-granted overrides. */
export function entitledModules(org: Organization): Set<string> {
  const set = new Set<string>();
  for (const c of org.categories) categoryById(c)?.modules.forEach((m) => set.add(m));
  org.moduleOverrides.add.forEach((m) => set.add(m));
  org.moduleOverrides.remove.forEach((m) => set.delete(m));
  CORE.forEach((m) => set.add(m)); // the core cannot be removed
  return set;
}

/** Primary navigation for an org: merged from its categories, filtered by entitlement. */
export function navFor(org: Organization): string[] {
  const entitled = entitledModules(org);
  const cats = org.categories.includes('full') ? ['full' as CategoryId] : org.categories;
  const out: string[] = [];
  for (const c of cats) for (const m of categoryById(c).nav) if (entitled.has(m) && !out.includes(m)) out.push(m);
  return out;
}

/** Which category would unlock a module, for "Available with …" messaging. */
export function unlockedBy(moduleId: string): CategoryId[] {
  return CATEGORIES.filter((c) => c.id !== 'full' && c.modules.includes(moduleId)).map((c) => c.id);
}
