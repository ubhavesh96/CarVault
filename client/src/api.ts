import type {
  AuditRow, Branding, Catalog, CategoryId, ChatMessage, ConfidenceResult, DataRoom, DocType, DocumentRecord, ExtractedField,
  GarageItem, Organization, OrgSummary, PassportData, Persona, PilotRow, Portfolio, PortfolioVehicle, PublicDataRoom, ResaleResult,
  ServiceDraft, Session, Share, TransferCheckId, TransferResult, User, Vehicle, VehicleDetail,
} from './types';

export class ApiError extends Error {
  constructor(message: string, public status: number, public conflicts?: string[], public extra?: Record<string, unknown>) {
    super(message);
  }
}

// ---------------------------------------------------------------------------------------
// Demo identity. There is no real login: the chosen persona id travels as a header (API calls)
// and a cookie (so <img> and file links, which can't set headers, are authorised too).
// ---------------------------------------------------------------------------------------
const KEY = 'cv_user';
export const identity = {
  get(): string | null {
    try { return localStorage.getItem(KEY); } catch { return null; }
  },
  set(id: string | null) {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
    document.cookie = id ? `${KEY}=${encodeURIComponent(id)}; path=/; SameSite=Lax` : `${KEY}=; path=/; max-age=0`;
  },
};
// Keep the cookie in step with storage on load.
if (identity.get()) identity.set(identity.get());

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const headers = new Headers(init?.headers);
  const who = identity.get();
  if (who) headers.set('x-cv-user', who);
  try {
    res = await fetch('/api' + path, { ...init, headers });
  } catch {
    throw new ApiError("Can't reach the CarVault server. Is it running?", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    const fallback = res.status >= 500 ? "CarVault's server isn't responding. Try again in a moment." : 'Something went wrong. Please try again.';
    throw new ApiError(body.error ?? fallback, res.status, body.conflicts, body);
  }
  return body as T;
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  status: () => req<{ provider: 'mock' | 'claude'; liveAiConfigured: boolean }>('/status'),
  personas: () => req<Persona[]>('/demo/personas'),
  reset: () => req<{ ok: true }>('/demo/reset', json('POST')),
  session: () => req<Session>('/session'),

  // Vehicles
  garage: () => req<GarageItem[]>('/vehicles'),
  portfolio: () => req<Portfolio>('/portfolio'),
  createVehicle: (b: Record<string, unknown>) => req<Vehicle>('/vehicles', json('POST', b)),
  vehicle: (id: string) => req<VehicleDetail>(`/vehicles/${id}`),
  updateVehicle: (id: string, b: Record<string, unknown>) => req<VehicleDetail>(`/vehicles/${id}`, json('PATCH', b)),
  deleteVehicle: (id: string) => req<{ ok: true }>(`/vehicles/${id}`, json('DELETE')),
  confidence: (id: string) => req<ConfidenceResult>(`/vehicles/${id}/confidence`),
  resale: (id: string) => req<ResaleResult>(`/vehicles/${id}/resale`),
  setTransferCheck: (id: string, check: TransferCheckId, clear = false) => req<TransferResult>(`/vehicles/${id}/transfer/${check}`, json('PUT', clear ? { clear: true } : {})),

  // Documents & records
  upload: (id: string, file: File, type: DocType | 'auto') => {
    const fd = new FormData();
    fd.append('type', type);
    fd.append('file', file);
    return req<{ document: DocumentRecord; fallbackReason?: string }>(`/vehicles/${id}/documents`, { method: 'POST', body: fd });
  },
  confirmDoc: (docId: string, b: { type: DocType; fields: ExtractedField[]; draft?: ServiceDraft; acknowledgeConflicts?: boolean }) =>
    req<VehicleDetail>(`/documents/${docId}/confirm`, json('POST', b)),
  deleteDoc: (docId: string) => req<VehicleDetail>(`/documents/${docId}`, json('DELETE')),
  verifyDoc: (docId: string, b: { reference: string; attest: boolean; note?: string }) => req<VehicleDetail>(`/documents/${docId}/verify`, json('POST', b)),
  addService: (id: string, b: Record<string, unknown>) => req<VehicleDetail>(`/vehicles/${id}/services`, json('POST', b)),
  deleteService: (id: string) => req<VehicleDetail>(`/services/${id}`, json('DELETE')),

  // Assistant
  chat: (id: string) => req<ChatMessage[]>(`/vehicles/${id}/chat`),
  send: (id: string, message: string) => req<{ user: ChatMessage; reply: ChatMessage }>(`/vehicles/${id}/chat`, json('POST', { message })),
  clearChat: (id: string) => req<{ ok: true }>(`/vehicles/${id}/chat`, json('DELETE')),

  // Passport, sharing, data rooms
  passport: (id: string) => req<{ passport: PassportData; share: Share | null }>(`/vehicles/${id}/passport`),
  share: (id: string) => req<Share>(`/vehicles/${id}/share`, json('POST')),
  unshare: (id: string) => req<{ ok: true }>(`/vehicles/${id}/share`, json('DELETE')),
  publicPassport: (token: string) => req<{ passport: PassportData }>(`/public/passport/${token}`),
  dataRooms: (id: string) => req<DataRoom[]>(`/vehicles/${id}/datarooms`),
  createDataRoom: (id: string, b: { recipient: string; sections: string[]; expiresInHours: number }) => req<DataRoom>(`/vehicles/${id}/datarooms`, json('POST', b)),
  revokeDataRoom: (roomId: string) => req<DataRoom>(`/datarooms/${roomId}`, json('DELETE')),
  publicDataRoom: (token: string) => req<PublicDataRoom>(`/public/dataroom/${token}`),

  // Tenant organization
  org: () => req<{ org: Organization; users: User[]; vehicleCount: number; catalog: Catalog }>('/org'),
  updateBranding: (b: Partial<Branding>) => req<{ branding: Branding }>('/org/branding', json('PATCH', b)),
  activateCategory: (id: CategoryId) => req<never>(`/org/categories/${id}/activate`, json('POST')),
  activateModule: (id: string) => req<never>(`/org/modules/${id}/activate`, json('POST')),
  requestAccess: (b: { module?: string; category?: string }) => req<{ ok: true; message: string }>('/org/access-requests', json('POST', b)),
  inviteUser: (b: { name: string; email: string; role: string; title?: string }) => req<User>('/org/users', json('POST', b)),
  removeUser: (id: string) => req<{ ok: true }>(`/org/users/${id}`, json('DELETE')),
  addBranch: (b: { name: string; city: string }) => req<Organization['branches']>('/org/branches', json('POST', b)),

  // CarVault Admin
  admin: {
    overview: () => req<AdminOverview>('/admin/overview'),
    orgs: () => req<OrgSummary[]>('/admin/orgs'),
    createOrg: (b: { name: string; category: CategoryId; plan?: string; adminName?: string; adminEmail?: string }) => req<OrgSummary>('/admin/orgs', json('POST', b)),
    org: (id: string) => req<AdminOrgDetail>(`/admin/orgs/${id}`),
    updateOrg: (id: string, b: Record<string, unknown>) => req<{ org: Organization; summary: OrgSummary; nav: string[]; catalog: Catalog }>(`/admin/orgs/${id}`, json('PATCH', b)),
    deleteOrg: (id: string) => req<{ ok: true }>(`/admin/orgs/${id}`, json('DELETE')),
    catalog: () => req<AdminCatalog>('/admin/catalog'),
    users: () => req<(User & { orgName?: string })[]>('/admin/users'),
    vehicles: () => req<PortfolioVehicle[]>('/admin/vehicles'),
    audit: () => req<AuditRow[]>('/admin/audit'),
    confidence: () => req<{ dimensions: { id: string; label: string }[]; weights: Record<string, number>; defaults: Record<string, number> }>('/admin/confidence'),
    updateConfidence: (weights: Record<string, number>) => req<{ dimensions: { id: string; label: string }[]; weights: Record<string, number>; defaults: Record<string, number> }>('/admin/confidence', json('PATCH', { weights })),
    pilots: () => req<PilotRow[]>('/admin/pilots'),
    ai: () => req<{ provider: string; model: string; liveConfigured: boolean; referenceImages: boolean }>('/admin/ai'),
  },
};

