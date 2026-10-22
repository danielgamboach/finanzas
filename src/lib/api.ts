// Minimal Supabase client (Auth + PostgREST) built on fetch, no dependencies.
export const SUPABASE_URL = 'https://vzgnujopgryuskixcnnx.supabase.co';
// Public anon key: safe to ship in the client, access is enforced by row level security.
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6Z251am9wZ3J5dXNraXhjbm54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMTIwMDAsImV4cCI6MjEwNzc4ODAwMH0.gObwp-66r3G9o314yeIefYIhdNer6M9MAugTaQgI3k4';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  user: { id: string; email: string; user_metadata?: Record<string, unknown> };
}

const KEY = 'finanzas.session';
let session: Session | null = load();
const listeners = new Set<(s: Session | null) => void>();

function load(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function save(s: Session | null) {
  session = s;
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(s));
}

export function onAuthChange(fn: (s: Session | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSession() {
  return session;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function authFetch(path: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && (data.msg || data.error_description || data.message || data.error)) || 'Error de autenticación';
    throw new ApiError(String(msg), res.status);
  }
  return data;
}

function toSession(data: any): Session {
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user,
  };
}

export const auth = {
  async signIn(email: string, password: string) {
    const data = await authFetch('token?grant_type=password', { email, password });
    save(toSession(data));
  },
  async signUp(email: string, password: string, name: string) {
    const data = await authFetch('signup', {
      email,
      password,
      data: { name },
      // email confirmation redirect comes back to the app
      ...(typeof location !== 'undefined' ? { redirect_to: location.origin } : {}),
    });
    if (data.access_token) save(toSession(data));
    return Boolean(data.access_token);
  },
  async recover(email: string) {
    await authFetch('recover', { email });
  },
  async signOut() {
    const s = session;
    save(null);
    if (s) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${s.access_token}` },
      }).catch(() => undefined);
    }
  },
  // Handles the tokens Supabase appends to the URL after confirming an email or a recovery link.
  consumeUrlTokens() {
    if (typeof location === 'undefined' || !location.hash.includes('access_token=')) return;
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    const access = p.get('access_token');
    const refresh = p.get('refresh_token');
    if (access && refresh) {
      save({
        access_token: access,
        refresh_token: refresh,
        expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + 3600,
        user: session?.user || { id: '', email: '' },
      });
      history.replaceState(null, '', location.pathname + '#/');
      void refreshUser();
    }
  },
};

async function refreshUser() {
  if (!session) return;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
  });
  if (res.ok) {
    const user = await res.json();
    save({ ...session, user });
  }
}

let refreshing: Promise<void> | null = null;
async function ensureFresh() {
  if (!session) return;
  if (session.expires_at - 60 > Date.now() / 1000) return;
  if (!refreshing) {
    refreshing = authFetch('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then((data) => save(toSession(data)))
      .catch(() => save(null))
      .finally(() => {
        refreshing = null;
      });
  }
  await refreshing;
}

async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  await ensureFresh();
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    save(null);
    throw new ApiError('Tu sesión expiró', 401);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError((data && (data.message || data.hint)) || `Error ${res.status}`, res.status);
  return data;
}

type Val = string | number | boolean | null;
const enc = (v: Val) => encodeURIComponent(String(v));

class Query<T = any> implements PromiseLike<T[]> {
  private filters: string[] = [];
  private extra: string[] = [];
  constructor(private table: string, private cols = '*') {}
  eq(c: string, v: Val) { this.filters.push(`${c}=eq.${enc(v)}`); return this; }
  neq(c: string, v: Val) { this.filters.push(`${c}=neq.${enc(v)}`); return this; }
  gte(c: string, v: Val) { this.filters.push(`${c}=gte.${enc(v)}`); return this; }
  lt(c: string, v: Val) { this.filters.push(`${c}=lt.${enc(v)}`); return this; }
  in(c: string, vs: Val[]) { this.filters.push(`${c}=in.(${vs.map((v) => enc(v)).join(',')})`); return this; }
  is(c: string, v: null | boolean) { this.filters.push(`${c}=is.${v}`); return this; }
  /** PostgREST or-filter, e.g. or('merchant.eq."X"', 'merchant_key.eq."Y"'). */
  or(...conds: string[]) { this.filters.push(`or=${encodeURIComponent(`(${conds.join(',')})`)}`); return this; }
  order(c: string, asc = true) { this.extra.push(`order=${c}.${asc ? 'asc' : 'desc'}`); return this; }
  limit(n: number) { this.extra.push(`limit=${n}`); return this; }
  private url() {
    return `${this.table}?${[`select=${encodeURIComponent(this.cols)}`, ...this.filters, ...this.extra].join('&')}`;
  }
  then<A = T[], B = never>(ok?: ((v: T[]) => A | PromiseLike<A>) | null, err?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return (rest('GET', this.url()) as Promise<T[]>).then(ok, err);
  }
}

export const db = {
  from<T = any>(table: string, cols = '*') {
    return new Query<T>(table, cols);
  },
  async insert<T = any>(table: string, rows: object | object[]): Promise<T[]> {
    return rest('POST', table, rows, 'return=representation');
  },
  async upsert<T = any>(table: string, rows: object | object[], onConflict: string): Promise<T[]> {
    return rest('POST', `${table}?on_conflict=${onConflict}`, rows, 'return=representation,resolution=merge-duplicates');
  },
  async update<T = any>(table: string, match: Record<string, Val>, patch: object): Promise<T[]> {
    const q = Object.entries(match).map(([k, v]) => `${k}=eq.${enc(v)}`).join('&');
    return rest('PATCH', `${table}?${q}`, patch, 'return=representation');
  },
  /** Same patch on many rows by id, in chunks so the URL stays short. */
  async updateIds(table: string, ids: string[], patch: object) {
    for (let i = 0; i < ids.length; i += 80) {
      await rest('PATCH', `${table}?id=in.(${ids.slice(i, i + 80).map((v) => enc(v)).join(',')})`, patch, 'return=minimal');
    }
  },
  async remove(table: string, match: Record<string, Val>) {
    const q = Object.entries(match).map(([k, v]) => `${k}=eq.${enc(v)}`).join('&');
    return rest('DELETE', `${table}?${q}`);
  },
  async rpc<T = any>(fn: string, args: object = {}): Promise<T> {
    return rest('POST', `rpc/${fn}`, args);
  },
  async fn<T = any>(name: string, body: object): Promise<T> {
    await ensureFresh();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data?.error || `Error ${res.status}`, res.status);
    return data as T;
  },
};

/** Supabase Storage: just what the app needs (upload, delete, public URL). */
export const storage = {
  publicUrl(bucket: string, path: string) {
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
  },
  async upload(bucket: string, path: string, file: Blob) {
    await ensureFresh();
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
        'Content-Type': file.type || 'application/octet-stream',
        'cache-control': '31536000',
        'x-upsert': 'true',
      },
      body: file,
    });
    if (!res.ok) throw new ApiError((await res.json().catch(() => ({})))?.message || `Error ${res.status}`, res.status);
  },
  async remove(bucket: string, paths: string[]) {
    await ensureFresh();
    await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    }).catch(() => undefined);
  },
};
