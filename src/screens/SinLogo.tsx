import { useEffect, useMemo, useState } from 'react';
import { ActionBar, Button, EmptyState, GroupSkeleton, ListGroup, ListRow, PageHeader, SearchField } from '../ds';
import { PageSkeleton } from '../ui/Skeletons';
import { db } from '../lib/api';
import { addPattern, defaultPattern, disablePattern, merchantError, normWords, photoUrl, type Merchant } from '../lib/merchants';
import { shortDate } from '../lib/format';
import { navigateBack, useApp } from '../store';
import { Emo, Icon, Sheet } from '../ui';
import { Face, PhotoSheet } from '../ui/Merchant';

/** One merchant without a logo, from any space: a catalog merchant (merchant_id) or a name that isn't in the catalog yet. */
interface Row {
  merchant_id: string | null;
  name: string;
  raw: string | null;
  movements: number;
  last_at: string;
}

const keyOf = (r: Row) => r.merchant_id || `n:${normWords(r.name).trim()}`;

const skip = (r: Row, on: boolean) => db.rpc('admin_merchant_photo_skip', { p_merchant: r.merchant_id, p_name: r.name, p_skip: on });

/**
 * Admin only (#/sin-logo): every merchant across all spaces that still has no logo, the most used first.
 * Saving a photo takes it off the list, along with any other name the new merchant's words cover.
 * "Ignorar" hides one for good (saved in the database, with undo).
 */
export function SinLogo() {
  const { space, merchants, version, toast } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Row | null>(null);
  const [peek, setPeek] = useState<Row | null>(null);
  const [merge, setMerge] = useState<Row | null>(null);
  const [done, setDone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    db.rpc<Row[]>('admin_merchants_without_photo')
      .then((r) => live && setRows(r || []), () => live && setRows([]));
    return () => { live = false; };
  }, [version]);

  const list = useMemo(() => {
    const left = (rows || []).filter((r) => !done.has(keyOf(r)));
    const n = normWords(q).trim();
    if (!n) return left;
    return left.filter((r) => normWords(`${r.name} ${r.raw || ''}`).includes(` ${n}`));
  }, [rows, done, q]);

  const finish = (r: Row) => setDone((d) => new Set(d).add(keyOf(r)));
  const back = (r: Row) => setDone((d) => { const n = new Set(d); n.delete(keyOf(r)); return n; });

  async function ignore(r: Row) {
    const k = keyOf(r);
    setDone((d) => new Set(d).add(k));
    try {
      await skip(r, true);
      toast(`${r.name} ignorado`, async () => {
        await skip(r, false);
        setDone((d) => { const n = new Set(d); n.delete(k); return n; });
      });
    } catch {
      setDone((d) => { const n = new Set(d); n.delete(k); return n; });
      toast('No se pudo ignorar');
    }
  }

  if (!rows || !space) return <PageSkeleton title="Comercios sin logo" back nav={false} hero={false}><GroupSkeleton rows={6} value={false} /></PageSkeleton>;
  const left = rows.filter((r) => !done.has(keyOf(r))).length;
  const merchant = pick?.merchant_id ? merchants.find((m) => m.id === pick.merchant_id) || null : null;

  return (
    <div className="page no-nav">
      <PageHeader title="Comercios sin logo" onBack={navigateBack} />
      <div className="page-body">
      {left === 0 ? (
        <EmptyState icon={<Icon name="checkCircle" size={24} />} title="Todos tienen logo">Cuando aparezca un comercio nuevo sin foto, va a salir acá.</EmptyState>
      ) : (
        <>
          <SearchField size="md" value={q} onChange={setQ} placeholder="Buscar comercio" aria-label="Buscar comercio" />
          <ListGroup title={left === 1 ? '1 comercio' : `${left} comercios`} note="De todos los espacios. Al ponerle foto o ignorarlo sale de la lista.">
            {list.length === 0 ? (
              <p className="group-pad page-text">No hay comercios sin logo con ese nombre.</p>
            ) : list.map((r) => {
              const raw = r.raw && normWords(r.raw).trim() !== normWords(r.name).trim() ? r.raw : null;
              const count = r.movements === 1 ? '1 movimiento' : `${r.movements} movimientos`;
              return (
                <ListRow
                  key={keyOf(r)}
                  leading={<Face m={{ id: '', name: r.name, photo_path: null, created_by: null, merchant_patterns: [] }} />}
                  title={r.name}
                  detail={raw ? `${count} · ${raw}` : count}
                  actions={<Button variant="secondary" size="xs" onClick={() => ignore(r)} aria-label={`Ignorar ${r.name}`}>Ignorar</Button>}
                  chevron
                  onClick={() => setPeek(r)}
                  label={`Ver los movimientos de ${r.name}`}
                />
              );
            })}
          </ListGroup>
        </>
      )}
      </div>
      {peek && (
        <PeekSheet
          r={peek}
          onPhoto={() => { setPick(peek); setPeek(null); }}
          onMerge={() => { setMerge(peek); setPeek(null); }}
          onIgnore={() => { ignore(peek); setPeek(null); }}
          onClose={() => setPeek(null)}
        />
      )}
      {merge && <AdminMergeSheet r={merge} onDone={() => finish(merge)} onUndo={() => back(merge)} onClose={() => setMerge(null)} />}
      {pick && (
        <PhotoSheet
          spaceId={space.id}
          merchant={merchant}
          suggestion={pick.raw || pick.name}
          nameHint={pick.name}
          onSaved={() => setDone((d) => new Set(d).add(keyOf(pick)))}
          onClose={() => setPick(null)}
        />
      )}
    </div>
  );
}

