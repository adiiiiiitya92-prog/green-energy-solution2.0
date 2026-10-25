import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import {
  getPushStatus,
  enablePush,
  disablePush,
  syncPushOwner,
  sendTestPush,
  type PushStatus
} from '../../services/pushService';

const HINTS: Record<PushStatus, string> = {
  enabled: 'Notifications ON for this device (click to turn off)',
  disabled: 'Turn on notifications for this device',
  denied: 'Notifications are blocked. Allow them from the browser site settings (🔒 icon in the address bar), then reload.',
  'ios-needs-install': 'On iPhone, tap Share → "Add to Home Screen", open the app from the Home Screen, then turn on notifications.',
  unsupported: 'This browser does not support push notifications.'
};

export const NotificationToggle: React.FC = () => {
  const { currentUser, originalUser } = useAuthStore();
  // Impersonation must not hijack the super admin's device subscription
  const realUser = originalUser || currentUser;
  const navigate = useNavigate();
  const [status, setStatus] = useState<PushStatus>('disabled');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus('unsupported'));
  }, []);

  useEffect(() => {
    if (realUser?.id) syncPushOwner(realUser).catch(() => {});
  }, [realUser?.id]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'PUSH_NAVIGATE' && e.data.url) {
        const u = new URL(e.data.url);
        navigate(u.pathname + u.search);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.startMessages?.();
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  const handleClick = async () => {
    if (!realUser || busy) return;
    if (status === 'denied' || status === 'ios-needs-install' || status === 'unsupported') {
      alert(HINTS[status]);
      return;
    }
    setBusy(true);
    try {
      if (status === 'enabled') {
        if (!confirm('Turn off notifications on this device?')) return;
        await disablePush();
        setStatus('disabled');
      } else {
        const next = await enablePush(realUser);
        setStatus(next);
        if (next === 'enabled') {
          const sent = await sendTestPush(realUser.id).catch(() => 0);
          if (!sent) alert('Notifications enabled, but the test alert could not be delivered. Please check that the backend server has been restarted.');
        } else if (next === 'denied') {
          alert(HINTS.denied);
        }
      }
    } catch (err: any) {
      console.warn('Push toggle failed:', err);
      alert(`Could not change notification setting: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  };

  if (!realUser) return null;

  const Icon = busy ? Loader2 : status === 'enabled' ? BellRing : status === 'disabled' ? Bell : BellOff;
  const tone =
    status === 'enabled'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
      : status === 'disabled'
        ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
        : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100';

  return (
    <button
      type="button"
      onClick={handleClick}
      title={HINTS[status]}
      aria-label={HINTS[status]}
      className={`relative p-1.5 rounded-lg border transition-colors cursor-pointer ${tone}`}
    >
      <Icon className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
      {status === 'disabled' && !busy && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500" />
      )}
    </button>
  );
};
