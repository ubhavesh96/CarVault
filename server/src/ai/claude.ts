import fs from 'fs';
import type { ChatBlock, ChatMessage, VehicleContext } from '../types';
import type { AIProvider, ChatReply, Extraction, ExtractionInput } from './types';

/**
 * Claude provider. Activated automatically when ANTHROPIC_API_KEY is set (see ai/index.ts).
 * Uses the Messages API directly over fetch so there is no SDK dependency to install.
 * Any failure throws; ai/index.ts falls back to the mock provider so the app never breaks.
 */

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = () => process.env.CARVAULT_MODEL || 'claude-sonnet-5';

const TRUST_RULES = `You are CarVault AI, the ownership assistant for ONE vehicle. You answer only from the vehicle context supplied.
Non-negotiable rules:
- Never invent vehicle history, parts, dates, costs, or prices. If it is not in the context, say it is unknown.
- Never state that a component is defective or needs replacing based on inference. Say a check is worth doing, and why.
- Label every statement by type: "verified" (from a document/record in context), "inference" (your reasoning from records), "estimated" (a value or prediction), "recommendation" (a suggested action), "unknown" (cannot be determined), or "text" (neutral framing).
- If records conflict, point out the conflict instead of choosing silently.
- Explain recommendations in one short sentence citing the record they came from. Do not reveal hidden reasoning.
- You cannot book, pay, or contact anyone. Ask for the owner's approval before proposing any consequential action.
- Be calm, concise and precise. AED for currency, km for distance.`;

async function call(body: object): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL(), max_tokens: 2000, ...body }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function jsonFrom(text: string): any {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('No JSON in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

const textOf = (r: any): string => (r.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');

const KINDS = new Set(['text', 'verified', 'inference', 'recommendation', 'unknown', 'estimated']);

export const claudeProvider: AIProvider = {
  name: 'claude',

  async chat(ctx: VehicleContext, message: string, history: ChatMessage[]): Promise<ChatReply> {
    const context = {
      vehicle: ctx.vehicle,
      today: new Date().toISOString().slice(0, 10),
      serviceRecords: ctx.services.map(({ vehicleId, sourceDocId, ...s }) => s),
      documents: ctx.documents.filter((d) => d.status === 'confirmed').map((d) => ({
        type: d.type, fileName: d.fileName, summary: d.summary, issuedOn: d.issuedOn, expiresOn: d.expiresOn, trust: d.trust,
      })),
      computedInsights: ctx.insights,
    };
    const prior = history.slice(-10).map((h) => ({
      role: h.role,
      content: h.role === 'user' ? (h.text ?? '') : (h.blocks ?? []).map((b) => `[${b.kind}] ${b.text}`).join('\n'),
    }));
    const r = await call({
      system:
        `${TRUST_RULES}\n\nRespond with ONLY a JSON object: {"blocks":[{"kind":"verified|inference|recommendation|unknown|estimated|text","text":"...","sources":["optional record names"]}],"suggestions":["up to 3 short follow-up questions"]}.\n\nVEHICLE CONTEXT:\n${JSON.stringify(context)}`,
      messages: [...prior, { role: 'user', content: message }],
    });
    const parsed = jsonFrom(textOf(r));
    const blocks: ChatBlock[] = (parsed.blocks ?? [])
      .filter((b: any) => b && typeof b.text === 'string')
      .map((b: any) => ({ kind: KINDS.has(b.kind) ? b.kind : 'text', text: b.text, sources: Array.isArray(b.sources) ? b.sources : undefined }));
    if (!blocks.length) throw new Error('Empty reply');
    return { blocks, suggestions: (parsed.suggestions ?? []).slice(0, 3) };
  },

  async extractDocument(input: ExtractionInput): Promise<Extraction> {
    const data = fs.readFileSync(input.filePath).toString('base64');
    const isPdf = input.mime === 'application/pdf';
    const isImage = /^image\/(png|jpe?g|gif|webp)$/.test(input.mime);
    if (!isPdf && !isImage) throw new Error(`Unsupported file type for extraction: ${input.mime}`);
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: input.mime, data } };

    const prompt = `Extract structured data from this vehicle document for a ${input.vehicle.year} ${input.vehicle.make} ${input.vehicle.model}.
Document type hint: ${input.type}. File name: ${input.fileName}.
Return ONLY JSON:
{"type":"service_invoice|insurance|registration|inspection|warranty|parts_invoice|tyre_invoice|ownership|claims_history|rta_certificate|loan_release|other",
 "summary":"one sentence",
 "fields":[{"key":"date|mileage|workshop|cost|insurer|expires|plate|vin|...","label":"Human label","value":"as printed","confidence":0.0-1.0}],
 "issuedOn":"YYYY-MM-DD or null","expiresOn":"YYYY-MM-DD or null",
 "draft":{"date":"YYYY-MM-DD","mileage":0,"category":"service|repair|tyres|brakes|inspection|other","title":"","workshop":"","workPerformed":[""],"parts":[{"name":"","partNo":""}],"cost":0,"notes":""} or null}
For an RTA Technical Vehicle Status Certificate use type "rta_certificate" and include: issuer, certificate_no, issued, vin, owners (number of registered owners), insurance_history (one line), last_test_result, and one field per odometer reading keyed odometer_1, odometer_2, ... with value "YYYY-MM-DD · 12,345 km". Do not include a "draft" for it.
For a bank loan clearance / release letter use type "loan_release" with issuer (bank), issued, vin and loan_status.
Rules: never guess. If a value is not legible or not present, omit the field or give low confidence. "draft" only for invoices/inspections. cost is a number in AED.`;

    const r = await call({ messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }] });
    const p = jsonFrom(textOf(r));
    return {
      type: p.type ?? 'other',
      summary: p.summary ?? '',
      fields: (p.fields ?? []).map((f: any) => ({
        key: String(f.key), label: String(f.label ?? f.key), value: String(f.value ?? ''), confidence: Number(f.confidence ?? 0.5),
      })),
      issuedOn: p.issuedOn || undefined,
      expiresOn: p.expiresOn || undefined,
      draft: p.draft || undefined,
    };
  },
};
