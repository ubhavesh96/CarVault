import { ReactNode, useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, CalendarClock, Camera, Check, Image as ImageIcon, Trash2, CircleDot, ClipboardCheck, Droplet, FileText, Gauge, History,
  type LucideIcon, ScanSearch, ShieldCheck, Wrench, Download, AlertTriangle, CircleDashed,
} from 'lucide-react';
import type { Confidence, Insight, InsightSource, InsightStatus, Level, Trust, Vehicle } from '../types';
import { photoApi } from '../api';
import { LEVEL_LABEL, LEVEL_STATUS, TRUST_HELP, TRUST_LABEL, fmtDate, fmtKm } from '../utils';

// ---------------------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------------------

const TRUST_ICON: Partial<Record<Trust, LucideIcon>> = { verified: Check, ai: ScanSearch, imported: Download, conflict: AlertTriangle, unverified: CircleDashed };

export function TrustBadge({ trust }: { trust: Trust }) {
  const Icon = TRUST_ICON[trust];
  return (
    <span className={`badge t-${trust}${Icon ? ' has-icon' : ''}`} title={TRUST_HELP[trust]}>
      {Icon && <Icon className="i" aria-hidden />}
      {TRUST_LABEL[trust]}
    </span>
  );
}

export const STATUS_WORD: Record<InsightStatus, string> = {
  due: 'Due', attention: 'Attention', upcoming: 'Upcoming', ok: 'Good', unknown: 'Unknown',
};

export function StatusBadge({ status, children }: { status: InsightStatus; children?: ReactNode }) {
  return <span className={`badge s-${status}`}>{children ?? STATUS_WORD[status]}</span>;
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="notice err" role="alert">{error}</div> : null;
}

/** Right-pointing arrow that mirrors in RTL. */
export const Arrow = () => <ArrowRight className="i arrow" aria-hidden />;

// ---------------------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------------------

export function Modal({ title, subtitle, onClose, children, wide }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <h2 id={titleId}>{title}</h2>
        {subtitle && <p className="muted small" style={{ marginBlockEnd: 20 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--color-success)', attention: 'var(--color-warning)', due: 'var(--color-danger)', unknown: 'var(--color-text-tertiary)',
};

/** Restrained circular score: graphite track, single-colour arc. */
export function HealthRing({ value, size = 88, color = 'var(--color-blue)', label = 'Score' }: { value: number | null; size?: number; color?: string; label?: string }) {
  const stroke = size > 70 ? 4 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="ring" style={{ inlineSize: size, blockSize: size }} role="img" aria-label={value === null ? `${label}: not enough records` : `${label}: ${v} out of 100`}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'var(--color-border-strong)' }} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)}
          style={{ stroke: color, transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div className="ring-val" aria-hidden>
        <b className="num" style={{ fontSize: size * 0.3, color: value === null ? 'var(--color-text-tertiary)' : undefined }}>{value === null ? '–' : v}</b>
        {value !== null && <span>/100</span>}
      </div>
    </div>
  );
}

/** Compact segmented indicator (●●●●○). Always paired with a text value. */
export function Segments({ filled, total, status = 'ok' }: { filled: number; total: number; status?: string }) {
  return (
    <span className="seg" aria-hidden style={{ '--c': STATUS_COLOR[status] ?? 'var(--color-blue)' } as never}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
    </span>
  );
}

const CONF_LABEL: Record<Confidence, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const CONF_BARS: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function ConfidenceMeter({ level, reason }: { level: Confidence; reason?: string }) {
  return (
    <span className="conf" title={reason}>
      <span className="conf-bars" aria-hidden>
        {[0, 1, 2].map((i) => <i key={i} className={i < CONF_BARS[level] ? 'on' : ''} />)}
      </span>
      {CONF_LABEL[level]}
    </span>
  );
}

// ---------------------------------------------------------------------------------------
// CarVault Insight: the signature explainable-intelligence pattern
// ---------------------------------------------------------------------------------------

export function sourcePath(vehicleId: string, s: InsightSource) {
  return s.kind === 'service' ? `/v/${vehicleId}/timeline?record=${s.id}` : `/v/${vehicleId}/documents?doc=${s.id}`;
}