export interface AdminOverview {
  tenants: number; activeTenants: number; users: number; vehicles: number; avgConfidence: number | null; highConfidence: number; dataRooms: number;
  byCategory: { id: CategoryId; name: string; tenants: number }[];
  accessRequests: AuditRow[]; recent: AuditRow[];
}
export interface AdminOrgDetail {
  org: Organization; summary: OrgSummary; users: User[]; vehicles: PortfolioVehicle[]; nav: string[]; catalog: Catalog; audit: AuditRow[];
}
export interface AdminCatalog {
  categories: { id: CategoryId; name: string; description: string; modules: string[]; nav: string[]; tenants: string[] }[];
  modules: { id: string; name: string; group: string; description: string; core?: boolean; categories: CategoryId[] }[];
}

export const photoApi = {
  upload: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('photo', file);
    return req<VehicleDetail>(`/vehicles/${id}/photo`, { method: 'POST', body: fd });
  },
  remove: (id: string) => req<VehicleDetail>(`/vehicles/${id}/photo`, json('DELETE')),
  reference: (id: string) => req<VehicleDetail>(`/vehicles/${id}/photo/reference`, json('POST')),
  url: (v: Vehicle) => (v.photo ? `/api/vehicles/${v.id}/photo?v=${encodeURIComponent(v.photo.updatedAt)}` : null),
};
