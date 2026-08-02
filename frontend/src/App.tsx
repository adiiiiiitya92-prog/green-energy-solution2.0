import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Layout } from './components/Common/Layout';
import { Login } from './views/Login';
import { Dashboard } from './views/SuperAdmin/Dashboard';
import { Leads } from './views/Admin/Leads';
import { Visits } from './views/FieldEmployee/Visits';
import { Employees } from './views/Admin/Employees';
import { Settings } from './views/SuperAdmin/Settings';
import { ProfileView } from './views/FieldEmployee/Profile';
import { Products } from './views/Admin/Products';
import { Challans } from './views/Admin/Challans';
import { ShadowAnalysisContainer } from './components/ShadowAnalysis';
import { DcrDocument } from './views/Admin/DcrDocument';
import { WcrDocument } from './views/Admin/WcrDocument';
import { ModelAgreementDocument } from './views/Admin/ModelAgreementDocument';
import { QuotationDocument } from './views/Admin/QuotationDocument';

import { InventoryPanel } from './views/InventoryManager/InventoryPanel';

import { syncAllLocalDataToFirestore, initializeRealtimeFirestoreSync } from './services/firebase';

export const App: React.FC = () => {
  const { currentRole, initAuth, isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    initAuth();
    initializeRealtimeFirestoreSync();
    syncAllLocalDataToFirestore();

    // Auto-purge legacy PWA Service Worker caches that lock old JS bundles
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
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
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Routing checks based on mock persona
  const isEmployee = currentRole === 'field_employee';
  const isInventoryManager = currentRole === 'inventory_manager';

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Inventory Manager Dedicated Panel & Routes */}
          {isInventoryManager ? (
            <>
              <Route path="/inventory-panel" element={<InventoryPanel />} />
              <Route path="/products" element={<Products />} />
              <Route path="/challans" element={<Challans />} />
              <Route path="*" element={<Navigate to="/inventory-panel" replace />} />
            </>
          ) : !isEmployee ? (
            /* Admin / Super Admin Routes */
            <>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory-panel" element={<InventoryPanel />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/shadow-analysis" element={<ShadowAnalysisContainer />} />
              <Route path="/products" element={<Products />} />
              <Route path="/employees" element={<Employees />} />
              <Route path="/challans" element={<Challans />} />
              <Route path="/dcr-document" element={<DcrDocument />} />
              <Route path="/wcr-document" element={<WcrDocument />} />
              <Route path="/model-agreement" element={<ModelAgreementDocument />} />
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
              <Route path="/leads" element={<Leads />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/visits/new" element={<VisitsNewAutoOpen />} />
              <Route path="/shadow-analysis" element={<ShadowAnalysisContainer />} />
              <Route path="/profile" element={<ProfileView />} />
              
              <Route path="*" element={<Navigate to="/leads" replace />} />
            </>
          )}
        </Routes>
      </Layout>
    </BrowserRouter>
  );
};

// Sub-wrapper component to render visits with Log Visit form pre-opened
const VisitsNewAutoOpen: React.FC = () => {
  // We can render Visits and trigger form show via state, 
  // but to keep it simple, we can inject a small effect into Visits component itself
  // or query selector. Let's make sure Visits handles a URL search parameter or just state.
  // In Visits, we can check if window.location.pathname.endsWith('/new') and default showLogForm!
  // Wait, that's already supported because we handle location.pathname!
  return <Visits />;
};

export default App;
