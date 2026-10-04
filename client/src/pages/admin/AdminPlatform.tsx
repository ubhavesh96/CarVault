import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { api, AdminOverview } from '../../api';
import { ErrorNote, MetricCard, Spinner } from '../../components/ui';
import { PermissionMatrix } from '../tenant/OrgSettings';
import ThemeToggle from '../../components/ThemeToggle';

/**
 * Where vehicle evidence can come from, and honestly how connected each source is today.
 * Official UAE registry data needs data-sharing agreements; until then the owner brings the official
 * document (RTA certificate) and a person checks it with the issuer.
 */
const CONNECTORS = [
  { id: 'rta_cert', name: 'RTA Vehicle Status Certificate', kind: 'Owner history, insurance history, odometer at every annual test', status: 'Document-based', detail: 'Owners order it on rta.ae with UAE PASS and upload it. Each odometer reading becomes a timeline entry. It turns Verified only after staff check the certificate number with the RTA.' },
  { id: 'dms', name: 'Dealer management system (DMS)', kind: 'Service & sales records', status: 'Sample data only', detail: 'ABC Motors records marked "Imported" come from a sample DMS feed seeded into the demo, not a live connection.' },
  { id: 'fleet', name: 'Fleet management system', kind: 'Service records & mileage', status: 'Sample data only', detail: 'Meridian Fleet\'s imported records are seeded sample data.' },
  { id: 'rta', name: 'RTA / ITC registry lookup', kind: 'Registration, owners, test results at source', status: 'Partnership needed', detail: 'Direct lookup needs a data-sharing agreement with Dubai RTA (and ITC for Abu Dhabi). Replaces the manual certificate check.' },
  { id: 'testing', name: 'Testing centres (e.g. Tasjeel, Shamil)', kind: 'Test results & odometer readings', status: 'Partnership needed', detail: 'Would add every test as imported evidence the day it happens.' },
  { id: 'history', name: 'Vehicle history providers (e.g. CarSeer, CARFAX Middle East)', kind: 'Accident, import and auction history', status: 'Partnership needed', detail: 'Commercial reseller agreement. Would fill the accident / claims dimension, which owners rarely document.' },
  { id: 'insurer', name: 'Insurer claims history', kind: 'Accident & claims evidence', status: 'Partnership needed', detail: 'Would strengthen the claims dimension. Claims reports are currently uploaded as documents.' },
  { id: 'telematics', name: 'Telematics', kind: 'Live mileage, utilization, downtime', status: 'Not connected', detail: 'Needed for Utilization. No provider is integrated.' },
  { id: 'uaepass', name: 'UAE PASS', kind: 'Sign-in and e-signature', status: 'Not connected', detail: 'Planned as the owner sign-in. Private-sector onboarding is through the UAE PASS service provider programme.' },
  { id: 'wikimedia', name: 'Wikimedia Commons', kind: 'Reference vehicle photos', status: 'Live', detail: 'Freely licensed photos of a vehicle\'s model, credited and labelled as reference images.' },
  { id: 'claude', name: 'Anthropic Claude', kind: 'Document extraction & CarVault Insight', status: 'Configurable', detail: 'Off until ANTHROPIC_API_KEY is set; a grounded mock is used meanwhile.' },
];
const STATUS_CLASS: Record<string, string> = { Live: 'ok', 'Document-based': 'ok', 'Not connected': 'unknown', 'Partnership needed': 'attention' };

export default function AdminPlatform() {
  const { section = '' } = useParams();
  const [ai, setAi] = useState<{ provider: string; model: string; liveConfigured: boolean; referenceImages: boolean } | null>(null);
  const [ov, setOv] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (section === 'ai') api.admin.ai().then(setAi).catch((e) => setErr(e.message));
    if (section === 'analytics') api.admin.overview().then(setOv).catch((e) => setErr(e.message));
  }, [section]);
  if (err) return <ErrorNote error={err} />;

  const head = (title: string, intro: string) => (
    <div className="page-head"><div><p className="caption">CarVault Admin</p><h1>{title}</h1><p className="muted" style={{ maxInlineSize: 680, marginBlockStart: 4 }}>{intro}</p></div></div>
  );

  if (section === 'integrations' || section === 'data-sources') {
    return (
      <div className="stack">
        {head(section === 'integrations' ? 'Integrations' : 'Data sources', 'Where vehicle evidence can come from. Records from a connected system are labelled Imported; everything else is uploaded and reviewed.')}
        <section className="panel">
          <div className="status-list">
            {CONNECTORS.map((c) => (
              <div key={c.id}>
                <span className="row" style={{ gap: 12, alignItems: 'flex-start' }}><Plug className="i" aria-hidden style={{ marginBlockStart: 3 }} /><span><b>{c.name}</b><br /><span className="caption">{c.kind} · {c.detail}</span></span></span>
                <span className={`badge s-${STATUS_CLASS[c.status] ?? 'upcoming'}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }
  if (section === 'ai') {
    return (
      <div className="stack">
        {head('AI configuration', 'The AI provider behind document extraction and CarVault Insight. AI output is always labelled and never counts as evidence.')}
        {!ai ? <div className="empty"><Spinner /></div> : (
          <div className="metrics">
            <MetricCard label="Active provider" value={ai.provider === 'claude' ? 'Claude' : 'Grounded mock'} detail={ai.liveConfigured ? 'API key configured' : 'Set ANTHROPIC_API_KEY to go live'} />
            <MetricCard label="Model" value={<span style={{ fontSize: 16 }}>{ai.model}</span>} detail="CARVAULT_MODEL" />
            <MetricCard label="Reference photos" value={ai.referenceImages ? 'On' : 'Off'} detail="REFERENCE_IMAGES" />
          </div>
        )}
      </div>
    );
  }
  if (section === 'analytics') {
    return (
      <div className="stack">
        {head('Platform analytics', 'Coverage and adoption across tenants.')}
        {!ov ? <div className="empty"><Spinner /></div> : (
          <div className="metrics">
            <MetricCard label="Vehicles under management" value={ov.vehicles} />
            <MetricCard label="High-confidence share" value={ov.vehicles ? `${Math.round((ov.highConfidence / ov.vehicles) * 100)}%` : '–'} detail="North Star proxy: trusted lifecycle coverage" />
            <MetricCard label="Average Vehicle Confidence" value={ov.avgConfidence ?? '–'} />
            <MetricCard label="Active data rooms" value={ov.dataRooms} />
          </div>
        )}
        <p className="small"><Link className="link" to="/admin/vehicles">See every vehicle</Link></p>
      </div>
    );
  }
  return (
    <div className="stack">
      {head('System settings', 'Platform-level rules that apply to every tenant.')}
      <section className="panel" aria-labelledby="appearance">
        <h2 className="section-title" id="appearance" style={{ marginBlockEnd: 4 }}>Appearance</h2>
        <ThemeToggle />
      </section>
      <section className="panel" aria-labelledby="pm">
        <h2 className="section-title" id="pm" style={{ marginBlockEnd: 12 }}>Permission model</h2>
        <PermissionMatrix />
      </section>
      <section className="panel">
        <h2 className="section-title" style={{ marginBlockEnd: 8 }}>Authentication</h2>
        <p className="small muted">This prototype uses a demo identity switcher. Before any real tenant uses CarVault, replace it with a proper identity provider (for example OIDC/SSO per organization). Authorization checks already run on the server for every request.</p>
      </section>
    </div>
  );
}
