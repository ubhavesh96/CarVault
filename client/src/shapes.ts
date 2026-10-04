// API response shapes used only by the client. Domain types come from ./types (synced from the server).
import type {
  AuditEvent, Branding, CategoryId, DocType, DocumentRecord, Insight, InsightStatus, Pilot, Role, ServiceRecord, TransferCheckId, Trust, User, Vehicle,
} from './types';

export interface HealthRow { label: string; value: string; filled: number; total: number; status: 'ok' | 'attention' | 'due' | 'unknown' }
export interface RecordsHealth {
  completeness: number; coreOnFile: number; coreTotal: number; rows: HealthRow[];
  parts: { label: string; score: number; note: string }[]; attentionCount: number; verifiedShare: number;
}
export interface VehicleHealth {
  score: number | null;
  label: 'Healthy' | 'Needs attention' | 'Action required' | 'Not enough records';
  status: 'ok' | 'attention' | 'due' | 'unknown';
  basis: string; unknowns: number;
}
export interface ValueEstimate {
  available: boolean; low?: number; mid?: number; high?: number; currency: 'AED';
  method: string; basis: string[]; caveats: string[]; comparables: 'unknown';
}

export type Level = 'high' | 'moderate' | 'low';
export interface ConfidenceSummary { score: number; level: Level; verifiedRecords: number; sources: number; gaps: number; question?: string }
export interface Evidence {
  label: string; date?: string; detail?: string; trust: Trust; source: string;
  ref?: { kind: 'service' | 'document'; id: string };
}
export interface MissingItem {
  id: string; label: string; evidence: string;
  cta: { label: string; to: 'documents' | 'timeline' | 'odometer' | 'passport' }; docType?: DocType;
}
export interface Dimension {
  id: string; label: string; score: number; level: Level; evidence: Evidence[]; sources: string[];
  lastVerified?: string; why: string; missing: MissingItem[];
}
export interface Improvement extends MissingItem { dimension: string; gain: number }
export interface ConfidenceResult extends ConfidenceSummary { dimensions: Dimension[]; improvements: Improvement[]; question: string }

export interface ResaleItem { id: string; label: string; ready: boolean; detail: string; weight: number }
export interface ResaleAction { id: string; label: string; detail: string; to: 'documents' | 'passport' | 'dataroom' | 'assistant' | 'value' | 'transfer'; available: boolean }

export type TransferStatus = 'ready' | 'action' | 'recheck' | 'not_applicable';
export interface TransferItem {
  id: string; label: string; status: TransferStatus; detail: string; how: string;
  basis: 'document' | 'seller' | 'records' | 'rule'; docType?: DocType;
  confirm?: { check: TransferCheckId; as: 'done' | 'not_applicable'; label: string };
  confirmedBy?: string; confirmedAt?: string;
}
export interface TransferResult { emirate: string; ruleNote: string; items: TransferItem[]; ready: number; required: number; complete: boolean }

export interface ResaleResult {
  score: number; level: Level; summary: string; items: ResaleItem[]; actions: ResaleAction[]; transfer: TransferResult;
  confidence: { score: number; level: Level }; value: ValueEstimate;
}

export interface VehicleDetail {
  vehicle: Vehicle; services: ServiceRecord[]; documents: DocumentRecord[]; insights: Insight[];
  health: RecordsHealth; vehicleHealth: VehicleHealth; confidence: ConfidenceSummary; value: ValueEstimate;
}
export interface GarageItem {
  vehicle: Vehicle; recordCount: number; documentCount: number; attention: number; health: number;
  vehicleHealth: VehicleHealth; confidence: { score: number; level: Level; gaps: number };
}

export interface PortfolioVehicle {
  id: string; orgId: string; orgName?: string; make: string; model: string; variant: string; year: number;
  chassis?: string; plate?: string; emirate?: string; ownerName?: string; mileage: number; vin: string;
  photoUrl: string | null; photoKind?: 'owner' | 'reference';
  confidence: { score: number; level: Level; gaps: number; verifiedRecords: number; sources: number; dims: Record<string, number>; topGap?: string };
  resale: { score: number; level: Level; notReady: string[] };
  attention: { id: string; title: string; status: InsightStatus; metric: string }[];
  upcoming: { id: string; title: string; metric: string }[];
  spend: number; records: number; documents: number;
  value: { low?: number; mid?: number; high?: number } | null;
  lastInspection: { id: string; date: string; title: string; notes?: string; shop: string; trust: Trust } | null;
  inspections: { id: string; date: string; title: string; notes?: string; shop: string; mileage: number; trust: Trust }[];
  parts: { name: string; date: string; title: string; recordId: string }[];
  insuranceExpires: string | null; registrationExpires: string | null;
  conflicts: { id: string; title: string; date: string; detail?: string }[];
  imported: number; lastActivity: string;
}
export interface Portfolio {
  vehicles: PortfolioVehicle[];
  recent: { at: string; vehicleId: string; kind: 'record' | 'document'; text: string; trust: Trust }[];
}

