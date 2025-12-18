
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ConfigProvider } from './context/ConfigContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Catalog } from './pages/Catalog';
import { Cart } from './pages/Cart';
import { Orders } from './pages/Orders';
import { Documents } from './pages/Documents';
import { Login } from './pages/Login';
import { QuickOrder } from './pages/QuickOrder';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { Clients } from './pages/admin/Clients';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminConfig } from './pages/admin/AdminConfig';
import { AdminNews } from './pages/admin/AdminNews';
import { AdminAudit } from './pages/admin/AdminAudit';
import { ClientTeam } from './pages/client/ClientTeam';
import { UserRole } from './types';

const queryClient = new QueryClient();

// Generic Guard
const ProtectedRoute = ({ children }: React.PropsWithChildren) => {
  const { user, isLoading } = useAuth();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// Role Guard
const RoleRoute = ({ children, allowedRoles }: React.PropsWithChildren<{ allowedRoles: UserRole[] }>) => {
  const { user, isLoading } = useAuth();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, hasRole } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={
          hasRole([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]) 
            ? <Navigate to="/admin/dashboard" replace /> 
            : <Navigate to="/dashboard" replace />
        } />

        {/* --- COMMON ROUTES --- */}
        <Route path="dashboard" element={hasRole([UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]) ? <AdminDashboard /> : <Dashboard />} />
        <Route path="admin/dashboard" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]}><AdminDashboard /></RoleRoute>} />
        
        {/* --- CATALOG & DOCUMENTS (ALL ROLES) --- */}
        <Route path="catalog" element={<RoleRoute allowedRoles={[UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]}><Catalog /></RoleRoute>} />
        <Route path="documents" element={<RoleRoute allowedRoles={[UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER, UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]}><Documents /></RoleRoute>} />
        
        {/* --- CLIENT SPECIFIC ROUTES --- */}
        <Route path="cart" element={<RoleRoute allowedRoles={[UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER]}><Cart /></RoleRoute>} />
        <Route path="team" element={<RoleRoute allowedRoles={[UserRole.CLIENT_ADMIN]}><ClientTeam /></RoleRoute>} />
        <Route path="quick-order" element={<RoleRoute allowedRoles={[UserRole.CLIENT_ADMIN]}><QuickOrder /></RoleRoute>} />

        {/* --- INTERNAL ADMIN ROUTES --- */}
        <Route path="admin/clients" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}><Clients /></RoleRoute>} />
        <Route path="admin/users" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}><AdminUsers /></RoleRoute>} />
        <Route path="admin/config" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}><AdminConfig /></RoleRoute>} />
        <Route path="admin/news" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}><AdminNews /></RoleRoute>} />
        <Route path="admin/audit" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN]}><AdminAudit /></RoleRoute>} />
        
        {/* Orders is shared but view logic differs inside */}
        <Route path="orders" element={<Orders />} />
        <Route path="admin/orders" element={<RoleRoute allowedRoles={[UserRole.SYSTEM_ADMIN, UserRole.PARTIAL_ADMIN]}><Orders /></RoleRoute>} />
      
      </Route>
    </Routes>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ConfigProvider>
            <NotificationProvider>
              <CartProvider>
                <BrowserRouter>
                    <AppRoutes />
                    <Toaster
                      position="top-right"
                      toastOptions={{
                        duration: 4000,
                        style: {
                          background: '#363636',
                          color: '#fff',
                        },
                        success: {
                          duration: 3000,
                          style: {
                            background: '#10b981',
                          },
                        },
                        error: {
                          duration: 5000,
                          style: {
                            background: '#ef4444',
                          },
                        },
                      }}
                    />
                  </BrowserRouter>
              </CartProvider>
            </NotificationProvider>
          </ConfigProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
