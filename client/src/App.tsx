import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import AdminLogin from './pages/AdminLogin';
import AdminSignup from './pages/AdminSignup';
import EmployeeLogin from './pages/EmployeeLogin';
import Onboarding from './pages/Onboarding/Onboarding';
import SetPassword from './pages/SetPassword';
import MatrixView from './pages/MatrixView';
import DashboardView from './pages/DashboardView';
import PayrollReview from './pages/PayrollReview';
import MyShifts from './pages/MyShifts';
import { useAuth } from './hooks/useAuth';

function Loading() {
  return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'admin') return <Navigate to="/admin/login" replace />;
  if (data.admin?.mustChangePassword) return <Navigate to="/admin/set-password" replace />;
  if ((data.workspace.onboardingStep ?? 3) < 3) return <Navigate to="/onboarding" replace />;
  return children;
}

function RequireAdminRole({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'admin') return <Navigate to="/admin/login" replace />;
  if (data.admin?.mustChangePassword) return <Navigate to="/admin/set-password" replace />;
  if ((data.workspace.onboardingStep ?? 3) < 3) return <Navigate to="/onboarding" replace />;
  if (data.admin?.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireOnboardingAdmin({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'admin') return <Navigate to="/admin/login" replace />;
  return children;
}

// No onboarding/mustChangePassword checks — this is exactly the screen
// mustChangePassword redirects to, so adding that check here would loop.
function RequireAuthenticatedAdmin({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'admin') return <Navigate to="/admin/login" replace />;
  return children;
}

function RequireEmployee({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'employee') return <Navigate to="/employee/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/signup" element={<AdminSignup />} />
      <Route path="/employee/login" element={<EmployeeLogin />} />
      <Route
        path="/admin/set-password"
        element={
          <RequireAuthenticatedAdmin>
            <SetPassword />
          </RequireAuthenticatedAdmin>
        }
      />
      <Route
        path="/onboarding"
        element={
          <RequireOnboardingAdmin>
            <Onboarding />
          </RequireOnboardingAdmin>
        }
      />
      <Route
        path="/matrix"
        element={
          <RequireAdmin>
            <MatrixView />
          </RequireAdmin>
        }
      />
      <Route
        path="/dashboard"
        element={
          <RequireAdmin>
            <DashboardView />
          </RequireAdmin>
        }
      />
      <Route
        path="/payroll"
        element={
          <RequireAdminRole>
            <PayrollReview />
          </RequireAdminRole>
        }
      />
      <Route
        path="/my-shifts"
        element={
          <RequireEmployee>
            <MyShifts />
          </RequireEmployee>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
