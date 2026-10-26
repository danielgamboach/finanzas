import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

await import('./tokens.mjs');
await import('./check-tokens.mjs');

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/assets', { recursive: true });
await build({
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2020', 'safari15'],
  jsx: 'automatic',
  outdir: 'dist/assets',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
});
cpSync('public', 'dist', { recursive: true });
cpSync('index.html', 'dist/index.html');
console.log('built dist/');
