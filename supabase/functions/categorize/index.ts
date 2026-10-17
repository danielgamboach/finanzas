// Categorize uncategorized transactions with Claude.
// Called by a database trigger (pg_net) when a voucher arrives without a category,
// and by the app to sweep the "Por revisar" list.
// It only ever touches transactions that are still uncategorized and were never checked,
// so calling it with arbitrary ids can't change existing data or burn credits twice.
// Subcategories: categories can have one level of children ("Salidas > Bares"). The model answers with
// "Padre > Hijo" when it can tell, or just the parent.
// Mode "refine" (internal only, needs x-notify-secret) re-reads the history of one parent and moves
// movements into its subcategories when the model is confident.
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
interface Cat { id: string; name: string; emoji: string; kind: string; parent_id: string | null }

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

/** "Salidas > Bares" for subcategories, the plain name otherwise. */
function label(cats: Cat[], c: Cat) {
  const p = c.parent_id ? cats.find((x) => x.id === c.parent_id) : null;
  return p ? `${p.name} > ${c.name}` : c.name;
}

/** Category list for the prompt: "Salidas (subcategorías: Restaurantes, Bares)". */
function catList(cats: Cat[], kind: string) {
  return cats
    .filter((c) => c.kind === kind && !c.parent_id)
    .map((c) => {
      const kids = cats.filter((k) => k.parent_id === c.id).map((k) => k.name);
      return kids.length ? `${c.name} (subcategorías: ${kids.join(', ')})` : c.name;
    })
    .join('; ');
}

/** Finds the category for an answer like "Salidas > Bares", "Bares" or "Salidas". */
function findCat(cats: Cat[], answer: string | null | undefined, kind: string) {
  if (!answer) return undefined;
  const pool = cats.filter((c) => c.kind === kind);
  const a = norm(answer.replace(/[>›/]/g, ' '));
  const full = pool.find((c) => norm(label(cats, c).replace(/[>›/]/g, ' ')) === a);
  if (full) return full;
  const byName = pool.filter((c) => norm(c.name) === a);
  if (byName.length === 1) return byName[0];
  return byName.find((c) => !c.parent_id);
}

