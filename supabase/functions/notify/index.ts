// Sends Web Push notifications.
// - Internal calls (database triggers / cron) carry x-notify-secret and target every member of a space
//   who has that kind of notification turned on.
// - The app can call it with the user's token and kind "test" to send a test to that user's devices.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const APP_URL = 'https://finanzas-alpha-three.vercel.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

let secrets: Record<string, string> | null = null;
async function getSecrets() {
  if (!secrets) {
    const rows: { key: string; value: string }[] = await rest('app_secrets?select=key,value');
    secrets = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    webpush.setVapidDetails(APP_URL, secrets.vapid_public, secrets.vapid_private);
  }
  return secrets;
}

interface Sub { id: string; endpoint: string; p256dh: string; auth: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const s = await getSecrets();
    const body = await req.json().catch(() => ({}));
    let userIds: string[] = [];
    let payload: { title: string; body: string; url: string; tag?: string };

    if (req.headers.get('x-notify-secret') === s.notify_secret) {
      const kind = String(body.kind || '');
      const col = kind === 'card' ? 'notify_card' : 'notify_limits';
      const members: { user_id: string }[] = await rest(`space_members?select=user_id&space_id=eq.${body.space_id}`);
      if (!members.length) return reply({ ok: true, sent: 0 });
      const ids = members.map((m) => m.user_id).join(',');
      const profs: { id: string }[] = await rest(`profiles?select=id&id=in.(${ids})&${col}=is.true`);
      userIds = profs.map((p) => p.id);
      payload = { title: String(body.title || ''), body: String(body.body || ''), url: String(body.url || '/#/'), tag: kind };
    } else {
      // test notification for the signed-in user
      const auth = req.headers.get('Authorization') || '';
      const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: auth } });
      if (!u.ok) return reply({ ok: false, reason: 'unauthorized' }, 401);
      const user = await u.json();
      userIds = [user.id];
      payload = { title: '🔔 Notificaciones activadas', body: 'Así te vamos a avisar de límites y del pago de la tarjeta.', url: '/#/', tag: 'test' };
    }
    if (!userIds.length || !payload.title) return reply({ ok: true, sent: 0 });

    const subs: Sub[] = await rest(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=in.(${userIds.join(',')})`);
    let sent = 0, removed = 0;
    const errors: string[] = [];
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 86400 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await rest(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' });
            removed++;
          } else errors.push(`${code ?? ''} ${String((e as Error).message || e).slice(0, 160)}`);
        }
      }),
    );
    return reply({ ok: true, sent, removed, devices: subs.length, errors });
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
