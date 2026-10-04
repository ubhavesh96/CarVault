/**
 * Data trust states shown throughout the product.
 * verified = source-backed; user = entered/uploaded by a person; imported = from a connected system;
 * ai = CarVault Insight (interpretation); estimated = model output; unverified = awaiting confirmation;
 * conflict = contradicts other evidence; unknown = no evidence.
 */
export type Trust = 'verified' | 'user' | 'imported' | 'ai' | 'estimated' | 'unverified' | 'conflict' | 'unknown';

export interface Vehicle {
  id: string;
  /** Owning tenant. Every vehicle belongs to exactly one organization. */
  orgId: string;
  /** Customer / owner name as the tenant records it (dealer customer, policyholder, fleet driver). */
  ownerName?: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  vin: string;
  mileage: number;
  mileageUpdatedAt: string;
  plate?: string;
  emirate?: string;
  /** Chassis / generation code, e.g. F90 */
  chassis?: string;
  /** Market specification, e.g. GCC */
  spec?: string;
  photo?: {
    storedName: string;
    mime: string;
    updatedAt: string;
    /** owner = uploaded by the owner; reference = a licensed photo of the same model, not this car. */
    kind?: 'owner' | 'reference';
    credit?: { author: string; license: string; source: string; title: string };
  };
  /** Owner removed the photo; don't re-apply the sample photo. */
  photoRemoved?: boolean;
  /** A reference-photo lookup has been attempted (so it is not repeated on every load). */
  referenceTried?: boolean;
  color?: string;
  /** Owner-provided original purchase price (AED). Used only by the illustrative value model. */
  originalPrice?: number;
  createdAt: string;
  isSample?: boolean;
  /** Seller-confirmed ownership-transfer checks (see transfer.ts). */
  transferChecks?: Partial<Record<TransferCheckId, TransferCheckState>>;
}

export type DocType =
  | 'service_invoice'
  | 'insurance'
  | 'registration'
  | 'inspection'
  | 'warranty'
  | 'parts_invoice'
  | 'tyre_invoice'
  | 'ownership'
  | 'claims_history'
  /** Official vehicle status certificate issued by a registration authority (e.g. RTA Dubai). */
  | 'rta_certificate'
  /** Bank clearance / release letter confirming a car loan is settled. */
  | 'loan_release'
  | 'other';

export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  /** 0..1 */
  confidence: number;
}

export type ServiceCategory = 'service' | 'repair' | 'tyres' | 'brakes' | 'inspection' | 'other';

export interface ServiceDraft {
  date: string;
  mileage: number;
  category: ServiceCategory;
  title: string;
  workshop: string;
  workPerformed: string[];
  parts: { name: string; partNo?: string }[];
  cost: number;
  notes?: string;
}

export interface DocumentRecord {
  id: string;
  vehicleId: string;
  type: DocType;
  fileName: string;
  storedName?: string;
  mime?: string;
  size: number;
  uploadedAt: string;
  status: 'needs_review' | 'confirmed';
  extractedBy: 'mock' | 'claude' | 'sample';
  summary: string;
  fields: ExtractedField[];
  /** Proposed timeline entry (service/inspection/tyre/parts docs). */
  draft?: ServiceDraft;
  conflicts: string[];
  issuedOn?: string;
  expiresOn?: string;
  trust: Trust;
  /** A person checked this document against the issuer's own verification service (e.g. the certificate number on rta.ae). */
  verification?: DocVerification;
}

export interface DocVerification {
  method: 'issuer_check';
  /** Certificate / reference number that was checked. */
  reference: string;
  checkedBy: string;
  /** Organization of the person who checked it, shown to buyers. */
  checkedByOrg: string;
  checkedAt: string;
  note?: string;
}

/** UAE ownership-transfer items the seller confirms themselves (the rest are read from documents). */
export type TransferCheckId = 'fines' | 'loan' | 'seller_id' | 'buyer_insurance';
export interface TransferCheckState {
  status: 'done' | 'not_applicable';
  at: string;
  by: string;
}

export interface ServiceRecord extends ServiceDraft {
  id: string;
  vehicleId: string;
  sourceDocId?: string;
  trust: Trust;
  /** For imported records: the connected system it came from. */
  importedFrom?: string;
  /** Conflicts the owner acknowledged when saving. */
  conflicts?: string[];
}

export interface ChatBlock {
  kind: 'text' | 'verified' | 'inference' | 'recommendation' | 'unknown' | 'estimated';
  text: string;
  sources?: string[];
}

