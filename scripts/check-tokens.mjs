// Fails the build when a raw value sneaks past the design tokens.
// Colors, font sizes, weights and radii must come from src/tokens.css (generated from tokens/tokens.json).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk('src');

const ALLOW = new Set(['src/tokens.css']);
const rules = [
  [/#[0-9a-fA-F]{3,8}\b/, 'color hex: use a token (var(--…))'],
  [/font-size:\s*[\d.]+px/, 'font-size: use var(--text-…)'],
  [/font-weight:\s*\d+/, 'font-weight: use var(--font-weight-…)'],
  [/border-radius:\s*[^;]*\b[1-9][\d.]*px/, 'border-radius: use var(--radius-…)'],
];
// canvas drawing can't read CSS variables
const EXEMPT = [/ctx\.fillStyle/];

const problems = [];
for (const f of files) {
  if (ALLOW.has(f) || !/\.(css|tsx?)$/.test(f)) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (EXEMPT.some((r) => r.test(line))) return;
    const css = f.endsWith('.css') ? line : (line.match(/['"`][^'"`]*['"`]/g) || []).join(' ');
    for (const [re, msg] of rules) if (re.test(css)) problems.push(`${f}:${i + 1}  ${msg}`);
  });
}
if (problems.length) {
  console.error(`Design tokens check failed (${problems.length}):\n` + problems.join('\n'));
  process.exit(1);
}
console.log('tokens check ok');
