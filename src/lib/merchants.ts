import { db, storage } from './api';
import type { Tx } from './types';

/**
 * The merchant catalog, shared by every user: "ampm" with its logo and the patterns that point to it
 * ("AM PM", "AMPM"). A movement belongs to the merchant whose pattern appears as whole words in its
 * name; the longest pattern wins. The database keeps that link in transactions.merchant_id; the app
 * uses the same rule for things without one (recurring payments, a name being typed).
 */
export interface MerchantPattern {
  id: string;
  merchant_id: string;
  pattern: string;
  norm: string;
  active: boolean;
  created_by: string | null;
}

export interface Merchant {
  id: string;
  name: string;
  photo_path: string | null;
  created_by: string | null;
  merchant_patterns: MerchantPattern[];
}

export const BUCKET = 'merchant-photos';
export const photoUrl = (m: Merchant) => (m.photo_path ? storage.publicUrl(BUCKET, m.photo_path) : null);

/** "McDonald's Sabana" → " mcdonald s sabana ": accents, case and punctuation never matter. */
export function normWords(s: string) {
  return ` ${s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

export async function loadMerchants(): Promise<Merchant[]> {
  return db.from<Merchant>('merchants', 'id,name,photo_path,created_by,merchant_patterns(id,merchant_id,pattern,norm,active,created_by)').order('name');
}

// every active pattern, longest first, built once per catalog
const index = new WeakMap<Merchant[], { needle: string; m: Merchant }[]>();
function patternsOf(list: Merchant[]) {
  let idx = index.get(list);
  if (!idx) {
    idx = list
      .flatMap((m) => m.merchant_patterns.filter((p) => p.active).map((p) => ({ needle: ` ${p.norm} `, m })))
      .filter((x) => x.needle.trim())
      .sort((a, b) => b.needle.length - a.needle.length);
    index.set(list, idx);
  }
  return idx;
}

/** The merchant whose pattern appears in any of the names. */
export function merchantFor(list: Merchant[], ...names: (string | null | undefined)[]) {
  if (!list.length) return null;
  const hays = names.filter(Boolean).map((n) => normWords(n as string)).filter((h) => h.trim());
  if (!hays.length) return null;
  for (const { needle, m } of patternsOf(list)) if (hays.some((h) => h.includes(needle))) return m;
  return null;
}

/** The pattern that ties a name to its merchant (the longest one found). */
export function matchedPattern(m: Merchant, ...names: (string | null | undefined)[]) {
  const hays = names.filter(Boolean).map((n) => normWords(n as string));
  return m.merchant_patterns
    .filter((p) => p.active && hays.some((h) => h.includes(` ${p.norm} `)))
    .sort((a, b) => b.norm.length - a.norm.length)[0] || null;
}

/** A movement's merchant: the link the database made, or the same rule on its names. */
export function txMerchant(list: Merchant[], t: Pick<Tx, 'kind' | 'merchant' | 'raw_merchant'> & { merchant_id?: string | null }) {
  if (t.kind === 'transfer') return null;
  if (t.merchant_id) return list.find((m) => m.id === t.merchant_id) || null;
  return merchantFor(list, t.merchant, t.raw_merchant);
}

/** Logo URL for a movement, or null. */
export function txPhoto(list: Merchant[], t: Parameters<typeof txMerchant>[1]) {
  const m = txMerchant(list, t);
  return m ? photoUrl(m) : null;
}

/** Logo URL for anything named (recurring payments), or null. */
export function namePhoto(list: Merchant[], ...names: (string | null | undefined)[]) {
  const m = merchantFor(list, ...names);
  return m ? photoUrl(m) : null;
}

// Words that say what kind of place it is, not which one ("Soda Tapia", "Taco Bell").
const GENERIC = new Set(['soda', 'restaurante', 'rest', 'cafe', 'cafeteria', 'bar', 'pizzeria', 'pizza', 'taco', 'taqueria', 'burger', 'la', 'el', 'los', 'las', 'the', 'super', 'supermercado', 'mini', 'farmacia', 'panaderia', 'tienda', 'hotel', 'auto', 'mas', 'casa', 'cine', 'pops']);

/** A sensible default pattern from a merchant name: the distinctive part, without the branch. */
export function defaultPattern(name: string) {
  const words = name
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+(san jose|san j|heredia|escazu|cartago|alajuela|costa rica)$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length <= 1) return words.join(' ');
  const plain = (w: string) => normWords(w).trim();
  let n = 1;
  while (n < words.length && n < 3 && (GENERIC.has(plain(words[n - 1])) || plain(words[n - 1]).length < 3 || plain(words[n]).length < 3)) n++;
  return words.slice(0, n).join(' ');
}

/** A readable merchant name from a bank name: "AMPM FRESES SAN JOSE" → "Ampm". */
export function defaultName(name: string) {
  const base = defaultPattern(name);
  return base === base.toUpperCase() ? base.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()) : base;
}

/** Square, small and light: center-cropped to 192px JPEG on a white background (~10 KB). */
export async function squareJpeg(file: File, size = 192): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, err) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => err(new Error('No se pudo leer la imagen'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return await new Promise<Blob>((ok, err) => canvas.toBlob((b) => (b ? ok(b) : err(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Uploads a logo (always a new file, so nothing already shown can be overwritten) and sets it on the merchant. */
export async function setLogo(merchantId: string, spaceId: string, file: File) {
  const blob = await squareJpeg(file);
  const path = `${spaceId}/m-${crypto.randomUUID()}.jpg`;
  await storage.upload(BUCKET, path, blob);
  await db.rpc('merchant_set_photo', { p_merchant: merchantId, p_path: path });
}

export const createMerchant = (name: string, pattern: string) => db.rpc<string>('merchant_create', { p_name: name, p_pattern: pattern });
export const addPattern = (merchantId: string, pattern: string) => db.rpc<string>('merchant_add_pattern', { p_merchant: merchantId, p_pattern: pattern });
export const disablePattern = (id: string) => db.rpc('merchant_disable_pattern', { p_id: id });
export const renameMerchant = (merchantId: string, name: string) => db.rpc('merchant_rename', { p_merchant: merchantId, p_name: name });

/** Friendly message for the database's merchant errors. */
export function merchantError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (/pattern_short/.test(msg)) return 'Usá al menos 3 letras';
  if (/pattern_taken/.test(msg)) return 'Ese nombre ya es de otro comercio';
  if (/photo_exists/.test(msg)) return 'Ese comercio ya tiene foto';
  if (/exceeded|size|large/i.test(msg)) return 'La imagen es muy pesada';
  return 'No se pudo guardar';
}