async function callClaude(system: string, user: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data)}`);
  const text: string = (data.content || []).map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
}

async function askClaude(cats: Cat[], examples: string[], items: Tx[]) {
  const expense = catList(cats, 'expense');
  const income = catList(cats, 'income');
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
    'Algunas categorías tienen subcategorías: si sabés cuál aplica respondé "Categoría > Subcategoría" (ej. "Salidas > Bares"); si no, respondé solo la categoría. ' +
    'Respondé únicamente con JSON válido, sin texto extra.';
  const user =
    `Categorías de gasto: ${expense}\nCategorías de ingreso: ${income || 'ninguna'}\n\n` +
    (examples.length ? `Así ha categorizado este hogar antes (comercio → categoría):\n${examples.join('\n')}\n\n` : '') +
    `Movimientos a clasificar:\n${JSON.stringify(list)}\n\n` +
    'Devolvé un arreglo JSON con un objeto por movimiento: ' +
    '{"i": número, "category": "nombre exacto (o Categoría > Subcategoría) o null", "confidence": número de 0 a 1, "name": "nombre legible del comercio, corto, con mayúsculas normales y tildes"}';
  return (await callClaude(system, user)) as { i: number; category: string | null; confidence: number; name?: string }[];
}

/** Moves movements of a parent category (or its subcategories) into the right subcategory. */
async function refine(parentId: string, limit: number, offset: number, dry: boolean) {
  const [parent]: Cat[] = await rest(`categories?select=id,name,emoji,kind,parent_id,space_id&id=eq.${parentId}`);
  if (!parent || parent.parent_id) throw new Error('not a parent category');
  const kids: Cat[] = await rest(`categories?select=id,name,emoji,kind,parent_id&parent_id=eq.${parentId}&archived=is.false`);
  if (!kids.length) return { processed: 0, moved: 0, results: [] };
  const fam = [parentId, ...kids.map((k) => k.id)];
  const txs: (Tx & { category_id: string; note: string | null })[] = await rest(
    `transactions?select=id,space_id,kind,raw_merchant,merchant,amount,currency,occurred_at,source,category_id,note&category_id=in.(${fam.join(',')})&kind=eq.expense&order=occurred_at.desc&limit=${limit}&offset=${offset}`,
  );
  if (!txs.length) return { processed: 0, moved: 0, results: [] };
  const list = txs.map((t, i) => ({
    i,
    comercio: t.merchant && t.raw_merchant && t.merchant !== t.raw_merchant ? `${t.merchant} (${t.raw_merchant})` : t.merchant || t.raw_merchant,
    monto: `${t.currency} ${t.amount}`,
    hora_cr: new Date(new Date(t.occurred_at).getTime() - 6 * 3600000).toISOString().slice(11, 16),
    nota: t.note || undefined,
  }));
  const system =
    'Clasificás gastos de un hogar en Costa Rica dentro de una categoría que ya está decidida. ' +
    'Tu trabajo es elegir la subcategoría correcta, o "ninguna" si no se puede saber con lo que hay. ' +
    'Conocés comercios de Costa Rica (restaurantes, bares, cafeterías, cines, teatros, ticketeras). ' +
    'Respondé únicamente con JSON válido, sin texto extra.';
  const user =
    `Categoría: ${parent.name}\nSubcategorías: ${kids.map((k) => k.name).join(', ')}\n\n` +
    `Movimientos:\n${JSON.stringify(list)}\n\n` +
    'Devolvé un arreglo JSON con un objeto por movimiento: {"i": número, "sub": "nombre exacto de la subcategoría o ninguna", "confidence": número de 0 a 1}. ' +
    'Usá confianza alta solo si el comercio es claramente de ese tipo.';
  const answers = (await callClaude(system, user)) as { i: number; sub: string; confidence: number }[];
  const results: unknown[] = [];
  let moved = 0;
  for (const [i, t] of txs.entries()) {
    const a = answers.find((x) => x.i === i);
    const kid = a?.sub ? kids.find((k) => norm(k.name) === norm(a.sub)) : undefined;
    const conf = Math.max(0, Math.min(1, Number(a?.confidence) || 0));
    // from the parent: move when fairly sure; between siblings: only when very sure
    const need = t.category_id === parentId ? THRESHOLD : 0.9;
    const move = kid && kid.id !== t.category_id && conf >= need;
    if (move && !dry) {
      await rest(`transactions?id=eq.${t.id}&category_id=eq.${t.category_id}`, { method: 'PATCH', body: JSON.stringify({ category_id: kid!.id }), headers: { Prefer: 'return=minimal' } });
    }
    if (move) moved++;
    results.push({ m: t.merchant, from: t.category_id === parentId ? parent.name : kids.find((k) => k.id === t.category_id)?.name, to: kid?.name || null, conf, move: Boolean(move) });
  }
  return { processed: txs.length, moved, results };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.mode === 'refine') {
      const [sec]: { value: string }[] = await rest('app_secrets?select=value&key=eq.notify_secret');
      if (!sec || req.headers.get('x-notify-secret') !== sec.value) return reply({ ok: false, reason: 'unauthorized' }, 401);
      if (!ANTHROPIC_API_KEY) return reply({ ok: false, reason: 'ANTHROPIC_API_KEY not configured' });
      if (!UUID.test(String(body.parent_id))) return reply({ ok: false, reason: 'parent_id' }, 400);
      const r = await refine(String(body.parent_id), Math.min(Number(body.limit) || 40, 60), Number(body.offset) || 0, !!body.dry);
      return reply({ ok: true, ...r });
    }
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
      const cats: Cat[] = await rest(`categories?select=id,name,emoji,kind,parent_id&space_id=eq.${spaceId}&archived=is.false`);
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
        examples.push(`${h.raw_merchant || h.merchant} → ${label(cats, c)}`);
        if (examples.length >= 60) break;
      }

      const answers = await askClaude(cats, examples, items);
      for (const t of items) {
        const a = answers.find((x) => x.i === items.indexOf(t));
        const wantKind = t.kind === 'income' ? 'income' : 'expense';
        const cat = findCat(cats, a?.category, wantKind);
        const conf = Math.max(0, Math.min(1, Number(a?.confidence) || 0));
        const patch: Record<string, unknown> = { ai_checked_at: new Date().toISOString(), ai_confidence: Math.round(conf * 100) / 100 };
        if (cat && conf >= THRESHOLD) Object.assign(patch, { category_id: cat.id, status: 'posted', category_source: 'ai', suggested_category_id: null });
        else if (cat) patch.suggested_category_id = cat.id;
        if (a?.name && t.raw_merchant && (t.source === 'email' || t.source === 'import')) patch.merchant = a.name.slice(0, 80);
        await rest(`transactions?id=eq.${t.id}&category_id=is.null`, { method: 'PATCH', body: JSON.stringify(patch) });
        results.push({ id: t.id, answer: a?.category ?? null, category: cat ? label(cats, cat) : null, confidence: conf, applied: Boolean(cat && conf >= THRESHOLD) });
      }
    }
    return reply({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
