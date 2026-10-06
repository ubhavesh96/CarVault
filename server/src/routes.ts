import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { getDB, save, newId, resetToSeed, SERVERLESS, UPLOAD_DIR } from './store';
import type {
  Branding, CategoryId, ChatMessage, DataRoom, DocType, DocumentRecord, ExtractedField, Organization, Pilot, PilotStage, Role,
  ServiceCategory, ServiceDraft, ServiceRecord, TransferCheckId, User, Vehicle,
} from './types';
import { computeInsights, computeRecordsHealth, computeVehicleHealth } from './insights';
import { estimateValue } from './value';
import { detectConflicts } from './conflicts';
import { buildPassport } from './passport';
import { activeProvider, withFallback } from './ai';
import { attachReferencePhoto } from './reference';
import {
  HttpError, audit, authenticate, ctx, hasModule, isPlatformAdmin, requireModule, requirePlatformAdmin,
  requireTenantAdmin, vehicleOr404, visibleVehicles,
} from './auth';
import { CATEGORIES, MODULES, categoryById, entitledModules, isCategory, isModule, navFor, unlockedBy } from './catalog';
import { DEFAULT_WEIGHTS, DIMENSIONS, computeConfidence, computeResale } from './confidence';
import { brand } from './seedTenants';
import { computeTransfer } from './transfer';
import { OFFICIAL_ISSUER, VERIFIABLE, canVerify, certificateDrafts } from './official';

export const api = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);

const DOC_TYPES: DocType[] = ['service_invoice', 'insurance', 'registration', 'inspection', 'warranty', 'parts_invoice', 'tyre_invoice', 'ownership', 'claims_history', 'rta_certificate', 'loan_release', 'other'];
const CATEGORIES_SVC: ServiceCategory[] = ['service', 'repair', 'tyres', 'brakes', 'inspection', 'other'];
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
const HEX = /^#[0-9a-f]{6}$/i;

// ---------------------------------------------------------------------------------------
// Shared computation
// ---------------------------------------------------------------------------------------

function context(v: Vehicle) {
  const db = getDB();
  const services = db.services.filter((s) => s.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date));
  const documents = db.documents.filter((d) => d.vehicleId === v.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const insights = computeInsights(v, services, documents);
  return { vehicle: v, services, documents, insights };
}
const weights = () => getDB().settings?.confidenceWeights ?? DEFAULT_WEIGHTS;
function confidenceOf(v: Vehicle, c = context(v)) {
  return computeConfidence({ vehicle: v, services: c.services, documents: c.documents }, weights());
}
function resaleOf(v: Vehicle, c = context(v), conf = confidenceOf(v, c)) {
  const db = getDB();
  const now = Date.now();
  const input = { vehicle: v, services: c.services, documents: c.documents };
  return computeResale(input, conf, {
    transfer: computeTransfer(input),
    passportShared: db.shares.some((s) => s.vehicleId === v.id),
    dataRooms: db.dataRooms.filter((r) => r.vehicleId === v.id && !r.revokedAt && new Date(r.expiresAt).getTime() > now).length,
  });
}
const photoUrl = (v: Vehicle, base = `/api/vehicles/${v.id}/photo`) =>
  v.photo ? `${base}?v=${encodeURIComponent(v.photo.updatedAt)}` : null;

function detail(v: Vehicle) {
  const c = context(v);
  const conf = confidenceOf(v, c);
  return {
    ...c,
    health: computeRecordsHealth(v, c.services, c.documents, c.insights),
    vehicleHealth: computeVehicleHealth(c.insights),
    confidence: { score: conf.score, level: conf.level, verifiedRecords: conf.verifiedRecords, sources: conf.sources, gaps: conf.gaps, question: conf.question },
    value: estimateValue(v),
  };
}

const orgOf = (v: Vehicle) => getDB().orgs.find((o) => o.id === v.orgId);

function passportFor(v: Vehicle, photoBase?: string) {
  const c = context(v);
  const conf = confidenceOf(v, c);
  const org = orgOf(v);
  const withResale = org ? entitledModules(org).has('resale_readiness') : false;
  return buildPassport(v, c.services, c.documents, {
    confidence: conf,
    resale: withResale ? resaleOf(v, c, conf) : null,
    photoUrl: photoUrl(v, photoBase),
    issuer: org && !org.isPlatform && org.branding.passportCobrand ? { name: org.branding.appName } : null,
  });
}

// ---------------------------------------------------------------------------------------
// Public routes (no sign-in): status, demo personas, shared passports and data rooms
// ---------------------------------------------------------------------------------------

api.get('/status', (_req, res) => {
  const p = activeProvider();
  res.json({ provider: p.name, liveAiConfigured: !!process.env.ANTHROPIC_API_KEY });
});

/** Demo sign-in: the list of sample identities. Replace with a real identity provider. */
api.get('/demo/personas', (_req, res) => {
  const db = getDB();
  res.json(db.users.map((u) => {
    const o = db.orgs.find((x) => x.id === u.orgId)!;
    return { id: u.id, name: u.name, title: u.title, role: u.role, org: o?.name, categories: o?.categories, isPlatform: !!o?.isPlatform };
  }));
});

api.post('/demo/reset', wrap((_req, res) => {
  resetToSeed();
  res.json({ ok: true });
}));

function sharedVehicle(token: string) {
  const share = getDB().shares.find((s) => s.token === token);
  const v = share && getDB().vehicles.find((x) => x.id === share.vehicleId);
  if (!v) throw new HttpError(404, 'This passport link is no longer active');
  return v;
}
api.get('/public/passport/:token', wrap((req, res) => {
  const v = sharedVehicle(req.params.token);
  res.json({ passport: passportFor(v, `/api/public/passport/${req.params.token}/photo`) });
}));
api.get('/public/passport/:token/photo', wrap((req, res) => sendPhoto(sharedVehicle(req.params.token), res)));

function openRoom(token: string): { room: DataRoom; v: Vehicle } {
  const db = getDB();
  const room = db.dataRooms.find((r) => r.token === token);
  if (!room) throw new HttpError(404, 'This data room link is not valid.');
  if (room.revokedAt) throw new HttpError(410, 'Access to this data room has been revoked by its owner.');
  if (new Date(room.expiresAt).getTime() < Date.now()) throw new HttpError(410, 'This data room link has expired.');
  const v = db.vehicles.find((x) => x.id === room.vehicleId);
  if (!v) throw new HttpError(404, 'This vehicle is no longer available.');
  return { room, v };
}
api.get('/public/dataroom/:token', wrap((req, res) => {
  const { room, v } = openRoom(req.params.token);
  room.views += 1;
  save();
  const p = passportFor(v, `/api/public/dataroom/${req.params.token}/photo`);
  const c = context(v);
  const conf = confidenceOf(v, c);
  const s = new Set(room.sections);
  const org = orgOf(v);
  res.json({
    room: { recipient: room.recipient, expiresAt: room.expiresAt, sharedBy: org?.isPlatform ? 'CarVault' : org?.name, sections: room.sections },
    vehicle: p.vehicle,
    identity: s.has('passport') ? p.identity : undefined,
    confidence: s.has('confidence') ? { score: conf.score, level: conf.level, verifiedRecords: conf.verifiedRecords, sources: conf.sources, gaps: conf.gaps, dimensions: conf.dimensions.map((d) => ({ id: d.id, label: d.label, score: d.score, level: d.level, why: d.why, sources: d.sources, lastVerified: d.lastVerified })) } : undefined,
    serviceHistory: s.has('service') ? p.serviceHistory : undefined,
    inspection: s.has('inspection') ? p.serviceHistory.filter((r) => r.category === 'inspection') : undefined,
    mileage: s.has('mileage') ? { timeline: p.mileageTimeline, dimension: conf.dimensions.find((d) => d.id === 'mileage') } : undefined,
    ownership: s.has('ownership') ? conf.dimensions.find((d) => d.id === 'ownership') : undefined,
    insurance: s.has('insurance') ? conf.dimensions.find((d) => d.id === 'insurance') : undefined,
    documents: s.has('documents') ? p.documents : undefined,
    transfer: s.has('transfer') ? publicTransfer(computeTransfer({ vehicle: v, services: c.services, documents: c.documents }, 'public')) : undefined,
    unknowns: p.unknowns,
    notice: p.notice,
  });
}));
api.get('/public/dataroom/:token/photo', wrap((req, res) => sendPhoto(openRoom(req.params.token).v, res)));

