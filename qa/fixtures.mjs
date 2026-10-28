// Fake data for local QA. Everything is relative to "today" in Costa Rica so the screens look current.
// Not real people or amounts.

const DANI = '92f8f5c6-e170-4058-9576-e63b0c2126e6';
const KIMMY = 'b1a2c3d4-0000-4000-8000-00000000kimm'.replace('kimm', '0001');
export const SPACE = '71150d11-94c1-4114-9b8c-ec14bed697ed';
const PERSONAL = 'd1730207-c62e-428c-b40c-875001813243';

const crNow = () => new Date(Date.now() - 6 * 3600e3); // CR is UTC-6, no DST
const iso = (daysAgo, hour = 12) => {
  const d = crNow();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour + 6, 15, 0, 0); // back to UTC
  return d.toISOString();
};
const day = (offset) => {
  const d = crNow();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const user = { id: DANI, email: 'qa@example.com', user_metadata: { name: 'Dani' } };

const cat = (id, name, emoji, color, extra = {}) => ({ id, space_id: SPACE, name, emoji, color, kind: 'expense', limit_amount: null, limit_period: null, is_fixed: false, archived: false, sort: 0, parent_id: null, ...extra });
const categories = [
  cat('c-super', 'Supermercado', '🛒', 'mint', { limit_amount: 250000, limit_period: 'monthly' }),
  cat('c-comida', 'Comida', '🍔', 'peach', { limit_amount: 120000, limit_period: 'monthly' }),
  cat('c-trans', 'Transporte', '🚗', 'sky', { limit_amount: 60000, limit_period: 'monthly' }),
  cat('c-cafe', 'Café', '☕', 'butter'),
  cat('c-salud', 'Salud', '💊', 'pink'),
  cat('c-casa', 'Casa', '🏠', 'gray', { is_fixed: true, limit_amount: 400000, limit_period: 'monthly' }),
  cat('c-serv', 'Servicios', '💡', 'cyan', { is_fixed: true }),
  cat('c-ocio', 'Salidas', '🎬', 'lilac'),
  cat('c-sal', 'Salario', '💰', 'butter', { kind: 'income' }),
];

const acc = (id, name, kind, color, extra = {}) => ({ id, space_id: SPACE, name, institution: 'BAC', kind, currency: 'CRC', last4: '1234', emoji: '💳', archived: false, color, brand: 'visa', ...extra });
const accounts = [
  acc('a-visa', 'Visa compartida', 'credit_card', 'violet'),
  acc('a-amex', 'Amex', 'credit_card', 'cyan', { brand: 'amex', last4: '4005' }),
  acc('a-deb', 'Débito BAC', 'debit', 'graphite', { brand: null }),
  acc('a-ahorro', 'Ahorro casa', 'savings', 'emerald', { brand: null, emoji: '🏡' }),
];

let n = 0;
const tx = (daysAgo, merchant, category_id, amount, extra = {}) => ({
  id: `t-${++n}`, space_id: SPACE, kind: 'expense', amount, currency: 'CRC', fx_rate: 1, amount_crc: amount,
  occurred_at: iso(daysAgo, 9 + (n % 10)), merchant, raw_merchant: merchant?.toUpperCase() ?? null, note: null,
  category_id, account_id: 'a-visa', to_account_id: null, contributor_id: null, recurring_id: null,
  status: 'posted', source: 'email', external_id: null, hold: null, sub_ask: null, merchant_id: null, created_by: DANI, transaction_tags: [], ...extra,
});
const transactions = [
  tx(0, 'Automercado', 'c-super', 23450),
  tx(0, 'Uber', null, 3120, { hold: 'pending', status: 'review' }),
  tx(0, 'SINPE 8888-1234', null, 6000, { status: 'review', suggested_category_id: 'c-comida' }),
  tx(1, 'Netflix', 'c-ocio', 8300, { currency: 'USD', amount: 15.49, fx_rate: 536, raw_merchant: 'NETFLIX.COM', merchant_key: 'NETFLIX.COM', sub_ask: 'pending' }),
  tx(1, 'Soda La Esquina', 'c-comida', 4800),
  tx(1, 'Salario', 'c-sal', 850000, { kind: 'income', account_id: 'a-deb' }),
  tx(3, 'Farmacia Fischel', 'c-salud', 12300),
  tx(4, 'Café Rojo', 'c-cafe', 3900),
  tx(5, 'Fresh Market', 'c-super', 18760),
  tx(6, 'Cinépolis', 'c-ocio', 9600),
  tx(8, 'Didi', 'c-trans', 4200),
  tx(9, 'Automercado', 'c-super', 41200),
  tx(11, 'CNFL', 'c-serv', 28900),
  tx(13, 'Pizza Antonino', 'c-comida', 15800),
  tx(15, 'Alquiler', 'c-casa', 350000, { account_id: 'a-deb', source: 'recurring' }),
  tx(18, 'Automercado', 'c-super', 36100),
  tx(20, 'Uber', 'c-trans', 5100),
  // last month, for the comparisons
  tx(31, 'Automercado', 'c-super', 52000), tx(33, 'Soda La Esquina', 'c-comida', 6200), tx(35, 'Alquiler', 'c-casa', 350000),
  tx(38, 'CNFL', 'c-serv', 27100), tx(40, 'Fresh Market', 'c-super', 21900), tx(44, 'Uber', 'c-trans', 4800),
];

const recurring = [
  { id: 'r-alq', space_id: SPACE, kind: 'expense', amount: 350000, currency: 'CRC', category_id: 'c-casa', account_id: 'a-deb', merchant: 'Alquiler', frequency: 'monthly', next_due: day(1), method: 'transfer', match_pattern: null, last_paid_on: day(-30), notes: null, active: true },
  { id: 'r-agua', space_id: SPACE, kind: 'expense', amount: 18400, currency: 'CRC', category_id: 'c-serv', account_id: null, merchant: 'Agua AyA', frequency: 'monthly', next_due: day(-2), method: 'transfer', match_pattern: null, last_paid_on: day(-32), notes: null, active: true, variable: true },
  { id: 'r-netflix', space_id: SPACE, kind: 'expense', amount: 7900, currency: 'CRC', category_id: 'c-ocio', account_id: 'a-visa', merchant: 'Netflix', frequency: 'monthly', next_due: day(9), method: 'card', match_pattern: 'NETFLIX', last_paid_on: day(-21), notes: null, active: true },
  { id: 'r-cnfl', space_id: SPACE, kind: 'expense', amount: 28000, currency: 'CRC', category_id: 'c-serv', account_id: 'a-visa', merchant: 'CNFL', frequency: 'monthly', next_due: day(19), method: 'card', match_pattern: 'CNFL', last_paid_on: day(-11), notes: null, active: true, variable: true },
];

export const tables = {
  spaces: [
    { id: PERSONAL, name: 'Personal', emoji: '🦥', kind: 'personal', week_start: 5, created_by: DANI },
    { id: SPACE, name: 'Simbiosis', emoji: '👫', kind: 'shared', week_start: 5, created_by: DANI },
  ],
  space_members: [
    { space_id: PERSONAL, user_id: DANI, role: 'owner' },
    { space_id: SPACE, user_id: DANI, role: 'owner' },
    { space_id: SPACE, user_id: KIMMY, role: 'member' },
  ],
  profiles: [
    { id: DANI, name: 'Dani G', emoji: '🦥', onboarded_at: '2026-01-01T00:00:00Z', setup_hidden: true, notify_limits: true, notify_card: true },
    { id: KIMMY, name: 'Kimmy', emoji: '🌻', onboarded_at: '2026-01-01T00:00:00Z', setup_hidden: true },
  ],
  fx_rates: [{ crc_per_usd: 505 }],
  categories,
  accounts,
  tags: [],
  merchants: [],
  merchant_patterns: [],
  transactions,
  recurring,
  goals: [{ id: 'g-casa', space_id: SPACE, name: 'Casa propia', emoji: '🏡', color: 'mint', target_amount: 20000000, currency: 'CRC', goal_accounts: [{ account_id: 'a-ahorro' }] }],
  balance_snapshots: [
    { id: 's1', account_id: 'a-ahorro', balance: 6400000, taken_on: day(-3) },
    { id: 's2', account_id: 'a-deb', balance: 812000, taken_on: day(-1) },
    { id: 's3', account_id: 'a-visa', balance: -318500, taken_on: day(-1) },
    { id: 's4', account_id: 'a-amex', balance: -42000, taken_on: day(-2) },
  ],
  apple_receipts: [],
  ingest_unmatched: [],
  recurring_dismissals: [],
  push_subscriptions: [],
};

// daily_spend: the movements above, plus a made-up history so 6M / 1A / YTD have something to draw
function dailySpend({ p_from, p_to }) {
  const map = new Map();
  for (const t of transactions) {
    if (t.hold || (t.kind !== 'expense' && t.kind !== 'refund')) continue;
    const k = new Date(new Date(t.occurred_at).getTime() - 6 * 3600e3).toISOString().slice(0, 10);
    map.set(k, (map.get(k) || 0) + (t.kind === 'refund' ? -1 : 1) * t.amount_crc);
  }
  const old = day(-45);
  for (let d = new Date(p_from + 'T00:00:00Z'); d.toISOString().slice(0, 10) < p_to; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    if (k >= old || k < '2025-12-01') continue;
    const n = d.getUTCDate() * 7 + d.getUTCMonth() * 13;
    map.set(k, (n % 5 === 0 ? 0 : 6000 + (n * 7919) % 42000) + (d.getUTCDate() === 1 ? 350000 : 0));
  }
  return [...map].filter(([k]) => k >= p_from && k < p_to).sort().map(([day, spend]) => ({ day, spend }));
}

export const rpcs = {
  daily_spend: dailySpend,
  is_app_admin: true,
  admin_merchants_without_photo: [
    { merchant_id: null, name: 'Culqi', raw: 'CULQI LA MOLINA', movements: 11, last_at: '2026-10-20T15:00:00Z' },
    { merchant_id: null, name: 'Parqueo Fércori', raw: 'PARQUEO FERCORI SAN J', movements: 6, last_at: '2026-10-18T15:00:00Z' },
    { merchant_id: null, name: 'Lebanese Cuisine', raw: 'LEBANESE CUISINE SAN J', movements: 6, last_at: '2026-10-12T15:00:00Z' },
    { merchant_id: null, name: 'La Empanadita', raw: 'LA EMPANADITA 4 MATA', movements: 5, last_at: '2026-10-10T15:00:00Z' },
    { merchant_id: null, name: 'Noisy Neighbours', raw: 'NOISY NEIGHBOURS SAN J', movements: 3, last_at: '2026-10-02T15:00:00Z' },
    { merchant_id: null, name: 'Soda Tapia', raw: 'SODA TAPIA', movements: 3, last_at: '2026-09-28T15:00:00Z' },
    { merchant_id: null, name: 'Cinepolis P Lincon San J', raw: 'CINEPOLIS P LINCON SAN J', movements: 2, last_at: '2026-09-20T15:00:00Z' },
    { merchant_id: null, name: 'Tulsi Café y Plantas', raw: 'TULSI CAFE Y PLANTAS SAN J', movements: 1, last_at: '2026-09-02T15:00:00Z' },
  ],
  recurring_suggestions: [],
  vapid_public_key: null,
};

export const functions = {
  insight: { ok: true, emoji: '🛒', tone: 'neutral', text: 'Van ¢119.410 en súper este mes, un poco menos que en septiembre a esta altura.' },
  ask: { ok: true, text: 'Este mes van ¢487.900 en total.' },
};

export const localStorage = {
  'finanzas.space': SPACE,
  'finanzas.cur': 'CRC',
  'finanzas.push.prompt-dismissed': '1',
};
