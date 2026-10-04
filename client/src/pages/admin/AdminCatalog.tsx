import { useEffect, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { api, AdminCatalog as Cat } from '../../api';
import { ErrorNote, Spinner } from '../../components/ui';
import { CATEGORY_LABEL, moduleMeta } from '../../modules';

export default function AdminCatalog({ modulesFirst }: { modulesFirst?: boolean }) {
  const [c, setC] = useState<Cat | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api.admin.catalog().then(setC).catch((e) => setErr(e.message)); }, []);
  if (err) return <ErrorNote error={err} />;
  if (!c) return <div className="empty"><Spinner /></div>;
  const cats = c.categories.filter((x) => x.id !== 'full');

  const categories = (
    <section aria-labelledby="cats">
      <h2 className="section-title" id="cats" style={{ marginBlockEnd: 12 }}>Categories</h2>
      <div className="module-grid">
        {c.categories.map((x) => (
          <article key={x.id} className="module-card active">
            <b>{x.name}</b>
            <p className="caption">{x.description}</p>
            <p className="caption">{x.modules.length} modules · navigation: {x.nav.map((n) => moduleMeta(n).label).join(', ')}</p>
            <p className="small">{x.tenants.length ? `Tenants: ${x.tenants.join(', ')}` : 'No tenants yet'}</p>
          </article>
        ))}
      </div>
    </section>
  );
  const matrix = (
    <section className="panel" aria-labelledby="mx">
      <h2 className="section-title" id="mx" style={{ marginBlockEnd: 4 }}>Modules by category</h2>
      <p className="caption" style={{ marginBlockEnd: 12 }}>The master catalog. Core modules are part of every plan; Full platform includes everything.</p>
      <div className="table-wrap">
        <table className="data-table matrix">
          <thead><tr><th>Module</th>{cats.map((x) => <th key={x.id} className="c">{CATEGORY_LABEL[x.id]}</th>)}</tr></thead>
          <tbody>
            {c.modules.map((m) => (
              <tr key={m.id}>
                <td><b className="small">{m.name}</b>{m.core && <span className="caption"> · core</span>}<br /><span className="caption">{m.group}</span></td>
                {cats.map((x) => {
                  const on = m.core || x.modules.includes(m.id);
                  return <td key={x.id} className="c">{on ? <span className="perm yes"><Check className="i" aria-hidden /><span className="sr-only">Included</span></span> : <span className="perm no"><Minus className="i" aria-hidden /><span className="sr-only">Not included</span></span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <div className="stack">
      <div className="page-head"><div><p className="caption">CarVault Admin</p><h1>{modulesFirst ? 'Modules' : 'Categories & products'}</h1><p className="muted" style={{ marginBlockStart: 4 }}>What CarVault sells. Assign categories and extra modules to a tenant from its organization page.</p></div></div>
      {modulesFirst ? <>{matrix}{categories}</> : <>{categories}{matrix}</>}
    </div>
  );
}