/** Buyers see status and guidance, never who at the seller's side ticked what. */
function publicTransfer(t: ReturnType<typeof computeTransfer>) {
  return { ...t, items: t.items.map(({ confirm, confirmedBy, confirmedAt, ...i }) => i) };
}

/**
 * Listing badge. A marketplace or dealer site embeds this SVG next to a listing; it links back to the
 * data room. It shows the score only when the owner shared the Vehicle Confidence section, and it
 * stops working the moment the room expires or is revoked.
 */
api.get('/public/dataroom/:token/badge.svg', (req, res) => {
  const esc = (x: string) => x.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  let line1 = 'CarVault verified history';
  let line2 = 'Link expired or revoked';
  let accent = '#8a96a3';
  try {
    const { room, v } = openRoom(req.params.token);
    const conf = confidenceOf(v);
    const title = `${v.year} ${v.make} ${v.model}`;
    if (room.sections.includes('confidence')) {
      line1 = `Vehicle Confidence ${conf.score}/100 · ${conf.level === 'high' ? 'High' : conf.level === 'moderate' ? 'Moderate' : 'Low'}`;
      accent = conf.level === 'high' ? '#2fbf71' : conf.level === 'moderate' ? '#e0a526' : '#e5534b';
    }
    line2 = `${title} · ${conf.verifiedRecords} source-backed records`;
  } catch { /* expired, revoked or unknown: render the neutral badge */ }
  const w = 320;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="64" viewBox="0 0 ${w} 64" role="img" aria-label="${esc(`${line1}. ${line2}`)}">
<rect width="${w}" height="64" rx="12" fill="#0d1217"/><rect x="0.5" y="0.5" width="${w - 1}" height="63" rx="11.5" fill="none" stroke="#2a3642"/>
<circle cx="28" cy="32" r="12" fill="none" stroke="${accent}" stroke-width="3"/><path d="M22.5 32.5l4 4 7-8" fill="none" stroke="${accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
<text x="52" y="27" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#eef2f5">${esc(line1)}</text>
<text x="52" y="45" font-family="Manrope, Segoe UI, sans-serif" font-size="11" fill="#aab6c1">${esc(line2.length > 44 ? `${line2.slice(0, 43)}…` : line2)}</text>
</svg>`);
});

function sendPhoto(v: Vehicle, res: Response) {
  const full = v.photo && path.join(UPLOAD_DIR, v.photo.storedName);
  if (!full || !fs.existsSync(full)) throw new HttpError(404, 'No photo');
  res.setHeader('Content-Type', v.photo!.mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(full);
}

// ---------------------------------------------------------------------------------------
// Everything below requires a signed-in user
// ---------------------------------------------------------------------------------------
api.use(authenticate);

/** Branding fields a tenant admin may change themselves (when self-serve is on). */
const TENANT_BRAND_FIELDS: (keyof Branding)[] = ['appName', 'logoText', 'logoDataUrl', 'faviconEmoji', 'primaryColor', 'secondaryColor', 'theme', 'loginHeadline', 'emailFooter', 'pdfFooter'];
/** Platform-controlled branding: identity on the wire, domains and the passport's trust presentation. */
const ADMIN_BRAND_FIELDS: (keyof Branding)[] = ['typography', 'emailSenderName', 'emailSenderAddress', 'passportCobrand', 'customDomain'];

function catalogFor(org: Organization) {
  const ent = entitledModules(org);
  return {
    categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, description: c.description, licensed: org.categories.includes(c.id) || org.categories.includes('full'), moduleCount: c.modules.length })),
    modules: MODULES.map((m) => ({ ...m, entitled: org.isPlatform || ent.has(m.id), unlockedBy: unlockedBy(m.id) })),
  };
}

api.get('/session', (_req, res) => {
  const { user, org } = ctx();
  res.json({
    user, org: { id: org.id, name: org.name, categories: org.categories, plan: org.plan, status: org.status, isPlatform: !!org.isPlatform, brandingSelfServe: org.brandingSelfServe },
    branding: org.branding,
    nav: org.isPlatform ? [] : navFor(org),
    entitlements: org.isPlatform ? MODULES.map((m) => m.id) : [...entitledModules(org)],
    catalog: catalogFor(org),
    permissions: {
      isPlatformAdmin: user.role === 'platform_admin',
      isTenantAdmin: user.role === 'tenant_admin',
      canEditBranding: user.role === 'platform_admin' || (user.role === 'tenant_admin' && org.brandingSelfServe),
      tenantBrandFields: TENANT_BRAND_FIELDS,
      adminBrandFields: ADMIN_BRAND_FIELDS,
    },
  });
});

// --- Tenant organization ----------------------------------------------------------------

api.get('/org', (_req, res) => {
  const { org } = ctx();
  const db = getDB();
  res.json({
    org,
    users: db.users.filter((u) => u.orgId === org.id),
    vehicleCount: db.vehicles.filter((v) => v.orgId === org.id).length,
    catalog: catalogFor(org),
  });
});

api.patch('/org/branding', wrap((req, res) => {
  const { user, org } = ctx();
  requireTenantAdmin('branding.update');
  const b = (req.body ?? {}) as Partial<Branding>;
  const attempted = Object.keys(b) as (keyof Branding)[];
  const locked = attempted.filter((k) => !TENANT_BRAND_FIELDS.includes(k));
  if (user.role !== 'platform_admin') {
    if (!org.brandingSelfServe) {
      audit('branding.update', 'Branding is managed by CarVault Admin for this organization', 'denied');
      throw new HttpError(403, 'Branding for your organization is managed by CarVault Admin.');
    }
    if (locked.length) {
      audit('branding.update', `Attempted to change platform-controlled fields: ${locked.join(', ')}`, 'denied');
      throw new HttpError(403, `These settings are controlled by CarVault Admin: ${locked.join(', ')}.`, { locked });
    }
  }
  org.branding = sanitizeBranding({ ...org.branding, ...b });
  audit('branding.update', `Updated ${attempted.join(', ')}`);
  save();
  res.json({ branding: org.branding });
}));

function sanitizeBranding(b: Branding): Branding {
  const str = (s: unknown, max: number) => String(s ?? '').slice(0, max).trim();
  if (!HEX.test(b.primaryColor)) throw new HttpError(400, 'Primary colour must be a hex colour like #4DA3FF');
  if (!HEX.test(b.secondaryColor)) throw new HttpError(400, 'Secondary colour must be a hex colour like #B9C4CE');
  if (b.logoDataUrl && (!/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(b.logoDataUrl) || b.logoDataUrl.length > 280_000))
    throw new HttpError(400, 'Logo must be a PNG, JPG, WebP or SVG under 200 KB');
  if (b.customDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(b.customDomain)) throw new HttpError(400, 'Enter a valid domain, e.g. vehicles.abcmotors.ae');
  return {
    ...b,
    appName: str(b.appName, 60) || 'CarVault',
    logoText: str(b.logoText, 40) || str(b.appName, 40),
    loginHeadline: str(b.loginHeadline, 120),
    emailFooter: str(b.emailFooter, 240),
    pdfFooter: str(b.pdfFooter, 240),
    emailSenderName: str(b.emailSenderName, 60),
    emailSenderAddress: str(b.emailSenderAddress, 120),
    theme: b.theme === 'light' ? 'light' : 'dark',
    typography: (['Manrope', 'Inter', 'IBM Plex Sans'] as const).includes(b.typography) ? b.typography : 'Manrope',
    faviconEmoji: str(b.faviconEmoji, 4) || undefined,
    customDomain: str(b.customDomain, 120) || undefined,
  };
}

/** Tenants can see locked categories/modules but can never activate them. */
api.post('/org/categories/:id/activate', wrap((req) => {
  const { org } = ctx();
  if (!isCategory(req.params.id)) throw new HttpError(404, 'Unknown category');
  if (isPlatformAdmin()) throw new HttpError(400, 'Use the CarVault Admin console to change an organization\'s categories.');
  const name = categoryById(req.params.id).name;
  audit('category.activate', `Tried to activate ${name}`, 'denied');
  if (org.categories.includes(req.params.id)) throw new HttpError(409, `${name} is already active.`);
  throw new HttpError(403, 'Your organization is not licensed for this category. Contact CarVault Admin.');
}));

api.post('/org/modules/:id/activate', wrap((req) => {
  const { org } = ctx();
  if (!isModule(req.params.id)) throw new HttpError(404, 'Unknown module');
  const m = MODULES.find((x) => x.id === req.params.id)!;
  if (hasModule(m.id)) throw new HttpError(409, `${m.name} is already included in your plan.`);
  audit('module.activate', `Tried to activate ${m.name}`, 'denied');
  const via = unlockedBy(m.id).map((c) => categoryById(c).name).join(' or ');
  throw new HttpError(403, `Your organization is not licensed for this ${via ? 'category' : 'module'}. Contact CarVault Admin.`, { unlockedBy: via, org: org.name });
}));

api.post('/org/access-requests', wrap((req, res) => {
  const { org } = ctx();
  const moduleId = String(req.body?.module ?? '');
  const categoryId = String(req.body?.category ?? '');
  const what = isModule(moduleId) ? MODULES.find((m) => m.id === moduleId)!.name : isCategory(categoryId) ? categoryById(categoryId as CategoryId).name : null;
  if (!what) throw new HttpError(400, 'Choose a module or category');
  audit('access.request', `${org.name} requested access to ${what}`);
  res.status(201).json({ ok: true, message: `Request sent. CarVault Admin will contact you about ${what}.` });
}));

api.post('/org/users', wrap((req, res) => {
  const { org } = ctx();
  requireTenantAdmin('user.invite');
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const role: Role = req.body?.role === 'tenant_admin' ? 'tenant_admin' : 'tenant_user';
  if (!name) throw new HttpError(400, 'Enter a name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address');
  if (getDB().users.some((u) => u.email === email)) throw new HttpError(409, 'A user with this email already exists');
  const u: User = { id: newId('u'), name, email, role, orgId: org.id, title: String(req.body?.title ?? '').trim() || undefined };
  getDB().users.push(u);
  audit('user.invite', `Added ${name} (${role === 'tenant_admin' ? 'admin' : 'user'})`);
  res.status(201).json(u);
}));

api.delete('/org/users/:id', wrap((req, res) => {
  const { org, user } = ctx();
  requireTenantAdmin('user.remove');
  const db = getDB();
  const u = db.users.find((x) => x.id === req.params.id && x.orgId === org.id);
  if (!u) throw new HttpError(404, 'User not found');
  if (u.id === user.id) throw new HttpError(400, 'You can\'t remove yourself');
  db.users = db.users.filter((x) => x.id !== u.id);
  audit('user.remove', `Removed ${u.name}`);
  res.json({ ok: true });
}));

api.post('/org/branches', wrap((req, res) => {
  const { org } = ctx();
  requireTenantAdmin('branch.create');
  const name = String(req.body?.name ?? '').trim();
  const city = String(req.body?.city ?? '').trim();
  if (!name || !city) throw new HttpError(400, 'Enter a branch name and city');
  org.branches.push({ id: newId('br'), name, city });
  audit('branch.create', `Added branch ${name}, ${city}`);
  res.status(201).json(org.branches);
}));

// --- Portfolio: tenant-scoped summaries for dashboards and module pages -----------------

function summary(v: Vehicle) {
  const c = context(v);
  const conf = confidenceOf(v, c);
  const resale = resaleOf(v, c, conf);
  const value = estimateValue(v);
  const dim = Object.fromEntries(conf.dimensions.map((d) => [d.id, d.score]));
  const docs = c.documents.filter((d) => d.status === 'confirmed');
  const exp = (t: DocType) => docs.filter((d) => d.type === t && d.expiresOn).map((d) => d.expiresOn!).sort().pop();
  const insp = c.services.filter((s) => s.category === 'inspection');
  const org = orgOf(v);
  return {
    id: v.id, orgId: v.orgId, orgName: org?.name, make: v.make, model: v.model, variant: v.variant, year: v.year,
    chassis: v.chassis, plate: v.plate, emirate: v.emirate, ownerName: v.ownerName, mileage: v.mileage, vin: v.vin,
    photoUrl: photoUrl(v), photoKind: v.photo?.kind,
    confidence: { score: conf.score, level: conf.level, gaps: conf.gaps, verifiedRecords: conf.verifiedRecords, sources: conf.sources, dims: dim, topGap: conf.improvements[0]?.label },
    resale: { score: resale.score, level: resale.level, notReady: resale.items.filter((i) => !i.ready).map((i) => i.label) },
    attention: c.insights.filter((i) => i.status === 'due' || i.status === 'attention').map((i) => ({ id: i.id, title: i.title, status: i.status, metric: i.metric })),
    upcoming: c.insights.filter((i) => i.status === 'upcoming').map((i) => ({ id: i.id, title: i.title, metric: i.metric })),
    spend: c.services.reduce((a, s) => a + s.cost, 0),
    records: c.services.length,
    documents: docs.length,
    value: value.available ? { low: value.low, mid: value.mid, high: value.high } : null,
    lastInspection: insp[0] ? { date: insp[0].date, title: insp[0].title, notes: insp[0].notes, shop: insp[0].workshop, trust: insp[0].trust, id: insp[0].id } : null,
    inspections: insp.map((s) => ({ id: s.id, date: s.date, title: s.title, notes: s.notes, shop: s.workshop, mileage: s.mileage, trust: s.trust })),
    parts: c.services.flatMap((s) => s.parts.map((p) => ({ name: p.name, date: s.date, title: s.title, recordId: s.id }))),
    insuranceExpires: exp('insurance') ?? null,
    registrationExpires: exp('registration') ?? null,
    conflicts: c.services.filter((s) => s.trust === 'conflict' || (s.conflicts?.length ?? 0) > 0).map((s) => ({ id: s.id, title: s.title, date: s.date, detail: s.conflicts?.[0] })),
    imported: c.services.filter((s) => s.trust === 'imported').length,
    lastActivity: [c.services[0]?.date, docs[0]?.uploadedAt?.slice(0, 10)].filter(Boolean).sort().pop() ?? v.createdAt.slice(0, 10),
  };
}

api.get('/portfolio', (_req, res) => {
  const vehicles = visibleVehicles().map(summary);
  const db = getDB();
  const ids = new Set(vehicles.map((v) => v.id));
  const recent = [
    ...db.services.filter((s) => ids.has(s.vehicleId)).map((s) => ({ at: s.date, vehicleId: s.vehicleId, kind: 'record' as const, text: s.title, trust: s.trust })),
    ...db.documents.filter((d) => ids.has(d.vehicleId) && d.status === 'confirmed').map((d) => ({ at: d.uploadedAt.slice(0, 10), vehicleId: d.vehicleId, kind: 'document' as const, text: d.fileName, trust: d.trust })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  res.json({ vehicles, recent });
});

// --- Vehicles -------------------------------------------------------------------------

api.get('/vehicles', (_req, res) => {
  res.json(
    visibleVehicles().map((v) => {
      const c = context(v);
      const conf = confidenceOf(v, c);
      return {
        vehicle: v,
        recordCount: c.services.length,
        documentCount: c.documents.filter((d) => d.status === 'confirmed').length,
        attention: c.insights.filter((i) => i.status === 'due' || i.status === 'attention').length,
        health: computeRecordsHealth(v, c.services, c.documents, c.insights).completeness,
        vehicleHealth: computeVehicleHealth(c.insights),
        confidence: { score: conf.score, level: conf.level, gaps: conf.gaps },
      };
    }),
  );
});

api.post('/vehicles', wrap(async (req, res) => {
  const { org } = ctx();
  const b = req.body ?? {};
  const make = String(b.make ?? '').trim();
  const model = String(b.model ?? '').trim();
  const year = Number(b.year);
  const mileage = Number(b.mileage);
  if (!make || !model) throw new HttpError(400, 'Make and model are required');
  if (!Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() + 1) throw new HttpError(400, 'Enter a valid year');
  if (!Number.isFinite(mileage) || mileage < 0) throw new HttpError(400, 'Enter a valid mileage');
  const vin = String(b.vin ?? '').trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) throw new HttpError(400, 'A VIN is 17 characters (letters and numbers, no I, O or Q)');
  const price = b.originalPrice === '' || b.originalPrice == null ? undefined : Number(b.originalPrice);
  let orgId = org.id;
  if (org.isPlatform) {
    const target = getDB().orgs.find((o) => o.id === b.orgId && !o.isPlatform);
    if (!target) throw new HttpError(400, 'Choose which organization this vehicle belongs to');
    orgId = target.id;
  }
  const v: Vehicle = {
    id: newId('veh'), orgId,
    ownerName: String(b.ownerName ?? '').trim() || undefined,
    make, model,
    variant: String(b.variant ?? '').trim(),
    year, vin, mileage,
    mileageUpdatedAt: new Date().toISOString(),
    plate: String(b.plate ?? '').trim() || undefined,
    emirate: String(b.emirate ?? '').trim() || undefined,
    color: String(b.color ?? '').trim() || undefined,
    chassis: String(b.chassis ?? '').trim().toUpperCase() || undefined,
    spec: String(b.spec ?? '').trim() || undefined,
    originalPrice: price && price > 0 ? price : undefined,
    createdAt: new Date().toISOString(),
  };
  getDB().vehicles.push(v);
  // No photo coming from the owner: look for a licensed reference photo of this model.
  if (!b.skipReference) v.referenceTried = (await attachReferencePhoto(v)) !== 'unavailable';
  audit('vehicle.create', `${v.year} ${v.make} ${v.model}`, 'ok', orgId);
  save();
  res.status(201).json(v);
}));

api.get('/vehicles/:id', wrap(async (req, res) => {
  const v = vehicleOr404(req.params.id);
  // Vehicles added before reference photos existed get one lookup attempt.
  if (!v.photo && !v.photoRemoved && !v.referenceTried) {
    v.referenceTried = (await attachReferencePhoto(v)) !== 'unavailable';
    save();
  }
  res.json(detail(v));
}));

api.patch('/vehicles/:id', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  const b = req.body ?? {};
  if (b.mileage !== undefined) {
    const m = Number(b.mileage);
    if (!Number.isFinite(m) || m < 0) throw new HttpError(400, 'Enter a valid mileage');
    const maxRecord = Math.max(0, ...getDB().services.filter((s) => s.vehicleId === v.id).map((s) => s.mileage));
    if (m < maxRecord) throw new HttpError(400, `Odometer can't be lower than the highest recorded service mileage (${maxRecord.toLocaleString('en-US')} km)`);
    v.mileage = m;
    v.mileageUpdatedAt = new Date().toISOString();
  }
  for (const k of ['plate', 'emirate', 'color', 'variant', 'chassis', 'spec', 'ownerName'] as const) if (typeof b[k] === 'string') v[k] = b[k].trim() || undefined as never;
  if (b.originalPrice !== undefined) v.originalPrice = Number(b.originalPrice) > 0 ? Number(b.originalPrice) : undefined;
  save();
  res.json(detail(v));
}));