export function CarVaultInsight({ vehicleId, insight, showLabel = true }: { vehicleId: string; insight: Insight; showLabel?: boolean }) {
  return (
    <div className="cv-insight">
      {showLabel && <span className="label-ai"><ScanSearch className="i" aria-hidden />CarVault Insight</span>}
      <h4>{insight.headline}</h4>
      <p>{insight.why}</p>
      <dl>
        <dt>Source</dt>
        <dd>{insight.source ? insight.source.label : insight.evidence[0] ?? 'No record on file'}</dd>
        <dt>Confidence</dt>
        <dd><ConfidenceMeter level={insight.confidence.level} /> <span className="muted">· {insight.confidence.reason}</span></dd>
      </dl>
      {insight.caveat && <p className="small">{insight.caveat}</p>}
      {insight.source && <Link className="link" to={sourcePath(vehicleId, insight.source)}>View source <Arrow /></Link>}
    </div>
  );
}

export const INSIGHT_ICON: Record<string, LucideIcon> = {
  ins_service: Wrench,
  ins_brakefluid: Droplet,
  ins_tyres: CircleDot,
  ins_inspection: ClipboardCheck,
  ins_insurance: ShieldCheck,
  ins_registration: FileText,
  ins_warranty: BadgeCheck,
  ins_gaps: History,
  ins_mileage: Gauge,
};
export const insightIcon = (id: string) => INSIGHT_ICON[id] ?? CalendarClock;

// ---------------------------------------------------------------------------------------
// Vehicle visual: owner photo if present, otherwise a restrained silhouette
// ---------------------------------------------------------------------------------------

function Silhouette() {
  const gid = useId().replace(/:/g, '');
  return (
    <svg className="silhouette" viewBox="0 0 480 170" aria-hidden>
      <defs>
        <linearGradient id={`${gid}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3642" />
          <stop offset=".55" stopColor="#151d25" />
          <stop offset="1" stopColor="#0c1116" />
        </linearGradient>
        <linearGradient id={`${gid}g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a4a59" stopOpacity=".2" />
          <stop offset=".6" stopColor="#6d8296" stopOpacity=".55" />
          <stop offset="1" stopColor="#3a4a59" stopOpacity=".2" />
        </linearGradient>
        <radialGradient id={`${gid}s`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#000" stopOpacity=".7" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="240" cy="150" rx="228" ry="12" fill={`url(#${gid}s)`} />
      {/* body */}
      <path
        d="M22 122 L20 104 C20 95 25 89 34 87 L82 80 C112 76 140 56 176 48 C214 40 262 40 294 46 C318 51 338 63 356 74 C384 80 420 84 446 90 C460 93 466 101 464 112 L461 122 L426 122 A36 36 0 0 0 354 122 L152 122 A36 36 0 0 0 80 122 Z"
        fill={`url(#${gid}b)`} stroke="#34424f" strokeWidth="1"
      />
      {/* glasshouse */}
      <path d="M150 80 C170 62 196 53 224 51 L288 51 C306 54 322 63 336 75 Z" fill="#0a0f14" stroke="#2c3844" strokeWidth="1" />
      <path d="M262 51 L258 78" stroke="#1b242d" strokeWidth="3" />
      {/* shoulder line highlight */}
      <path d="M40 98 C150 92 330 92 452 99" fill="none" stroke={`url(#${gid}g)`} strokeWidth="1.25" />
      {/* lights */}
      <path d="M440 92 L458 97" stroke="#9fb3c6" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      <path d="M22 95 L40 92" stroke="#e56b6f" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      {/* wheels */}
      {[116, 390].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="122" r="30" fill="#07090c" stroke="#26313b" strokeWidth="1.5" />
          <circle cx={cx} cy="122" r="19" fill="none" stroke="#3c4a57" strokeWidth="1.5" />
          <circle cx={cx} cy="122" r="4" fill="#3c4a57" />
        </g>
      ))}
    </svg>
  );
}

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export function VehicleVisual({ vehicle, onPick, onRemove, onFindReference, busy, src, showCredit = true }: {
  vehicle: Vehicle; onPick?: (f: File) => void; onRemove?: () => void; onFindReference?: () => void; busy?: boolean | string;
  /** Override image (e.g. a local preview before upload). */
  src?: string | null;
  showCredit?: boolean;
}) {
  const url = src ?? photoApi.url(vehicle);
  const input = useRef<HTMLInputElement>(null);
  const ref = !src && vehicle.photo?.kind === 'reference' ? vehicle.photo.credit : undefined;
  // With edit actions on the image, the credit sits underneath it so the two never collide.
  const creditBelow = !!onPick;
  const credit = ref && showCredit ? (
    <a className={`ref-credit${creditBelow ? ' below' : ''}`} href={ref.source} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
      Photo: {ref.author} · {ref.license} · Wikimedia Commons
    </a>
  ) : null;
  const visual = (
    <div className={`vehicle-visual${url ? ' has-photo' : ''}`}>
      {url
        ? <img src={url} alt={ref ? `Reference photo of a ${vehicle.make} ${vehicle.model} (not this vehicle)` : `${vehicle.make} ${vehicle.model}`} />
        : <Silhouette />}
      {ref && (
        <span className="ref-tag" title={`Reference photo of the same model, not this vehicle. ${ref.author} · ${ref.license}`}>Reference photo</span>
      )}
      {!creditBelow && credit}
      {onPick && (
        <div className="photo-actions">
          {!url && onFindReference && (
            <button type="button" className="photo-action" onClick={onFindReference} disabled={!!busy}>
              <ImageIcon className="i" aria-hidden />{busy === 'reference' ? 'Searching…' : 'Find photo'}
            </button>
          )}
          <button type="button" className="photo-action" onClick={() => input.current?.click()} disabled={!!busy}>
            <Camera className="i" aria-hidden />{busy === true || busy === 'upload' ? 'Uploading…' : url && !ref ? 'Change photo' : 'Upload your photo'}
          </button>
          {url && onRemove && !busy && (
            <button type="button" className="photo-action icon" onClick={onRemove} aria-label="Remove photo" title="Remove photo">
              <Trash2 className="i" aria-hidden />
            </button>
          )}
          <input ref={input} type="file" hidden accept={PHOTO_ACCEPT}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
        </div>
      )}
    </div>
  );
  return creditBelow ? <div className="vv-wrap">{visual}{credit}</div> : visual;
}

