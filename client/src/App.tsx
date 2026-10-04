import { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import Shell from './components/Shell';
import { Spinner } from './components/ui';
import SignIn from './pages/SignIn';
import Garage from './pages/Garage';
import VehicleLayout from './pages/VehicleLayout';
import Overview from './pages/Overview';
import Timeline from './pages/Timeline';
import Documents from './pages/Documents';
import Assistant from './pages/Assistant';
import Passport from './pages/Passport';
import ConfidencePage from './pages/Confidence';
import Resale from './pages/Resale';
import DataRoomPage from './pages/DataRoom';
import PublicPassport from './pages/PublicPassport';
import PublicDataRoom from './pages/PublicDataRoom';
import Dashboard from './pages/tenant/Dashboard';
import ModulePage from './pages/tenant/ModulePage';
import ModulesCatalog from './pages/tenant/ModulesCatalog';
import OrgSettings from './pages/tenant/OrgSettings';
import WhiteLabelStudio from './pages/WhiteLabelStudio';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminOrgs from './pages/admin/AdminOrgs';
import AdminOrg from './pages/admin/AdminOrg';
import AdminCatalog from './pages/admin/AdminCatalog';
import AdminTables from './pages/admin/AdminTables';
import AdminConfidence from './pages/admin/AdminConfidence';
import AdminPlatform from './pages/admin/AdminPlatform';
import AdminPilots from './pages/admin/AdminPilots';

function Home() {
  const { session, isConsumer } = useSession();
  if (!session) return <Navigate to="/signin" replace />;
  if (session.org.isPlatform) return <Navigate to="/admin" replace />;
  return <Navigate to={isConsumer ? '/garage' : '/app'} replace />;
}

/** Route guard: signed in, and (optionally) the right kind of user. */
function Guard({ children, admin, tenant }: { children: ReactNode; admin?: boolean; tenant?: boolean }) {
  const { session, loading } = useSession();
  if (loading) return <div className="empty"><Spinner /></div>;
  if (!session) return <Navigate to="/signin" replace />;
  if (admin && !session.org.isPlatform) return <Navigate to="/" replace />;
  if (tenant && session.org.isPlatform) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { session, loading } = useSession();
  return (
    <Routes>
      <Route path="/p/:token" element={<PublicPassport />} />
      <Route path="/d/:token" element={<PublicDataRoom />} />
      <Route
        path="*"
        element={
          <Shell>
            <Routes>
              <Route path="/signin" element={session && !loading ? <Navigate to="/" replace /> : <SignIn />} />
              <Route path="/" element={loading ? <div className="empty"><Spinner /></div> : <Home />} />

              <Route path="/garage" element={<Guard tenant><Garage /></Guard>} />
              <Route path="/app" element={<Guard tenant><Dashboard /></Guard>} />
              <Route path="/app/m/:module" element={<Guard tenant><ModulePage /></Guard>} />
              <Route path="/app/modules" element={<Guard tenant><ModulesCatalog /></Guard>} />
              <Route path="/app/settings" element={<Guard tenant><OrgSettings /></Guard>} />
              <Route path="/app/white-label" element={<Guard tenant><WhiteLabelStudio /></Guard>} />

              <Route path="/admin" element={<Guard admin><AdminDashboard /></Guard>} />
              <Route path="/admin/orgs" element={<Guard admin><AdminOrgs /></Guard>} />
              <Route path="/admin/subscriptions" element={<Guard admin><AdminOrgs subscriptions /></Guard>} />
              <Route path="/admin/orgs/:id" element={<Guard admin><AdminOrg /></Guard>} />
              <Route path="/admin/orgs/:id/white-label" element={<Guard admin><WhiteLabelStudio /></Guard>} />
              <Route path="/admin/catalog" element={<Guard admin><AdminCatalog /></Guard>} />
              <Route path="/admin/modules" element={<Guard admin><AdminCatalog modulesFirst /></Guard>} />
              <Route path="/admin/vehicles" element={<Guard admin><AdminTables kind="vehicles" /></Guard>} />
              <Route path="/admin/users" element={<Guard admin><AdminTables kind="users" /></Guard>} />
              <Route path="/admin/audit" element={<Guard admin><AdminTables kind="audit" /></Guard>} />
              <Route path="/admin/confidence" element={<Guard admin><AdminConfidence /></Guard>} />
              <Route path="/admin/pilots" element={<Guard admin><AdminPilots /></Guard>} />
              <Route path="/admin/:section" element={<Guard admin><AdminPlatform /></Guard>} />

              <Route path="/v/:id" element={<Guard><VehicleLayout /></Guard>}>
                <Route index element={<Overview />} />
                <Route path="confidence" element={<ConfidencePage />} />
                <Route path="timeline" element={<Timeline />} />
                <Route path="documents" element={<Documents />} />
                <Route path="assistant" element={<Assistant />} />
                <Route path="passport" element={<Passport />} />
                <Route path="resale" element={<Resale />} />
                <Route path="data-room" element={<DataRoomPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AppRoutes />
    </SessionProvider>
  );
}
