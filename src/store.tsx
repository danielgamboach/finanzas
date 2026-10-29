import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, getSession, onAuthChange, type Session } from './lib/api';
import type { Account, Category, Currency, Member, Profile, Space, Tag, Tx } from './lib/types';
import type { Range } from './lib/calc';
import { loadMerchants, type Merchant } from './lib/merchants';

interface Ctx {
  session: Session | null;
  userId: string;
  profile: Profile | null;
  profiles: Record<string, Profile>;
  spaces: Space[];
  members: Member[];
  space: Space | null;
  setSpaceId: (id: string) => void;
  categories: Category[];
  accounts: Account[];
  tags: Tag[];
  /** The shared merchant catalog (logos and the names that point to each merchant). */
  merchants: Merchant[];
  /** App admin: can replace logos and manage the catalog. */
  isAdmin: boolean;
  cur: Currency;
  toggleCur: () => void;
  fx: number;
  version: number;
  bump: () => void;
  reloadMeta: () => Promise<void>;
  ready: boolean;
  /** A short message; with `undo` it stays ~6 s and offers "Deshacer". */
  toast: (msg: string, undo?: () => Promise<unknown> | unknown) => void;
  toastMsg: string | null;
  toastUndo: (() => Promise<unknown> | unknown) | null;
  clearToast: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

const read = (k: string) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(getSession());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [spaceId, setSpaceIdState] = useState<string | null>(read('finanzas.space'));
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [cur, setCur] = useState<Currency>((read('finanzas.cur') as Currency) || 'CRC');
  const [fx, setFx] = useState(460);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastUndo, setToastUndo] = useState<{ fn: () => Promise<unknown> | unknown } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    auth.consumeUrlTokens();
    return onAuthChange(setSession) as unknown as () => void;
  }, []);

  const userId = session?.user?.id || '';

  const loadBase = useCallback(async () => {
    if (!userId) return;
    const [sp, mem, profs, rate] = await Promise.all([
      db.from<Space>('spaces').order('created_at'),
      db.from<Member>('space_members'),
      db.from<Profile>('profiles'),
      db.from<{ crc_per_usd: number }>('fx_rates', 'crc_per_usd').order('rate_date', false).limit(1),
    ]);
    setSpaces(sp);
    setMembers(mem);
    const map: Record<string, Profile> = {};
    profs.forEach((p) => (map[p.id] = p));
    setProfiles(map);
    setProfile(map[userId] || null);
    if (rate[0]) setFx(Number(rate[0].crc_per_usd));
    setSpaceIdState((prev) => {
      if (prev && sp.some((s) => s.id === prev)) return prev;
      const shared = sp.find((s) => s.kind === 'shared');
      return (shared || sp[0])?.id || null;
    });
    setReady(true);
    // the catalog and the admin flag are optional: never block the app if they fail to load
    loadMerchants().then(setMerchants, () => undefined);
    db.rpc<boolean>('is_app_admin').then((v) => setIsAdmin(v === true), () => setIsAdmin(false));
  }, [userId]);

  useEffect(() => {
    setReady(false);
    if (!userId) return;
    loadBase().catch(() => setReady(true));
  }, [userId, loadBase]);

  const loadSpaceMeta = useCallback(async () => {
    if (!spaceId || !userId) return;
    const [c, a, t] = await Promise.all([
      db.from<Category>('categories').eq('space_id', spaceId).order('sort'),
      db.from<Account>('accounts').eq('space_id', spaceId).order('created_at'),
      db.from<Tag>('tags').eq('space_id', spaceId).order('name'),
    ]);
    setCategories(c);
    setAccounts(a);
    setTags(t);
  }, [spaceId, userId]);

  useEffect(() => {
    loadSpaceMeta().catch(() => undefined);
  }, [loadSpaceMeta]);

  const reloadMeta = useCallback(async () => {
    await Promise.all([loadBase(), loadSpaceMeta()]);
  }, [loadBase, loadSpaceMeta]);

  const clearToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(null);
    setToastUndo(null);
  }, []);
  const toast = useCallback((msg: string, undo?: () => Promise<unknown> | unknown) => {
    window.clearTimeout(toastTimer.current);
    setToastMsg(msg);
    setToastUndo(undo ? { fn: undo } : null);
    toastTimer.current = window.setTimeout(() => {
      setToastMsg(null);
      setToastUndo(null);
    }, undo ? 6000 : 2600);
  }, []);

  const value = useMemo<Ctx>(() => ({
    session,
    userId,
    profile,
    profiles,
    spaces,
    members,
    space: spaces.find((s) => s.id === spaceId) || null,
    setSpaceId: (id: string) => {
      write('finanzas.space', id);
      setSpaceIdState(id);
    },
    categories,
    accounts,
    tags,
    merchants,
    isAdmin,
    cur,
    toggleCur: () => setCur((c) => {
      const n = c === 'CRC' ? 'USD' : 'CRC';
      write('finanzas.cur', n);
      return n;
    }),
    fx,
    version,
    bump: () => setVersion((v) => v + 1),
    reloadMeta,
    ready,
    toast,
    toastMsg,
    toastUndo: toastUndo?.fn ?? null,
    clearToast,
  }), [session, userId, profile, profiles, spaces, members, spaceId, categories, accounts, tags, merchants, isAdmin, cur, fx, version, reloadMeta, ready, toast, toastMsg, toastUndo, clearToast]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider missing');
  return c;
}

