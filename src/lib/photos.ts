import { db, storage } from './api';

/** A picture for a merchant: shown instead of the category emoji on every movement that matches. */
export interface MerchantPhoto {
  id: string;
  space_id: string;
  pattern: string; // as the user typed it, e.g. "Starbucks"
  path: string; // inside the merchant-photos bucket: <space_id>/<uuid>.jpg
}

export const BUCKET = 'merchant-photos';
export const photoUrl = (p: MerchantPhoto) => storage.publicUrl(BUCKET, p.path);

/** "McDonald's Sabana" → " mcdonald s sabana ": accents, case and punctuation never matter. */
export function normWords(s: string) {
  return ` ${s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
}

/** The photo whose pattern appears (as whole words) in the merchant name; the longest pattern wins. */
export function photoFor(photos: MerchantPhoto[], ...names: (string | null | undefined)[]) {
  if (!photos.length) return null;
  const hay = normWords(names.filter(Boolean).join(' '));
  if (hay.trim() === '') return null;
  let best: MerchantPhoto | null = null;
  let bestLen = 0;
  for (const p of photos) {
    const needle = normWords(p.pattern);
    if (needle.trim() && hay.includes(needle) && needle.length > bestLen) {
      best = p;
      bestLen = needle.length;
    }
  }
  return best;
}

// Words that say what kind of place it is, not which one ("Soda Tapia", "Taco Bell").
const GENERIC = new Set(['soda', 'restaurante', 'rest', 'cafe', 'cafeteria', 'bar', 'pizzeria', 'pizza', 'taco', 'taqueria', 'burger', 'la', 'el', 'los', 'las', 'the', 'super', 'supermercado', 'mini', 'farmacia', 'panaderia', 'tienda', 'hotel', 'auto', 'mas', 'casa', 'cine', 'pops']);

/** A sensible default pattern from a merchant name: the distinctive part, without the branch. */
export function defaultPattern(name: string) {
  const words = name.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length <= 1) return words.join(' ');
  const plain = (w: string) => normWords(w).trim();
  let n = 1;
  while (n < words.length && n < 3 && (GENERIC.has(plain(words[n - 1])) || plain(words[n - 1]).length < 3 || plain(words[n]).length < 3)) n++;
  return words.slice(0, n).join(' ');
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

/** Uploads the picture and saves (or replaces) the photo for that pattern in the space. */
export async function savePhoto(spaceId: string, pattern: string, file: File, existing: MerchantPhoto[]) {
  const blob = await squareJpeg(file);
  const path = `${spaceId}/${crypto.randomUUID()}.jpg`;
  await storage.upload(BUCKET, path, blob);
  const clean = pattern.replace(/\s+/g, ' ').trim();
  const old = existing.find((p) => p.space_id === spaceId && normWords(p.pattern) === normWords(clean));
  if (old) {
    await db.update('merchant_photos', { id: old.id }, { path, pattern: clean });
    await storage.remove(BUCKET, [old.path]);
  } else {
    await db.insert('merchant_photos', { space_id: spaceId, pattern: clean, path });
  }
}

export async function deletePhoto(p: MerchantPhoto) {
  await db.remove('merchant_photos', { id: p.id });
  await storage.remove(BUCKET, [p.path]);
}
