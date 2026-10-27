import { useEffect, useRef, useState } from 'react';
import { Button } from '../ds';
import { db } from '../lib/api';
import { useRecurring } from '../lib/recurring';
import { useApp } from '../store';
import { Icon, Sheet } from '.';

/** Opens "Preguntale a Kai" from anywhere, optionally with a question ready to send. */
export function openKai(question?: string) {
  dispatchEvent(new CustomEvent('kai:open', { detail: question }));
}

interface Result { q: string; a: string | null; error?: string }
// the last answer per space, so closing and reopening doesn't lose it (not a history)
const lastBySpace = new Map<string, Result>();

/** Mounted once; listens for openKai(). */
export function KaiHost() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<string | undefined>();
  useEffect(() => {
    const on = (e: Event) => {
      setSeed((e as CustomEvent<string | undefined>).detail);
      setOpen(true);
    };
    addEventListener('kai:open', on);
    return () => removeEventListener('kai:open', on);
  }, []);
  if (!open) return null;
  return <KaiSheet seed={seed} onClose={() => setOpen(false)} />;
}

function KaiSheet({ seed, onClose }: { seed?: string; onClose: () => void }) {
  const { space } = useApp();
  const { items } = useRecurring(space?.id);
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Result | null>(() => (space ? lastBySpace.get(space.id) || null : null));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const shared = space?.kind === 'shared';

  async function ask(question: string) {
    const text = question.trim();
    if (!space || text.length < 3 || busy) return;
    setQ('');
    setBusy(true);
    setRes({ q: text, a: null });
    input.current?.blur();
    let out: Result;
    try {
      const r = await db.fn<{ ok: boolean; answer?: string; reason?: string }>('ask', { space_id: space.id, question: text });
      out = r.ok && r.answer
        ? { q: text, a: r.answer }
        : {
            q: text,
            a: null,
            error: r.reason === 'quota'
              ? 'Ya hiciste muchas preguntas hoy. Kai vuelve a responder en unas horas.'
              : r.reason?.includes('API_KEY') ? 'Falta configurar la clave de Claude.' : 'Kai no pudo responder. Probá de nuevo.',
          };
    } catch {
      out = { q: text, a: null, error: 'Kai no pudo responder. Revisá tu conexión y probá de nuevo.' };
    }
    lastBySpace.set(space.id, out);
    setRes(out);
    setBusy(false);
  }

  useEffect(() => {
    if (seed) void ask(seed);
    else setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a subscription they actually have makes the first suggestion feel real
  const sub = items.find((r) => r.kind === 'expense' && r.method === 'card' && r.merchant)?.merchant || 'Netflix';
  const suggestions = shared
    ? [`¿Cuándo se cobra ${sub}?`, '¿Cuál es nuestro principal gasto hormiga?', '¿En qué gastamos más este mes?', '¿Cómo vamos comparado con el mes pasado?']
    : [`¿Cuándo se cobra ${sub}?`, '¿Cuál es mi principal gasto hormiga?', '¿En qué gasté más este mes?', '¿Cómo voy comparado con el mes pasado?'];

  return (
    <Sheet title="Preguntale a Kai" onClose={onClose}>
      <p className="kai-scope">
        Responde con los datos de {space?.emoji} {space?.name}. Una pregunta, una respuesta.
      </p>

      <form
        className="kai-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
      >
        <span className="kai-mark" aria-hidden="true"><Icon name="sparkle" size={18} /></span>
        <label className="sr" htmlFor="kai-q">Tu pregunta</label>
        <input
          id="kai-q"
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={res ? 'Preguntá otra cosa' : '¿Qué querés saber?'}
          maxLength={300}
          enterKeyHint="send"
          autoComplete="off"
        />
        <Button variant="primary" size="md" iconOnly type="submit" className="kai-send" disabled={busy || q.trim().length < 3} aria-label="Preguntar"><Icon name="arrowUp" size={18} /></Button>
      </form>

      {!res && (
        <div className="kai-sugs" aria-label="Ideas para preguntar">
          {suggestions.map((s) => (
            <button key={s} className="kai-sug" onClick={() => void ask(s)}>{s}</button>
          ))}
        </div>
      )}

      {res && (
        <section className="kai-answer" aria-live="polite" aria-busy={busy}>
          <p className="kai-q">{res.q}</p>
          {busy ? (
            <span className="kai-skel" aria-label="Kai está pensando"><span /><span /><span /></span>
          ) : res.a ? (
            <Answer text={res.a} />
          ) : (
            <p className="kai-error">{res.error}</p>
          )}
        </section>
      )}

      <p className="kai-foot">Kai puede equivocarse. Si un monto importa, revisalo en Movimientos.</p>
    </Sheet>
  );
}

/** Plain text with optional "• " lines turned into a list. */
function Answer({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks: (string | string[])[] = [];
  for (const l of lines) {
    if (/^[•\-*]\s+/.test(l)) {
      const item = l.replace(/^[•\-*]\s+/, '');
      const last = blocks[blocks.length - 1];
      if (Array.isArray(last)) last.push(item);
      else blocks.push([item]);
    } else blocks.push(l);
  }
  return (
    <div className="kai-text">
      {blocks.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((x, j) => <li key={j}>{x}</li>)}</ul> : <p key={i}>{b}</p>))}
    </div>
  );
}

/** Looks like a field; opens Kai. Used under the AI note in Análisis. */
export function KaiAskBar() {
  return (
    <button className="kai-bar" onClick={() => openKai()}>
      <span className="kai-mark" aria-hidden="true"><Icon name="sparkle" size={16} /></span>
      <span className="grow">Preguntale algo a Kai</span>
      <span className="kai-bar-hint" aria-hidden="true">Ej: ¿cuándo se cobra Netflix?</span>
    </button>
  );
}
