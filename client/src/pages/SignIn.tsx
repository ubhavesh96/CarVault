import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, ShieldCheck, UserCircle2 } from 'lucide-react';
import { api } from '../api';
import { useSession } from '../session';
import { CATEGORY_LABEL, ROLE_LABEL } from '../modules';
import { ErrorNote, Spinner } from '../components/ui';
import type { Persona } from '../types';

export default function SignIn() {
  const { signIn, error } = useSession();
  const nav = useNavigate();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api.personas().then(setPersonas).catch((e) => setErr(e.message)); }, []);

  const go = async (id: string) => {
    setBusy(id);
    await signIn(id);
    nav('/');
  };
  const groups: { title: string; icon: typeof Building2; items: Persona[] }[] = personas ? [
    { title: 'CarVault platform', icon: ShieldCheck, items: personas.filter((p) => p.isPlatform) },
    { title: 'Organizations', icon: Building2, items: personas.filter((p) => !p.isPlatform && !p.categories.includes('consumer')) },
    { title: 'Vehicle owners', icon: UserCircle2, items: personas.filter((p) => p.categories.includes('consumer')) },
  ] : [];

  return (
    <div className="signin">
      <div className="signin-intro">
        <span className="label-ai"><ShieldCheck className="i" aria-hidden />CarVault</span>
        <h1>Trusted vehicle lifecycle intelligence.</h1>
        <p className="lede">One platform, many organizations. Each sees only its own vehicles and the modules it is licensed for. CarVault controls the intelligence and trust model.</p>
        <div className="notice" style={{ marginBlockStart: 24 }}>
          <b>Prototype sign-in.</b> There is no real authentication yet. Choose who to act as; what each person can see and do is enforced by the server.
        </div>
      </div>
      <div className="signin-list">
        <ErrorNote error={err ?? error} />
        {!personas && !err && <div className="empty"><Spinner /></div>}
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 className="label row" id={`g-${g.title}`} style={{ gap: 8, marginBlockEnd: 10 }}><g.icon className="i" aria-hidden />{g.title}</h2>
            <div className="persona-cards">
              {g.items.map((p) => (
                <button key={p.id} className="persona-card" onClick={() => go(p.id)} disabled={!!busy}>
                  <span>
                    <b>{p.name}</b>
                    <small>{p.title ?? ROLE_LABEL[p.role]} · {p.org}</small>
                    {!p.isPlatform && <span className="tags" style={{ marginBlockStart: 6 }}>{p.categories.map((c) => <span key={c} className="tag">{CATEGORY_LABEL[c]}</span>)}<span className="tag">{ROLE_LABEL[p.role]}</span></span>}
                  </span>
                  {busy === p.id ? <Spinner /> : <ArrowRight className="i arrow" aria-hidden />}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
