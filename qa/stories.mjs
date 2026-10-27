// Renders every Storybook story without Storybook (no npm here): bundles the stories with esbuild,
// mounts each one in a page and takes a screenshot. Catches broken stories before Vercel builds them.
// Usage: node qa/stories.mjs [outDir] [filter]
import { build } from 'esbuild';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const [outDir = 'qa/out/stories', filter = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.stories\.tsx$/.test(f) && p.includes(filter) && files.push(p); });
walk('src/ds');

const ROOT = resolve('.');
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import '${ROOT}/src/tokens.css';
import '${ROOT}/src/styles.css';
import '${ROOT}/src/ds/ds.css';
${files.map((f, i) => `import * as S${i} from '${ROOT}/${f}';`).join('\n')}
const mods = [${files.map((f, i) => `['${f}', S${i}]`).join(',')}];
const all = [];
for (const [file, m] of mods) {
  const meta = m.default || {};
  for (const [k, v] of Object.entries(m)) {
    if (k === 'default' || typeof v !== 'object') continue;
    all.push({ id: (meta.title || file) + ' / ' + (v.name || k), meta, story: v });
  }
}
window.__stories = all.map((s) => s.id);
window.__show = (i) => {
  const { meta, story } = all[i];
  const args = { ...(meta.args || {}), ...(story.args || {}) };
  const C = meta.component;
  const Render = () => (story.render ? story.render(args, { args, globals: {} }) : C ? React.createElement(C, args) : null);
  document.body.innerHTML = '<div id="r" class="ds-canvas"></div>';
  createRoot(document.getElementById('r')).render(React.createElement(Render));
};
`;
mkdirSync('qa/out/tmp', { recursive: true });
writeFileSync('qa/out/tmp/entry.jsx', entry);
await build({ entryPoints: ['qa/out/tmp/entry.jsx'], bundle: true, outfile: 'qa/out/tmp/bundle.js', format: 'iife', jsx: 'automatic', loader: { '.json': 'json' }, external: [], alias: { '@storybook/react-vite': resolve('qa/sb-stub.js') }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'error' });
writeFileSync('qa/out/tmp/index.html', '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="bundle.css"><body></body><script src="bundle.js"></script>');

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('file://' + resolve('qa/out/tmp/index.html'));
const ids = await page.evaluate(() => window.__stories);
let bad = 0;
for (let i = 0; i < ids.length; i++) {
  errors.length = 0;
  await page.evaluate((n) => window.__show(n), i);
  await page.waitForTimeout(120);
  const name = ids[i].replace(/[^\wáéíóúñ]+/gi, '_').slice(0, 90) + '.png';
  await page.locator('#r').screenshot({ path: join(outDir, name) });
  if (errors.length) { bad++; console.log('ERROR', ids[i], errors.join(' | ')); }
}
console.log(`${ids.length} stories, ${bad} with errors`);
await browser.close();