interface Movement {
  id: string;
  occurred_at: string;
  raw_merchant: string | null;
  merchant: string | null;
  category: string | null;
  emoji: string | null;
  color: string | null;
}

/** One row of the list, opened: its movements (date, what the bank said, category; no amounts) and what to do with it. */
function PeekSheet({ r, onPhoto, onMerge, onIgnore, onClose }: { r: Row; onPhoto: () => void; onMerge: () => void; onIgnore: () => void; onClose: () => void }) {
  const [moves, setMoves] = useState<Movement[] | null>(null);
  useEffect(() => {
    let live = true;
    db.rpc<Movement[]>('admin_merchant_movements', { p_merchant: r.merchant_id, p_name: r.name })
      .then((m) => live && setMoves(m || []), () => live && setMoves([]));
    return () => { live = false; };
  }, [r.merchant_id, r.name]);

  const year = new Date().getFullYear();
  const when = (iso: string) => {
    const y = new Date(iso).getFullYear();
    return y === year ? shortDate(iso) : `${shortDate(iso)} ${y}`;
  };
  const count = r.movements === 1 ? '1 movimiento' : `${r.movements} movimientos`;

  return (
    <Sheet title={r.name} onClose={onClose}>
      {!moves ? (
        <GroupSkeleton rows={Math.min(r.movements, 4)} value={false} />
      ) : (
        <ListGroup title={count} note={r.movements > moves.length ? `Los ${moves.length} más recientes.` : undefined}>
          {moves.map((m) => {
            const bank = m.raw_merchant || m.merchant || r.name;
            const clean = m.merchant && normWords(m.merchant).trim() !== normWords(bank).trim() ? m.merchant : null;
            return (
              <ListRow
                key={m.id}
                leading={<Emo e={m.emoji || '🧾'} color={m.color} size={40} />}
                title={bank}
                detail={[when(m.occurred_at), m.category || 'Sin categoría', clean || ''].filter(Boolean) as string[]}
              />
            );
          })}
        </ListGroup>
      )}
      <div className="col gap8">
        <Button variant="secondary" size="lg" block leading={<Icon name="link" size={16} />} onClick={onMerge}>Unir con otro comercio</Button>
        <Button variant="ghost" size="lg" block onClick={onIgnore}>Ignorar</Button>
      </div>
      <ActionBar>
        <Button variant="primary" size="lg" block leading={<Icon name="camera" size={18} />} onClick={onPhoto}>Poner foto</Button>
      </ActionBar>
    </Sheet>
  );
}

/**
 * Join a row with a merchant that already exists (usually one with a logo). A catalog merchant moves all
 * its words to the other one; a loose name gets the words that identify it. Everything past and future
 * follows, for everyone. Undo puts the words back where they were.
 */
