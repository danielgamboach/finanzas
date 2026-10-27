// Local QA: serves dist/ and opens the app with Supabase mocked by qa/fixtures.mjs.
// Usage: node qa/shoot.mjs [outDir] [route[@width]] ...   e.g. node qa/shoot.mjs qa/out / /movimientos@1440
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import * as fx from './fixtures.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }

const [outDir = 'qa/out', ...routes] = process.argv.slice(2);
const shots = routes.length ? routes : ['/', '/movimientos', '/analisis', '/cuentas', '/recurrentes', '/ajustes', '/agregar', '/mov/t-1', '/@1440', '/movimientos@1440'];
mkdirSync(outDir, { recursive: true });

const root = resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(root, p === '/' ? 'index.html' : p);
  try { res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

// minimal PostgREST filters: eq, neq, gte, gt, lte, lt, in, is
function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'or', 'on_conflict'].includes(k)) continue;
    const m = v.match(/^(eq|neq|gte|gt|lte|lt|in|is)\.(.*)$/);
    if (!m) continue;
    const [, op, raw] = m;
    out = out.filter((r) => {
      const x = r[k];
      if (x === undefined) return true;
      switch (op) {
        case 'eq': return String(x) === raw;
        case 'neq': return String(x) !== raw;
        case 'gte': return String(x) >= raw;
        case 'gt': return String(x) > raw;
        case 'lte': return String(x) <= raw;
        case 'lt': return String(x) < raw;
        case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(x));
        case 'is': return raw === 'null' ? x == null : String(x) === raw;
      }
      return true;
    });
  }
  const order = params.get('order');
  if (order) {
    const [col, dir] = order.split('.');
    out = [...out].sort((a, b) => (String(a[col] ?? '') < String(b[col] ?? '') ? -1 : 1) * (dir === 'desc' ? -1 : 1));
  }
  const limit = Number(params.get('limit'));
  return limit ? out.slice(0, limit) : out;
}

const browser = await playwright.chromium.launch();
for (const spec of shots) {
  const [route, w] = spec.split('@');
  const width = Number(w) || 390;
  const ctx = await browser.newContext({ viewport: { width, height: width > 800 ? 900 : 844 }, deviceScaleFactor: 2, timezoneId: 'America/Costa_Rica', locale: 'es-CR' });
  await ctx.addInitScript(({ session, ls }) => {
    localStorage.setItem('finanzas.session', JSON.stringify(session));
    for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
  }, { session: { access_token: 'qa', refresh_token: 'qa', expires_at: 4102444800, user: fx.user }, ls: fx.localStorage });
  await ctx.route('https://vzgnujopgryuskixcnnx.supabase.co/**', async (r) => {
    const u = new URL(r.request().url());
    const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(fx.rpcs[u.pathname.split('/').pop()] ?? []);
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.split('/').pop();
      if (r.request().method() !== 'GET') return json([]);
      return json(filterRows(fx.tables[table] || [], u.searchParams));
    }
    if (u.pathname.startsWith('/functions/v1/')) return json(fx.functions[u.pathname.split('/').pop()] || {});
    if (u.pathname.startsWith('/auth/v1/user')) return json(fx.user);
    return r.fulfill({ status: 404, body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + (process.env.QA_STACK ? '\n' + e.stack : '')));
  await page.goto(`${base}/#${route}`);
  await page.waitForTimeout(1200);
  const name = `${(route.replace(/\//g, '_') || '_').replace(/^_/, '') || 'inicio'}${width > 800 ? '-desk' : ''}.png`;
  await page.screenshot({ path: join(outDir, name) });
  console.log(name, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ok');
  await ctx.close();
}
await browser.close();
server.close();
