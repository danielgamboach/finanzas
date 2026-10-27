// Categorize uncategorized transactions with Claude.
// Called by a database trigger (pg_net) when a voucher arrives without a category,
// and by the app to sweep the "Por revisar" list.
// It only ever touches transactions that are still uncategorized and were never checked,
// so calling it with arbitrary ids can't change existing data or burn credits twice.
// Subcategories: categories can have one level of children ("Salidas > Bares"). The model answers with
// "Padre > Hijo" when it can tell, or just the parent.
// One question per merchant: movements of the same merchant (catalog merchant, or the same merchant_key)
// share one answer, inside a batch and later on: a new movement reuses the answer an earlier one got.
// When the name looks like a known catalog merchant ("AMPM ASAMBLEA" ~ "ampm"), the same call asks
// whether it is that merchant and leaves suggested_merchant_id for the person to confirm.
// It also says whether a charge looks like a digital subscription (an app, software, streaming, an online
// service); those are flagged with sub_ask_flag so the app asks the person "¿Es una suscripción?".
// Mode "refine" (internal only, needs x-notify-secret) re-reads the history of one parent and moves
// movements into its subcategories when the model is confident.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SPACE_DAILY_CAP = 300; // movements per space per day, whoever asks
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5';
const THRESHOLD = 0.75;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Tx { id: string; space_id: string; kind: string; raw_merchant: string | null; merchant: string | null; amount: number; currency: string; occurred_at: string; source: string; merchant_id?: string | null; merchant_key?: string | null }
interface Known { id: string; name: string }
interface Answer { i: number; category: string | null; confidence: number; name?: string; es?: string | null; es_confianza?: number; suscripcion?: boolean }
interface Prior { suggested_category_id: string | null; category_id: string | null; category_source: string | null; ai_confidence: number | null; suggested_merchant_id: string | null }
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

