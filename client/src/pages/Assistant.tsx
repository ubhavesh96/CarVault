import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, HelpCircle, type LucideIcon, ScanSearch, TrendingDown } from 'lucide-react';
import { api } from '../api';
import { useVehicle } from './VehicleLayout';
import { ErrorNote } from '../components/ui';
import type { ChatBlock, ChatMessage } from '../types';

const LABEL: Record<ChatBlock['kind'], string> = {
  text: '', verified: 'From your records', inference: 'Insight', recommendation: 'Next step', unknown: 'Unknown', estimated: 'Estimate',
};
const ICON: Partial<Record<ChatBlock['kind'], LucideIcon>> = {
  verified: Check, inference: ScanSearch, recommendation: ArrowRight, unknown: HelpCircle, estimated: TrendingDown,
};
const PROMPTS = ['What needs attention?', 'What should I service next?', 'Is my car ready for a long drive?', 'Explain my service history.', 'Prepare my car for sale', 'What is my car worth?'];

function Answer({ m, onPick, disabled }: { m: ChatMessage; onPick: (s: string) => void; disabled: boolean }) {
  return (
    <article className="answer" aria-label="CarVault answer">
      <span className="label-ai"><ScanSearch className="i" aria-hidden />CarVault Insight</span>
      {m.blocks?.map((b, i) => {
        const Icon = ICON[b.kind];
        return (
          <div className={`blk k-${b.kind}`} key={i}>
            {LABEL[b.kind] && <div className="lbl">{Icon && <Icon className={`i${b.kind === 'recommendation' ? ' flip-rtl' : ''}`} aria-hidden />}{LABEL[b.kind]}</div>}
            <p>{b.text}</p>
            {b.sources && b.sources.length > 0 && (
              <div className="tags" aria-label="Sources">{b.sources.map((s) => <span className="tag" key={s}>{s}</span>)}</div>
            )}
          </div>
        );
      })}
      {m.suggestions && m.suggestions.length > 0 && (
        <div className="chips" style={{ marginBlockStart: 4 }}>
          {m.suggestions.map((s) => <button key={s} className="chip" disabled={disabled} onClick={() => onPick(s)}>{s}</button>)}
        </div>
      )}
    </article>
  );
}

export default function Assistant() {
  const { data } = useVehicle();
  const id = data.vehicle.id;
  const [params, setParams] = useSearchParams();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => { api.chat(id).then(setMsgs).catch((e) => { setErr(e.message); setMsgs([]); }); }, [id]);
  useEffect(() => { if (msgs?.length) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const send = useCallback(async (message: string) => {
    const m = message.trim();
    if (!m) return;
    setErr(null);
    setBusy(true);
    setText('');
    const temp: ChatMessage = { id: 'tmp', vehicleId: id, role: 'user', at: new Date().toISOString(), text: m };
    setMsgs((cur) => [...(cur ?? []), temp]);
    try {
      const r = await api.send(id, m);
      setMsgs((cur) => [...(cur ?? []).filter((x) => x.id !== 'tmp'), r.user, r.reply]);
    } catch (e) {
      setMsgs((cur) => (cur ?? []).filter((x) => x.id !== 'tmp'));
      setText(m);
      setErr(e instanceof Error ? e.message : 'CarVault could not answer');
    } finally {
      setBusy(false);
    }
  }, [id]);

  // A question chosen on the Overview arrives as ?q=
  useEffect(() => {
    const q = params.get('q');
    if (q && msgs && !started.current) {
      started.current = true;
      setParams({}, { replace: true });
      send(q);
    }
  }, [params, msgs, send, setParams]);

  const submit = (e: FormEvent) => { e.preventDefault(); if (!busy) send(text); };
  const clear = async () => {
    if (!confirm('Clear this conversation?')) return;
    await api.clearChat(id);
    setMsgs([]);
  };
  const last = msgs?.[msgs.length - 1];

  return (
    <div className="assistant-layout">
      <section className="chat" aria-label="Ask CarVault">
        <div className="panel-head">
          <div>
            <h2 className="section-title">Ask CarVault</h2>
            <p className="caption" style={{ marginBlockStart: 2 }}>Answers come from this vehicle's records, with the basis shown.</p>
          </div>
          {msgs && msgs.length > 0 && <button className="link muted" onClick={clear}>Clear</button>}
        </div>

        <div className="chat-scroll" aria-live="polite">
          {msgs && msgs.length === 0 && (
            <div className="prompt-list" role="list" aria-label="Suggested questions">
              {PROMPTS.map((s) => (
                <button key={s} role="listitem" onClick={() => send(s)}>
                  <ScanSearch className="i" aria-hidden style={{ color: 'var(--color-text-tertiary)' }} />{s}<ChevronRight className="i" aria-hidden />
                </button>
              ))}
            </div>
          )}
          {msgs?.map((m) =>
            m.role === 'user'
              ? <div className="q" key={m.id}><span className="caption">You asked</span><p>{m.text}</p></div>
              : <Answer key={m.id} m={m} disabled={busy || m !== last} onPick={send} />,
          )}
          {busy && <div className="caption row"><span className="typing" aria-hidden><i /><i /><i /></span> Reviewing the vehicle's records…</div>}
          <div ref={bottom} />
        </div>

        <ErrorNote error={err} />
        <form className="composer" onSubmit={submit}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask about the ${data.vehicle.model}…`} aria-label="Question" maxLength={2000} />
          <button className="btn primary" disabled={busy || !text.trim()}>Ask</button>
        </form>
      </section>

      <aside className="assistant-side" aria-label="How answers are labelled">
        <p className="label" style={{ marginBlockEnd: 14 }}>How answers are labelled</p>
        <div className="legend">
          <span style={{ '--c': 'var(--color-success)' } as never}><i />From your records: read from a document</span>
          <span style={{ '--c': 'var(--color-blue)' } as never}><i />Insight: interpreted from records</span>
          <span style={{ '--c': 'var(--color-platinum)' } as never}><i />Estimate: a model, not a fact</span>
          <span style={{ '--c': 'var(--color-text-primary)' } as never}><i />Next step: a suggested action</span>
          <span style={{ '--c': 'var(--color-unknown)' } as never}><i />Unknown: not in the records</span>
        </div>
        <hr className="divider" />
        <p className="caption">CarVault never books, pays or contacts anyone without your approval, and never diagnoses a fault from records alone.</p>
      </aside>
    </div>
  );
}
