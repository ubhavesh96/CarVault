import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { api, errorHandler } from './routes';

/**
 * The Express app, shared by the local server (index.ts) and the Netlify Function
 * (netlify/functions/api.ts). It is mounted under /api and, for serverless requests that arrive
 * with the function's own path, under /.netlify/functions/api as well.
 */
export function createApp(opts: { serveClient?: boolean } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  for (const base of ['/api', '/.netlify/functions/api']) {
    app.use(base, api);
    app.use(base, (_req, res) => res.status(404).json({ error: 'Not found' }));
  }

  // In single-server production, serve the built client from the same server.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (opts.serveClient && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