api.delete('/vehicles/:id', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  const db = getDB();
  db.documents.filter((d) => d.vehicleId === v.id && d.storedName).forEach((d) => fs.rmSync(path.join(UPLOAD_DIR, d.storedName!), { force: true }));
  if (v.photo) fs.rmSync(path.join(UPLOAD_DIR, v.photo.storedName), { force: true });
  db.vehicles = db.vehicles.filter((x) => x.id !== v.id);
  db.documents = db.documents.filter((d) => d.vehicleId !== v.id);
  db.services = db.services.filter((s) => s.vehicleId !== v.id);
  db.chats = db.chats.filter((c) => c.vehicleId !== v.id);
  db.shares = db.shares.filter((s) => s.vehicleId !== v.id);
  db.dataRooms = db.dataRooms.filter((r) => r.vehicleId !== v.id);
  audit('vehicle.delete', `${v.year} ${v.make} ${v.model}`, 'ok', v.orgId);
  save();
  res.json({ ok: true });
}));

// --- Vehicle Confidence & Resale Readiness ---------------------------------------------

api.get('/vehicles/:id/confidence', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('vehicle_confidence', 'Vehicle Confidence');
  res.json(confidenceOf(v));
}));

api.get('/vehicles/:id/resale', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('resale_readiness', 'Resale Readiness');
  const c = context(v);
  const conf = confidenceOf(v, c);
  res.json({ ...resaleOf(v, c, conf), confidence: { score: conf.score, level: conf.level }, value: estimateValue(v) });
}));

