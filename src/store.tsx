import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { auth, db, getSession, onAuthChange, type Session } from './lib/api';
import type { Account, Category, Currency, Member, Profile, Space, Tag, Tx } from './lib/types';
import type { Range } from './lib/calc';

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
  cur: Currency;
  toggleCur: () => void;
  fx: number;
  version: number;
  bump: () => void;
  reloadMeta: () => Promise<void>;
  ready: boolean;
  toast: (msg: string) => void;
  toastMsg: string | null;
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
  const [cur, setCur] = useState<Currency>((read('finanzas.cur') as Currency) || 'CRC');
  const [fx, setFx] = useState(460);
  const [version, setVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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
  }, [userId]);

  useEffect(() => {
    setReady(false);
    if (!userId) return;
    loadBase().catch(() => setReady(true));
    db.rpc('generate_my_recurring').catch(() => undefined);
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

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), 2600);
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
  }), [session, userId, profile, profiles, spaces, members, spaceId, categories, accounts, tags, cur, fx, version, reloadMeta, ready, toast, toastMsg]);

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

export const go = (path: string) => {
  location.hash = path;
};

export function useQuery() {
  const q = location.hash.split('?')[1] || '';
  return new URLSearchParams(q);
}
