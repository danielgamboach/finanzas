// Categorize uncategorized transactions with Claude.
// Called by a database trigger (pg_net) when a voucher arrives without a category,
// and by the app to sweep the "Por revisar" list.
// It only ever touches transactions that are still uncategorized and were never checked,
// so calling it with arbitrary ids can't change existing data or burn credits twice.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5';
const THRESHOLD = 0.75;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Tx { id: string; space_id: string; kind: string; raw_merchant: string | null; merchant: string | null; amount: number; currency: string; occurred_at: string; source: string }
interface Cat { id: string; name: string; emoji: string; kind: string }

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// "📺 Suscripciones", "suscripciones", "Suscripciones." all match the same category
function norm(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function key(m: string | null) {
  return (m || '').toUpperCase().replace(/HTTPS?:\/\/\S*/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
}

async function askClaude(cats: Cat[], examples: string[], items: Tx[]) {
  const expense = cats.filter((c) => c.kind === 'expense').map((c) => c.name).join(', ');
  const income = cats.filter((c) => c.kind === 'income').map((c) => c.name).join(', ');
  const list = items.map((t, i) => ({
    i,
    comercio: t.raw_merchant || t.merchant,
    monto: `${t.currency} ${t.amount}`,
    tipo: t.kind === 'income' ? 'ingreso' : 'gasto',
  }));
  const system =
    'Clasificás movimientos de tarjetas y cuentas bancarias de un hogar en Costa Rica. ' +
    'Los nombres vienen del voucher del banco, en mayúsculas y a veces cortados. ' +
    'Usá solo las categorías dadas, con el nombre exacto. Si no estás seguro, bajá la confianza; no inventes categorías. ' +
    'Respondé únicamente con JSON válido, sin texto extra.';
  const user =
    `Categorías de gasto: ${expense}\nCategorías de ingreso: ${income || 'ninguna'}\n\n` +
    (examples.length ? `Así ha categorizado este hogar antes (comercio → categoría):\n${examples.join('\n')}\n\n` : '') +
    `Movimientos a clasificar:\n${JSON.stringify(list)}\n\n` +
    'Devolvé un arreglo JSON con un objeto por movimiento: ' +
    '{"i": número, "category": "nombre exacto o null", "confidence": número de 0 a 1, "name": "nombre legible del comercio, corto, con mayúsculas normales y tildes"}';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data)}`);
  const text: string = (data.content || []).map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : '')).join('');
  const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
  return JSON.parse(json) as { i: number; category: string | null; confidence: number; name?: string }[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = (Array.isArray(body.tx_ids) ? body.tx_ids : []).filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 50);
    if (!ids.length) return reply({ ok: true, processed: 0 });
    if (!ANTHROPIC_API_KEY) return reply({ ok: false, reason: 'ANTHROPIC_API_KEY not configured' });

    const txs: Tx[] = await rest(
      `transactions?select=id,space_id,kind,raw_merchant,merchant,amount,currency,occurred_at,source&id=in.(${ids.join(',')})&category_id=is.null&ai_checked_at=is.null&kind=in.(expense,income,refund)`,
    );
    if (!txs.length) return reply({ ok: true, processed: 0 });

    const bySpace = new Map<string, Tx[]>();
    txs.forEach((t) => bySpace.set(t.space_id, [...(bySpace.get(t.space_id) || []), t]));
    const results: unknown[] = [];

    for (const [spaceId, items] of bySpace) {
      const cats: Cat[] = await rest(`categories?select=id,name,emoji,kind&space_id=eq.${spaceId}&archived=is.false`);
      const history: { raw_merchant: string | null; merchant: string | null; category_id: string }[] = await rest(
        `transactions?select=raw_merchant,merchant,category_id&space_id=eq.${spaceId}&status=eq.posted&category_id=not.is.null&order=occurred_at.desc&limit=400`,
      );
      const seen = new Set<string>();
      const examples: string[] = [];
      for (const h of history) {
        const k = key(h.raw_merchant || h.merchant);
        const c = cats.find((x) => x.id === h.category_id);
        if (!k || !c || seen.has(k)) continue;
        seen.add(k);
        examples.push(`${h.raw_merchant || h.merchant} → ${c.name}`);
        if (examples.length >= 60) break;
      }

      const answers = await askClaude(cats, examples, items);
      for (const t of items) {
        const a = answers.find((x) => x.i === items.indexOf(t));
        const wantKind = t.kind === 'income' ? 'income' : 'expense';
        const cat = a?.category ? cats.find((c) => c.kind === wantKind && norm(c.name) === norm(a.category!)) : undefined;
        const conf = Math.max(0, Math.min(1, Number(a?.confidence) || 0));
        const patch: Record<string, unknown> = { ai_checked_at: new Date().toISOString(), ai_confidence: Math.round(conf * 100) / 100 };
        if (cat && conf >= THRESHOLD) Object.assign(patch, { category_id: cat.id, status: 'posted', category_source: 'ai', suggested_category_id: null });
        else if (cat) patch.suggested_category_id = cat.id;
        if (a?.name && t.raw_merchant && t.source === 'email') patch.merchant = a.name.slice(0, 80);
        await rest(`transactions?id=eq.${t.id}&category_id=is.null`, { method: 'PATCH', body: JSON.stringify(patch) });
        results.push({ id: t.id, answer: a?.category ?? null, category: cat?.name || null, confidence: conf, applied: Boolean(cat && conf >= THRESHOLD) });
      }
    }
    return reply({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