// --- UAE transfer checklist -------------------------------------------------------------
const TRANSFER_CONFIRMS: Record<TransferCheckId, 'done' | 'not_applicable'> = { fines: 'done', loan: 'not_applicable', seller_id: 'done', buyer_insurance: 'done' };

api.get('/vehicles/:id/transfer', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('resale_readiness', 'Resale Readiness');
  const c = context(v);
  res.json(computeTransfer({ vehicle: v, services: c.services, documents: c.documents }));
}));

api.put('/vehicles/:id/transfer/:check', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('resale_readiness', 'Resale Readiness');
  const { user } = ctx();
  const check = req.params.check as TransferCheckId;
  if (!(check in TRANSFER_CONFIRMS)) throw new HttpError(404, 'Unknown transfer check');
  const checks = (v.transferChecks ??= {});
  if (req.body?.clear === true) {
    delete checks[check];
    audit('transfer.check', `${v.make} ${v.model}: cleared "${check}"`, 'ok', v.orgId);
  } else {
    checks[check] = { status: TRANSFER_CONFIRMS[check], at: new Date().toISOString(), by: user.name };
    audit('transfer.check', `${v.make} ${v.model}: confirmed "${check}"`, 'ok', v.orgId);
  }
  const c = context(v);
  res.json(computeTransfer({ vehicle: v, services: c.services, documents: c.documents }));
}));

