import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ds';
import { db } from '../lib/api';
import {
  addPattern,
  createMerchant,
  defaultName,
  defaultPattern,
  disablePattern,
  matchedPattern,
  merchantError,
  merchantFor,
  normWords,
  photoUrl,
  renameMerchant,
  setLogo,
  type Merchant,
} from '../lib/merchants';
import type { Tx } from '../lib/types';
import { useApp } from '../store';
import { Emo, Icon, Sheet } from '.';

/** A merchant's face in lists: its logo, or its initial. */
export function Face({ m, size = 36 }: { m: Merchant | null; size?: number }) {
  const url = m ? photoUrl(m) : null;
  if (url) return <Emo e="" img={url} size={size} />;
  return (
    <span className="m-initial" style={{ width: size, height: size }} aria-hidden="true">
      {(m?.name || '+').charAt(0).toUpperCase()}
    </span>
  );
}

/** "AMPM FRESES SAN JOSE" → "AMPM FRESES": the whole name without the city, to single out one branch. */
function fullPattern(name: string) {
  return name
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+(san jose|san j|heredia|escazu|cartago|alajuela|costa rica)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Row inside the movement form: the merchant's logo. Anyone can add the first one; only an admin replaces it. */
export function MerchantPhotoField({ spaceId, name, raw, merchantId }: { spaceId: string; name: string; raw?: string | null; merchantId?: string | null }) {
  const { merchants, isAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const byId = merchantId ? merchants.find((m) => m.id === merchantId) || null : null;
  const m = byId || merchantFor(merchants, name, raw);
  const url = m ? photoUrl(m) : null;
  if (!name.trim() && !m) return null;

  if (url && !isAdmin) {
    return (
      <div className="field-row photo-row">
        <Emo e="" img={url} size={40} />
        <span className="col grow">
          <span>Foto del comercio</span>
          <small>Logo de {m!.name}</small>
        </span>
      </div>
    );
  }
  return (
    <>
      <button type="button" className="field-row photo-row" onClick={() => setOpen(true)}>
        {url ? <Emo e="" img={url} size={40} /> : <span className="photo-empty" aria-hidden="true"><Icon name="camera" size={20} /></span>}
        <span className="col grow">
          <span>Foto del comercio</span>
          <small>{m ? (url ? `Logo de ${m.name}` : `Se usa en todo lo de ${m.name}`) : 'Se muestra en lugar del emoji'}</small>
        </span>
        <span className="photo-action">{url ? 'Cambiar' : 'Agregar'}</span>
      </button>
      {open && <PhotoSheet spaceId={spaceId} merchant={m} suggestion={name || raw || ''} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Pick a logo. For a merchant that isn't in the catalog yet, also its name and the words that identify it. */
export function PhotoSheet({ spaceId, merchant, suggestion = '', nameHint, onSaved, onClose }: { spaceId: string; merchant: Merchant | null; suggestion?: string; nameHint?: string; onSaved?: () => void; onClose: () => void }) {
  const { toast, reloadMeta, bump, isAdmin } = useApp();
  const [name, setName] = useState(merchant?.name || nameHint || defaultName(suggestion));
  const [pattern, setPattern] = useState(defaultPattern(suggestion));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const current = merchant ? photoUrl(merchant) : null;
  const locked = !!current && !isAdmin;
  const clean = pattern.replace(/\s+/g, ' ').trim();
  const covers = !suggestion || !clean || normWords(suggestion).includes(normWords(clean));
  const renamed = !!merchant && isAdmin && name.trim() !== '' && name.trim() !== merchant.name;
  const canSave = !busy && !locked && (merchant ? !!file || renamed : !!file && !!name.trim() && normWords(clean).trim().length >= 3 && covers);

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      const id = merchant?.id || (await createMerchant(name.trim(), clean));
      if (renamed) await renameMerchant(id, name.trim());
      if (file) await setLogo(id, spaceId, file);
      await reloadMeta();
      bump();
      toast('📸 Foto guardada');
      if (file) onSaved?.();
      onClose();
    } catch (e) {
      toast(merchantError(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!merchant) return;
    setBusy(true);
    try {
      await db.rpc('merchant_set_photo', { p_merchant: merchant.id, p_path: null });
      await reloadMeta();
      bump();
      toast('Foto quitada');
      onClose();
    } catch (e) {
      toast(merchantError(e));
    } finally {
      setBusy(false);
    }
  }

  const shown = preview || current;
  return (
    <Sheet title={merchant ? `Foto de ${merchant.name}` : 'Foto del comercio'} onClose={onClose}>
      <div className="col gap14">
        <button type="button" className="photo-pick" onClick={() => input.current?.click()} disabled={locked} aria-label={shown ? 'Cambiar imagen' : 'Elegir imagen'}>
          {shown ? <img src={shown} alt="" /> : <Icon name="camera" size={34} />}
          {!locked && <span className="photo-pick-badge">{shown ? 'Cambiar' : 'Elegir foto'}</span>}
        </button>
        <input ref={input} type="file" accept="image/*" className="sr" tabIndex={-1} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        {(!merchant || isAdmin) && (
          <label className="col gap6">
            <span className="field-label">Nombre del comercio</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Starbucks" maxLength={60} />
          </label>
        )}
        {!merchant && (
          <label className="col gap6">
            <span className="field-label">Se usa en los movimientos que digan</span>
            <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ej. Starbucks" />
          </label>
        )}
        <span className="hint">
          {locked
            ? 'Este comercio ya tiene foto. Solo un administrador la puede cambiar.'
            : merchant
              ? `Se ve en todos los movimientos de ${merchant.name}, para todos.`
              : !covers
                ? `Ojo: “${suggestion}” no contiene “${clean}”, así que este movimiento no la mostraría.`
                : 'Usá la parte que se repite, sin la sucursal. “Starbucks” sirve para Starbucks Multiplaza y Starbucks Escazú.'}
        </span>
        {!locked && <Button variant="primary" size="xl" onClick={save} disabled={!canSave}>{busy ? 'Guardando…' : 'Guardar'}</Button>}
        {merchant && current && isAdmin && (
          <Button variant="destructive-outline" size="lg" leading={<Icon name="trash" size={18} />} onClick={remove} disabled={busy}>Quitar foto</Button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * "Unir con otro comercio": pick the merchant this movement belongs to (or create it), and the words
 * that identify it. Everything that says those words, past and future, goes to that merchant.
 */
export function MergeSheet({ t, preset, onClose }: { t: Tx; preset?: Merchant | null; onClose: () => void }) {
  const { merchants, toast, reloadMeta, bump } = useApp();
  const label = t.merchant || t.raw_merchant || '';
  const current = t.merchant_id ? merchants.find((m) => m.id === t.merchant_id) || null : null;
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Merchant | 'new' | null>(preset || null);
  const [newName, setNewName] = useState(defaultName(label));
  // already in a merchant: only this branch's full name can move it; otherwise the distinctive part
  const [pattern, setPattern] = useState(current ? fullPattern(t.raw_merchant || label) : defaultPattern(t.raw_merchant || label));
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = normWords(q).trim();
    const pool = merchants.filter((m) => m.id !== current?.id);
    if (!n) return pool.slice(0, 40);
    const hit = (m: Merchant) => normWords(m.name).includes(` ${n}`) || m.merchant_patterns.some((p) => p.active && ` ${p.norm} `.includes(` ${n}`));
    return pool.filter(hit).slice(0, 40);
  }, [q, merchants, current?.id]);

  const clean = pattern.replace(/\s+/g, ' ').trim();
  const covers = normWords(`${t.raw_merchant || ''} | ${t.merchant || ''}`).includes(normWords(clean)) && normWords(clean).trim().length >= 3;
  const target = pick === 'new' ? newName.trim() : pick?.name;
  const tooShort = current && covers ? (matchedPattern(current, t.raw_merchant, t.merchant)?.norm.length || 0) >= normWords(clean).trim().length : false;
  const canSave = !busy && !!pick && !!target && covers && !tooShort;

  async function save() {
    if (!canSave || !pick) return;
    setBusy(true);
    try {
      let mid: string;
      let undoIds: string[];
      if (pick === 'new') {
        mid = await createMerchant(newName.trim(), clean);
        const mine = await db.from<{ id: string }>('merchant_patterns', 'id').eq('merchant_id', mid).eq('active', true);
        undoIds = mine.map((p) => p.id);
      } else {
        mid = pick.id;
        undoIds = [await addPattern(mid, clean)];
      }
      const linked = await db.from<{ id: string }>('transactions', 'id').eq('space_id', t.space_id).eq('merchant_id', mid);
      await reloadMeta();
      bump();
      const more = linked.length > 1 ? ` · ${linked.length} movimientos` : '';
      toast(`🔗 ${label} → ${target}${more}`, async () => {
        for (const id of undoIds) await disablePattern(id);
        await reloadMeta();
      });
      onClose();
    } catch (e) {
      toast(merchantError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!pick) {
    return (
      <Sheet title="Unir con otro comercio" onClose={onClose}>
        <div className="col gap12">
          <span className="hint">¿De qué comercio es “{label}”?</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar comercio" autoFocus aria-label="Buscar comercio" />
          <div className="m-list" role="listbox" aria-label="Comercios">
            {list.map((m) => (
              <button key={m.id} type="button" role="option" aria-selected={false} className="m-row" onClick={() => setPick(m)}>
                <Face m={m} />
                <span className="grow left">{m.name}</span>
                <Icon name="chevRight" size={16} />
              </button>
            ))}
            {list.length === 0 && <span className="empty">No hay comercios con ese nombre.</span>}
          </div>
          <Button variant="secondary" size="lg" onClick={() => { if (q.trim()) setNewName(q.trim()); setPick('new'); }} leading={<Icon name="plus" size={18} />}>Crear comercio{q.trim() ? ` “${q.trim()}”` : ''}</Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={pick === 'new' ? 'Nuevo comercio' : `Unir a ${pick.name}`} onClose={onClose}>
      <div className="col gap14">
        {pick === 'new' ? (
          <label className="col gap6">
            <span className="field-label">Nombre del comercio</span>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. ampm" maxLength={60} />
          </label>
        ) : (
          <div className="row gap12 m-picked">
            <Face m={pick} size={44} />
            <strong className="grow">{pick.name}</strong>
            {!preset && <Button variant="link" onClick={() => setPick(null)}>Cambiar</Button>}
          </div>
        )}
        <label className="col gap6">
          <span className="field-label">Los movimientos que digan</span>
          <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ej. AMPM" />
        </label>
        <span className="hint">
          {!covers
            ? `Tiene que ser parte de “${t.raw_merchant || label}”, con al menos 3 letras.`
            : tooShort
              ? `“${clean}” ya lleva a ${current!.name}. Usá algo más largo, como el nombre completo de esta sucursal.`
              : `Todo lo que diga “${clean}”, de antes y de ahora, queda en ${target || 'este comercio'}. Sirve para todos.`}
        </span>
        <Button variant="primary" size="xl" onClick={save} disabled={!canSave}>{busy ? 'Guardando…' : pick === 'new' ? 'Crear y unir' : 'Unir'}</Button>
      </div>
    </Sheet>
  );
}
