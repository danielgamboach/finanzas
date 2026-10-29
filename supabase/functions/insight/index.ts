// Home screen message: a short, concrete, slightly funny read of how the space is doing.
// Requires a logged-in user (verify_jwt). All reads use the caller's token, so row level
// security decides what it can see; it never reads data the user couldn't see in the app.
// The app caches the answer per space and only asks again when the data changes.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-5-5';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CR = 6 * 3600 * 1000; // Costa Rica is UTC-6 all year

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Tx { kind: string; amount_crc: number; category_id: string | null; merchant: string | null; occurred_at: string; status: string }
interface Cat { id: string; name: string; emoji: string; kind: string; limit_amount: number | null; limit_period: string | null; is_fixed: boolean; parent_id?: string | null }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const crIso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) + CR).toISOString();
const crc = (n: number) => '¢' + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const spend = (t: Tx) => (t.kind === 'expense' ? Number(t.amount_crc) : t.kind === 'refund' ? -Number(t.amount_crc) : 0);
const sum = (txs: Tx[]) => txs.reduce((a, t) => a + spend(t), 0);
const within = (t: Tx, from: string, to: string) => t.occurred_at >= from && t.occurred_at < to;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

function facts(space: { name: string; kind: string; week_start: number }, names: string[], cats: Cat[], txs: Tx[]) {
  const nowIso = new Date().toISOString();
  const l = new Date(Date.now() - CR);
  const y = l.getUTCFullYear(), m = l.getUTCMonth(), d = l.getUTCDate(), dow = l.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthFrom = crIso(y, m, 1), monthTo = crIso(y, m + 1, 1);
  const prevMonthFrom = crIso(y, m - 1, 1);
  const prevMonthSameDay = crIso(y, m - 1, Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate()) + 1);
  const back = (dow - space.week_start + 7) % 7;
  const weekFrom = crIso(y, m, d - back), weekTo = crIso(y, m, d - back + 7);
  const prevWeekFrom = crIso(y, m, d - back - 7);
  const prevWeekSameDay = new Date(Date.now() - 7 * 86400000).toISOString(); // this exact moment, one week ago
  const daysLeftWeek = 7 - back - 1;
  // History may start mid-month (e.g. right after importing), so only compare against periods we actually have data for.
  const oldest = txs.reduce((o, t) => (t.occurred_at < o ? t.occurred_at : o), nowIso);
  const hasPrevMonth = oldest < crIso(y, m - 1, 3);
  const hasPrevWeek = oldest < crIso(y, m, d - back - 6);
  const NO_DATA = 'sin datos para comparar';

  const exp = cats.filter((c) => c.kind === 'expense');
  const tops = exp.filter((c) => !c.parent_id); // budgets live on parents; subcategories roll up
  const root = (id: string | null) => exp.find((x) => x.id === id)?.parent_id || id;
  const month = txs.filter((t) => within(t, monthFrom, monthTo));
  const week = txs.filter((t) => within(t, weekFrom, weekTo));
  const catName = (id: string | null) => {
    const c = exp.find((x) => x.id === id);
    const p = c?.parent_id ? exp.find((x) => x.id === c.parent_id) : null;
    return c ? (p ? `${p.emoji} ${p.name} › ${c.name}` : `${c.emoji} ${c.name}`) : 'Sin categoría';
  };

  const perCat = tops
    .map((c) => {
      const mine = (t: Tx) => root(t.category_id) === c.id;
      const mTx = month.filter(mine);
      const wTx = week.filter(mine);
      const kids = exp.filter((k) => k.parent_id === c.id);
      const detalle = kids.length
        ? [...kids.map((k) => [`${k.emoji} ${k.name}`, sum(mTx.filter((t) => t.category_id === k.id))] as const), ['sin detalle', sum(mTx.filter((t) => t.category_id === c.id))] as const]
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}: ${crc(v)}`)
        : undefined;
      const weekly = c.limit_period === 'weekly';
      const spent = weekly ? sum(wTx) : sum(mTx);
      const limit = c.limit_amount == null ? null : Number(c.limit_amount);
      const p = limit ? pct(spent, limit) : null;
      const prevMonth = sum(txs.filter((t) => mine(t) && within(t, prevMonthFrom, prevMonthSameDay)));
      return {
        categoria: `${c.emoji} ${c.name}`,
        fijo: c.is_fixed,
        mes: crc(sum(mTx)),
        detalle_del_mes: detalle?.length ? detalle : undefined,
        mes_num: sum(mTx),
        compras_mes: mTx.filter((t) => t.kind === 'expense').length,
        semana: crc(sum(wTx)),
        compras_semana: wTx.filter((t) => t.kind === 'expense').length,
        mes_pasado_misma_altura: hasPrevMonth ? crc(prevMonth) : NO_DATA,
        limite: limit ? `${crc(limit)} ${weekly ? 'por semana' : 'por mes'}` : null,
        usado_del_limite: p !== null ? `${p}%` : null,
        estado: p === null ? 'sin límite' : c.is_fixed ? (p >= 100 ? 'pagado' : 'pendiente') : p >= 100 ? 'PASADO' : p >= 80 ? 'cerca del límite' : 'bien',
        falta_para_limite: limit && spent < limit ? crc(limit - spent) : null,
        pasado_por: limit && spent > limit ? crc(spent - limit) : null,
      };
    })
    .filter((c) => c.mes_num > 0 || c.limite)
    .sort((a, b) => b.mes_num - a.mes_num)
    .map(({ mes_num: _, ...c }) => c);

  const monthSpent = sum(month);
  const budget = tops.reduce((a, c) => a + (c.limit_amount ? (c.limit_period === 'weekly' ? Number(c.limit_amount) * 4.33 : Number(c.limit_amount)) : 0), 0);
  const fixedIds = new Set(tops.filter((c) => c.is_fixed).map((c) => c.id));
  const variable = sum(month.filter((t) => !fixedIds.has(root(t.category_id) || '')));
  const projection = monthSpent - variable + (variable / Math.max(d, 1)) * daysInMonth;
  const biggest = [...week].filter((t) => t.kind === 'expense').sort((a, b) => b.amount_crc - a.amount_crc)[0];
  const merchants = new Map<string, number>();
  week.filter((t) => t.kind === 'expense' && t.merchant).forEach((t) => merchants.set(t.merchant!, (merchants.get(t.merchant!) || 0) + 1));
  const repeated = [...merchants].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n} veces)`);
  const last = [...txs].filter((t) => t.kind === 'expense' && t.occurred_at <= nowIso).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];

  return {
    para: names.length ? names.join(' y ') : 'ustedes',
    espacio: `${space.name} (${space.kind === 'shared' ? 'finanzas compartidas de pareja' : 'finanzas personales'})`,
    hoy: `${DOW[dow]} ${d} de ${MONTHS[m]}, día ${d} de ${daysInMonth}`,
    semana: {
      nota: 'La semana va de viernes a jueves; la tarjeta se paga cada viernes.',
      gastado: crc(sum(week)),
      compras: week.filter((t) => t.kind === 'expense').length,
      dias_que_faltan: daysLeftWeek,
      semana_pasada_a_esta_altura: hasPrevWeek ? crc(sum(txs.filter((t) => within(t, prevWeekFrom, prevWeekSameDay)))) : NO_DATA,
      semana_pasada_completa: hasPrevWeek ? crc(sum(txs.filter((t) => within(t, prevWeekFrom, weekFrom)))) : NO_DATA,
      gasto_mas_grande: biggest ? `${biggest.merchant || 'Sin nombre'} ${crc(biggest.amount_crc)} (${catName(biggest.category_id)})` : null,
      comercios_repetidos: repeated,
    },
    mes: {
      gastado: crc(monthSpent),
      presupuesto: budget > 0 ? crc(budget) : 'todavía no definieron límites',
      usado_del_presupuesto: budget > 0 ? `${pct(monthSpent, budget)}%` : null,
      proyeccion_de_cierre: crc(projection),
      mes_pasado_a_esta_altura: hasPrevMonth ? crc(sum(txs.filter((t) => within(t, prevMonthFrom, prevMonthSameDay)))) : NO_DATA,
    },
    categorias: perCat,
    por_revisar: txs.filter((t) => t.status === 'review' && within(t, monthFrom, monthTo)).length,
    ultimo_gasto: last ? `${last.merchant || 'Sin nombre'} ${crc(last.amount_crc)} (${catName(last.category_id)})` : null,
  };
}