export interface ChatMessage {
  id: string;
  vehicleId: string;
  role: 'user' | 'assistant';
  at: string;
  text?: string;
  blocks?: ChatBlock[];
  suggestions?: string[];
  provider?: 'mock' | 'claude';
}

export interface Share {
  token: string;
  vehicleId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------------------
// Platform: tenants, users, licensing
// ---------------------------------------------------------------------------------------

export type CategoryId = 'dealership' | 'insurance' | 'finance' | 'service' | 'inspection' | 'fleet' | 'consumer' | 'full';

export type Role = 'platform_admin' | 'tenant_admin' | 'tenant_user';

export interface Branding {
  appName: string;
  logoText: string;
  /** data: URL, max ~200 KB */
  logoDataUrl?: string;
  faviconEmoji?: string;
  primaryColor: string;
  secondaryColor: string;
  typography: 'Manrope' | 'Inter' | 'IBM Plex Sans';
  theme: 'dark' | 'light';
  loginHeadline: string;
  emailSenderName: string;
  emailSenderAddress: string;
  emailFooter: string;
  pdfFooter: string;
  /** Show the tenant brand on shared passports (CarVault attribution always remains). */
  passportCobrand: boolean;
  customDomain?: string;
}

export interface Branch { id: string; name: string; city: string }

export interface Organization {
  id: string;
  name: string;
  /** Licensed categories. Only a platform admin can change these. */
  categories: CategoryId[];
  /** Per-module overrides granted/removed by a platform admin on top of the categories. */
  moduleOverrides: { add: string[]; remove: string[] };
  plan: string;
  status: 'active' | 'suspended';
  branding: Branding;
  /** Whether tenant admins may edit their own (limited) branding fields. */
  brandingSelfServe: boolean;
  branches: Branch[];
  integrations: string[];
  createdAt: string;
  /** The platform operator itself. */
  isPlatform?: boolean;
  /** Go-to-market: where this organization is in the pilot programme. Platform-admin only. */
  pilot?: Pilot;
}

export type PilotStage = 'prospect' | 'pilot' | 'converted' | 'ended';
export interface Pilot {
  stage: PilotStage;
  startedAt?: string;
  endsAt?: string;
  /** What the pilot has to show for the organization to convert, in the partner's words. */
  goal: string;
  /** Target share of vehicles at Vehicle Confidence 85+ (the North Star), 0..100. */
  targetHighConfidence?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  branchId?: string;
  title?: string;
}

export interface DataRoom {
  id: string;
  vehicleId: string;
  orgId: string;
  token: string;
  recipient: string;
  sections: string[];
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  revokedAt?: string;
  views: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  orgId?: string;
  action: string;
  detail: string;
  outcome: 'ok' | 'denied';
}

export interface PlatformSettings {
  /** Relative weight of each Vehicle Confidence dimension. Platform-admin only. */
  confidenceWeights: Record<string, number>;
  /** Sample pilot pipeline has been added to this database (so removing pilots sticks). */
  samplePilotsApplied?: boolean;
}

export interface DB {
  vehicles: Vehicle[];
  documents: DocumentRecord[];
  services: ServiceRecord[];
  chats: ChatMessage[];
  shares: Share[];
  orgs: Organization[];
  users: User[];
  dataRooms: DataRoom[];
  audit: AuditEvent[];
  settings: PlatformSettings;
}

export type InsightStatus = 'due' | 'attention' | 'upcoming' | 'ok' | 'unknown';

export interface InsightSource {
  kind: 'service' | 'document';
  id: string;
  label: string;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Insight {
  id: string;
  /** Short, confident statement, e.g. "Brake fluid appears overdue." */
  headline: string;
  /** One-line context shown in compact lists, e.g. "36 months since replacement" */
  detail: string;
  /** Compact right-aligned value, e.g. "Due", "~6,300 km", "37 days" */
  metric: string;
  facts: { label: string; value: string }[];
  source?: InsightSource;
  /** Rule-based: high = read directly from a verified document; medium = verified record + typical interval; low = owner-entered or missing data. */
  confidence: { level: Confidence; reason: string };
  category: 'maintenance' | 'protection' | 'records' | 'resale';
  title: string;
  status: InsightStatus;
  summary: string;
  /** Concise, user-facing explanation of why this was raised (not chain-of-thought). */
  why: string;
  evidence: string[];
  trust: Trust;
  caveat?: string;
}

export interface VehicleContext {
  vehicle: Vehicle;
  services: ServiceRecord[];
  documents: DocumentRecord[];
  insights: Insight[];
  /** Vehicle Confidence, when available (used by the assistant to explain the score). */
  confidence?: unknown;
}

// Client response shapes
export * from './shapes';
