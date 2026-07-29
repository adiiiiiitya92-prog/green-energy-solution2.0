import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, Wifi, WifiOff, X, CheckCircle2 } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [showOfflineToast, setShowOfflineToast] = useState<boolean>(false);

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r?: ServiceWorkerRegistration) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error: any) {
      console.warn('SW registration error', error);
    },
  });

  useEffect(() => {
    // Listen for beforeinstallprompt event for PWA installation
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Online / Offline listeners
    const handleOnline = () => {
      setIsOffline(false);
      setShowOfflineToast(true);
      setTimeout(() => setShowOfflineToast(false), 4000);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowOfflineToast(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full px-4 sm:px-0">
      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="bg-emerald-900 text-white p-4 rounded-xl shadow-2xl border border-emerald-700 flex items-center justify-between space-x-3 animate-slide-up">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-700 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <p className="text-xs font-bold text-emerald-100 uppercase tracking-wide">Green Energy App</p>
              <p className="text-xs text-emerald-300">Install for offline & quick access</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleInstallClick}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Install
            </button>
            <button
              onClick={() => setShowInstallBanner(false)}
              className="text-emerald-300 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* SW Update Ready Prompt */}
      {needRefresh && (
        <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 flex items-center justify-between space-x-3">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            <div>
              <p className="text-xs font-bold">New App Version Ready</p>
              <p className="text-[11px] text-slate-400">Click update to load latest features</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => updateServiceWorker(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Update
            </button>
            <button
              onClick={() => setNeedRefresh(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline Ready Notification */}
      {offlineReady && (
        <div className="bg-emerald-800 text-white p-3 rounded-xl shadow-xl border border-emerald-600 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-300" />
            <span className="text-xs font-medium">App ready to work offline</span>
          </div>
          <button onClick={() => setOfflineReady(false)} className="text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Network Status Toast */}
      {showOfflineToast && (
        <div
          className={`p-3 rounded-xl shadow-xl border flex items-center space-x-2 text-xs font-semibold ${
            isOffline
              ? 'bg-amber-900/90 text-amber-100 border-amber-700'
              : 'bg-emerald-900/90 text-emerald-100 border-emerald-700'
          }`}
        >
          {isOffline ? (
            <>
              <WifiOff className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Offline Mode active. All changes saved locally.</span>
            </>
          ) : (
            <>
              <Wifi className="w-4 h-4 text-emerald-300 shrink-0" />
              <span>Network restored. Syncing database...</span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
