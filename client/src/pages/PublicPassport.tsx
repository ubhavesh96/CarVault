import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import PassportView from '../components/PassportView';
import { Spinner } from '../components/ui';
import type { PassportData } from '../types';

export default function PublicPassport() {
  const { token = '' } = useParams();
  const [p, setP] = useState<PassportData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.publicPassport(token).then((r) => setP(r.passport)).catch((e) => setErr(e.message)); }, [token]);

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">CarVault <span className="ai">AI</span></Link>
        <span className="muted small">Shared vehicle passport</span>
      </header>
      <main className="page">
        {err && <div className="empty"><h3>Passport unavailable</h3><p>{err}</p></div>}
        {!p && !err && <div className="empty"><Spinner /></div>}
        {p && <PassportView p={p} />}
      </main>
    </>
  );
}
