import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { api, ApiError } from '../api';
import { useVehicle } from './VehicleLayout';
import { ErrorNote, Modal, TrustBadge } from '../components/ui';
import type { ServiceCategory } from '../types';
import { CATEGORY_LABEL, fmtAED, fmtDate, fmtKm } from '../utils';

function AddEntry({ onClose }: { onClose: () => void }) {
  const { data, setData } = useVehicle();
  const [err, setErr] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const body = { ...Object.fromEntries(new FormData(e.currentTarget).entries()), acknowledgeConflicts: ack };
    try {
      setData(await api.addService(data.vehicle.id, body));
      onClose();
    } catch (x) {
      if (x instanceof ApiError && x.status === 409) setConflicts(x.conflicts ?? []);
      else setErr(x instanceof Error ? x.message : 'Could not save');
      setBusy(false);
    }
  };
  return (
    <Modal title="Add a record manually" subtitle="Entries without a document are marked Owner-provided, not Verified." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field full"><span>What was done *</span><input name="title" required placeholder="Oil service" /></label>
          <label className="field"><span>Date *</span><input name="date" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
          <label className="field"><span>Odometer (km) *</span><input name="mileage" type="number" required min={0} /></label>
          <label className="field"><span>Type</span>
            <select name="category" defaultValue="service">{Object.entries(CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field"><span>Cost (AED)</span><input name="cost" type="number" min={0} defaultValue={0} /></label>
          <label className="field full"><span>Workshop</span><input name="workshop" /></label>
          <label className="field full"><span>Notes</span><textarea name="notes" /></label>
        </div>
        {conflicts.length > 0 && (
          <div className="notice warn" style={{ marginBlockStart: 14 }}>
            <b>Please check this entry:</b>
            <ul style={{ margin: '6px 0 8px', paddingInlineStart: 18 }}>{conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={ack} onChange={(e) => setAck(e.target.checked)} /> I've checked, save it anyway</label>
          </div>
        )}
        <div style={{ marginBlockStart: 12 }}><ErrorNote error={err} /></div>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || (conflicts.length > 0 && !ack)}>Save record</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Timeline() {
  const { data, setData } = useVehicle();
  const [filter, setFilter] = useState<ServiceCategory | 'all'>('all');
  const [params] = useSearchParams();
  const target = params.get('record');
  const [open, setOpen] = useState<string | null>(target);
  // Deep link from an insight's "View source": open, scroll to and highlight the record.
  useEffect(() => {
    if (!target) return;
    setFilter('all');
    setOpen(target);
    requestAnimationFrame(() => document.getElementById(`rec-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, [target]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const list = useMemo(() => data.services.filter((s) => filter === 'all' || s.category === filter), [data.services, filter]);
  const years = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((s) => { const y = s.date.slice(0, 4); m.set(y, [...(m.get(y) ?? []), s]); });
    return [...m.entries()];
  }, [list]);
  const total = data.services.reduce((s, r) => s + r.cost, 0);
  const cats = [...new Set(data.services.map((s) => s.category))];

  const remove = async (id: string, title: string) => {
    if (!confirm(`Remove "${title}" from the timeline?`)) return;
    try { setData(await api.deleteService(id)); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not remove'); }
  };

  return (
    <>
      <div className="row between wrap" style={{ marginBlockEnd: 24 }}>
        <div className="stat-strip">
          <div><b className="num">{data.services.length}</b><span>Records</span></div>
          <div><b className="num">{fmtAED(total)}</b><span>Recorded spend</span></div>
        </div>
        <button className="btn" onClick={() => setAdding(true)}><Plus className="i" aria-hidden />Add record</button>
      </div>

      {cats.length > 1 && (
        <div className="pills" style={{ marginBlockEnd: 16 }} role="group" aria-label="Filter by type">
          {(['all', ...cats] as const).map((c) => (
            <button key={c} className={`pill${filter === c ? ' on' : ''}`} aria-pressed={filter === c} onClick={() => setFilter(c)}>
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      )}
      <ErrorNote error={err} />

      {data.services.length === 0 ? (
        <div className="card empty">
          <h3>No history yet</h3>
          <p>Upload a service invoice and CarVault will build this timeline for you.</p>
        </div>
      ) : (
        <div className="tl">
          {years.map(([year, items]) => (
            <div key={year}>
              <div className="tl-year num">{year}</div>
              {items.map((s) => {
                const isOpen = open === s.id;
                return (
                  <div className={`tl-item ${s.category}${target === s.id ? ' highlight' : ''}`} key={s.id} id={`rec-${s.id}`}>
                    <div className="tl-card">
                      <div className="tl-top">
                        <div>
                          <h4>{s.title}</h4>
                          <div className="tl-meta num">
                            <span>{fmtDate(s.date)}</span><span>{fmtKm(s.mileage)}</span><span>{s.workshop}</span><span>{CATEGORY_LABEL[s.category]}</span>
                          </div>
                        </div>
                        <div className="r">
                          <div className="num" style={{ fontWeight: 600 }}>{fmtAED(s.cost)}</div>
                          <TrustBadge trust={s.trust} />
                        </div>
                      </div>
                      <button className="link muted" style={{ marginBlockStart: 8 }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                        {isOpen ? 'Hide details' : 'Details'} <ChevronDown className="i" aria-hidden style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 200ms' }} />
                      </button>
                      {isOpen && (
                        <div className="tl-detail">
                          {s.workPerformed.length > 0 && <div><b>Work performed</b><ul>{s.workPerformed.map((w) => <li key={w}>{w}</li>)}</ul></div>}
                          {s.parts.length > 0 && <div><b>Parts</b><ul>{s.parts.map((p) => <li key={p.name}>{p.name}{p.partNo ? ` (${p.partNo})` : ''}</li>)}</ul></div>}
                          {s.notes && <div><b>Notes</b><p>{s.notes}</p></div>}
                          {!s.workPerformed.length && !s.parts.length && !s.notes && <span className="muted">No further detail was recorded.</span>}
                          <div><button className="link danger" onClick={() => remove(s.id, s.title)}>Remove this record</button></div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {adding && <AddEntry onClose={() => setAdding(false)} />}
    </>
  );
}
