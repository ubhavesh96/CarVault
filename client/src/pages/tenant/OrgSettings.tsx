import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Lock, Minus } from 'lucide-react';
import { api } from '../../api';
import { useSession } from '../../session';
import { ErrorNote, Spinner } from '../../components/ui';
import { CATEGORY_LABEL, ROLE_LABEL } from '../../modules';
import type { Organization, User } from '../../types';
import ThemeToggle from '../../components/ThemeToggle';

export const PERMISSIONS: { cap: string; platform: boolean; admin: boolean; user: boolean }[] = [
  { cap: 'Use licensed modules and manage vehicles', platform: true, admin: true, user: true },
  { cap: 'Create data rooms and share passports', platform: true, admin: true, user: true },
  { cap: 'Manage users and branches', platform: true, admin: true, user: false },
  { cap: 'Edit allowed branding (when self-serve is on)', platform: true, admin: true, user: false },
  { cap: 'Assign, change, add or remove categories', platform: true, admin: false, user: false },
  { cap: 'Enable or remove modules and integrations', platform: true, admin: false, user: false },
  { cap: 'Custom domain, email sender, passport co-branding', platform: true, admin: false, user: false },
  { cap: 'Change Confidence Engine logic or evidence rules', platform: true, admin: false, user: false },
  { cap: 'Access another organization\'s data', platform: false, admin: false, user: false },
];

export function PermissionMatrix() {
  const Mark = ({ on }: { on: boolean }) => (on
    ? <span className="perm yes"><Check className="i" aria-hidden /><span className="sr-only">Allowed</span></span>
    : <span className="perm no"><Minus className="i" aria-hidden /><span className="sr-only">Not allowed</span></span>);
  return (
    <div className="table-wrap">
      <table className="data-table perm-table">
        <thead><tr><th>Capability</th><th className="c">CarVault Admin</th><th className="c">Organization admin</th><th className="c">Team member</th></tr></thead>
        <tbody>{PERMISSIONS.map((p) => (
          <tr key={p.cap}><td>{p.cap}</td><td className="c"><Mark on={p.platform} /></td><td className="c"><Mark on={p.admin} /></td><td className="c"><Mark on={p.user} /></td></tr>
        ))}</tbody>
      </table>
      <p className="caption" style={{ marginBlockStart: 8 }}>Tenant isolation applies to everyone: the platform operator can view tenants for support, but tenants never see each other.</p>
    </div>
  );
}

export default function OrgSettings() {
  const { session } = useSession();
  const [data, setData] = useState<{ org: Organization; users: User[]; vehicleCount: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const load = useCallback(() => api.org().then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!session) return null;
  if (err) return <ErrorNote error={err} />;
  if (!data) return <div className="empty"><Spinner /></div>;
  const isAdmin = session.permissions.isTenantAdmin;

  const invite = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    try { await api.inviteUser({ name: f.name, email: f.email, role: f.role, title: f.title }); form.reset(); setFormErr(null); load(); }
    catch (x) { setFormErr(x instanceof Error ? x.message : 'Could not add user'); }
  };
  const addBranch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    try { await api.addBranch({ name: f.name, city: f.city }); form.reset(); setFormErr(null); load(); }
    catch (x) { setFormErr(x instanceof Error ? x.message : 'Could not add branch'); }
  };
  const remove = async (u: User) => {
    if (!confirm(`Remove ${u.name}?`)) return;
    try { await api.removeUser(u.id); load(); } catch (x) { setFormErr(x instanceof Error ? x.message : 'Could not remove'); }
  };

  return (
    <div className="stack">
      <div className="page-head"><div><p className="caption">Settings</p><h1>{data.org.name}</h1></div></div>
      <ErrorNote error={formErr} />
      <section className="panel" aria-labelledby="appearance">
        <h2 className="section-title" id="appearance" style={{ marginBlockEnd: 4 }}>Appearance</h2>
        <ThemeToggle />
      </section>
      <div className="g12">
        <section className="panel span-4" aria-labelledby="lic">
          <h2 className="section-title" id="lic" style={{ marginBlockEnd: 12 }}>Plan & licensing</h2>
          <div className="status-list">
            <div><span className="k">Plan</span><b>{data.org.plan}</b></div>
            <div><span className="k">Categories</span><span className="tags">{data.org.categories.map((c) => <span key={c} className="tag">{CATEGORY_LABEL[c]}</span>)}</span></div>
            <div><span className="k">Modules</span><b className="num">{session.entitlements.length}</b></div>
            <div><span className="k">Vehicles</span><b className="num">{data.vehicleCount}</b></div>
          </div>
          <p className="caption row" style={{ gap: 6, marginBlockStart: 14 }}><Lock className="i" aria-hidden style={{ inlineSize: 13, blockSize: 13 }} />Categories and modules are managed by CarVault Admin.</p>
          <Link className="link" to="/app/modules" style={{ marginBlockStart: 8 }}>See available modules</Link>
        </section>

        <section className="panel span-8" aria-labelledby="users">
          <h2 className="section-title" id="users" style={{ marginBlockEnd: 12 }}>Users</h2>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Name</th><th>Role</th><th className="hide-sm">Branch</th><th /></tr></thead>
            <tbody>{data.users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><br /><span className="caption">{u.email}</span></td>
                <td>{ROLE_LABEL[u.role]}{u.title ? <><br /><span className="caption">{u.title}</span></> : null}</td>
                <td className="hide-sm caption">{data.org.branches.find((b) => b.id === u.branchId)?.name ?? '–'}</td>
                <td>{isAdmin && u.id !== session.user.id && <button className="btn sm ghost danger" onClick={() => remove(u)}>Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {isAdmin ? (
            <form className="inline-form" onSubmit={invite}>
              <input name="name" placeholder="Full name" required aria-label="Full name" />
              <input name="email" type="email" placeholder="Email" required aria-label="Email" />
              <select name="role" aria-label="Role" defaultValue="tenant_user"><option value="tenant_user">Team member</option><option value="tenant_admin">Organization admin</option></select>
              <button className="btn">Add user</button>
            </form>
          ) : <p className="caption" style={{ marginBlockStart: 12 }}>Only your organization admin can manage users.</p>}
        </section>
      </div>

      <div className="g12">
        <section className="panel span-4" aria-labelledby="br">
          <h2 className="section-title" id="br" style={{ marginBlockEnd: 12 }}>Branches</h2>
          <div className="status-list">
            {data.org.branches.map((b) => <div key={b.id}><span>{b.name}</span><span className="caption">{b.city}</span></div>)}
            {!data.org.branches.length && <p className="muted small">No branches yet.</p>}
          </div>
          {isAdmin && (
            <form className="inline-form" onSubmit={addBranch}>
              <input name="name" placeholder="Branch name" required aria-label="Branch name" />
              <input name="city" placeholder="City" required aria-label="City" />
              <button className="btn">Add</button>
            </form>
          )}
        </section>
        <section className="panel span-8" aria-labelledby="perm">
          <h2 className="section-title" id="perm" style={{ marginBlockEnd: 12 }}>Who can do what</h2>
          <PermissionMatrix />
        </section>
      </div>
    </div>
  );
}