async function askClaude(cats: Cat[], examples: string[], items: Tx[], known: Known[][]) {
  const expense = catList(cats, 'expense');
  const income = catList(cats, 'income');
  const list = items.map((t, i) => ({
    i,
    comercio: t.raw_merchant || t.merchant,
    monto: `${t.currency} ${t.amount}`,
    tipo: t.kind === 'income' ? 'ingreso' : 'gasto',
    ...(known[i]?.length ? { conocidos: known[i].map((k) => k.name) } : {}),
  }));
  const system =
    'Clasificás movimientos de tarjetas y cuentas bancarias de un hogar en Costa Rica. ' +
    'Los nombres vienen del voucher del banco, en mayúsculas y a veces cortados. ' +
    'Usá solo las categorías dadas, con el nombre exacto. Si no estás seguro, bajá la confianza; no inventes categorías. ' +
    'Algunas categorías tienen subcategorías: si sabés cuál aplica respondé "Categoría > Subcategoría" (ej. "Salidas > Bares"); si no, respondé solo la categoría. ' +
    'Algunos movimientos traen "conocidos": comercios ya registrados con nombre parecido. Si el movimiento es claramente una sucursal o variante de uno de ellos, ponelo en "es" con el nombre exacto; si no, null. ' +
    'En "suscripcion" decí true solo si el gasto parece un cobro digital que suele ser un plan recurrente (una app, software, streaming, almacenamiento, una membresía en línea); para comercios físicos, comida, transporte o compras sueltas, false. ' +
    'Respondé únicamente con JSON válido, sin texto extra.';
  const user =
    `Categorías de gasto: ${expense}\nCategorías de ingreso: ${income || 'ninguna'}\n\n` +
    (examples.length ? `Así ha categorizado este hogar antes (comercio → categoría):\n${examples.join('\n')}\n\n` : '') +
    `Movimientos a clasificar:\n${JSON.stringify(list)}\n\n` +
    'Devolvé un arreglo JSON con un objeto por movimiento: ' +
    '{"i": número, "category": "nombre exacto (o Categoría > Subcategoría) o null", "confidence": número de 0 a 1, "name": "nombre legible del comercio, corto, con mayúsculas normales y tildes", "es": "nombre exacto de un conocido o null", "es_confianza": número de 0 a 1, "suscripcion": true o false}';
  return (await callClaude(system, user)) as Answer[];
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

/** Movements of the same merchant share one answer. */
function groupOf(t: Tx) {
  return t.merchant_id ? `m:${t.merchant_id}` : t.merchant_key ? `k:${t.merchant_key}` : `t:${t.id}`;
}

/** The answer an earlier movement of the same merchant got in this space, if any. */
async function priorAnswer(spaceId: string, t: Tx): Promise<Prior | null> {
  const same = t.merchant_id ? `merchant_id=eq.${t.merchant_id}` : t.merchant_key ? `merchant_key=eq.${encodeURIComponent(t.merchant_key)}` : null;
  if (!same) return null;
  const rows: Prior[] = await rest(
    `transactions?select=suggested_category_id,category_id,category_source,ai_confidence,suggested_merchant_id&space_id=eq.${spaceId}&id=neq.${t.id}&${same}&ai_checked_at=not.is.null&or=(suggested_category_id.not.is.null,category_source.eq.ai)&order=ai_checked_at.desc&limit=1`,
  );
  return rows[0] || null;
}

/** Catalog merchants with a similar name, for the "es" question. */
async function candidates(text: string | null): Promise<Known[]> {
  if (!text) return [];
  try {
    const rows: Known[] = await rest('rpc/merchant_candidates', { method: 'POST', body: JSON.stringify({ p_text: text, p_limit: 4 }) });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  } catch {
    return [];
  }
}

async function apply(t: Tx, cat: Cat | undefined, conf: number, name: string | null, sameAs: string | null) {
  const patch: Record<string, unknown> = { ai_checked_at: new Date().toISOString(), ai_confidence: Math.round(conf * 100) / 100 };
  if (cat && conf >= THRESHOLD) Object.assign(patch, { category_id: cat.id, status: 'posted', category_source: 'ai', suggested_category_id: null });
  else if (cat) patch.suggested_category_id = cat.id;
  // Apple charges are named from Apple's receipt (ingest_apple_receipt), never by the model
  if (name && t.raw_merchant && (t.source === 'email' || t.source === 'import') && !/^APPLE\.COM/i.test(t.raw_merchant)) patch.merchant = name.slice(0, 80);
  if (sameAs && !t.merchant_id) patch.suggested_merchant_id = sameAs;
  await rest(`transactions?id=eq.${t.id}&category_id=is.null`, { method: 'PATCH', body: JSON.stringify(patch) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json().catch(() => ({}));
    // internal callers (database trigger, cron) send the shared secret; the app sends the user's session
    const [sec]: { value: string }[] = await rest('app_secrets?select=value&key=eq.notify_secret');
    const internal = !!sec && req.headers.get('x-notify-secret') === sec.value;
    if (body.mode === 'refine') {
      if (!internal) return reply({ ok: false, reason: 'unauthorized' }, 401);
      if (!ANTHROPIC_API_KEY) return reply({ ok: false, reason: 'ANTHROPIC_API_KEY not configured' });
      if (!UUID.test(String(body.parent_id))) return reply({ ok: false, reason: 'parent_id' }, 400);
      const r = await refine(String(body.parent_id), Math.min(Number(body.limit) || 40, 60), Number(body.offset) || 0, !!body.dry);
      return reply({ ok: true, ...r });
    }
    let ids: string[] = (Array.isArray(body.tx_ids) ? body.tx_ids : []).filter((x: unknown) => typeof x === 'string' && UUID.test(x)).slice(0, 50);
    if (!ids.length) return reply({ ok: true, processed: 0 });
    if (!ANTHROPIC_API_KEY) return reply({ ok: false, reason: 'ANTHROPIC_API_KEY not configured' });

    if (!internal) {
      // only movements the caller can see, read with their own session (row level security decides)
      const auth = req.headers.get('Authorization') || '';
      const user = { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' };
      const seen = await fetch(`${SUPABASE_URL}/rest/v1/transactions?select=id&id=in.(${ids.join(',')})`, { headers: user });
      if (!seen.ok) return reply({ ok: false, reason: 'unauthorized' }, 401);
      ids = ((await seen.json()) as { id: string }[]).map((x) => x.id);
      if (!ids.length) return reply({ ok: true, processed: 0 });
      const quota = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, { method: 'POST', headers: user, body: JSON.stringify({ p_kind: 'categorize', p_limit: 30 }) });
      if (!quota.ok || (await quota.json()) !== true) return reply({ ok: false, reason: 'quota' });
    }

    const txs: Tx[] = await rest(
      `transactions?select=id,space_id,kind,raw_merchant,merchant,amount,currency,occurred_at,source,merchant_id,merchant_key&id=in.(${ids.join(',')})&category_id=is.null&ai_checked_at=is.null&kind=in.(expense,income,refund)`,
    );
    if (!txs.length) return reply({ ok: true, processed: 0 });

    const bySpace = new Map<string, Tx[]>();
    txs.forEach((t) => bySpace.set(t.space_id, [...(bySpace.get(t.space_id) || []), t]));
    const results: unknown[] = [];

    for (const [spaceId, items] of bySpace) {
      // a hard ceiling per space, so even a flood of new movements can't run up the bill
      const since = new Date(Date.now() - 86400000).toISOString();
      const recent: unknown[] = await rest(`transactions?select=id&space_id=eq.${spaceId}&ai_checked_at=gte.${encodeURIComponent(since)}&limit=${SPACE_DAILY_CAP}`);
      if (recent.length >= SPACE_DAILY_CAP) continue;
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

      // one question per merchant: group the batch, and reuse what an earlier movement of the same merchant got
      const groups = new Map<string, Tx[]>();
      for (const t of items) {
        const g = groupOf(t);
        groups.set(g, [...(groups.get(g) || []), t]);
      }
      const ask: Tx[] = [];
      const known: Known[][] = [];
      for (const members of groups.values()) {
        const rep = members[0];
        const prior = await priorAnswer(spaceId, rep);
        if (prior) {
          const cat = cats.find((c) => c.id === (prior.suggested_category_id || (prior.category_source === 'ai' ? prior.category_id : null)));
          const conf = Number(prior.ai_confidence) || 0;
          for (const t of members) {
            await apply(t, cat, conf, null, prior.suggested_merchant_id); // the clean name is per branch: not reused
            results.push({ id: t.id, reused: true, category: cat ? label(cats, cat) : null, confidence: conf, applied: Boolean(cat && conf >= THRESHOLD) });
          }
          continue;
        }
        ask.push(rep);
        known.push(rep.merchant_id ? [] : await candidates(rep.raw_merchant || rep.merchant));
      }
      if (!ask.length) continue;

      const answers = await askClaude(cats, examples, ask, known);
      for (const [i, rep] of ask.entries()) {
        const a = answers.find((x) => x.i === i);
        const wantKind = rep.kind === 'income' ? 'income' : 'expense';
        const cat = findCat(cats, a?.category, wantKind);
        const conf = Math.max(0, Math.min(1, Number(a?.confidence) || 0));
        const same = a?.es && Number(a.es_confianza) >= 0.8 ? known[i].find((k) => norm(k.name) === norm(String(a.es))) : undefined;
        for (const t of groups.get(groupOf(rep)) || [rep]) {
          await apply(t, cat, conf, t.id === rep.id ? a?.name || null : null, same?.id || null);
          // looks like a digital plan: the app asks whether it is one (the database decides if it still can)
          if (a?.suscripcion === true && t.kind === 'expense') {
            await rest('rpc/sub_ask_flag', { method: 'POST', body: JSON.stringify({ p_tx: t.id }) }).catch(() => undefined);
          }
          results.push({ id: t.id, answer: a?.category ?? null, category: cat ? label(cats, cat) : null, confidence: conf, applied: Boolean(cat && conf >= THRESHOLD), same_as: same?.name || null });
        }
      }
    }
    return reply({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