// --- Documents ------------------------------------------------------------------------
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${newId('f')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

api.post('/vehicles/:id/documents', upload.single('file'), wrap(async (req, res) => {
  const v = vehicleOr404(req.params.id);
  if (!req.file) throw new HttpError(400, 'Choose a file to upload');
  const requested = String(req.body?.type ?? 'auto');
  const type = (DOC_TYPES as string[]).includes(requested) ? (requested as DocType) : 'auto';
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

  const { result, provider, fallbackReason } = await withFallback((p) =>
    p.extractDocument({
      vehicle: v, type, fileName: originalName, filePath: req.file!.path, mime: req.file!.mimetype,
      knownReadings: getDB().services.filter((s) => s.vehicleId === v.id && s.mileage > 0 && s.trust !== 'conflict').map((s) => ({ date: s.date, mileage: s.mileage })),
    }),
  );
  const db = getDB();
  const conflicts = detectConflicts(v, result.draft, result.fields, db.services.filter((s) => s.vehicleId === v.id));
  const doc: DocumentRecord = {
    id: newId('doc'), vehicleId: v.id, type: result.type, fileName: originalName, storedName: req.file.filename,
    mime: req.file.mimetype, size: req.file.size, uploadedAt: new Date().toISOString(), status: 'needs_review',
    extractedBy: provider, summary: result.summary, fields: result.fields, draft: result.draft, conflicts,
    issuedOn: result.issuedOn, expiresOn: result.expiresOn, trust: 'unverified',
  };
  db.documents.push(doc);
  save();
  res.status(201).json({ document: doc, fallbackReason });
}));

function docOr404(id: string) {
  const d = getDB().documents.find((x) => x.id === id);
  if (!d) throw new HttpError(404, 'Document not found');
  vehicleOr404(d.vehicleId); // tenant isolation
  return d;
}

api.get('/documents/:id/file', wrap((req, res) => {
  const d = docOr404(req.params.id);
  if (!d.storedName) throw new HttpError(404, 'No stored file for this document (sample data has no file)');
  const full = path.join(UPLOAD_DIR, d.storedName);
  if (!fs.existsSync(full)) throw new HttpError(404, 'File is missing from storage');
  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.fileName)}"`);
  res.sendFile(full);
}));

api.post('/documents/:id/confirm', wrap((req, res) => {
  const db = getDB();
  const doc = docOr404(req.params.id);
  if (doc.status === 'confirmed') throw new HttpError(409, 'Already confirmed');
  const v = vehicleOr404(doc.vehicleId);
  const b = req.body ?? {};

  if (DOC_TYPES.includes(b.type)) doc.type = b.type;
  if (Array.isArray(b.fields)) {
    doc.fields = (b.fields as ExtractedField[]).map((f) => ({ key: String(f.key), label: String(f.label), value: String(f.value ?? ''), confidence: 1 }));
  }
  const fieldVal = (k: string) => doc.fields.find((f) => f.key === k)?.value;
  const d = b.draft as Partial<ServiceDraft> | undefined;
  let draft: ServiceDraft | undefined;
  if (d) {
    if (!isDate(d.date)) throw new HttpError(400, 'Enter a valid date');
    const mileage = Number(d.mileage);
    const cost = Number(d.cost);
    if (!Number.isFinite(mileage) || mileage < 0) throw new HttpError(400, 'Enter a valid mileage');
    if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'Enter a valid cost');
    if (!String(d.title ?? '').trim()) throw new HttpError(400, 'Give the entry a title');
    draft = {
      date: d.date.slice(0, 10), mileage,
      category: CATEGORIES_SVC.includes(d.category as ServiceCategory) ? (d.category as ServiceCategory) : 'service',
      title: String(d.title).trim(),
      workshop: String(d.workshop ?? '').trim() || 'Unknown workshop',
      workPerformed: (d.workPerformed ?? []).map(String).map((s) => s.trim()).filter(Boolean),
      parts: (d.parts ?? []).filter((p) => p?.name?.trim()).map((p) => ({ name: p.name.trim(), partNo: p.partNo?.trim() || undefined })),
      cost, notes: d.notes?.trim() || undefined,
    };
  }

  const others = db.services.filter((s) => s.vehicleId === v.id);
  doc.conflicts = detectConflicts(v, draft, doc.fields, others);
  // An official certificate carries several dated odometer readings; each is checked like any other record.
  // Records already flagged as conflicts are left out: an official reading that disagrees with a
  // record CarVault already distrusts corroborates the flag rather than creating a new conflict.
  const certDrafts = certificateDrafts(doc);
  const certConflicts = new Map<ServiceDraft, string[]>();
  const trusted = others.filter((o) => o.trust !== 'conflict');
  certDrafts.forEach((cd, i) => {
    const found = detectConflicts(v, cd, [], [...trusted, ...certDrafts.slice(0, i).map((x) => ({ ...x, id: 'pending', vehicleId: v.id, trust: 'user' as const }))]);
    if (found.length) { certConflicts.set(cd, found); doc.conflicts.push(...found); }
  });
  if (doc.conflicts.length && !b.acknowledgeConflicts)
    throw new HttpError(409, 'This document conflicts with existing records', { conflicts: doc.conflicts });

  const exp = fieldVal('expires');
  if (isDate(exp)) doc.expiresOn = exp.slice(0, 10);
  else if (b.type !== undefined || Array.isArray(b.fields)) doc.expiresOn = undefined;
  const iss = fieldVal('issued');
  if (isDate(iss)) doc.issuedOn = iss.slice(0, 10);
  if (draft) doc.issuedOn = draft.date;

  // A real extraction the owner reviewed is "verified"; a simulated one is only "user provided".
  // Anything saved over a detected conflict is marked as a conflict so it can't pass as clean evidence.
  const base = doc.extractedBy === 'claude' ? 'verified' : 'user';
  doc.trust = doc.conflicts.length ? 'conflict' : base;
  doc.status = 'confirmed';
  doc.draft = draft;
  if (draft) {
    const rec: ServiceRecord = { ...draft, id: newId('svc'), vehicleId: v.id, sourceDocId: doc.id, trust: doc.trust, conflicts: doc.conflicts.length ? doc.conflicts : undefined };
    db.services.push(rec);
  }
  for (const cd of certDrafts) {
    const own = certConflicts.get(cd);
    db.services.push({ ...cd, id: newId('svc'), vehicleId: v.id, sourceDocId: doc.id, trust: own ? 'conflict' : doc.trust === 'conflict' ? base : doc.trust, conflicts: own });
  }
  save();
  res.json(detail(v));
}));

/**
 * Record that a person checked this document on the issuer's own verification service (for an RTA
 * certificate: its number on rta.ae). This, not the upload, is what makes it Verified.
 */
api.post('/documents/:id/verify', wrap((req, res) => {
  const { user, org } = ctx();
  const doc = docOr404(req.params.id);
  const v = vehicleOr404(doc.vehicleId);
  if (!canVerify(user, org)) {
    audit('document.verify', `Tried to verify ${doc.fileName}`, 'denied', v.orgId);
    throw new HttpError(403, org.categories.includes('consumer')
      ? 'Owners can\'t verify their own documents. CarVault\'s verification team checks official certificates.'
      : 'Only your organization administrator can verify documents.');
  }
  if (doc.status !== 'confirmed') throw new HttpError(409, 'Review and confirm the document first');
  if (!VERIFIABLE.includes(doc.type)) throw new HttpError(400, 'This type of document has no issuer to check it against');
  if (doc.trust === 'conflict') throw new HttpError(409, 'Resolve the conflict on this document before verifying it');
  const reference = String(req.body?.reference ?? '').trim().slice(0, 60);
  if (reference.length < 4) throw new HttpError(400, 'Enter the certificate or reference number you checked');
  if (req.body?.attest !== true) throw new HttpError(400, 'Confirm that you checked it on the issuer\'s official service');
  const checkedByOrg = org.isPlatform ? 'CarVault verification team' : org.name;
  doc.verification = {
    method: 'issuer_check', reference, checkedBy: user.name, checkedByOrg, checkedAt: new Date().toISOString(),
    note: String(req.body?.note ?? '').trim().slice(0, 200) || undefined,
  };
  doc.trust = 'verified';
  for (const s of getDB().services) if (s.sourceDocId === doc.id && s.trust !== 'conflict') s.trust = 'verified';
  audit('document.verify', `${checkedByOrg} checked ${doc.fileName} with ${OFFICIAL_ISSUER[doc.type] ?? 'the issuer'} (ref ${reference})`, 'ok', v.orgId);
  res.json(detail(v));
}));

