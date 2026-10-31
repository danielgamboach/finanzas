import React, { useEffect, useMemo, useState } from 'react';
import { ListGroup, ListRow } from '../ds';
import { db } from '../lib/api';
import { photoUrl } from '../lib/merchants';
import type { Category } from '../lib/types';
import { useApp } from '../store';
import { Emo } from '.';

type Known = { name: string; n: number; categoryId: string | null; merchantId: string | null };

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** The merchants this space has used (most used first), with the category each one went to last. */
function useKnownMerchants(spaceId: string) {
  const { version } = useApp();
  const [list, setList] = useState<Known[]>([]);
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    db.from<{ merchant: string | null; category_id: string | null; merchant_id: string | null }>('transactions', 'merchant,category_id,merchant_id')
      .eq('space_id', spaceId)
      .order('occurred_at', false)
      .limit(1000)
      .then((rows) => {
        if (!alive) return;
        const by = new Map<string, Known>();
        for (const r of rows) {
          const name = (r.merchant || '').trim();
          if (!name) continue;
          const k = norm(name);
          const cur = by.get(k);
          if (cur) cur.n += 1;
          // rows come newest first: the first one seen holds the latest category
          else by.set(k, { name, n: 1, categoryId: r.category_id, merchantId: r.merchant_id });
        }
        setList([...by.values()].sort((a, b) => b.n - a.n));
      })
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [spaceId, version]);
  return list;
}

/**
 * "comercio o detalle": the merchant right under the amount, as big as it and left aligned. While typing it suggests
 * the merchants already used in this space (and the shared catalog); picking one fills the name, its logo and, if
 * none is chosen yet, the category it usually goes to. `after` sits right after the text (the logo and category faces).
 */
export function MerchantInput({ value, onChange, onPick, onDone, spaceId, cats, placeholder, suggest = true, countWord = ['compra', 'compras'], after }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (name: string, categoryId: string | null, merchantId: string | null) => void;
  /** Enter on the keyboard: the merchant step is done. */
  onDone?: () => void;
  spaceId: string;
  cats: Category[];
  placeholder: string;
  suggest?: boolean;
  countWord?: [string, string];
  after?: React.ReactNode;
}) {
  const { merchants } = useApp();
  const known = useKnownMerchants(spaceId);
  const [focus, setFocus] = useState(false);
  const q = norm(value);

  const matches = useMemo(() => {
    if (!suggest || q.length < 1) return [];
    const seen = new Set<string>();
    const out: (Known & { score: number })[] = [];
    const add = (k: Known) => {
      const key = norm(k.name);
      if (seen.has(key) || key === q) return;
      const at = key.indexOf(q);
      const word = at === 0 || (at > 0 && /[\s.-]/.test(key[at - 1]));
      if (at < 0) return;
      seen.add(key);
      out.push({ ...k, score: (word ? 2 : 1) * 1000 + Math.min(k.n, 999) });
    };
    known.forEach(add);
    merchants.forEach((m) => add({ name: m.name, n: 0, categoryId: null, merchantId: m.id }));
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [q, known, merchants, suggest]);

  const open = focus && matches.length > 0;
  return (
    <div className="merchant-input">
      <div className="merchant-line">
        <label className="merchant-field" data-value={value || placeholder}>
          <span className="sr">Comercio o detalle</span>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocus(true)}
            // a beat, so a tap on a suggestion lands before the list goes away
            onBlur={() => window.setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onDone?.();
              }
            }}
            placeholder={placeholder}
            // as narrow as it gets: the hidden copy of the text (::after) sets the width, so the faces follow the text
            size={1}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="done"
            aria-autocomplete="list"
            aria-expanded={open}
          />
        </label>
        {!focus && after}
      </div>
      {open && (
        <ListGroup className="merchant-suggest" title="Sugerencias">
          {matches.map((m) => {
            const cat = cats.find((c) => c.id === m.categoryId);
            const cm = m.merchantId ? merchants.find((x) => x.id === m.merchantId) : null;
            const img = cm ? photoUrl(cm) : null;
            return (
              <ListRow
                key={m.name}
                density="sm"
                leading={<Emo e={cat?.emoji || '🛍️'} color={cat?.color} size={40} img={img} />}
                title={m.name}
                detail={[cat?.name, m.n ? `${m.n} ${m.n === 1 ? countWord[0] : countWord[1]}` : null].filter(Boolean).join(' · ') || 'Del catálogo'}
                onClick={() => {
                  onPick(m.name, m.categoryId && cats.some((c) => c.id === m.categoryId) ? m.categoryId : null, m.merchantId);
                  setFocus(false);
                  (document.activeElement as HTMLElement | null)?.blur?.();
                }}
              />
            );
          })}
        </ListGroup>
      )}
    </div>
  );
}
