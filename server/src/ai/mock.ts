import type { ChatBlock, ChatMessage, DocType, ServiceDraft, VehicleContext } from '../types';
import type { AIProvider, ChatReply, Extraction, ExtractionInput } from './types';
import { estimateValue } from '../value';

/**
 * Mock AI provider.
 *
 * Extraction cannot really read the file, so its output is SIMULATED (and the UI says so).
 * Chat is different: answers are assembled from the vehicle's actual records and insights,
 * so they are grounded and correctly trust-labelled, just not free-form language.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = <T,>(arr: T[], seed: number) => arr[seed % arr.length];
const km = (n: number) => `${Math.round(n).toLocaleString('en-US')} km`;
const aed = (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`;
const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function guessType(fileName: string): DocType {
  const n = fileName.toLowerCase();
  if (/(^|[^a-z])rta([^a-z]|$)|vehicle[-_ ]?status|status[-_ ]?cert/.test(n)) return 'rta_certificate';
  if (/loan|clearance|release[-_ ]?letter|liability/.test(n)) return 'loan_release';
  if (/insur|policy|takaful/.test(n)) return 'insurance';
  if (/regist|mulkiya|reg[-_ ]?card/.test(n)) return 'registration';
  if (/inspect|report|check/.test(n)) return 'inspection';
  if (/warrant|contract/.test(n)) return 'warranty';
  if (/tyre|tire/.test(n)) return 'tyre_invoice';
  if (/part/.test(n)) return 'parts_invoice';
  if (/invoice|service|receipt|bill|oil/.test(n)) return 'service_invoice';
  return 'other';
}

const WORKSHOPS = [
  'Sample BMW Authorised Service Centre, Al Quoz',
  'Sample German Auto Specialist, Al Quoz',
  'Sample Performance Workshop, Ras Al Khor',
];

/**
 * Plausible annual-test odometer readings for a simulated certificate. Mileage is interpolated
 * between the readings CarVault already holds, so the demo never manufactures a conflict.
 */
function simulatedTestReadings(v: { year: number; mileage: number; mileageUpdatedAt: string }, known: { date: string; mileage: number }[]) {
  const now = Date.now();
  const points = [
    { t: new Date(`${v.year}-01-01`).getTime(), km: 0 },
    ...known.map((k) => ({ t: new Date(k.date).getTime(), km: k.mileage })),
    { t: Math.max(now, new Date(v.mileageUpdatedAt).getTime()), km: v.mileage },
  ].sort((a, b) => a.t - b.t);
  const at = (t: number) => {
    let lo = points[0];
    for (const p of points) {
      if (p.t <= t) lo = p;
      else {
        const span = p.t - lo.t || 1;
        return Math.max(lo.km, Math.round((lo.km + (p.km - lo.km) * ((t - lo.t) / span)) / 10) * 10);
      }
    }
    return lo.km;
  };
  const out: { date: string; mileage: number }[] = [];
  const thisYear = new Date().getFullYear();
  for (let y = Math.max(v.year + 1, thisYear - 4); y <= thisYear; y++) {
    const d = new Date(`${y}-03-15`);
    if (d.getTime() > now - 7 * 86_400_000) continue;
    const date = iso(d);
    if (known.some((k) => k.date === date)) continue;
    out.push({ date, mileage: at(d.getTime()) });
  }
  return out;
}