async function ask(f: ReturnType<typeof facts>, prev: string | null) {
  const system = [
    'Sos el copiloto financiero dentro de una app de finanzas de Costa Rica.',
    'Escribís UN solo mensaje para la pantalla de inicio, como una notificación de un amigo que sabe de plata.',
    'Reglas:',
    '- Hablale directo a las personas por su nombre (campo "para").',
    '- Máximo 170 caracteres. Una o dos oraciones cortas. Nada de saludos ni relleno.',
    '- Concreto: incluí 1 o 2 números del resumen, copiados tal cual vienen (con ¢). Nunca inventes ni calcules cifras nuevas.',
    '- Elegí LO MÁS importante, en este orden: una categoría PASADA de su límite; una cerca del límite; gastar bastante más que la semana o el mes pasado a esta altura; un comercio repetido o un gasto grande esta semana; si todo va bien, celebralo.',
    '- Cuando aplique, cerrá con una sugerencia concreta y graciosa (ej: "hoy toca cocinar en casa").',
    '- Humor ligero, cálido y tico sin exagerar. Nunca regañes, no culpes a nadie, no seas condescendiente.',
    '- No menciones el total gastado del mes: ya se ve arriba en la pantalla.',
    '- No uses guiones largos ni rayas (—, –). Usá comas o puntos.',
    '- Sin emojis, salvo el de una categoría cuando la nombrés tal como viene en el resumen.',
    '- Respondé solo con JSON: {"text": "el mensaje", "tone": "good|neutral|warn|bad"}.',
  ].join('\n');
  const user =
    `Resumen de hoy:\n${JSON.stringify(f, null, 1)}` +
    (prev ? `\n\nEl mensaje anterior fue: "${prev}". Si la situación no cambió mucho, decilo de otra forma o enfocate en otro dato.` : '');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1200, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(data)}`);
  const text: string = (data.content || []).map((b: { type: string; text?: string }) => (b.type === 'text' ? b.text : '')).join('');
  if (!text.includes('{')) throw new Error(`no JSON in answer (${data.stop_reason}): ${text.slice(0, 200)}`);
  const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { emoji?: string; text?: string; tone?: string };
  const clean = String(out.text || '').replace(/\s*[—–]\s*/g, ', ').trim();
  const tone = ['good', 'neutral', 'warn', 'bad'].includes(String(out.tone)) ? out.tone : 'neutral';
  return { emoji: '', text: clean, tone };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const auth = req.headers.get('Authorization') || '';
    const body = await req.json().catch(() => ({}));
    const spaceId = String(body.space_id || '');
    if (!UUID.test(spaceId)) return reply({ ok: false, reason: 'space_id' }, 400);
    if (!ANTHROPIC_API_KEY) return reply({ ok: false, reason: 'ANTHROPIC_API_KEY not configured' });
    const prev = typeof body.prev === 'string' ? body.prev.slice(0, 300) : null;

    const get = async (path: string) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: ANON_KEY, Authorization: auth } });
      if (!r.ok) throw new Error(`${path.split('?')[0]}: ${r.status} ${await r.text()}`);
      return r.json();
    };

    const [space] = await get(`spaces?select=name,kind,week_start&id=eq.${spaceId}`);
    if (!space) return reply({ ok: false, reason: 'not a member' }, 403);
    // daily limit per person, so nobody can run up the Anthropic bill
    const quota = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_quota`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_kind: 'insight', p_limit: 60 }),
    });
    if (!quota.ok || (await quota.json()) !== true) return reply({ ok: false, reason: 'quota' });
    const l = new Date(Date.now() - 6 * 3600 * 1000);
    const from = crIso(l.getUTCFullYear(), l.getUTCMonth() - 1, 1); // start of last month (always before last week's start)
    const [members, cats, txs] = await Promise.all([
      get(`space_members?select=user_id&space_id=eq.${spaceId}&order=created_at`),
      get(`categories?select=id,name,emoji,kind,limit_amount,limit_period,is_fixed,parent_id&space_id=eq.${spaceId}&archived=is.false`),
      get(`transactions?select=kind,amount_crc,category_id,merchant,occurred_at,status&space_id=eq.${spaceId}&occurred_at=gte.${encodeURIComponent(from)}&order=occurred_at.desc&limit=3000`),
    ]);
    const ids = (members as { user_id: string }[]).map((x) => x.user_id);
    const profs: { id: string; name: string | null }[] = ids.length ? await get(`profiles?select=id,name&id=in.(${ids.join(',')})`) : [];
    const names = ids.map((id) => profs.find((p) => p.id === id)?.name?.trim()).filter(Boolean) as string[];
    const f = facts(space, names, cats, txs);
    const msg = await ask(f, prev);
    return reply({ ok: true, ...msg });
  } catch (e) {
    console.error(e);
    return reply({ ok: false, error: String(e) }, 500);
  }
});
