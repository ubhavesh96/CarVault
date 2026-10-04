import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { getDB, newId, save } from './store';
import { entitledModules } from './catalog';
import type { Organization, User, Vehicle } from './types';

/**
 * Access control.
 *
 * PROTOTYPE IDENTITY: there is no login yet. The client sends the acting user's id in the
 * `x-cv-user` header (chosen with the demo sign-in switcher). Everything after identity is
 * enforced here on the server: tenant isolation, roles, and module entitlements. Replacing the
 * header with a real session (OIDC / SSO) only changes `currentUser()`.
 */

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: object) {
    super(message);
  }
}

interface Ctx { user: User; org: Organization }
const als = new AsyncLocalStorage<Ctx>();

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const db = getDB();
  // Header for API calls; cookie so <img> and file links (which can't set headers) work too.
  const cookie = /(?:^|;\s*)cv_user=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
  const id = String(req.header('x-cv-user') || (cookie ? decodeURIComponent(cookie) : ''));
  const user = db.users.find((u) => u.id === id);
  if (!user) return next(new HttpError(401, 'Choose who you are signing in as.'));
  const org = db.orgs.find((o) => o.id === user.orgId);
  if (!org) return next(new HttpError(401, 'Your organization no longer exists.'));
  if (org.status === 'suspended' && user.role !== 'platform_admin')
    return next(new HttpError(403, `${org.name} is suspended. Contact CarVault Admin.`));
  als.run({ user, org }, next);
}

export function ctx(): Ctx {
  const c = als.getStore();
  if (!c) throw new HttpError(401, 'Not signed in');
  return c;
}

export const isPlatformAdmin = () => ctx().user.role === 'platform_admin';

export function requirePlatformAdmin(action: string) {
  if (!isPlatformAdmin()) {
    audit(action, 'Platform-admin action attempted by a tenant user', 'denied');
    throw new HttpError(403, 'Only CarVault Admin can do this.');
  }
}

export function requireTenantAdmin(action: string) {
  const { user } = ctx();
  if (user.role !== 'tenant_admin' && user.role !== 'platform_admin') {
    audit(action, 'Tenant-admin action attempted by a standard user', 'denied');
    throw new HttpError(403, 'Only your organization administrator can do this.');
  }
}

export function hasModule(moduleId: string, org: Organization = ctx().org): boolean {
  if (org.isPlatform) return true; // the operator can see everything for support
  return entitledModules(org).has(moduleId);
}

export function requireModule(moduleId: string, label = moduleId) {
  if (!hasModule(moduleId)) {
    throw new HttpError(403, `${label} isn't included in your organization's plan. Contact CarVault Admin.`, { module: moduleId });
  }
}

/** Vehicles visible to the current user: their own tenant's, or all for the platform operator. */
export function visibleVehicles(): Vehicle[] {
  const { org } = ctx();
  const all = getDB().vehicles;
  return org.isPlatform ? all : all.filter((v) => v.orgId === org.id);
}

/** Tenant isolation for every per-vehicle route. Another tenant's vehicle looks like it doesn't exist. */
export function vehicleOr404(id: string): Vehicle {
  const v = visibleVehicles().find((x) => x.id === id);
  if (!v) throw new HttpError(404, 'Vehicle not found');
  return v;
}

export function audit(action: string, detail: string, outcome: 'ok' | 'denied' = 'ok', orgId?: string) {
  const c = als.getStore();
  const db = getDB();
  db.audit.unshift({
    id: newId('evt'), at: new Date().toISOString(),
    actorId: c?.user.id ?? 'system', actorName: c?.user.name ?? 'System',
    orgId: orgId ?? c?.org.id, action, detail, outcome,
  });
  db.audit = db.audit.slice(0, 500);
  save();
}
