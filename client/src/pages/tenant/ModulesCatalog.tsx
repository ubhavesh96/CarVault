import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock } from 'lucide-react';
import { api, ApiError } from '../../api';
import { useSession } from '../../session';
import { moduleMeta } from '../../modules';
import type { CatalogModule, CategoryId } from '../../types';

type Msg = { kind: 'err' | 'ok'; text: string } | undefined;

export default function ModulesCatalog() {
  const { session } = useSession();
  const [msgs, setMsgs] = useState<Record<string, Msg>>({});
  if (!session) return null;
  const { catalog } = session;
  const set = (k: string, m: Msg) => setMsgs((s) => ({ ...s, [k]: m }));

  const activateCategory = async (id: CategoryId) => {
    try { await api.activateCategory(id); } catch (e) { set(`c-${id}`, { kind: 'err', text: e instanceof ApiError ? e.message : 'Not available' }); }
  };
  const activateModule = async (m: CatalogModule) => {
    try { await api.activateModule(m.id); } catch (e) { set(`m-${m.id}`, { kind: 'err', text: e instanceof ApiError ? e.message : 'Not available' }); }
  };
  const request = async (key: string, b: { module?: string; category?: string }) => {
    try { set(key, { kind: 'ok', text: (await api.requestAccess(b)).message }); } catch (e) { set(key, { kind: 'err', text: e instanceof Error ? e.message : 'Could not send' }); }
  };

  const groups = [...new Set(catalog.modules.map((m) => m.group))];
  const catName = (id: CategoryId) => catalog.categories.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="caption">Available modules</p>
          <h1>The CarVault platform</h1>
          <p className="muted" style={{ maxInlineSize: 680, marginBlockStart: 4 }}>
            Everything CarVault offers. Your organization is licensed for the categories marked active. Only CarVault Admin can add, change or remove categories and modules.
          </p>
        </div>
      </div>

      <section aria-labelledby="cats">
        <h2 className="section-title" id="cats" style={{ marginBlockEnd: 12 }}>Categories</h2>
        <div className="module-grid">
          {catalog.categories.map((c) => {
            const m = msgs[`c-${c.id}`];
            return (
              <article key={c.id} className={`module-card${c.licensed ? ' active' : ' locked'}`}>
                <div className="row between">
                  <b>{c.name}</b>
                  {c.licensed ? <span className="badge s-ok has-icon"><Check className="i" aria-hidden />Active</span> : <span className="badge s-unknown has-icon"><Lock className="i" aria-hidden />Locked</span>}
                </div>
                <p className="caption">{c.description}</p>
                <p className="caption">{c.moduleCount} modules</p>
                {!c.licensed && (
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className="btn sm" onClick={() => activateCategory(c.id)}>Activate</button>
                    <button className="btn sm ghost" onClick={() => request(`c-${c.id}`, { category: c.id })}>Contact CarVault Admin</button>
                  </div>
                )}
                {m && <p className={`small ${m.kind === 'err' ? 'err-text' : 'ok-text'}`} role={m.kind === 'err' ? 'alert' : 'status'}>{m.text}</p>}
              </article>
            );
          })}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g} aria-labelledby={`g-${g}`}>
          <h2 className="section-title" id={`g-${g}`} style={{ marginBlockEnd: 12 }}>{g}</h2>
          <div className="module-grid">
            {catalog.modules.filter((m) => m.group === g).map((m) => {
              const meta = moduleMeta(m.id);
              const msg = msgs[`m-${m.id}`];
              return (
                <article key={m.id} className={`module-card${m.entitled ? ' active' : ' locked'}`}>
                  <div className="row between">
                    <span className="row" style={{ gap: 8 }}><meta.icon className="i" aria-hidden /><b>{m.name}</b></span>
                    {m.entitled ? <span className="badge s-ok has-icon"><Check className="i" aria-hidden />Included</span> : <span className="badge s-unknown has-icon"><Lock className="i" aria-hidden />Locked</span>}
                  </div>
                  <p className="caption">{m.description}</p>
                  {m.entitled
                    ? (meta.path.startsWith('/app/m/') && meta.path !== '/app/m/vehicles') || meta.path === '/app'
                      ? <Link className="link" to={meta.path}>Open</Link>
                      : <span className="caption">{m.core ? 'Core: part of every plan' : 'Available on each vehicle'}</span>
                    : (
                      <>
                        <p className="caption">Available with {m.unlockedBy.length ? m.unlockedBy.map(catName).join(' or ') : 'a custom plan'}</p>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <button className="btn sm" onClick={() => activateModule(m)}>Activate</button>
                          <button className="btn sm ghost" onClick={() => request(`m-${m.id}`, { module: m.id })}>Contact CarVault Admin</button>
                        </div>
                      </>
                    )}
                  {msg && <p className={`small ${msg.kind === 'err' ? 'err-text' : 'ok-text'}`} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
