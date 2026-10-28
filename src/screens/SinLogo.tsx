import { useEffect, useMemo, useState } from 'react';
import { EmptyState, ListItem, SearchField } from '../ds';
import { db } from '../lib/api';
import { normWords } from '../lib/merchants';
import { useApp } from '../store';
import { BackBar, Icon, Loading } from '../ui';
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

/**
 * Admin only (#/sin-logo): every merchant across all spaces that still has no logo, the most used first.
 * Saving a photo takes it off the list, along with any other name the new merchant's words cover.
 */
export function SinLogo() {
  const { space, merchants, version } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Row | null>(null);
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

  if (!rows || !space) return <Loading />;
  const left = rows.filter((r) => !done.has(keyOf(r))).length;
  const merchant = pick?.merchant_id ? merchants.find((m) => m.id === pick.merchant_id) || null : null;

  return (
    <div className="screen no-nav">
      <BackBar title="Comercios sin logo" />
      {left === 0 ? (
        <EmptyState icon="🎉" title="Todos tienen logo">Cuando aparezca un comercio nuevo sin foto, va a salir acá.</EmptyState>
      ) : (
        <>
          <span className="muted small px4">
            {left === 1 ? '1 comercio' : `${left} comercios`} de todos los espacios. Al ponerle foto sale de la lista.
          </span>
          <SearchField value={q} onChange={setQ} placeholder="Buscar comercio" aria-label="Buscar comercio" />
          {list.length === 0 ? (
            <span className="muted small px4">No hay comercios sin logo con ese nombre.</span>
          ) : (
            <div className="card list">
              {list.map((r) => {
                const raw = r.raw && normWords(r.raw).trim() !== normWords(r.name).trim() ? r.raw : null;
                const count = r.movements === 1 ? '1 movimiento' : `${r.movements} movimientos`;
                return (
                  <ListItem
                    key={keyOf(r)}
                    density="sm"
                    leading={<Face m={{ id: '', name: r.name, photo_path: null, created_by: null, merchant_patterns: [] }} />}
                    title={r.name}
                    subtitle={raw ? `${count} · ${raw}` : count}
                    trailing={<Icon name="camera" size={20} />}
                    onClick={() => setPick(r)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
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