export const TX_SELECT = '*,transaction_tags(tags(name))';

export function useTxs(range: Range | null, spaceId?: string | null) {
  const { version, space } = useApp();
  const sid = spaceId === undefined ? space?.id : spaceId;
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const key = range ? `${range.from}|${range.to}` : '';
  useEffect(() => {
    if (!range || !sid) return;
    let alive = true;
    setLoading(true);
    db.from<Tx>('transactions', TX_SELECT)
      .eq('space_id', sid)
      .gte('occurred_at', range.from)
      .lt('occurred_at', range.to)
      .order('occurred_at', false)
      .limit(2000)
      .then((rows) => {
        if (alive) setTxs(rows);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, sid, version]);
  return { txs, loading };
}

export function useRoute() {
  const get = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const [path, setPath] = useState(get());
  useEffect(() => {
    const fn = () => {
      setPath(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return path;
}

// On the phone, the detail and the movement form open without adding a page to the browser history: iOS turns an
// edge swipe into its own back/forward navigation, which fought the app's swipes (menu, new movement) and drew a
// second copy of the screen. Each one remembers where it came from and closeModal() goes back there.
const MODAL_PATH = /^\/(agregar|mov\/)/;
const isPhone = () => !window.matchMedia?.('(min-width: 1024px)').matches;
const modalReturns: string[] = [];
const here = () => location.hash.replace(/^#/, '') || '/';

export const go = (path: string) => {
  if (isPhone() && MODAL_PATH.test(path)) {
    modalReturns.push(here());
    location.replace(`#${path}`);
    return;
  }
  location.hash = path;
};

/** Top-level pages on the phone (menu destinations) replace each other instead of piling up in the history. */
export const goTop = (path: string) => {
  if (here() === path) return;
  if (isPhone()) location.replace(`#${path}`);
  else location.hash = path;
};

/** Closes the detail or the form: back to where it was opened from (`all`: past every open layer, after a delete). */
export function closeModal(all = false) {
  let r = modalReturns.pop();
  if (all) while (r !== undefined && MODAL_PATH.test(r)) r = modalReturns.pop();
  if (r !== undefined) location.replace(`#${r}`);
  else if (history.length > 1) history.back();
  else location.replace('#/');
}

type VT = { finished: Promise<void> };
const startVT = (cb: () => Promise<void>): VT | null => {
  const d = document as Document & { startViewTransition?: (cb: () => Promise<void>) => VT };
  if (!d.startViewTransition || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
  return d.startViewTransition(cb);
};
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Like go(), but morphs shared elements (view-transition-name) between the two screens when the browser can. */
export function navigate(path: string) {
  if (!startVT(async () => {
    location.hash = path;
    await nextPaint();
  })) go(path);
}

/** history.back() with the same morph. */
export function navigateBack() {
  if (history.length <= 1) return navigate('/');
  if (!startVT(() => new Promise<void>((res) => {
    const done = () => nextPaint().then(res);
    addEventListener('hashchange', done, { once: true });
    history.back();
    setTimeout(done, 400); // never block the screen if the event doesn't come
  }))) history.back();
}

export function useQuery() {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q);
}
