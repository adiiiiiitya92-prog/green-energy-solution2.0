import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Common/Layout';

// Route-level Code Splitting for Ultra-Fast Initial Load
const Login = lazy(() => import('./views/Login').then(m => ({ default: m.Login })));
const Dashboard = lazy(() => import('./views/SuperAdmin/Dashboard').then(m => ({ default: m.Dashboard })));
const Leads = lazy(() => import('./views/Admin/Leads').then(m => ({ default: m.Leads })));
const Visits = lazy(() => import('./views/FieldEmployee/Visits').then(m => ({ default: m.Visits })));
const Employees = lazy(() => import('./views/Admin/Employees').then(m => ({ default: m.Employees })));
const Settings = lazy(() => import('./views/SuperAdmin/Settings').then(m => ({ default: m.Settings })));
const ProfileView = lazy(() => import('./views/FieldEmployee/Profile').then(m => ({ default: m.ProfileView })));
const Products = lazy(() => import('./views/Admin/Products').then(m => ({ default: m.Products })));
const Challans = lazy(() => import('./views/Admin/Challans').then(m => ({ default: m.Challans })));
const B2BBusinesses = lazy(() => import('./views/Admin/B2BBusinesses').then(m => ({ default: m.B2BBusinesses })));
const ShadowAnalysisContainer = lazy(() => import('./components/ShadowAnalysis').then(m => ({ default: m.ShadowAnalysisContainer })));
const DcrDocument = lazy(() => import('./views/Admin/DcrDocument').then(m => ({ default: m.DcrDocument })));
const WcrDocument = lazy(() => import('./views/Admin/WcrDocument').then(m => ({ default: m.WcrDocument })));
const ModelAgreementDocument = lazy(() => import('./views/Admin/ModelAgreementDocument').then(m => ({ default: m.ModelAgreementDocument })));
const CfaAgreementDocument = lazy(() => import('./views/Admin/CfaAgreementDocument').then(m => ({ default: m.CfaAgreementDocument })));
const QuotationDocument = lazy(() => import('./views/Admin/QuotationDocument').then(m => ({ default: m.QuotationDocument })));
const Complaints = lazy(() => import('./views/Admin/Complaints').then(m => ({ default: m.Complaints })));
const InventoryPanel = lazy(() => import('./views/InventoryManager/InventoryPanel').then(m => ({ default: m.InventoryPanel })));
const LeaveApplication = lazy(() => import('./views/Leave/LeaveApplication').then(m => ({ default: m.LeaveApplication })));
const LeaveRequests = lazy(() => import('./views/SuperAdmin/LeaveRequests').then(m => ({ default: m.LeaveRequests })));
const ExpenseTracker = lazy(() => import('./views/Admin/ExpenseTracker').then(m => ({ default: m.ExpenseTracker })));
const Expenses = lazy(() => import('./views/SuperAdmin/Expenses').then(m => ({ default: m.Expenses })));

const PageLoader: React.FC = () => (
  <div className="min-h-[50vh] flex flex-col justify-center items-center py-16 text-slate-400">
    <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></div>
    <span className="text-xs font-medium tracking-wide">Loading module...</span>
  </div>
);

// Sub-wrapper component to render visits with Log Visit form pre-opened
const VisitsNewAutoOpen: React.FC = () => {
  return <Visits />;
};

