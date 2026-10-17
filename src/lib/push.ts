import { db } from './api';

export type PushSupport = 'ok' | 'ios-install' | 'unsupported';

const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-install'; // iPhone only allows push from the installed app
  return capable ? 'ok' : 'unsupported';
}

export const permission = (): NotificationPermission | 'unsupported' => ('Notification' in window ? Notification.permission : 'unsupported');

function keyBytes(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function saveSubscription() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await db.rpc<string>('vapid_public_key');
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await db.upsert('push_subscriptions', { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, 'endpoint');
}

/** Asks for permission (must run from a tap) and registers this device. */
export async function enablePush(): Promise<NotificationPermission> {
  const p = await Notification.requestPermission();
  if (p === 'granted') await saveSubscription();
  return p;
}

/** On start: if permission was already given, make sure this device is registered. */
export async function refreshPush() {
  try {
    if (pushSupport() === 'ok' && Notification.permission === 'granted') await saveSubscription();
  } catch {
    /* ignore: offline or browser without push */
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await db.remove('push_subscriptions', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
}

export const sendTestPush = () => db.fn<{ ok: boolean; sent?: number; devices?: number }>('notify', { kind: 'test' });

const DISMISS_KEY = 'finanzas.push.prompt-dismissed';
export function promptDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
export function dismissPrompt() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
