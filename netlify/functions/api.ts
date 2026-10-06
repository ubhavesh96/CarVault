import serverless from 'serverless-http';
import { createApp } from '../../server/src/app';

/**
 * The CarVault API as a Netlify Function. netlify.toml rewrites /api/* here, so the web app keeps
 * calling a same-origin /api. Data lives in the function's temp folder and re-seeds on a cold start,
 * which suits a demo; images and PDFs are returned as binary.
 */
export const handler = serverless(createApp(), {
  binary: ['image/*', 'application/pdf', 'application/octet-stream'],
});
