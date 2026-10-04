import fs from 'fs';
import path from 'path';
import { UPLOAD_DIR, newId } from './store';
import type { Vehicle } from './types';

/**
 * Reference photos: when an owner hasn't uploaded a photo, find a freely licensed photo of the
 * same make/model on Wikipedia / Wikimedia Commons, store a local copy, and credit it.
 *
 * - Only Creative Commons or public-domain files from Commons are accepted (non-free
 *   "fair use" images hosted on Wikipedia itself are rejected).
 * - The photo is always labelled as a reference image, never presented as the owner's car.
 * - Sends only make/model/chassis to Wikipedia. Disable with REFERENCE_IMAGES=off.
 */

const UA = 'CarVault-prototype/0.1 (vehicle reference images; local development)';
const TIMEOUT_MS = 8000;
const PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Wikimedia rate-limits bursts: send requests one at a time, at least MIN_GAP_MS apart. */
const MIN_GAP_MS = 1100;
let queue: Promise<unknown> = Promise.resolve();
let last = 0;
function politeFetch(url: string): Promise<Response> {
  const run = async () => {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

async function getJSON(url: string): Promise<any> {
  const res = await politeFetch(url);
  if (res.status === 429) throw new Error('rate limited by Wikimedia; try again shortly');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 80));
  }
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Variants and non-car pages describe a different vehicle, so they are not a reference for this one.
const OFF_TOPIC = /racing|concept|engine|list of|motorsport|6x6|squared|pickup|truck|police|limousine/;

interface Candidate { title: string; file: string; index: number }

async function findCandidates(v: Vehicle): Promise<Candidate[]> {
  const q = [v.make, v.model, v.chassis].filter(Boolean).join(' ') + ' car';
  const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=8'
    + `&gsrsearch=${encodeURIComponent(q)}&prop=pageimages&piprop=name`;
  const data = await getJSON(url);
  const pages = Object.values<any>(data?.query?.pages ?? {});
  const make = norm(v.make).split(' ')[0]; // "Mercedes-AMG" also matches "Mercedes-Benz"
  const model = norm(v.model);
  const chassis = v.chassis ? norm(v.chassis) : '';
  const known = new Set([...norm(v.make).split(' '), ...model.split(' '), chassis, 'car', 'class', 'series']);
  return pages
    .filter((p) => p.pageimage)
    .map((p) => {
      const t = norm(p.title);
      const words = t.split(' ');
      let score = 0;
      if (words.includes(make)) score += 3;
      if (` ${t} `.includes(` ${model} `)) score += 4;
      if (chassis && words.includes(chassis)) score += 3;
      if (OFF_TOPIC.test(t)) score -= 10;
      const extra = words.filter((w) => !known.has(w)).length;
      return { p, score, extra };
    })
    .filter((x) => x.score >= 6) // make + model, or make + chassis code
    .sort((a, b) => b.score - a.score || a.extra - b.extra || a.p.index - b.p.index)
    .map((x) => ({ title: x.p.title, file: x.p.pageimage, index: x.p.index }));
}

interface Licensed { thumb: string; author: string; license: string; source: string }

async function licensedFile(file: string): Promise<Licensed | null> {
  const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + `&iiprop=url|extmetadata&iiurlwidth=1200&titles=${encodeURIComponent('File:' + file)}`;
  const data = await getJSON(url);
  const page = Object.values<any>(data?.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null; // not on Commons, e.g. a non-free local file
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? '');
  if (!/^(cc|public domain|pd)/i.test(license)) return null;
  return {
    thumb: info.thumburl ?? info.url,
    author: stripHtml(meta.Artist?.value ?? 'Unknown author').slice(0, 80),
    license,
    source: info.descriptionurl,
  };
}

/** Lookup results per make/model/chassis, so adding the same model again doesn't re-query. */
const cache = new Map<string, { c: Candidate; lic: Licensed } | null>();

async function resolve(v: Vehicle): Promise<{ c: Candidate; lic: Licensed } | null> {
  const key = norm([v.make, v.model, v.chassis].filter(Boolean).join(' '));
  if (cache.has(key)) return cache.get(key)!;
  let candidates = await findCandidates(v);
  // Mercedes-AMG names ("G 63", "E 63 S", "GLE 53") are covered by the class page ("G-Class").
  const amg = /mercedes/i.test(v.make) && v.model.trim().match(/^([A-Z]{1,3})\s?\d{2,3}\b/i);
  if (!candidates.length && amg) {
    candidates = await findCandidates({ ...v, make: 'Mercedes-Benz', model: `${amg[1].toUpperCase()} Class` });
  }
  let found: { c: Candidate; lic: Licensed } | null = null;
  for (const c of candidates.slice(0, 3)) {
    const lic = await licensedFile(c.file);
    if (lic) { found = { c, lic }; break; }
  }
  cache.set(key, found); // only definitive answers reach here; network errors throw first
  return found;
}

export type ReferenceResult = 'attached' | 'none' | 'unavailable';

/** Try to attach a reference photo. Never throws. */
export async function attachReferencePhoto(v: Vehicle): Promise<ReferenceResult> {
  if ((process.env.REFERENCE_IMAGES || '').toLowerCase() === 'off') return 'none';
  try {
    const hit = await resolve(v);
    if (!hit) return 'none';
    const { c, lic } = hit;
    const res = await politeFetch(lic.thumb);
    const mime = (res.headers.get('content-type') || '').split(';')[0];
    if (!res.ok || !PHOTO_MIME.has(mime)) return 'unavailable';
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return 'none';
    const storedName = `${newId('ref')}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
    if (v.photo) fs.rmSync(path.join(UPLOAD_DIR, v.photo.storedName), { force: true });
    v.photo = {
      storedName, mime, updatedAt: new Date().toISOString(), kind: 'reference',
      credit: { author: lic.author, license: lic.license, source: lic.source, title: c.title },
    };
    return 'attached';
  } catch (e) {
    console.warn(`[reference] lookup failed for ${v.make} ${v.model}: ${e instanceof Error ? e.message : e}`);
    return 'unavailable';
  }
}
