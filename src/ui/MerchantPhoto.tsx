import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/api';
import { defaultPattern, deletePhoto, normWords, photoFor, photoUrl, savePhoto, type MerchantPhoto } from '../lib/photos';
import { useApp } from '../store';
import { Emo, Icon, Sheet } from '.';

/** Photos of a space: the store's when it's the current space, fetched otherwise. */
function useSpacePhotos(spaceId: string) {
  const { space, photos, version } = useApp();
  const [other, setOther] = useState<MerchantPhoto[]>([]);
  const isCurrent = space?.id === spaceId;
  useEffect(() => {
    if (isCurrent || !spaceId) return;
    db.from<MerchantPhoto>('merchant_photos').eq('space_id', spaceId).then(setOther, () => setOther([]));
  }, [spaceId, isCurrent, version]);
  return isCurrent ? photos : other;
}

/** Row inside the movement form: shows the merchant's photo and opens the editor. */
export function MerchantPhotoField({ spaceId, name, raw }: { spaceId: string; name: string; raw?: string | null }) {
  const list = useSpacePhotos(spaceId);
  const match = photoFor(list, name, raw);
  const [open, setOpen] = useState(false);
  if (!name.trim()) return null;
  return (
    <>
      <button type="button" className="field-row photo-row" onClick={() => setOpen(true)}>
        {match ? <Emo e="" img={photoUrl(match)} size={40} /> : <span className="photo-empty" aria-hidden="true"><Icon name="camera" size={20} /></span>}
        <span className="col grow">
          <span>Foto del comercio</span>
          <small>{match ? `Se usa en todo lo que diga “${match.pattern}”` : 'Se muestra en lugar del emoji'}</small>
        </span>
        <span className="photo-action">{match ? 'Cambiar' : 'Agregar'}</span>
      </button>
      {open && <PhotoSheet spaceId={spaceId} photo={match} suggestion={name} all={list} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Pick a picture and the name it applies to. Works for a new photo or an existing one. */
export function PhotoSheet({ spaceId, photo, suggestion = '', all, onClose }: { spaceId: string; photo: MerchantPhoto | null; suggestion?: string; all: MerchantPhoto[]; onClose: () => void }) {
  const { toast, reloadMeta, bump } = useApp();
  const [pattern, setPattern] = useState(photo?.pattern || defaultPattern(suggestion));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const clean = pattern.replace(/\s+/g, ' ').trim();
  const renamed = photo && normWords(clean) !== normWords(photo.pattern);
  const clash = all.find((p) => p.id !== photo?.id && normWords(p.pattern) === normWords(clean));
  const covers = suggestion && clean ? normWords(suggestion).includes(normWords(clean)) : true;
  const canSave = !!clean && !busy && (file || renamed) && (!clash || !!file);

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      if (file) {
        // a new picture replaces the photo with the same name, and the one we were editing if it got renamed
        await savePhoto(spaceId, clean, file, all);
        if (photo && renamed) await deletePhoto(photo);
      } else if (photo) {
        await db.update('merchant_photos', { id: photo.id }, { pattern: clean });
      }
      await reloadMeta();
      bump();
      toast('📸 Foto guardada');
      onClose();
    } catch (e) {
      toast(e instanceof Error && /exceeded|size|large/i.test(e.message) ? 'La imagen es muy pesada' : 'No se pudo guardar la foto');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!photo) return;
    setBusy(true);
    try {
      await deletePhoto(photo);
      await reloadMeta();
      bump();
      toast('Foto quitada');
      onClose();
    } catch {
      toast('No se pudo quitar');
    } finally {
      setBusy(false);
    }
  }

  const shown = preview || (photo ? photoUrl(photo) : null);
  return (
    <Sheet title="Foto del comercio" onClose={onClose}>
      <div className="col gap14">
        <button type="button" className="photo-pick" onClick={() => input.current?.click()} aria-label={shown ? 'Cambiar imagen' : 'Elegir imagen'}>
          {shown ? <img src={shown} alt="" /> : <Icon name="camera" size={34} />}
          <span className="photo-pick-badge">{shown ? 'Cambiar' : 'Elegir foto'}</span>
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <label className="col gap6">
          <span className="field-label">Se usa en los movimientos que digan</span>
          <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ej. Starbucks" />
        </label>
        <span className="hint">
          {clash && !file
            ? `Ya hay una foto para “${clash.pattern}”. Elegí una imagen nueva para reemplazarla.`
            : !covers
              ? `Ojo: “${suggestion}” no contiene “${clean}”, así que este movimiento no la mostraría.`
              : 'Usá la parte que se repite, sin la sucursal. “Starbucks” sirve para Starbucks Multiplaza y Starbucks Escazú.'}
        </span>
        <button className="btn-dark big" onClick={save} disabled={!canSave}>{busy ? 'Guardando…' : 'Guardar'}</button>
        {photo && (
          <button className="btn-danger" onClick={remove} disabled={busy}><Icon name="trash" size={18} /> Quitar foto</button>
        )}
      </div>
    </Sheet>
  );
}

/** Settings list: every merchant photo of the space. */
export function MerchantPhotoList() {
  const { space, photos } = useApp();
  const [editing, setEditing] = useState<MerchantPhoto | null>(null);
  if (!space) return null;
  return (
    <section className="col gap8">
      <h2 className="h3 px4">Fotos de comercios</h2>
      <div className="card list">
        {photos.length === 0 ? (
          <span className="empty">Abrí un movimiento y tocá “Foto del comercio” para agregar la primera.</span>
        ) : (
          photos.map((p) => (
            <button key={p.id} className="row gap12 list-row plain-btn" onClick={() => setEditing(p)}>
              <Emo e="" img={photoUrl(p)} size={40} />
              <strong className="grow sm left">{p.pattern}</strong>
              <Icon name="chevRight" size={18} />
            </button>
          ))
        )}
      </div>
      {editing && <PhotoSheet spaceId={space.id} photo={editing} all={photos} onClose={() => setEditing(null)} />}
    </section>
  );
}