export const mockProvider: AIProvider = {
  name: 'mock',

  async extractDocument(input: ExtractionInput): Promise<Extraction> {
    await new Promise((r) => setTimeout(r, 900)); // feel like real processing
    const type = input.type === 'auto' ? guessType(input.fileName) : input.type;
    const h = hash(input.fileName + input.vehicle.id);
    const f = (key: string, label: string, value: string, confidence: number) => ({ key, label, value, confidence });
    const workshop = pick(WORKSHOPS, h);
    const v = input.vehicle;

    if (type === 'service_invoice' || type === 'parts_invoice' || type === 'tyre_invoice' || type === 'inspection') {
      const category = type === 'tyre_invoice' ? 'tyres' : type === 'inspection' ? 'inspection' : 'service';
      const date = shift(-(3 + (h % 9)));
      const mileage = Math.max(0, v.mileage - (h % 700));
      const cost = type === 'inspection' ? 650 : type === 'tyre_invoice' ? 4600 + (h % 8) * 100 : 1800 + (h % 14) * 90;
      const draft: ServiceDraft = {
        date,
        mileage,
        category,
        title:
          type === 'inspection' ? 'Independent inspection'
          : type === 'tyre_invoice' ? 'Rear tyres replaced'
          : type === 'parts_invoice' ? 'Parts purchase'
          : 'Oil service',
        workshop,
        workPerformed:
          type === 'inspection' ? ['Mechanical inspection', 'Diagnostic scan', 'Tyre and brake assessment']
          : type === 'tyre_invoice' ? ['Rear axle tyres replaced', 'Wheel balancing', 'Alignment check']
          : type === 'parts_invoice' ? ['Parts supplied']
          : ['Engine oil and filter change', 'Multi-point inspection'],
        parts:
          type === 'inspection' ? []
          : type === 'tyre_invoice' ? [{ name: 'Rear tyres 295/30 R20 (x2)' }]
          : type === 'parts_invoice' ? [{ name: 'Brake pad set (front)' }]
          : [{ name: 'Engine oil 5W-30 (x8L)' }, { name: 'Oil filter element' }],
        cost,
        notes: type === 'inspection' ? 'No fault codes stored. Tyres and brakes within serviceable limits.' : undefined,
      };
      return {
        type,
        summary: `${draft.title} at ${km(mileage)}, ${aed(cost)}.`,
        fields: [
          f('date', 'Date', date, 0.96),
          f('mileage', 'Mileage (km)', String(mileage), 0.71), // deliberately low: odometer OCR is the weak point
          f('workshop', 'Workshop', workshop, 0.9),
          f('cost', 'Total (AED)', String(cost), 0.94),
        ],
        draft,
        issuedOn: date,
      };
    }

    if (type === 'insurance') {
      const issued = shift(-20);
      const expires = shift(345);
      return {
        type,
        summary: 'Comprehensive motor insurance policy.',
        fields: [
          f('insurer', 'Insurer', 'Sample Insurance Co.', 0.88),
          f('cover', 'Cover', 'Comprehensive - agency repair', 0.82),
          f('issued', 'Issued', issued, 0.95),
          f('expires', 'Expires', expires, 0.95),
        ],
        issuedOn: issued,
        expiresOn: expires,
      };
    }

    if (type === 'registration') {
      const expires = shift(330);
      return {
        type,
        summary: `Vehicle registration card (${v.emirate ?? 'UAE'}).`,
        fields: [
          f('plate', 'Plate', `${v.emirate ?? 'Dubai'} ${v.plate ?? 'A 00000'}`, 0.9),
          f('vin', 'VIN', v.vin, 0.86),
          f('expires', 'Registration expires', expires, 0.94),
        ],
        expiresOn: expires,
      };
    }

    if (type === 'rta_certificate') {
      const issued = shift(-2);
      const readings = simulatedTestReadings(v, input.knownReadings ?? []);
      return {
        type,
        summary: `RTA Technical Vehicle Status Certificate with ${readings.length} odometer reading${readings.length === 1 ? '' : 's'} from annual tests.`,
        fields: [
          f('issuer', 'Issuer', 'Roads & Transport Authority (RTA), Dubai', 0.97),
          f('certificate_no', 'Certificate number', `VSC-${String(h).slice(0, 8)}`, 0.9),
          f('issued', 'Issued', issued, 0.95),
          f('vin', 'VIN / chassis number', v.vin, 0.93),
          f('owners', 'Registered owners to date', String(1 + (h % 2)), 0.88),
          f('insurance_history', 'Insurance history', `${Math.min(4, Math.max(1, new Date().getFullYear() - v.year))} consecutive policies, no gaps`, 0.84),
          ...readings.map((r, i) => f(`odometer_${i + 1}`, `Odometer at test ${i + 1}`, `${r.date} · ${r.mileage.toLocaleString('en-US')} km`, 0.9)),
          f('last_test_result', 'Latest test result', 'Passed', 0.92),
        ],
        issuedOn: issued,
      };
    }

    if (type === 'loan_release') {
      const issued = shift(-5);
      return {
        type,
        summary: 'Bank clearance letter confirming the car loan is fully settled.',
        fields: [
          f('issuer', 'Bank', 'Sample Bank PJSC', 0.9),
          f('issued', 'Letter date', issued, 0.95),
          f('vin', 'VIN / chassis number', v.vin, 0.88),
          f('loan_status', 'Status', 'Loan fully settled; no objection to transfer', 0.9),
        ],
        issuedOn: issued,
      };
    }

    if (type === 'warranty') {
      const expires = shift(700);
      return {
        type,
        summary: 'Extended warranty certificate.',
        fields: [
          f('provider', 'Provider', 'Sample Warranty Provider', 0.8),
          f('expires', 'Expires', expires, 0.9),
          f('limit', 'Mileage limit (km)', '100000', 0.76),
        ],
        expiresOn: expires,
      };
    }

    return {
      type: 'other',
      summary: 'Document stored. CarVault could not classify it confidently, so no structured data was extracted.',
      fields: [],
    };
  },

  async chat(ctx: VehicleContext, message: string, history: ChatMessage[]): Promise<ChatReply> {
    await new Promise((r) => setTimeout(r, 600));
    return answer(ctx, message, history);
  },
};

