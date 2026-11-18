// Korb – Mitteilungen per Web Push. Auf dem iPhone nur in der Home-Bildschirm-App (iOS 16.4+).
import { VAPID_PUBLIC_KEY } from './config.js';
import * as store from './store.js';

export const supported = () => Boolean(VAPID_PUBLIC_KEY) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function isEnabled() {
  if (!supported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  return Boolean(await reg.pushManager.getSubscription());
}

// Muss direkt aus einem Tipp heraus aufgerufen werden (iOS verlangt eine Nutzeraktion).
export async function enable() {
  if (!supported()) throw new Error('Mitteilungen gehen nur in der App auf dem Home-Bildschirm.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Mitteilungen sind aus. Einschalten: iPhone-Einstellungen → Mitteilungen → Korb.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  await store.backend().savePushSubscription({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth,
    member_id: store.me(), household_id: store.state.session.household_id,
  });
  store.updateMe({ push_enabled: true });
}

export async function disable() {
  if (!supported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await store.backend().deletePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  if (store.state.session) store.updateMe({ push_enabled: false });
}

// „Anna geht einkaufen“ an die anderen im Haushalt
export function notifyShopping(info) {
  if (!navigator.onLine || !store.backend()) return;
  store.invoke('notify', { type: 'shopping', ...info }).catch(() => {});
}
