import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Common/Layout';

// Resilient Code Splitting that handles deployments without reload loops
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T } | any>
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error: any) {
      // First attempt a brief 300ms retry (handles brief network glitch)
      try {
        await new Promise(r => setTimeout(r, 300));
        return await componentImport();
      } catch (retryError: any) {
        if (!import.meta.env.DEV) {
          const lastReload = Number(sessionStorage.getItem('ges_last_chunk_reload') || 0);
          if (Date.now() - lastReload > 10000) {
            sessionStorage.setItem('ges_last_chunk_reload', String(Date.now()));
            window.location.reload();
            return new Promise<{ default: T }>(() => {});
          }
        }
        throw retryError;
      }
    }
  });
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  locationKey?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class RouteErrorBoundaryClass extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('RouteErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Automatically reset error state whenever user navigates to another section!
    if (prevProps.locationKey !== this.props.locationKey && this.state.hasError) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-emerald-100">
            ⚡
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Section Updated</h2>
          <p className="text-sm text-slate-500 max-w-md">
            This module has updated with the latest version. Click below to reload and view latest updates.
          </p>
          <button
            onClick={this.handleRetry}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold rounded-xl text-sm shadow-md transition cursor-pointer"
          >
            Refresh View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <RouteErrorBoundaryClass locationKey={location.pathname} key={location.pathname}>
      {children}
    </RouteErrorBoundaryClass>
  );
};

const Login = lazyWithRetry(() => import('./views/Login').then(m => ({ default: m.Login })));
const Dashboard = lazyWithRetry(() => import('./views/SuperAdmin/Dashboard').then(m => ({ default: m.Dashboard })));
const Leads = lazyWithRetry(() => import('./views/Admin/Leads').then(m => ({ default: m.Leads })));
const Visits = lazyWithRetry(() => import('./views/FieldEmployee/Visits').then(m => ({ default: m.Visits })));
const Employees = lazyWithRetry(() => import('./views/Admin/Employees').then(m => ({ default: m.Employees })));
const Settings = lazyWithRetry(() => import('./views/SuperAdmin/Settings').then(m => ({ default: m.Settings })));
const ProfileView = lazyWithRetry(() => import('./views/FieldEmployee/Profile').then(m => ({ default: m.ProfileView })));
const Products = lazyWithRetry(() => import('./views/Admin/Products').then(m => ({ default: m.Products })));
const Challans = lazyWithRetry(() => import('./views/Admin/Challans').then(m => ({ default: m.Challans })));
const B2BBusinesses = lazyWithRetry(() => import('./views/Admin/B2BBusinesses').then(m => ({ default: m.B2BBusinesses })));
const ShadowAnalysisContainer = lazyWithRetry(() => import('./components/ShadowAnalysis').then(m => ({ default: m.ShadowAnalysisContainer })));
const DcrDocument = lazyWithRetry(() => import('./views/Admin/DcrDocument').then(m => ({ default: m.DcrDocument })));
const WcrDocument = lazyWithRetry(() => import('./views/Admin/WcrDocument').then(m => ({ default: m.WcrDocument })));
const ModelAgreementDocument = lazyWithRetry(() => import('./views/Admin/ModelAgreementDocument').then(m => ({ default: m.ModelAgreementDocument })));
const CfaAgreementDocument = lazyWithRetry(() => import('./views/Admin/CfaAgreementDocument').then(m => ({ default: m.CfaAgreementDocument })));
const QuotationDocument = lazyWithRetry(() => import('./views/Admin/QuotationDocument').then(m => ({ default: m.QuotationDocument })));
const Complaints = lazyWithRetry(() => import('./views/Admin/Complaints').then(m => ({ default: m.Complaints })));
const InventoryPanel = lazyWithRetry(() => import('./views/InventoryManager/InventoryPanel').then(m => ({ default: m.InventoryPanel })));
const LeaveApplication = lazyWithRetry(() => import('./views/Leave/LeaveApplication').then(m => ({ default: m.LeaveApplication })));
const LeaveRequests = lazyWithRetry(() => import('./views/SuperAdmin/LeaveRequests').then(m => ({ default: m.LeaveRequests })));
const ExpenseTracker = lazyWithRetry(() => import('./views/Admin/ExpenseTracker').then(m => ({ default: m.ExpenseTracker })));
const Expenses = lazyWithRetry(() => import('./views/SuperAdmin/Expenses').then(m => ({ default: m.Expenses })));

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
  }, []);

  // ONLY sync with MongoDB and preload route chunks AFTER the user is authenticated!
  // This keeps the Login screen 100% lightweight and instant on mobile 4G.
  useEffect(() => {
    if (!isAuthenticated) return;

    // Defer cloud sync until 2 seconds after authenticated dashboard mounts
    const syncTimer = setTimeout(() => {
      import('./services/firebase').then(({ syncAllLocalDataToFirestore, initializeRealtimeFirestoreSync }) => {
        initializeRealtimeFirestoreSync();
        syncAllLocalDataToFirestore();
      }).catch(err => console.warn('Background sync init note:', err));
    }, 2000);

    // Preload primary routes on idle so mobile bandwidth is never congested
    const preloadTimer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          import('./views/Admin/Leads').catch(() => {});
          import('./views/Admin/Challans').catch(() => {});
          import('./views/Admin/Products').catch(() => {});
        });
      } else {
        import('./views/Admin/Leads').catch(() => {});
      }
    }, 3500);

    return () => {
      clearTimeout(syncTimer);
      clearTimeout(preloadTimer);
    };
  }, [isAuthenticated]);

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
        <RouteErrorBoundary>
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
        </RouteErrorBoundary>
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
        <RouteErrorBoundary>
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
        </RouteErrorBoundary>
      </Layout>
    </BrowserRouter>
  );
};

export default App;