api.delete('/documents/:id', wrap((req, res) => {
  const db = getDB();
  const doc = docOr404(req.params.id);
  if (doc.storedName) fs.rmSync(path.join(UPLOAD_DIR, doc.storedName), { force: true });
  db.documents = db.documents.filter((d) => d.id !== doc.id);
  db.services = db.services.filter((s) => s.sourceDocId !== doc.id);
  save();
  res.json(detail(vehicleOr404(doc.vehicleId)));
}));

// --- Manual timeline entry ----------------------------------------------------------------
api.post('/vehicles/:id/services', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  const d = req.body ?? {};
  if (!isDate(d.date)) throw new HttpError(400, 'Enter a valid date');
  const mileage = Number(d.mileage);
  const cost = Number(d.cost ?? 0);
  if (!Number.isFinite(mileage) || mileage < 0) throw new HttpError(400, 'Enter a valid mileage');
  if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'Enter a valid cost');
  if (!String(d.title ?? '').trim()) throw new HttpError(400, 'Give the entry a title');
  const draft: ServiceDraft = {
    date: d.date.slice(0, 10), mileage, cost,
    category: CATEGORIES_SVC.includes(d.category) ? d.category : 'service',
    title: String(d.title).trim(),
    workshop: String(d.workshop ?? '').trim() || 'Unknown workshop',
    workPerformed: [], parts: [],
    notes: String(d.notes ?? '').trim() || undefined,
  };
  const others = getDB().services.filter((s) => s.vehicleId === v.id);
  const conflicts = detectConflicts(v, draft, [], others);
  if (conflicts.length && !d.acknowledgeConflicts) throw new HttpError(409, 'This entry conflicts with existing records', { conflicts });
  getDB().services.push({ ...draft, id: newId('svc'), vehicleId: v.id, trust: conflicts.length ? 'conflict' : 'user', conflicts: conflicts.length ? conflicts : undefined });
  save();
  res.status(201).json(detail(v));
}));

api.delete('/services/:id', wrap((req, res) => {
  const db = getDB();
  const s = db.services.find((x) => x.id === req.params.id);
  if (!s) throw new HttpError(404, 'Record not found');
  vehicleOr404(s.vehicleId);
  db.services = db.services.filter((x) => x.id !== s.id);
  save();
  res.json(detail(vehicleOr404(s.vehicleId)));
}));

// --- Vehicle photo -------------------------------------------------------------------
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${newId('photo')}${path.extname(file.originalname).slice(0, 10)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

api.post('/vehicles/:id/photo', photoUpload.single('photo'), wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  if (!req.file) throw new HttpError(400, 'Choose a JPG, PNG or WebP image up to 8 MB');
  if (v.photo) fs.rmSync(path.join(UPLOAD_DIR, v.photo.storedName), { force: true });
  v.photo = { storedName: req.file.filename, mime: req.file.mimetype, updatedAt: new Date().toISOString(), kind: 'owner' };
  v.photoRemoved = undefined;
  save();
  res.json(detail(v));
}));

api.get('/vehicles/:id/photo', wrap((req, res) => sendPhoto(vehicleOr404(req.params.id), res)));

api.post('/vehicles/:id/photo/reference', wrap(async (req, res) => {
  const v = vehicleOr404(req.params.id);
  const result = await attachReferencePhoto(v);
  v.referenceTried = true;
  if (result === 'attached') v.photoRemoved = undefined;
  save();
  if (result === 'unavailable') throw new HttpError(503, 'The photo library is busy or unreachable right now. Try again in a minute, or upload your own photo.');
  if (result === 'none') throw new HttpError(404, `No freely licensed photo of the ${v.make} ${v.model} was found. Upload your own instead.`);
  res.json(detail(v));
}));

api.delete('/vehicles/:id/photo', wrap(async (req, res) => {
  const v = vehicleOr404(req.params.id);
  const wasReference = v.photo?.kind === 'reference';
  if (v.photo) fs.rmSync(path.join(UPLOAD_DIR, v.photo.storedName), { force: true });
  v.photo = undefined;
  // Removing the owner's photo falls back to a realistic reference photo of the model.
  // Removing a reference photo means the owner doesn't want one, so show the neutral drawing.
  if (wasReference || (await attachReferencePhoto(v)) !== 'attached') v.photoRemoved = true;
  v.referenceTried = true;
  save();
  res.json(detail(v));
}));

// --- Assistant ------------------------------------------------------------------------
api.get('/vehicles/:id/chat', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  res.json(getDB().chats.filter((c) => c.vehicleId === v.id));
}));

api.post('/vehicles/:id/chat', wrap(async (req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('assistant', 'CarVault Assistant');
  const text = String(req.body?.message ?? '').trim();
  if (!text) throw new HttpError(400, 'Type a message');
  if (text.length > 2000) throw new HttpError(400, 'Message is too long');
  const db = getDB();
  const history = db.chats.filter((c) => c.vehicleId === v.id);
  const userMsg: ChatMessage = { id: newId('msg'), vehicleId: v.id, role: 'user', at: new Date().toISOString(), text };
  const c = context(v);
  const { result, provider } = await withFallback((p) => p.chat({ ...c, confidence: confidenceOf(v, c) }, text, history));
  const reply: ChatMessage = {
    id: newId('msg'), vehicleId: v.id, role: 'assistant', at: new Date().toISOString(),
    blocks: result.blocks, suggestions: result.suggestions, provider,
  };
  db.chats.push(userMsg, reply);
  save();
  res.json({ user: userMsg, reply });
}));

api.delete('/vehicles/:id/chat', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  getDB().chats = getDB().chats.filter((c) => c.vehicleId !== v.id);
  save();
  res.json({ ok: true });
}));

// --- Passport -------------------------------------------------------------------------
api.get('/vehicles/:id/passport', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  const share = getDB().shares.find((s) => s.vehicleId === v.id);
  res.json({ passport: passportFor(v), share: share ?? null });
}));

api.post('/vehicles/:id/share', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  const db = getDB();
  let share = db.shares.find((s) => s.vehicleId === v.id);
  if (!share) {
    share = { token: randomBytes(12).toString('base64url'), vehicleId: v.id, createdAt: new Date().toISOString() };
    db.shares.push(share);
    audit('passport.share', `Shared passport for ${v.make} ${v.model}`, 'ok', v.orgId);
    save();
  }
  res.status(201).json(share);
}));

api.delete('/vehicles/:id/share', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  getDB().shares = getDB().shares.filter((s) => s.vehicleId !== v.id);
  save();
  res.json({ ok: true });
}));

// --- Vehicle Data Room ------------------------------------------------------------------
export const DATAROOM_SECTIONS = ['passport', 'confidence', 'service', 'inspection', 'ownership', 'mileage', 'insurance', 'documents', 'transfer'];

api.get('/vehicles/:id/datarooms', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('data_room', 'Vehicle Data Room');
  res.json(getDB().dataRooms.filter((r) => r.vehicleId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}));

