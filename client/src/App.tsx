import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import AdminLogin from './pages/AdminLogin';
import AdminSignup from './pages/AdminSignup';
import EmployeeLogin from './pages/EmployeeLogin';
import Onboarding from './pages/Onboarding/Onboarding';
import MatrixView from './pages/MatrixView';
import DashboardView from './pages/DashboardView';
import MyShifts from './pages/MyShifts';
import { useAuth } from './hooks/useAuth';

function Loading() {
  return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading...</div>;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { data, isLoading } = useAuth();
  if (isLoading) return <Loading />;
  if (!data || data.actorType !== 'admin') return <Navigate to="/admin/login" replace />;
  if ((data.workspace.onboardingStep ?? 3) < 3) return <Navigate to="/onboarding" replace />;
  return children;
}

function RequireOnboardingAdmin({ children }: { children: JSX.Element }) {
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
