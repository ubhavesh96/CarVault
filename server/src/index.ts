import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';

// Minimal .env loader (no dependency): reads KEY=VALUE lines from the repo root.
const envFile = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (m && !line.trim().startsWith('#') && m[2] !== '' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { api, errorHandler } from './routes';
import { activeProvider } from './ai';
import { getDB, save } from './store';
import { attachReferencePhoto } from './reference';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built client from the same server.
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`CarVault API on http://localhost:${port}  (AI provider: ${activeProvider().name})`);
  prefetchReferencePhotos();
});

/** Fetch reference photos for vehicles that don't have one yet, one at a time, in the background. */
async function prefetchReferencePhotos() {
  const pending = getDB().vehicles.filter((v) => !v.photo && !v.photoRemoved && !v.referenceTried);
  for (const v of pending) {
    const result = await attachReferencePhoto(v);
    if (result !== 'unavailable') v.referenceTried = true;
    save();
  }
  if (pending.length) console.log(`[reference] background lookup finished for ${pending.length} vehicle(s)`);
}