// ---------------------------------------------------------------------------------------
// Mileage chart
// ---------------------------------------------------------------------------------------

/** Odometer over time. Answers: "How has this car been used?" */
export function MileageChart({ points, current }: { points: { date: string; mileage: number }[]; current?: { date: string; mileage: number } }) {
  const gid = useId().replace(/:/g, '');
  const data = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (current) data.push(current);
  if (data.length < 2) return <p className="muted small">Add at least two records to see the mileage timeline.</p>;
  const W = 560, H = 180, L = 48, R = 12, T = 12, B = 24;
  const t0 = new Date(data[0].date).getTime();
  const t1 = new Date(data[data.length - 1].date).getTime() || t0 + 1;
  const maxKm = Math.ceil(Math.max(...data.map((d) => d.mileage)) / 10000) * 10000 || 10000;
  const x = (d: string) => L + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (m: number) => T + (1 - m / maxKm) * (H - T - B);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(d.date).toFixed(1)},${y(d.mileage).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data[data.length - 1].date)},${H - B} L${x(data[0].date)},${H - B} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxKm * f));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Odometer from ${fmtKm(data[0].mileage)} to ${fmtKm(data[data.length - 1].mileage)}`}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4da3ff" stopOpacity=".14" />
          <stop offset="1" stopColor="#4da3ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tk) => (
        <g key={tk}>
          <line x1={L} x2={W - R} y1={y(tk)} y2={y(tk)} style={{ stroke: 'var(--color-border)' }} />
          <text x={L - 8} y={y(tk) + 4} textAnchor="end">{tk.toLocaleString('en-US')}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" style={{ stroke: 'var(--color-blue)' }} strokeWidth="1.5" strokeLinejoin="round" />
      {data.map((d, i) => (
        <circle key={i} cx={x(d.date)} cy={y(d.mileage)} r={i === data.length - 1 && current ? 4 : 2.75} style={{ fill: 'var(--color-bg)', stroke: 'var(--color-blue)' }} strokeWidth="1.5">
          <title>{`${fmtDate(d.date)}: ${fmtKm(d.mileage)}`}</title>
        </circle>
      ))}
      <text x={L} y={H - 4}>{new Date(data[0].date).getFullYear()}</text>
      <text x={W - R} y={H - 4} textAnchor="end">{new Date(data[data.length - 1].date).getFullYear()}</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------------------
// Vehicle Confidence & shared data-display pieces
// ---------------------------------------------------------------------------------------

const LEVEL_COLOR: Record<Level, string> = { high: 'var(--color-success)', moderate: 'var(--color-warning)', low: 'var(--color-danger)' };

export function LevelBadge({ level, short }: { level: Level; short?: boolean }) {
  return <span className={`badge s-${LEVEL_STATUS[level]}`}>{short ? LEVEL_LABEL[level].replace(' confidence', '') : LEVEL_LABEL[level]}</span>;
}

/** Signature Vehicle Confidence display: score ring, level, and the evidence counts behind it. */
export function ConfidenceScore({ score, level, verifiedRecords, sources, gaps, size = 104, question, compact }: {
  score: number; level: Level; verifiedRecords?: number; sources?: number; gaps?: number; size?: number; question?: string; compact?: boolean;
}) {
  return (
    <div className={`conf-score${compact ? ' compact' : ''}`}>
      <HealthRing value={score} size={size} color="var(--color-blue)" label="Vehicle Confidence" />
      <div>
        <span className="label-ai" style={{ color: 'var(--color-text-secondary)' }}><ShieldCheck className="i" aria-hidden />Vehicle Confidence</span>
        <div className="conf-level" style={{ color: LEVEL_COLOR[level] }}>{LEVEL_LABEL[level]}</div>
        {verifiedRecords !== undefined && (
          <p className="conf-counts num">
            {verifiedRecords} verified record{verifiedRecords === 1 ? '' : 's'} · {sources} source{sources === 1 ? '' : 's'} · {gaps} gap{gaps === 1 ? '' : 's'}
          </p>
        )}
        {question && <p className="caption" style={{ marginBlockStart: 4 }}>{question}</p>}
      </div>
    </div>
  );
}

/** Horizontal score bar with its value always printed beside it (never colour alone). */
export function ScoreBar({ score, level }: { score: number; level?: Level }) {
  return (
    <span className="score-bar" role="img" aria-label={`${score} out of 100`}>
      <span className="track"><i style={{ inlineSize: `${score}%`, background: level ? LEVEL_COLOR[level] : 'var(--color-blue)' }} /></span>
      <b className="num">{score}</b>
    </span>
  );
}

export function MetricCard({ label, value, detail, tone }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'ok' | 'attention' | 'due' }) {
  return (
    <div className="metric">
      <span className="caption">{label}</span>
      <b className="num" style={tone ? { color: tone === 'ok' ? 'var(--color-success)' : tone === 'attention' ? 'var(--color-warning)' : 'var(--color-danger)' } : undefined}>{value}</b>
      {detail && <span className="caption">{detail}</span>}
    </div>
  );
}

/** Small vehicle identity cell used in tables: thumbnail, name, plate/owner. */
export function VehicleCell({ v, sub }: { v: { id: string; make: string; model: string; variant?: string; year: number; plate?: string; photoUrl: string | null; photoKind?: string }; sub?: ReactNode }) {
  return (
    <Link to={`/v/${v.id}`} className="veh-cell">
      <span className="veh-thumb" aria-hidden>{v.photoUrl ? <img src={v.photoUrl} alt="" loading="lazy" /> : null}</span>
      <span>
        <b>{v.year} {v.make} {v.model}{v.variant ? ` ${v.variant}` : ''}</b>
        <small>{sub ?? v.plate ?? ''}</small>
      </span>
    </Link>
  );
}
