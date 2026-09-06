import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserProtocols } from './components/UserProtocols';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import DevicesPage from './pages/DevicesPage';
import MediaPage from './pages/MediaPage';
import SchedulesPage from './pages/SchedulesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import UsersPage from './pages/UsersPage';

import { ROLE_POWER, type UserRole } from './types';
import CompaniesPage from './pages/CompaniesPage';
import CirclesPage from './pages/CirclesPage';
import SubcentersPage from './pages/SubcentersPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-void">
        <div className="w-16 h-16 border-4 border-cyan border-t-transparent rounded-full shadow-[0_0_20px_rgba(0,240,255,0.15)] animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleRoute({ children, minRole }: { children: React.ReactNode, minRole: UserRole }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-void">
        <div className="w-16 h-16 border-4 border-cyan border-t-transparent rounded-full shadow-[0_0_20px_rgba(0,240,255,0.15)] animate-spin" />
      </div>
    );
  }
  
  const userPower = user ? ROLE_POWER[user.role] : 0;
  const requiredPower = ROLE_POWER[minRole];
  
  if (!user || userPower < requiredPower) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="schedules" element={<SchedulesPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        
        {/* Command Center Routes */}
        <Route
          path="companies"
          element={
            <RoleRoute minRole="CENTRAL_ADMIN">
              <CompaniesPage />
            </RoleRoute>
          }
        />
        <Route
          path="circles"
          element={
            <RoleRoute minRole="COMPANY_ADMIN">
              <CirclesPage />
            </RoleRoute>
          }
        />
        <Route
          path="subcenters"
          element={
            <RoleRoute minRole="CIRCLE_ADMIN">
              <SubcentersPage />
            </RoleRoute>
          }
        />
        <Route
          path="users"
          element={
            <RoleRoute minRole="SUBCENTER_ADMIN">
              <UsersPage />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <UserProtocols />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