// ---------------------------------------------------------------------------------------
// Grounded, intent-based answers
// ---------------------------------------------------------------------------------------

const name = (ctx: VehicleContext) => `${ctx.vehicle.year} ${ctx.vehicle.make} ${ctx.vehicle.model} ${ctx.vehicle.variant}`.trim();
const has = (m: string, re: RegExp) => re.test(m.toLowerCase());
const B = (kind: ChatBlock['kind'], text: string, sources?: string[]): ChatBlock => ({ kind, text, sources });

const DEFAULT_SUGGESTIONS = [
  'What does my car need?',
  'How much have I spent on this car?',
  'Prepare my car for sale',
  'What is my car worth?',
];

function lastTopic(history: ChatMessage[]): string | undefined {
  const prev = [...history].reverse().find((m) => m.role === 'user');
  return prev?.text?.toLowerCase();
}

function answer(ctx: VehicleContext, message: string, history: ChatMessage[]): ChatReply {
  const m = message.toLowerCase();
  const prev = lastTopic(history) ?? '';
  const insights = ctx.insights;
  const recs = [...ctx.services].sort((a, b) => b.date.localeCompare(a.date));

  // Vehicle Confidence ------------------------------------------------------------------
  const conf = ctx.confidence;
  if (conf && has(m, /confidence|score|why is my|decrease|dropped|went down/)) {
    const weakest = [...conf.dimensions].sort((a, b) => a.score - b.score).slice(0, 3);
    const strongest = [...conf.dimensions].sort((a, b) => b.score - a.score)[0];
    const blocks: ChatBlock[] = [
      B('verified', `Vehicle Confidence is ${conf.score}/100 (${conf.level}), from ${conf.verifiedRecords} source-backed records across ${conf.sources} sources, with ${conf.gaps} gap${conf.gaps === 1 ? '' : 's'}.`, ['Confidence Engine']),
      B('text', 'It measures how well this vehicle\'s history is evidenced, not its mechanical condition.'),
      B('inference', `Strongest: ${strongest.label} (${strongest.score}%). ${strongest.why}`),
      ...weakest.map((d) => B('inference', `${d.label} (${d.score}%): ${d.why}`, d.sources.length ? d.sources.slice(0, 2) : undefined)),
    ];
    if (has(m, /decrease|dropped|went down/))
      blocks.push(B('text', 'Confidence falls when evidence ages (for example an inspection getting older), when a record conflicts with others, or when a document expires. The weakest areas above are the current drags on the score.'));
    if (conf.improvements[0]) blocks.push(B('recommendation', `Largest single improvement: ${conf.improvements[0].label} (about +${conf.improvements[0].gain}).`));
    return { blocks, suggestions: ['What records are missing?', 'Summarize this vehicle\'s history', 'Prepare this vehicle for resale'] };
  }
  if (conf && has(m, /missing|gaps?\b|what records/)) {
    if (!conf.improvements.length) return { blocks: [B('verified', 'No evidence gaps are open. Every confidence dimension has its core evidence.')], suggestions: DEFAULT_SUGGESTIONS };
    return {
      blocks: [
        B('verified', `${conf.gaps} evidence gap${conf.gaps === 1 ? '' : 's'} are open across ${new Set(conf.improvements.map((i) => i.dimension)).size} areas.`, ['Confidence Engine']),
        ...conf.improvements.slice(0, 5).map((i) => B('recommendation', `${i.label} (${i.dimension}, about +${i.gain}). Needs: ${i.evidence}.`)),
        B('text', 'Gains are estimates from re-scoring each area as if the evidence were added.'),
      ],
      suggestions: ['Why is my Vehicle Confidence this score?', 'Prepare this vehicle for resale'],
    };
  }
  if (has(m, /summar|overview of|tell me about (this|my) (car|vehicle)/)) {
    const first = recs[recs.length - 1];
    const blocks: ChatBlock[] = [];
    if (!recs.length) blocks.push(B('unknown', 'There is no recorded history for this vehicle yet.'));
    else {
      blocks.push(B('verified', `${name(ctx)}: ${recs.length} records from ${fdate(first.date)} to ${fdate(recs[0].date)}, ${km(first.mileage)} to ${km(recs[0].mileage)}.`, ['Service timeline']));
      const imported = recs.filter((r) => r.trust === 'imported').length;
      const conflictsN = recs.filter((r) => r.trust === 'conflict').length;
      if (imported) blocks.push(B('verified', `${imported} record${imported > 1 ? 's were' : ' was'} imported from a connected system.`));
      if (conflictsN) blocks.push(B('inference', `${conflictsN} record${conflictsN > 1 ? 's conflict' : ' conflicts'} with other evidence and should be checked against the source.`));
    }
    if (conf) blocks.push(B('inference', `Vehicle Confidence ${conf.score}/100 (${conf.level}).`));
    const act = insights.filter((i) => i.status === 'due' || i.status === 'attention');
    if (act.length) blocks.push(B('inference', `Currently flagged: ${act.map((i) => i.title.toLowerCase()).join(', ')}.`));
    return { blocks, suggestions: ['What records are missing?', 'What should I service next?'] };
  }
  if (has(m, /explain (this|the|my) inspection|inspection (report|result|found)/)) {
    const insp = recs.find((r) => r.category === 'inspection');
    if (!insp) return { blocks: [B('unknown', 'No inspection is on file for this vehicle.'), B('recommendation', 'An independent inspection within the last 6 months strengthens both confidence and resale readiness.')], suggestions: DEFAULT_SUGGESTIONS };
    return {
      blocks: [
        B(insp.trust === 'verified' ? 'verified' : 'inference', `${insp.title} on ${fdate(insp.date)} at ${km(insp.mileage)} by ${insp.workshop}.`, ['Inspection record']),
        ...(insp.notes ? [B('verified', `Findings recorded: "${insp.notes}"`)] : [B('unknown', 'No findings were recorded with this inspection.')]),
        B('text', 'CarVault reports what the inspector recorded; it doesn\'t add findings of its own.'),
      ],
      suggestions: ['Why is my Vehicle Confidence this score?', 'Tell me about my tyres'],
    };
  }

  // Booking / workshop -----------------------------------------------------------------
  if (has(m, /book|workshop|find (someone|a garage|me)|inspect(ed|ion)? (them|it)|quote|appointment/) ||
      (has(m, /find someone|book|option/) && /tyre|service|brake/.test(prev))) {
    const topic = /tyre/.test(m + prev) ? 'tyre inspection' : /brake/.test(m + prev) ? 'brake fluid service' : 'service';
    return {
      blocks: [
        B('text', `Workshop matching and booking are not live in this version of CarVault, so I can't contact anyone or book on your behalf.`),
        B('recommendation',
          `Here is what I would do once it is enabled: shortlist ${ctx.vehicle.make}-experienced workshops near ${ctx.vehicle.emirate ?? 'you'}, compare price and availability for a ${topic}, and present the options. I would ask for your approval before anything is requested or booked.`),
        B('verified',
          `Brief you can send to a workshop today: ${name(ctx)}, VIN ${ctx.vehicle.vin}, ${km(ctx.vehicle.mileage)}. ` +
          (recs[0] ? `Last recorded work: ${recs[0].title} on ${fdate(recs[0].date)} at ${km(recs[0].mileage)}.` : 'No service history recorded yet.'),
          ['Vehicle record', ...(recs[0] ? ['Latest service record'] : [])]),
      ],
      suggestions: ['What does my car need?', 'Prepare my car for sale'],
    };
  }

  // Long drive readiness ------------------------------------------------------------------
  if (has(m, /long drive|road trip|long trip|ready for a (long )?(drive|trip)|drive to (oman|abu dhabi|ras al khaimah|fujairah)/)) {
    const relevant = insights.filter((i) => ['ins_tyres', 'ins_brakefluid', 'ins_service', 'ins_insurance', 'ins_registration'].includes(i.id));
    const flagged = relevant.filter((i) => ['due', 'attention'].includes(i.status));
    const blocks: ChatBlock[] = [];
    blocks.push(B(flagged.length ? 'inference' : 'verified',
      flagged.length
        ? `${flagged.length} item${flagged.length > 1 ? 's are' : ' is'} worth resolving before a long drive.`
        : 'Nothing in your records stands in the way of a long drive.'));
    for (const i of flagged) blocks.push(B(i.trust === 'verified' ? 'verified' : 'inference', i.headline, i.source ? [i.source.label] : i.evidence));
    const mech = flagged.filter((i) => i.category === 'maintenance').map((i) => i.title.toLowerCase());
    const cover = flagged.filter((i) => i.category === 'protection').map((i) => i.title.toLowerCase());
    const list = (a: string[]) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}` : a[0]);
    if (mech.length) blocks.push(B('recommendation', `Have the ${list(mech)} checked before you go. I can prepare a workshop brief.`));
    if (cover.length) blocks.push(B('recommendation', `Confirm your ${list(cover)} renewal covers the trip dates.`));
    blocks.push(B('unknown', 'Records cannot show current tyre pressures, fluid levels or warning lights. A quick pre-trip check covers those.'));
    return { blocks, suggestions: ['Find someone who can inspect them', 'What should I service next?'] };
  }

  // Tyres ------------------------------------------------------------------------------
  if (has(m, /tyre|tire|tread/)) {
    const t = insights.find((i) => i.id === 'ins_tyres')!;
    const last = recs.find((r) => r.category === 'tyres');
    const blocks: ChatBlock[] = [];
    if (last) blocks.push(B('verified', `${last.title} on ${fdate(last.date)} at ${km(last.mileage)} (${aed(last.cost)}, ${last.workshop}).`, ['Tyre invoice']));
    blocks.push(B(t.status === 'unknown' ? 'unknown' : 'inference', t.summary, t.evidence));
    if (t.status === 'attention' || t.status === 'upcoming')
      blocks.push(B('recommendation', 'Have the tread depth measured before your next long drive. I can prepare a brief for a workshop. This is a prompt to check, not a finding that anything is wrong.'));
    if (t.caveat) blocks.push(B('text', t.caveat));
    return { blocks, suggestions: ['Find someone who can inspect them', 'What else does my car need?'] };
  }

  // What does my car need / maintenance -------------------------------------------------
  if (has(m, /need|due|maintenance|next service|upcoming|overdue|what should i/)) {
    const act = insights.filter((i) => ['due', 'attention', 'upcoming'].includes(i.status));
    const unk = insights.filter((i) => i.status === 'unknown');
    const blocks: ChatBlock[] = [];
    const svc = insights.find((i) => i.id === 'ins_service');
    if (recs[0]) blocks.push(B('verified', `Latest record: ${recs[0].title} on ${fdate(recs[0].date)} at ${km(recs[0].mileage)}. Current mileage is ${km(ctx.vehicle.mileage)}.`, ['Service timeline']));
    if (act.length === 0) blocks.push(B('inference', 'Nothing in your records currently needs attention.'));
    for (const i of act.slice(0, 4)) blocks.push(B(i.trust === 'verified' || i.trust === 'user' ? 'verified' : 'inference', `${i.headline} ${i.detail}.`, i.source ? [i.source.label] : i.evidence));
    if (act.length) blocks.push(B('recommendation', `Start with ${act[0].title.toLowerCase()}${act[1] ? `, then ${act[1].title.toLowerCase()}` : ''}. Say "find someone" and I'll prepare a workshop brief.`));
    if (unk.length) blocks.push(B('unknown', `I can't tell about: ${unk.map((u) => u.title.toLowerCase()).join(', ')}. No records for ${unk.length === 1 ? 'this' : 'these'} yet.`));
    if (svc?.caveat) blocks.push(B('text', svc.caveat));
    return { blocks, suggestions: ['Tell me about my tyres', 'Find someone who can inspect them', 'Prepare my car for sale'] };
  }

  // Spend ------------------------------------------------------------------------------
  if (has(m, /spent|spend|cost|expens|paid|money/)) {
    if (!recs.length) return { blocks: [B('unknown', 'No costs are recorded yet. Upload invoices and I can total them.')], suggestions: DEFAULT_SUGGESTIONS };
    const total = recs.reduce((s, r) => s + r.cost, 0);
    const byCat = new Map<string, number>();
    recs.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.cost));
    const parts = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c}: ${aed(v)}`).join(', ');
    const first = recs[recs.length - 1];
    const years = Math.max(1, (Date.now() - new Date(first.date).getTime()) / (365.25 * 86400000));
    return {
      blocks: [
        B('verified', `${aed(total)} across ${recs.length} recorded jobs (${parts}).`, ['Service invoices']),
        B('inference', `That is roughly ${aed(total / years)} per year since ${fdate(first.date)}.`),
        B('unknown', 'Fuel, insurance premiums, registration, fines and any work done without an uploaded invoice are not included.'),
      ],
      suggestions: ['What does my car need?', 'What is my car worth?'],
    };
  }

  // Value ------------------------------------------------------------------------------
  if (has(m, /worth|value|price|depreciat/)) {
    const v = estimateValue(ctx.vehicle);
    if (!v.available) return { blocks: [B('unknown', v.basis[0])], suggestions: DEFAULT_SUGGESTIONS };
    return {
      blocks: [
        B('estimated', `An illustrative range is ${aed(v.low!)} to ${aed(v.high!)} (midpoint ${aed(v.mid!)}).`, v.basis),
        B('unknown', 'Comparable vehicles and live demand are unknown. This is a simple age-and-mileage model, not UAE market data.'),
        B('recommendation', 'Treat this as a placeholder. Before listing, get a dealer valuation or check current comparable listings.'),
      ],
      suggestions: ['Prepare my car for sale', 'How much have I spent on this car?'],
    };
  }

  // Resale -----------------------------------------------------------------------------
  if (has(m, /sell|sale|resale|listing|passport/)) {
    const insp = insights.find((i) => i.id === 'ins_inspection')!;
    const gaps = insights.find((i) => i.id === 'ins_gaps')!;
    const svc = insights.find((i) => i.id === 'ins_service')!;
    const blocks: ChatBlock[] = [
      B('verified', `${recs.length} service records and ${ctx.documents.filter((d) => d.status === 'confirmed').length} documents are on file for the ${name(ctx)}.`, ['Vehicle passport']),
    ];
    if (gaps.status === 'attention') blocks.push(B('inference', gaps.summary, gaps.evidence));
    else if (gaps.status === 'ok') blocks.push(B('inference', 'Your service history looks continuous, which is what buyers look for.'));
    const todo: string[] = [];
    if (insp.status !== 'ok') todo.push(insp.summary);
    if (svc.status === 'due' || svc.status === 'upcoming') todo.push(`Consider completing the service first: ${svc.summary}`);
    insights.filter((i) => i.id === 'ins_tyres' && i.status === 'attention').forEach((i) => todo.push(i.summary));
    if (todo.length) blocks.push(B('recommendation', `Before listing: ${todo.join(' ')}`));
    blocks.push(B('unknown', 'Ownership history, accident history and current market demand are unknown. The passport will list them as unknown rather than guess.'));
    blocks.push(B('text', 'Your shareable Vehicle Passport is on the Passport tab. Nothing is shared until you create a link.'));
    return { blocks, suggestions: ['What is my car worth?', 'What does my car need?'] };
  }

  // History ----------------------------------------------------------------------------
  if (has(m, /last|history|when|previous|timeline|serviced/)) {
    if (!recs.length) return { blocks: [B('unknown', 'There are no service records yet.')], suggestions: DEFAULT_SUGGESTIONS };
    const top = recs.slice(0, 3);
    return {
      blocks: [
        B('verified', top.map((r) => `${fdate(r.date)}, ${km(r.mileage)}: ${r.title} (${r.workshop})`).join('. '), ['Service timeline']),
        B('text', `See the Timeline tab for all ${recs.length} entries, including parts and costs.`),
      ],
      suggestions: ['What does my car need?', 'How much have I spent on this car?'],
    };
  }

  // Documents / expiry -------------------------------------------------------------------
  if (has(m, /insur|regist|warrant|expire|renew/)) {
    const rel = insights.filter((i) => ['ins_insurance', 'ins_registration', 'ins_warranty'].includes(i.id));
    return {
      blocks: rel.map((i) => B(i.status === 'unknown' ? 'unknown' : 'verified', `${i.title}: ${i.summary}`, i.evidence)),
      suggestions: ['What does my car need?', 'Prepare my car for sale'],
    };
  }

  // Fallback ---------------------------------------------------------------------------
  return {
    blocks: [
      B('text', `I'm your ${ctx.vehicle.make} ${ctx.vehicle.model}'s ownership assistant. I answer from the records CarVault holds for this vehicle and label what is verified, inferred, estimated or unknown.`),
      B('text', 'Try asking what the car needs, what you have spent, whether it is ready to sell, or what it might be worth.'),
    ],
    suggestions: DEFAULT_SUGGESTIONS,
  };
}
