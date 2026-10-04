import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { DB } from './types';
import { buildSeed } from './seed';
import { OWNER_ORG_ID, applySamplePilots } from './seedTenants';

export const DATA_DIR = path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const SAMPLE_PHOTO = path.join(__dirname, '..', 'assets', 'sample-m5.jpg');

/** Give the sample vehicle its original photo (copied into uploads so it behaves like any owner photo). */
function applySamplePhoto(data: DB) {
  if (!fs.existsSync(SAMPLE_PHOTO)) return;
  for (const v of data.vehicles) {
    // Only the sample BMW M5 gets the photo from the design board; other sample vehicles use reference photos.
    if (v.id !== 'veh_m5') {
      if (v.photo?.storedName === 'sample-m5.jpg') v.photo = undefined; // undo an earlier over-broad match (shared file is kept)
      continue;
    }
    if (v.photo || v.photoRemoved) continue;
    const storedName = 'sample-m5.jpg';
    fs.copyFileSync(SAMPLE_PHOTO, path.join(UPLOAD_DIR, storedName));
    v.photo = { storedName, mime: 'image/jpeg', updatedAt: new Date().toISOString() };
  }
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db: DB;

function load(): DB {
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DB;
      // Migration: sample vehicle gained chassis/spec fields.
      for (const v of data.vehicles) if (v.isSample && !v.chassis) Object.assign(v, { chassis: 'F90', spec: 'GCC' });
      migrate(data);
      // Go-to-market pilots arrived after launch; give existing demo data the sample pipeline once.
      if (!data.settings.samplePilotsApplied) { applySamplePilots(data.orgs); data.settings.samplePilotsApplied = true; }
      applySamplePhoto(data);
      persist(data);
      return data;
    } catch (e) {
      const bak = DB_FILE + '.corrupt-' + Date.now();
      fs.renameSync(DB_FILE, bak);
      console.warn(`db.json was unreadable; moved to ${bak} and re-seeded`);
    }
  }
  const seeded = buildSeed();
  applySamplePhoto(seeded);
  persist(seeded);
  return seeded;
}

/**
 * Migration to multi-tenancy: databases created before organizations existed keep all their
 * data. Existing vehicles move into the sample owner's account; sample tenants are added.
 */
function migrate(data: DB) {
  if (data.orgs && data.users) return;
  const seed = buildSeed();
  const existingIds = new Set(data.vehicles.map((v) => v.id));
  for (const v of data.vehicles) {
    if (!v.orgId) v.orgId = OWNER_ORG_ID;
    if (!v.ownerName && v.isSample) v.ownerName = 'Alex Morgan';
  }
  // Sample registration card gained its VIN field.
  const reg = data.documents.find((d) => d.id === 'doc_seed_reg');
  if (reg && !reg.fields.some((f) => f.key === 'vin')) reg.fields.splice(1, 0, { key: 'vin', label: 'VIN', value: 'WBSXXXXXXNCXXXXXX', confidence: 0.97 });
  const newVehicles = seed.vehicles.filter((v) => !existingIds.has(v.id));
  const newIds = new Set(newVehicles.map((v) => v.id));
  data.vehicles.push(...newVehicles);
  data.services.push(...seed.services.filter((x) => newIds.has(x.vehicleId)));
  data.documents.push(...seed.documents.filter((x) => newIds.has(x.vehicleId)));
  data.orgs = seed.orgs;
  data.users = seed.users;
  data.dataRooms = data.dataRooms ?? [];
  data.audit = data.audit ?? [];
  data.settings = data.settings ?? seed.settings;
  console.log(`[store] migrated to multi-tenancy: ${newVehicles.length} sample tenant vehicles added`);
}

function persist(data: DB) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export function getDB(): DB {
  if (!db) db = load();
  return db;
}

/** Mutate then flush to disk. */
export function save() {
  persist(getDB());
}

export function resetToSeed() {
  db = buildSeed();
  applySamplePhoto(db);
  persist(db);
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;
