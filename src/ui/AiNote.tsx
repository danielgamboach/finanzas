import { useEffect, useState } from 'react';
import { db } from '../lib/api';
import type { Tx } from '../lib/types';
import { Icon } from '.';

interface Insight { emoji: string; text: string; tone: 'good' | 'neutral' | 'warn' | 'bad'; fp: string; at: number }

/** Changes whenever something the message talks about changes: a new or edited movement, a limit, or the day. */
export function fingerprint(txs: Tx[], categories: { id: string; limit_amount: number | null; limit_period: string | null }[], today: string) {
  let h = 5381;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  };
  feed(today);
  txs.forEach((t) => feed(`${t.id}${t.category_id}${t.amount_crc}${(t as Tx & { updated_at?: string }).updated_at || ''}`));
  categories.forEach((c) => feed(`${c.id}${c.limit_amount}${c.limit_period}`));
  return String(h >>> 0);
}

function readInsight(spaceId: string): Insight | null {
  try {
    const raw = localStorage.getItem(`finanzas.insight.${spaceId}`);
    return raw ? (JSON.parse(raw) as Insight) : null;
  } catch {
    return null;
  }
}
function writeInsight(spaceId: string, v: Insight) {
  try {
    localStorage.setItem(`finanzas.insight.${spaceId}`, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** The AI's read of the month, first thing in Análisis. Tap refresh for another take. */
export function AiNote({ spaceId, fp, ready }: { spaceId: string; fp: string; ready: boolean }) {
  const [note, setNote] = useState<Insight | null>(() => readInsight(spaceId));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function load(force = false) {
    const cached = readInsight(spaceId);
    if (!force && cached && cached.fp === fp) return setNote(cached);
    if (!force && cached && Date.now() - cached.at < 20_000) return setNote(cached);
    setBusy(true);
    setFailed(false);
    try {
      const r = await db.fn<{ ok: boolean; emoji?: string; text?: string; tone?: Insight['tone'] }>('insight', { space_id: spaceId, prev: cached?.text });
      if (r.ok && r.text) {
        const v: Insight = { emoji: r.emoji || '✨', text: r.text, tone: r.tone || 'neutral', fp, at: Date.now() };
        writeInsight(spaceId, v);
        setNote(v);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setNote(readInsight(spaceId));
  }, [spaceId]);
  useEffect(() => {
    if (ready && fp) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, fp, ready]);

  if (!note && failed) return null;
  return (
    <section className={`ai-card tone-${note?.tone || 'neutral'}`} aria-live="polite" aria-busy={busy}>
      <span className="ai-card-emoji" aria-hidden="true">{note?.emoji || '✨'}</span>
      {note ? (
        <p className={busy ? 'ai-card-text busy' : 'ai-card-text'}>{note.text}</p>
      ) : (
        <span className="ai-card-skel" aria-label="Pensando…"><span /><span /></span>
      )}
      <button className={busy ? 'ai-card-refresh spin' : 'ai-card-refresh'} onClick={() => load(true)} disabled={busy} aria-label="Otro mensaje">
        <Icon name="refresh" size={16} />
      </button>
    </section>
  );
}