api.post('/vehicles/:id/datarooms', wrap((req, res) => {
  const v = vehicleOr404(req.params.id);
  requireModule('data_room', 'Vehicle Data Room');
  const { user } = ctx();
  const b = req.body ?? {};
  const sections = (Array.isArray(b.sections) ? b.sections : []).filter((s: unknown) => DATAROOM_SECTIONS.includes(String(s)));
  if (!sections.length) throw new HttpError(400, 'Choose at least one section to share');
  const hours = Number(b.expiresInHours);
  if (![24, 48, 72, 168].includes(hours)) throw new HttpError(400, 'Choose an expiry: 24, 48, 72 hours or 7 days');
  const recipient = String(b.recipient ?? '').trim().slice(0, 80) || 'Buyer';
  const room: DataRoom = {
    id: newId('room'), vehicleId: v.id, orgId: v.orgId, token: randomBytes(18).toString('base64url'), recipient, sections,
    createdAt: new Date().toISOString(), createdBy: user.name, expiresAt: new Date(Date.now() + hours * 3_600_000).toISOString(), views: 0,
  };
  getDB().dataRooms.push(room);
  audit('dataroom.create', `Data room for ${v.make} ${v.model} → ${recipient}, ${hours}h, ${sections.join(', ')}`, 'ok', v.orgId);
  res.status(201).json(room);
}));

api.delete('/datarooms/:id', wrap((req, res) => {
  const db = getDB();
  const room = db.dataRooms.find((r) => r.id === req.params.id);
  if (!room) throw new HttpError(404, 'Data room not found');
  vehicleOr404(room.vehicleId);
  if (!room.revokedAt) room.revokedAt = new Date().toISOString();
  audit('dataroom.revoke', `Revoked access for ${room.recipient}`, 'ok', room.orgId);
  res.json(room);
}));

// ---------------------------------------------------------------------------------------
// CarVault Admin (platform owner only)
// ---------------------------------------------------------------------------------------

function orgSummary(o: Organization) {
  const db = getDB();
  const vehicles = db.vehicles.filter((v) => v.orgId === o.id);
  const confs = vehicles.map((v) => confidenceOf(v).score);
  return {
    id: o.id, name: o.name, categories: o.categories, plan: o.plan, status: o.status, isPlatform: !!o.isPlatform,
    users: db.users.filter((u) => u.orgId === o.id).length, vehicles: vehicles.length, branches: o.branches.length,
    modules: entitledModules(o).size, avgConfidence: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : null,
    customDomain: o.branding.customDomain, createdAt: o.createdAt,
  };
}

api.get('/admin/overview', (_req, res) => {
  requirePlatformAdmin('admin.overview');
  const db = getDB();
  const tenants = db.orgs.filter((o) => !o.isPlatform);
  const confs = db.vehicles.map((v) => confidenceOf(v).score);
  res.json({
    tenants: tenants.length,
    activeTenants: tenants.filter((o) => o.status === 'active').length,
    users: db.users.length,
    vehicles: db.vehicles.length,
    avgConfidence: confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : null,
    highConfidence: confs.filter((c) => c >= 85).length,
    dataRooms: db.dataRooms.filter((r) => !r.revokedAt && new Date(r.expiresAt).getTime() > Date.now()).length,
    byCategory: CATEGORIES.map((c) => ({ id: c.id, name: c.name, tenants: tenants.filter((o) => o.categories.includes(c.id)).length })),
    accessRequests: db.audit.filter((e) => e.action === 'access.request' || e.outcome === 'denied').slice(0, 8),
    recent: db.audit.slice(0, 8),
  });
});

api.get('/admin/orgs', (_req, res) => {
  requirePlatformAdmin('admin.orgs');
  res.json(getDB().orgs.map(orgSummary));
});