function AdminMergeSheet({ r, onDone, onUndo, onClose }: { r: Row; onDone: () => void; onUndo: () => void; onClose: () => void }) {
  const { merchants, toast, reloadMeta, bump } = useApp();
  const source = r.merchant_id ? merchants.find((m) => m.id === r.merchant_id) || null : null;
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<Merchant | null>(null);
  const [pattern, setPattern] = useState(defaultPattern(r.raw || r.name));
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const n = normWords(q).trim();
    const pool = merchants.filter((m) => m.id !== r.merchant_id);
    const hit = (m: Merchant) => normWords(m.name).includes(` ${n}`) || m.merchant_patterns.some((p) => p.active && ` ${p.norm} `.includes(` ${n}`));
    const found = n ? pool.filter(hit) : pool;
    // the ones with a logo first: that's usually why they're being joined
    return [...found].sort((a, b) => Number(!!b.photo_path) - Number(!!a.photo_path) || a.name.localeCompare(b.name)).slice(0, 40);
  }, [q, merchants, r.merchant_id]);

  const moving = source ? source.merchant_patterns.filter((p) => p.active) : [];
  const clean = pattern.replace(/\s+/g, ' ').trim();
  const covers = normWords(`${r.raw || ''} | ${r.name}`).includes(normWords(clean)) && normWords(clean).trim().length >= 3;
  const canSave = !busy && !!target && (source ? moving.length > 0 : covers);

  async function save() {
    if (!canSave || !target) return;
    setBusy(true);
    try {
      let undo: () => Promise<unknown>;
      if (source) {
        for (const p of moving) await addPattern(target.id, p.pattern);
        undo = async () => { for (const p of moving) await addPattern(source.id, p.pattern); };
      } else {
        const norm = normWords(clean).trim();
        const prev = merchants.find((m) => m.merchant_patterns.some((p) => p.active && p.norm === norm)) || null;
        const id = await addPattern(target.id, clean);
        undo = prev && prev.id !== target.id ? () => addPattern(prev.id, clean) : () => disablePattern(id);
      }
      await reloadMeta();
      bump();
      onDone();
      toast(`${r.name} → ${target.name}`, async () => {
        await undo();
        await reloadMeta();
        bump();
        onUndo();
      });
      onClose();
    } catch (e) {
      toast(merchantError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!target) {
    return (
      <Sheet title={`Unir ${r.name}`} onClose={onClose}>
        <SearchField size="md" value={q} onChange={setQ} placeholder="Buscar comercio" aria-label="Buscar comercio" autoFocus />
        <ListGroup title="¿Con cuál comercio?">
          {list.length === 0 ? (
            <p className="group-pad page-text">No hay comercios con ese nombre.</p>
          ) : list.map((m) => (
            <ListRow
              key={m.id}
              leading={<Face m={m} size={40} />}
              title={m.name}
              detail={photoUrl(m) ? undefined : 'Sin logo'}
              chevron
              onClick={() => setTarget(m)}
            />
          ))}
        </ListGroup>
      </Sheet>
    );
  }

  return (
    <Sheet title={`Unir a ${target.name}`} onClose={onClose}>
      <ListGroup>
        <ListRow leading={<Face m={target} size={40} />} title={target.name} actions={<Button variant="secondary" size="xs" onClick={() => setTarget(null)}>Cambiar</Button>} />
      </ListGroup>
      {source ? (
        <span className="hint">
          Todo lo de {source.name} ({moving.map((p) => `“${p.pattern}”`).join(', ') || 'sin palabras'}) pasa a {target.name}, de antes y de ahora. Sirve para todos.
        </span>
      ) : (
        <>
          <label className="col gap6">
            <span className="field-label">Los movimientos que digan</span>
            <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Ej. AMPM" />
          </label>
          <span className="hint">
            {covers
              ? `Todo lo que diga “${clean}”, de antes y de ahora, queda en ${target.name}. Sirve para todos.`
              : `Tiene que ser parte de “${r.raw || r.name}”, con al menos 3 letras.`}
          </span>
        </>
      )}
      <ActionBar>
        <Button variant="primary" size="lg" block onClick={save} disabled={!canSave}>{busy ? 'Uniendo…' : 'Unir'}</Button>
      </ActionBar>
    </Sheet>
  );
}
