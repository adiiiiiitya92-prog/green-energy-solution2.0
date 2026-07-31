import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoImg from '../../assets/Green-Energy-Solution.png';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import {
  LayoutDashboard,
  Users,
  Compass,
  FileText,
  MapPin,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Truck,
  LogOut,
  Sun,
  Package
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { currentRole, currentUser, originalUser, stopImpersonating, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  const handleLogout = async () => {
    if (confirm('Are you sure you want to sign out?')) {
      await logout();
      navigate('/');
    }
  };

  const isEmployee = currentRole === 'field_employee';

  // Desktop sidebar options
  const sidebarItems = [
    {
      name: 'Dashboard',
      path: '/dashboard',
      roles: ['super_admin', 'admin'],
      icon: LayoutDashboard
    },
    {
      name: 'Lead Pipeline',
      path: '/leads',
      roles: ['super_admin', 'admin'],
      icon: Compass
    },
    {
      name: 'Inventory & Challan Panel',
      path: '/inventory-panel',
      roles: ['inventory_manager'],
      icon: Package
    },
    {
      name: 'Product Catalog',
      path: '/products',
      roles: ['super_admin', 'admin', 'inventory_manager'],
      icon: FileText
    },
    {
      name: 'Delivery Challans',
      path: '/challans',
      roles: ['super_admin', 'admin', 'inventory_manager'],
      icon: Truck
    },
    {
      name: 'Field Visit Reports',
      path: '/visits',
      roles: ['super_admin', 'admin'],
      icon: MapPin
    },
    {
      name: 'Shadow Analysis',
      path: '/shadow-analysis',
      roles: ['super_admin', 'admin'],
      icon: Sun
    },
    {
      name: 'Employee Panel',
      path: '/employees',
      roles: ['super_admin', 'admin'],
      icon: Users
    },
    {
      name: 'System Settings',
      path: '/settings',
      roles: ['super_admin'],
      icon: Settings
    }
  ];

  // Mobile bottom navigation options (Field Employee)
  const mobileNavItems = [
    {
      name: 'My Leads',
      path: '/leads',
      icon: Compass
    },
    {
      name: 'Log Visit',
      path: '/visits/new',
      icon: MapPin
    },
    {
      name: 'My Visits',
      path: '/visits',
      icon: FileText
    },
    {
      name: 'Profile',
      path: '/profile',
      icon: Users
    }
  ];

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-800 overflow-hidden">
      {/* Impersonation Warning Banner */}
      {originalUser && (
        <div className="bg-amber-500 text-white font-black text-xs px-4 py-2 flex items-center justify-between shadow-sm select-none shrink-0 z-50 animate-fade-in">
          <div className="flex items-center space-x-2">
            <span className="text-sm">⚠️</span>
            <span>Impersonating Account: <strong>{currentUser?.fullName}</strong> ({currentRole.replace('_', ' ')})</span>
          </div>
          <button
            onClick={async () => {
              await stopImpersonating();
              navigate('/employees');
            }}
            className="bg-white/20 hover:bg-white/30 text-white font-extrabold px-3 py-1 rounded-md transition-colors cursor-pointer text-[10px] uppercase border border-white/40"
          >
            Exit Impersonation
          </button>
        </div>
      )}
      {/* Main Header Bar */}
      <header className="sticky top-0 z-50 bg-white text-slate-800 border-b border-slate-200/80 px-4 py-2.5 flex justify-between items-center shadow-xs select-none">
        <div className="flex items-center space-x-2">
          {!isEmployee && (
            <>
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 hover:bg-slate-100 rounded-lg md:hidden text-slate-600 transition-colors cursor-pointer"
                title="Open Navigation"
              >
                <Menu className="w-5 h-5" />
              </button>

              {/* Desktop sidebar collapse toggle */}
              <button
                onClick={() => setIsNavCollapsed(!isNavCollapsed)}
                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-lg hidden md:inline-block transition-colors cursor-pointer"
                title={isNavCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                <ChevronLeft className={`w-5 h-5 transition-transform duration-300 ${isNavCollapsed ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
          <Link to="/" className="flex items-center">
            <img
              src={logoImg}
              alt="Green Energy Solution"
              className="h-10 sm:h-12 w-auto object-contain cursor-pointer transition-all"
            />
          </Link>
        </div>

        <div className="flex items-center space-x-3">
          {currentUser && (
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
              <div className="w-5.5 h-5.5 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                {currentUser.fullName[0]}
              </div>
              <span className="text-xs font-bold text-slate-700 hidden sm:inline-block">
                {currentUser.fullName}
              </span>
              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded uppercase">
                {currentRole.replace('_', ' ')}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            type="button"
            className="text-[10px] bg-slate-50 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 text-slate-600 font-bold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center space-x-1"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline-block">Sign Out</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation - Desktop only (Super Admin + Admin) */}
        {!isEmployee && (
          <aside className={`bg-white border-r border-slate-200 hidden md:flex flex-col justify-between shrink-0 transition-all duration-300 ${
            isNavCollapsed ? 'w-16' : 'w-64'
          }`}>
            <div className={`space-y-6 ${isNavCollapsed ? 'p-2' : 'p-4'}`}>
              {/* Navigation Menu */}
              <nav className="space-y-1">
                {sidebarItems
                  .filter(item => item.roles.includes(currentRole))
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        className={`flex items-center rounded-lg text-xs font-bold transition-all ${
                          isNavCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2.5'
                        } ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-l-4 border-emerald-600'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title={isNavCollapsed ? item.name : undefined}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-600' : ''}`} />
                          {!isNavCollapsed && <span>{item.name}</span>}
                        </div>
                        {!isNavCollapsed && (
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'translate-x-0.5' : 'opacity-0'}`} />
                        )}
                      </Link>
                    );
                  })}
              </nav>
            </div>

            <div className={`border-t border-slate-100 ${isNavCollapsed ? 'p-2' : 'p-4'}`}>
              {!isNavCollapsed && (
                <div className="text-[10px] text-slate-400 text-center font-medium">
                  v1.0.0 (Offline Native)
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-6 pb-20 md:pb-8 transition-all">
          <div className="w-full space-y-6">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Tab Navigation - Mobile / Field Employee */}
      {isEmployee && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 py-1.5 flex justify-around md:hidden shadow-lg select-none">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg transition-colors ${
                  isActive ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <Icon className="w-5.5 h-5.5" />
                <span className="text-[9px] font-bold mt-1 uppercase tracking-tight">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Mobile drawer sidebar - only for Admin / Super Admin */}
      {!isEmployee && mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden bg-slate-900/40 backdrop-blur-xs">
          <div className="w-64 bg-white h-full flex flex-col justify-between p-4 shadow-2xl">
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <img
                    src={logoImg}
                    alt="Green Energy Solution"
                    className="h-9 w-auto object-contain"
                  />
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Navigation Menu */}
              <nav className="space-y-1">
                {sidebarItems
                  .filter(item => item.roles.includes(currentRole))
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <Link
                        key={item.name}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 border-l-4 border-emerald-600'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : ''}`} />
                          <span>{item.name}</span>
                        </div>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isActive ? 'translate-x-0.5' : 'opacity-0'}`} />
                      </Link>
                    );
                  })}
              </nav>
            </div>

            <div className="p-4 border-t border-slate-100 space-y-3">
              <button
                onClick={handleLogout}
                className="w-full bg-slate-50 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 text-slate-650 text-[10px] font-bold py-2 px-3 rounded-lg flex items-center justify-center space-x-2 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
              <div className="text-[10px] text-slate-400 text-center font-medium">
                v1.0.0 (Offline Native PWA)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PWA Installation Banner & Offline Status Toast */}
      <PWAInstallPrompt />
    </div>
  );
};