export interface CatalogModule { id: string; name: string; group: string; description: string; core?: boolean; entitled: boolean; unlockedBy: CategoryId[] }
export interface CatalogCategory { id: CategoryId; name: string; description: string; licensed: boolean; moduleCount: number }
export interface Catalog { categories: CatalogCategory[]; modules: CatalogModule[] }

export interface Session {
  user: User;
  org: { id: string; name: string; categories: CategoryId[]; plan: string; status: string; isPlatform: boolean; brandingSelfServe: boolean };
  branding: Branding;
  nav: string[];
  entitlements: string[];
  catalog: Catalog;
  permissions: { isPlatformAdmin: boolean; isTenantAdmin: boolean; canEditBranding: boolean; tenantBrandFields: (keyof Branding)[]; adminBrandFields: (keyof Branding)[] };
}
export interface Persona { id: string; name: string; title?: string; role: Role; org: string; categories: CategoryId[]; isPlatform: boolean }

export interface PassportData {
  generatedAt: string;
  passportNo: string;
  issuer: { name: string } | null;
  vehicle: {
    id: string; title: string; subtitle: string; location?: string; make: string; model: string;
    photoUpdatedAt?: string; photoUrl: string | null; photoKind?: 'owner' | 'reference';
    photoCredit?: { author: string; license: string; source: string; title: string };
  };
  identity: { label: string; value: string; trust: Trust; source?: string }[];
  confidence: ConfidenceSummary & { dimensions: { id: string; label: string; score: number; level: Level; sources: string[]; lastVerified?: string; evidenceCount: number }[] };
  resale: { score: number; level: Level; summary: string; ready: string[]; attention: string[] } | null;
  ownershipTimeline: { date: string; event: string; detail: string; trust: Trust }[];
  summary: { records: number; documents: number; verifiedRecords: number; totalSpend: number; firstRecord?: string; lastRecord?: string };
  serviceHistory: (Omit<ServiceRecord, 'vehicleId' | 'sourceDocId'>)[];
  partsHistory: { date: string; name: string; partNo?: string; record: string; trust: Trust }[];
  mileageTimeline: { date: string; mileage: number }[];
  documents: { id: string; type: DocType; fileName: string; issuedOn?: string; expiresOn?: string; trust: Trust; verifiedWithIssuer?: { by: string; at: string } }[];
  estimatedValue: { low: number; mid: number; high: number; method: string } | null;
  unknowns: string[];
  notice: string;
}

export interface PublicDataRoom {
  room: { recipient: string; expiresAt: string; sharedBy?: string; sections: string[] };
  vehicle: PassportData['vehicle'];
  identity?: PassportData['identity'];
  confidence?: ConfidenceSummary & { dimensions: { id: string; label: string; score: number; level: Level; why: string; sources: string[]; lastVerified?: string }[] };
  serviceHistory?: PassportData['serviceHistory'];
  inspection?: PassportData['serviceHistory'];
  mileage?: { timeline: { date: string; mileage: number }[]; dimension: Dimension };
  ownership?: Dimension;
  insurance?: Dimension;
  documents?: PassportData['documents'];
  transfer?: TransferResult;
  unknowns: string[];
  notice: string;
}

export interface OrgSummary {
  id: string; name: string; categories: CategoryId[]; plan: string; status: 'active' | 'suspended'; isPlatform: boolean;
  users: number; vehicles: number; branches: number; modules: number; avgConfidence: number | null; customDomain?: string; createdAt: string;
}
export interface AuditRow extends AuditEvent { orgName?: string }

export interface PilotRow {
  id: string; name: string; categories: CategoryId[]; plan: string; status: 'active' | 'suspended'; pilot: Pilot | null;
  metrics: {
    vehicles: number; highConfidenceShare: number | null; avgConfidence: number | null; verifiedDocs: number;
    dataRooms30d: number; buyerViews: number; passportsShared: number; transferReady: number; activeUsers: number;
  };
}