export const App: React.FC = () => {
  const { currentRole, initAuth, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    initAuth();

    // Auto-purge legacy PWA Service Worker caches that lock old JS bundles
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }

    // Defer heavy cloud sync and listeners until after initial render so UI is instant
    const syncTimer = setTimeout(() => {
      import('./services/firebase').then(({ syncAllLocalDataToFirestore, initializeRealtimeFirestoreSync }) => {
        initializeRealtimeFirestoreSync();
        syncAllLocalDataToFirestore();
      }).catch(err => console.warn('Background sync init note:', err));
    }, 1500);

    return () => clearTimeout(syncTimer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-slate-50 text-slate-500 font-semibold text-xs space-y-3">
        <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="animate-pulse">Loading SolarCRM Database Environment...</p>
      </div>
    );
  }

  // If not authenticated, force login screen
  if (!isAuthenticated) {
    return (
      <BrowserRouter>
        <Suspense fallback={
          <div className="min-h-screen flex flex-col justify-center items-center bg-slate-900 text-slate-400">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-2"></div>
            <span className="text-xs">Loading Green Energy Solution...</span>
          </div>
        }>
          <Routes>
            <Route path="*" element={<Login />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  }

  // Routing checks based on mock persona
  const isEmployee = currentRole === 'field_employee';
  const isInventoryManager = currentRole === 'inventory_manager';
  const isDealer = currentRole === 'dealer';

  return (
    <BrowserRouter>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Dealer Dedicated Panel & Routes */}
            {isDealer ? (
              <>
                <Route path="/leads" element={<Leads />} />
                <Route path="/leave-application" element={<LeaveApplication />} />
                <Route path="/expense-tracker" element={<ExpenseTracker />} />
                <Route path="/complaints" element={<Complaints />} />
                <Route path="/visits" element={<Visits />} />
                <Route path="/profile" element={<ProfileView />} />
                <Route path="*" element={<Navigate to="/leads" replace />} />
              </>
            ) : isInventoryManager ? (
              <>
                <Route path="/inventory-panel" element={<InventoryPanel />} />
                <Route path="/leave-application" element={<LeaveApplication />} />
                <Route path="/expense-tracker" element={<ExpenseTracker />} />
                <Route path="/complaints" element={<Complaints />} />
                <Route path="/products" element={<Products />} />
                <Route path="/challans" element={<Challans />} />
                <Route path="/b2b-businesses" element={<B2BBusinesses />} />
                <Route path="*" element={<Navigate to="/inventory-panel" replace />} />
              </>
            ) : !isEmployee ? (
              /* Admin / Super Admin Routes */
              <>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/inventory-panel" element={<InventoryPanel />} />
                <Route path="/leave-application" element={<LeaveApplication />} />
                <Route path="/leave-requests" element={<LeaveRequests />} />
                <Route path="/hrms/leave-requests" element={<LeaveRequests />} />
                <Route path="/expense-tracker" element={<ExpenseTracker />} />
                <Route path="/expenses" element={currentRole === 'super_admin' ? <Expenses /> : <ExpenseTracker />} />
                <Route path="/complaints" element={<Complaints />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/visits" element={<Visits />} />
                <Route path="/shadow-analysis" element={<ShadowAnalysisContainer />} />
                <Route path="/products" element={<Products />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/challans" element={<Challans />} />
                <Route path="/b2b-businesses" element={<B2BBusinesses />} />
                <Route path="/dcr-document" element={<DcrDocument />} />
                <Route path="/wcr-document" element={<WcrDocument />} />
                <Route path="/model-agreement" element={<ModelAgreementDocument />} />
                <Route path="/cfa-agreement" element={<CfaAgreementDocument />} />
                <Route path="/quotation-document" element={<QuotationDocument />} />
                
                {currentRole === 'super_admin' ? (
                  <Route path="/settings" element={<Settings />} />
                ) : (
                  <Route path="/settings" element={<Navigate to="/dashboard" replace />} />
                )}
                
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </>
            ) : (
              // Field Employee routes
              <>
                <Route path="/complaints" element={<Complaints />} />
                <Route path="/leave-application" element={<LeaveApplication />} />
                <Route path="/expense-tracker" element={<ExpenseTracker />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/visits" element={<Visits />} />
                <Route path="/visits/new" element={<VisitsNewAutoOpen />} />
                <Route path="/shadow-analysis" element={<ShadowAnalysisContainer />} />
                <Route path="/profile" element={<ProfileView />} />
                
                <Route path="*" element={<Navigate to="/leads" replace />} />
              </>
            )}
          </Routes>
        </Suspense>
      </Layout>
    </BrowserRouter>
  );
};

export default App;