api.post('/admin/orgs', wrap((req, res) => {
  requirePlatformAdmin('org.create');
  const name = String(req.body?.name ?? '').trim();
  const category = req.body?.category;
  if (!name) throw new HttpError(400, 'Enter the organization name');
  if (!isCategory(category)) throw new HttpError(400, 'Choose a category');
  const db = getDB();
  if (db.orgs.some((o) => o.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, 'An organization with this name already exists');
  const o: Organization = {
    id: newId('org'), name, categories: [category], moduleOverrides: { add: [], remove: [] },
    plan: String(req.body?.plan ?? '').trim() || `${categoryById(category).name} · Standard`, status: 'active',
    branding: brand({ appName: name, logoText: name, emailSenderName: name }), brandingSelfServe: true,
    branches: [], integrations: [], createdAt: new Date().toISOString(),
  };
  db.orgs.push(o);
  // Every new tenant gets an administrator account so it can be signed into straight away.
  const adminEmail = String(req.body?.adminEmail ?? '').trim().toLowerCase();
  const adminName = String(req.body?.adminName ?? '').trim() || `${name} admin`;
  db.users.push({ id: newId('u'), name: adminName, email: adminEmail || `admin@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example`, role: 'tenant_admin', orgId: o.id, title: 'Organization admin' });
  audit('org.create', `Created ${name} as ${categoryById(category).name}`, 'ok', o.id);
  res.status(201).json(orgSummary(o));
}));

api.get('/admin/orgs/:id', wrap((req, res) => {
  requirePlatformAdmin('admin.org');
  const db = getDB();
  const o = db.orgs.find((x) => x.id === req.params.id);
  if (!o) throw new HttpError(404, 'Organization not found');
  res.json({
    org: o, summary: orgSummary(o),
    users: db.users.filter((u) => u.orgId === o.id),
    vehicles: db.vehicles.filter((v) => v.orgId === o.id).map(summary),
    nav: o.isPlatform ? [] : navFor(o),
    catalog: catalogFor(o),
    audit: db.audit.filter((e) => e.orgId === o.id).slice(0, 20),
  });
}));

api.patch('/admin/orgs/:id', wrap((req, res) => {
  requirePlatformAdmin('org.update');
  const db = getDB();
  const o = db.orgs.find((x) => x.id === req.params.id);
  if (!o) throw new HttpError(404, 'Organization not found');
  if (o.isPlatform) throw new HttpError(400, 'The CarVault platform organization can\'t be changed here.');
  const b = req.body ?? {};
  const changes: string[] = [];
  if (b.categories !== undefined) {
    const cats = (Array.isArray(b.categories) ? b.categories : []).filter(isCategory) as CategoryId[];
    if (!cats.length) throw new HttpError(400, 'An organization needs at least one category');
    const next: CategoryId[] = cats.includes('full') ? ['full'] : [...new Set(cats)];
    changes.push(`categories ${o.categories.join('+')} → ${next.join('+')}`);
    o.categories = next;
  }
  if (b.addModule !== undefined) {
    if (!isModule(b.addModule)) throw new HttpError(400, 'Unknown module');
    o.moduleOverrides.remove = o.moduleOverrides.remove.filter((m) => m !== b.addModule);
    if (!entitledModules(o).has(b.addModule)) o.moduleOverrides.add.push(b.addModule);
    changes.push(`added module ${b.addModule}`);
  }
  if (b.removeModule !== undefined) {
    if (!isModule(b.removeModule)) throw new HttpError(400, 'Unknown module');
    if (MODULES.find((m) => m.id === b.removeModule)?.core) throw new HttpError(400, 'Core modules are part of every plan and can\'t be removed');
    o.moduleOverrides.add = o.moduleOverrides.add.filter((m) => m !== b.removeModule);
    if (!o.moduleOverrides.remove.includes(b.removeModule)) o.moduleOverrides.remove.push(b.removeModule);
    changes.push(`removed module ${b.removeModule}`);
  }
  if (b.status === 'active' || b.status === 'suspended') { changes.push(`status → ${b.status}`); o.status = b.status; }
  if (typeof b.plan === 'string' && b.plan.trim()) { changes.push(`plan → ${b.plan.trim()}`); o.plan = b.plan.trim().slice(0, 60); }
  if (b.pilot !== undefined) {
    o.pilot = b.pilot === null ? undefined : sanitizePilot(b.pilot, o.pilot);
    changes.push(b.pilot === null ? 'removed from pilot programme' : `pilot: ${o.pilot!.stage}`);
  }
  if (typeof b.brandingSelfServe === 'boolean') { changes.push(`branding self-serve → ${b.brandingSelfServe}`); o.brandingSelfServe = b.brandingSelfServe; }
  if (b.branding && typeof b.branding === 'object') {
    o.branding = sanitizeBranding({ ...o.branding, ...b.branding });
    changes.push(`branding: ${Object.keys(b.branding).join(', ')}`);
  }
  if (!changes.length) throw new HttpError(400, 'Nothing to change');
  audit('org.update', `${o.name}: ${changes.join('; ')}`, 'ok', o.id);
  res.json({ org: o, summary: orgSummary(o), nav: navFor(o), catalog: catalogFor(o) });
}));

api.delete('/admin/orgs/:id', wrap((req, res) => {
  requirePlatformAdmin('org.delete');
  const db = getDB();
  const o = db.orgs.find((x) => x.id === req.params.id);
  if (!o) throw new HttpError(404, 'Organization not found');
  if (o.isPlatform) throw new HttpError(400, 'The CarVault platform organization can\'t be deleted.');
  const vehicles = db.vehicles.filter((v) => v.orgId === o.id).length;
  if (vehicles) throw new HttpError(409, `${o.name} still manages ${vehicles} vehicle${vehicles === 1 ? '' : 's'}. Suspend it instead, or move its vehicles first.`);
  db.orgs = db.orgs.filter((x) => x.id !== o.id);
  db.users = db.users.filter((u) => u.orgId !== o.id);
  audit('org.delete', `Deleted ${o.name}`, 'ok', o.id);
  res.json({ ok: true });
}));

const PILOT_STAGES: PilotStage[] = ['prospect', 'pilot', 'converted', 'ended'];
function sanitizePilot(p: Partial<Pilot>, prev?: Pilot): Pilot {
  const stage = PILOT_STAGES.includes(p.stage as PilotStage) ? (p.stage as PilotStage) : prev?.stage ?? 'prospect';
  const date = (x: unknown, fallback?: string) => (x === '' || x === null ? undefined : isDate(x) ? x.slice(0, 10) : fallback);
  const target = p.targetHighConfidence === undefined ? prev?.targetHighConfidence : Number(p.targetHighConfidence);
  if (target !== undefined && (!Number.isFinite(target) || target < 0 || target > 100)) throw new HttpError(400, 'Target share must be between 0 and 100');
  return {
    stage,
    goal: p.goal === undefined ? prev?.goal ?? '' : String(p.goal).trim().slice(0, 240),
    startedAt: date(p.startedAt, prev?.startedAt) ?? (stage === 'pilot' ? new Date().toISOString().slice(0, 10) : undefined),
    endsAt: date(p.endsAt, prev?.endsAt),
    targetHighConfidence: target,
  };
}

/**
 * Pilot programme: the business-first go-to-market. For each design partner, the numbers that decide
 * whether a pilot converts: North Star coverage (Vehicle Confidence 85+), buyer-facing sharing and
 * transfer readiness.
 */
api.get('/admin/pilots', (_req, res) => {
  requirePlatformAdmin('admin.pilots');
  const db = getDB();
  const since = Date.now() - 30 * 86_400_000;
  res.json(db.orgs.filter((o) => !o.isPlatform).map((o) => {
    const vehicles = db.vehicles.filter((v) => v.orgId === o.id);
    const scored = vehicles.map((v) => {
      const c = context(v);
      return { conf: confidenceOf(v, c).score, transfer: computeTransfer({ vehicle: v, services: c.services, documents: c.documents }).complete };
    });
    const rooms = db.dataRooms.filter((r) => r.orgId === o.id);
    const vids = new Set(vehicles.map((v) => v.id));
    const docs = db.documents.filter((d) => vids.has(d.vehicleId) && d.status === 'confirmed');
    return {
      id: o.id, name: o.name, categories: o.categories, plan: o.plan, status: o.status, pilot: o.pilot ?? null,
      metrics: {
        vehicles: vehicles.length,
        highConfidenceShare: vehicles.length ? Math.round((scored.filter((x) => x.conf >= 85).length / vehicles.length) * 100) : null,
        avgConfidence: vehicles.length ? Math.round(scored.reduce((a, x) => a + x.conf, 0) / vehicles.length) : null,
        verifiedDocs: docs.filter((d) => d.verification).length,
        dataRooms30d: rooms.filter((r) => new Date(r.createdAt).getTime() >= since).length,
        buyerViews: rooms.reduce((a, r) => a + r.views, 0),
        passportsShared: db.shares.filter((sh) => vids.has(sh.vehicleId)).length,
        transferReady: scored.filter((x) => x.transfer).length,
        activeUsers: db.users.filter((u) => u.orgId === o.id).length,
      },
    };
  }));
});

api.get('/admin/catalog', (_req, res) => {
  requirePlatformAdmin('admin.catalog');
  const db = getDB();
  res.json({
    categories: CATEGORIES.map((c) => ({ ...c, tenants: db.orgs.filter((o) => !o.isPlatform && o.categories.includes(c.id)).map((o) => o.name) })),
    modules: MODULES.map((m) => ({ ...m, categories: unlockedBy(m.id) })),
  });
});

api.get('/admin/users', (_req, res) => {
  requirePlatformAdmin('admin.users');
  const db = getDB();
  res.json(db.users.map((u) => ({ ...u, orgName: db.orgs.find((o) => o.id === u.orgId)?.name })));
});

api.get('/admin/vehicles', (_req, res) => {
  requirePlatformAdmin('admin.vehicles');
  res.json(getDB().vehicles.map(summary));
});

api.get('/admin/audit', (_req, res) => {
  requirePlatformAdmin('admin.audit');
  const db = getDB();
  res.json(db.audit.map((e) => ({ ...e, orgName: db.orgs.find((o) => o.id === e.orgId)?.name })));
});

api.get('/admin/confidence', (_req, res) => {
  requirePlatformAdmin('admin.confidence');
  res.json({ dimensions: DIMENSIONS, weights: weights(), defaults: DEFAULT_WEIGHTS });
});

api.patch('/admin/confidence', wrap((req, res) => {
  requirePlatformAdmin('confidence.update');
  const w = req.body?.weights ?? {};
  const next: Record<string, number> = { ...weights() };
  for (const d of DIMENSIONS) {
    if (w[d.id] === undefined) continue;
    const n = Number(w[d.id]);
    if (!Number.isFinite(n) || n < 0 || n > 3) throw new HttpError(400, `${d.label}: weight must be between 0 and 3`);
    next[d.id] = Math.round(n * 100) / 100;
  }
  if (!Object.values(next).some((n) => n > 0)) throw new HttpError(400, 'At least one dimension needs a weight above 0');
  getDB().settings.confidenceWeights = next;
  audit('confidence.update', `Weights: ${Object.entries(next).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  res.json({ dimensions: DIMENSIONS, weights: next, defaults: DEFAULT_WEIGHTS });
}));

api.get('/admin/ai', (_req, res) => {
  requirePlatformAdmin('admin.ai');
  const p = activeProvider();
  res.json({ provider: p.name, model: process.env.CARVAULT_MODEL || 'claude-sonnet-5', liveConfigured: !!process.env.ANTHROPIC_API_KEY, referenceImages: (process.env.REFERENCE_IMAGES || (SERVERLESS ? 'off' : 'on')).toLowerCase() !== 'off' });
});

// --- Errors ---------------------------------------------------------------------------
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than 15 MB' : err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
