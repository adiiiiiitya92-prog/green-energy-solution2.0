import { buildApiUrl } from './firebase';
import type { Profile } from '../types';

const SW_URL = '/push/sw.js';
const SW_SCOPE = '/push/';

export type PushStatus = 'unsupported' | 'ios-needs-install' | 'denied' | 'enabled' | 'disabled';

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export const isPushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const platform = () => {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (isIos()) return 'ios';
  return 'desktop';
};

const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

// getRegistration() falls back to the "/" PWA worker when /push/ isn't registered yet, so match the scope exactly.
const getRegistration = async () => {
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  return reg && new URL(reg.scope).pathname === SW_SCOPE ? reg : undefined;
};

// navigator.serviceWorker.ready tracks the worker for the page's own scope ("/"), not /push/, so wait on this registration directly.
const waitForActive = (reg: ServiceWorkerRegistration) =>
  new Promise<void>((resolve) => {
    if (reg.active) return resolve();
    const worker = reg.installing || reg.waiting;
    if (!worker) return resolve();
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  });

async function getSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

async function sendToServer(sub: PushSubscription, user: Profile) {
  const res = await fetch(buildApiUrl('/api/push/subscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      userId: user.id,
      userRole: user.role,
      userName: user.fullName,
      platform: platform()
    })
  });
  if (!res.ok) throw new Error(`Subscribe failed (${res.status})`);
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'disabled';
  return (await getSubscription()) ? 'enabled' : 'disabled';
}

export async function enablePush(user: Profile): Promise<PushStatus> {
  if (!isPushSupported()) return getPushStatus();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return getPushStatus();

  const reg = (await getRegistration()) || (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }));
  await waitForActive(reg);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyRes = await fetch(buildApiUrl('/api/push/public-key'));
    if (!keyRes.ok) throw new Error('Could not load push key from server');
    const { publicKey } = await keyRes.json();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await sendToServer(sub, user);
  return 'enabled';
}

export async function disablePush(): Promise<void> {
  const sub = await getSubscription();
  if (!sub) return;
  await fetch(buildApiUrl('/api/push/unsubscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// Re-binds an already-enabled device to whoever is logged in now (device may have switched users).
export async function syncPushOwner(user: Profile): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  const sub = await getSubscription();
  if (sub) await sendToServer(sub, user).catch(() => {});
}

// Stops server-side delivery for this device after logout but keeps the browser permission,
// so the next login on this device re-links automatically.
export async function detachPushOnLogout(): Promise<void> {
  const sub = await getSubscription().catch(() => null);
  if (!sub) return;
  await fetch(buildApiUrl('/api/push/unsubscribe'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).catch(() => {});
}

export async function sendTestPush(userId: string): Promise<number> {
  const res = await fetch(buildApiUrl('/api/push/test'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  const data = await res.json().catch(() => ({}));
  return data.sent || 0;
}
