import { useEffect, useRef, useState } from 'react';
import { Button } from '../ds';
import { db } from '../lib/api';
import { accountColor } from '../lib/accounts';
import type { Account, Currency } from '../lib/types';
import { go, useApp } from '../store';
import { Icon } from '../ui';

/**
 * First-time setup for new people. Three short questions, every one skippable:
 * how they'll use the app (alone, shared, or joining with a code), their main way to pay,
 * and a closing screen that points to the first expense. Shown once; Inicio then keeps a checklist.
 */

type Step = 'uso' | 'espacio' | 'codigo' | 'cuenta' | 'listo';
type Uso = 'solo' | 'compartido' | 'invitado';
type Kind = 'credit_card' | 'debit' | 'cash';

const INVITE_KEY = 'finanzas.invite';
export const pendingInvite = () => {
  try { return localStorage.getItem(INVITE_KEY); } catch { return null; }
};
export const setPendingInvite = (code: string | null) => {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code);
    else localStorage.removeItem(INVITE_KEY);
  } catch { /* ignore */ }
};
export const inviteLink = (code: string) => `${location.origin}/#/unirme/${code}`;

/** Shares the invite with the phone's share sheet, or copies the link when there isn't one. */
export async function shareInvite(code: string, spaceName: string): Promise<'shared' | 'copied' | 'cancel'> {
  const url = inviteLink(code);
  const text = `Te invito a ${spaceName} en Finanzas, para llevar nuestros gastos juntos.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Finanzas', text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancel';
    }
  }
  await navigator.clipboard?.writeText(`${text} ${url}`);
  return 'copied';
}

const KINDS: { k: Kind; emoji: string; icon: string; label: string; name: string; color: string }[] = [
  { k: 'credit_card', emoji: '💳', icon: 'cards', label: 'Tarjeta de crédito', name: 'Tarjeta de crédito', color: 'violet' },
  { k: 'debit', emoji: '🏦', icon: 'bank', label: 'Tarjeta de débito', name: 'Tarjeta de débito', color: 'blue' },
  { k: 'cash', emoji: '💵', icon: 'money', label: 'Efectivo', name: 'Efectivo', color: 'emerald' },
];

const SPACE_EMOJIS = ['🫶', '🏡', '🐾', '✈️'];
const SPACE_IDEAS = ['Casa', 'Nosotros', 'Roomies'];

/** `preview`: admins can walk through it from Ajustes; nothing gets saved. */
export function Onboarding({ preview = false }: { preview?: boolean }) {
  const { profile, userId, spaces, reloadMeta, setSpaceId, toast } = useApp();
  const invite = preview ? null : pendingInvite();
  const [step, setStep] = useState<Step>(invite ? 'codigo' : 'uso');
  const [trail, setTrail] = useState<Step[]>([]);
  const [uso, setUso] = useState<Uso | null>(invite ? 'invitado' : null);
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const first = (profile?.name || '').trim().split(/\s+/)[0];

  // the shared space they made or joined in this flow (for the account step and the summary)
  const [shared, setShared] = useState<{ id: string; name: string; code?: string } | null>(null);

  useEffect(() => {
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus();
    window.scrollTo(0, 0);
  }, [step]);

  const to = (s: Step) => {
    setTrail((t) => [...t, step]);
    setStep(s);
  };
  const back = () => {
    const prev = trail[trail.length - 1];
    if (!prev) return;
    setTrail((t) => t.slice(0, -1));
    setStep(prev);
  };

  async function finish(next: string) {
    if (preview) return go('/ajustes');
    setBusy(true);
    try {
      await db.update('profiles', { id: userId }, { onboarded_at: new Date().toISOString() });
    } catch {
      toast('No se pudo guardar, pero podés seguir');
    }
    setPendingInvite(null);
    go(next);
    await reloadMeta();
    setBusy(false);
  }

  // progress: the path depends on the first answer
  const path: Step[] = ['uso', ...(uso === 'compartido' ? ['espacio' as Step] : uso === 'invitado' ? ['codigo' as Step] : []), 'cuenta'];
  const idx = step === 'listo' ? path.length : Math.max(0, path.indexOf(step));

  return (
    <div className="ob">
      <header className="ob-bar">
        {trail.length > 0 && step !== 'listo' ? (
          <Button variant="secondary" size="md" iconOnly onClick={back} aria-label="Volver"><Icon name="back" /></Button>
        ) : (
          <span className="ob-bar-gap" />
        )}
        {step !== 'listo' && (
          <div className="ob-progress" role="progressbar" aria-label="Avance de la configuración" aria-valuemin={0} aria-valuemax={path.length} aria-valuenow={idx + 1}>
            {path.map((s, i) => <span key={s} className={i <= idx ? 'on' : ''} />)}
          </div>
        )}
        {step !== 'listo' ? (
          <button className="ob-skip" onClick={() => finish('/')} disabled={busy}>Saltar</button>
        ) : (
          <span className="ob-bar-gap" />
        )}
      </header>

      <div className="ob-main" ref={mainRef} key={step}>
        {step === 'uso' && (
          <UsoStep
            first={first}
            value={uso}
            onPick={setUso}
            onNext={() => to(uso === 'compartido' ? 'espacio' : uso === 'invitado' ? 'codigo' : 'cuenta')}
            onSkip={() => to('cuenta')}
          />
        )}
        {step === 'espacio' && (
          <EspacioStep
            preview={preview}
            onCreated={(sp) => {
              setShared(sp);
              setDone((d) => [...d.filter((x) => !x.startsWith('Creaste')), `Creaste el espacio ${sp.name}`]);
            }}
            created={shared}
            onNext={() => to('cuenta')}
          />
        )}
        {step === 'codigo' && (
          <CodigoStep
            preview={preview}
            initial={invite || ''}
            fromLink={!!invite}
            joined={shared}
            onJoined={(sp) => {
              setShared(sp);
              if (!preview) {
                setSpaceId(sp.id);
                setPendingInvite(null);
              }
              setDone((d) => [...d.filter((x) => !x.startsWith('Te uniste')), `Te uniste a ${sp.name}`]);
            }}
            onNext={() => to('cuenta')}
          />
        )}
        {step === 'cuenta' && (
          <CuentaStep
            preview={preview}
            personalId={spaces.find((s) => s.kind === 'personal' && s.created_by === userId)?.id || spaces.find((s) => s.kind === 'personal')?.id || ''}
            shared={shared}
            onSaved={(name) => {
              setDone((d) => [...d.filter((x) => !x.startsWith('Agregaste')), `Agregaste ${name}`]);
              to('listo');
            }}
            onSkip={() => to('listo')}
          />
        )}
        {step === 'listo' && <ListoStep first={first} done={done} busy={busy} finish={finish} />}
      </div>
    </div>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="ob-actions">{children}</div>;
}

function UsoStep({ first, value, onPick, onNext, onSkip }: { first: string; value: Uso | null; onPick: (u: Uso) => void; onNext: () => void; onSkip: () => void }) {
  const opts: { u: Uso; icon: string; title: string; sub: string }[] = [
    { u: 'solo', icon: 'user', title: 'Solo yo', sub: 'Tus gastos, en privado.' },
    { u: 'compartido', icon: 'users', title: 'Con mi pareja o alguien más', sub: 'Un espacio compartido, además del tuyo.' },
    { u: 'invitado', icon: 'key', title: 'Me invitaron', sub: 'Tengo un código para unirme.' },
  ];
  return (
    <>
      <div className="ob-head">
        <span className="ob-icon" aria-hidden="true"><Icon name="wave" size={28} /></span>
        <h1 className="ob-title" tabIndex={-1}>{first ? `¡Hola, ${first}!` : '¡Hola!'} ¿Cómo vas a usar Finanzas?</h1>
        <p className="ob-sub">Así lo dejamos listo para vos. Todo se puede cambiar después.</p>
      </div>
      <div className="ob-opts" role="radiogroup" aria-label="Cómo vas a usar Finanzas">
        {opts.map((o) => (
          <button key={o.u} role="radio" aria-checked={value === o.u} className={value === o.u ? 'ob-opt on' : 'ob-opt'} onClick={() => onPick(o.u)}>
            <span className="ob-opt-emo" aria-hidden="true"><Icon name={o.icon} size={22} /></span>
            <span className="ob-opt-text">
              <strong>{o.title}</strong>
              <span>{o.sub}</span>
            </span>
            <span className="ob-radio" aria-hidden="true">{value === o.u && <Icon name="check" size={14} stroke={3} />}</span>
          </button>
        ))}
      </div>
      <Actions>
        <Button variant="primary" size="xl" onClick={onNext} disabled={!value}>Continuar</Button>
        <Button variant="ghost" size="lg" onClick={onSkip}>Ahora no</Button>
      </Actions>
    </>
  );
}

function EspacioStep({ preview, created, onCreated, onNext }: { preview: boolean; created: { id: string; name: string; code?: string } | null; onCreated: (s: { id: string; name: string; code?: string }) => void; onNext: () => void }) {
  const { reloadMeta, toast } = useApp();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(SPACE_EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const code = created?.code || null;

  async function create() {
    const n = name.trim() || 'Casa';
    setBusy(true);
    setErr(null);
    if (preview) {
      onCreated({ id: 'preview', name: n, code: 'a1b2c3d4e5f6' });
      setBusy(false);
      return;
    }
    try {
      const sid = await db.rpc<string>('create_space', { p_name: n, p_emoji: emoji, p_kind: 'shared' });
      const c = await db.rpc<string>('create_invite', { p_space: sid }).catch(() => undefined);
      onCreated({ id: sid, name: n, code: c });
      await reloadMeta();
    } catch {
      setErr('No pudimos crear el espacio. Probá de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!code || !created) return;
    if (preview) return toast('Vista previa: no se comparte nada');
    const r = await shareInvite(code, created.name);
    if (r === 'copied') toast('Enlace copiado');
  }

  if (created) {
    return (
      <>
        <div className="ob-head">
          <span className="ob-icon" aria-hidden="true"><Icon name="envelope" size={28} /></span>
          <h1 className="ob-title" tabIndex={-1}>Invitá a quien comparte {created.name} con vos</h1>
          <p className="ob-sub">Mandale el enlace. Si ya tiene cuenta, también puede escribir el código.</p>
        </div>
        <div className="ob-invite">
          {code ? <span className="ob-code" aria-label={`Código ${code.split('').join(' ')}`}>{code}</span> : <span className="ob-code muted">Generalo después en Ajustes</span>}
          <span className="ob-invite-note">El código sirve una vez y vence en 14 días.</span>
          <div className="ob-row2">
            <Button variant="secondary" size="lg" leading={<Icon name="arrowUpRight" size={18} />} onClick={share} disabled={!code}>Compartir enlace</Button>
            <Button variant="secondary" size="lg" onClick={() => code && navigator.clipboard?.writeText(code).then(() => toast('Código copiado'))} disabled={!code}>Copiar código</Button>
          </div>
        </div>
        <Actions>
          <Button variant="primary" size="xl" onClick={onNext}>Continuar</Button>
          <span className="ob-foot">También podés invitar después desde Ajustes.</span>
        </Actions>
      </>
    );
  }

  return (
    <>
      <div className="ob-head">
        <span className="ob-emoji" aria-hidden="true">{emoji}</span>
        <h1 className="ob-title" tabIndex={-1}>Pónganle nombre a su espacio</h1>
        <p className="ob-sub">Ahí van los gastos que comparten. Los tuyos siguen en tu espacio personal.</p>
      </div>
      <div className="ob-fields">
        <label className="col gap6">
          <span className="field-label">Nombre</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa" maxLength={40} autoComplete="off" />
        </label>
        <div className="ob-chips" aria-label="Ideas de nombre">
          {SPACE_IDEAS.map((n) => (
            <button key={n} className={name === n ? 'ob-chip on' : 'ob-chip'} aria-pressed={name === n} onClick={() => setName(n)}>{n}</button>
          ))}
        </div>
        <span className="field-label">Ícono</span>
        <div className="ob-emojis" role="radiogroup" aria-label="Ícono del espacio">
          {SPACE_EMOJIS.map((e) => (
            <button key={e} role="radio" aria-checked={emoji === e} className={emoji === e ? 'ob-emo on' : 'ob-emo'} onClick={() => setEmoji(e)}>{e}</button>
          ))}
        </div>
        {err && <div className="error">{err}</div>}
      </div>
      <Actions>
        <Button variant="primary" size="xl" onClick={create} disabled={busy}>{busy ? 'Creando…' : 'Crear espacio'}</Button>
        <Button variant="ghost" size="lg" onClick={onNext} disabled={busy}>Ahora no</Button>
      </Actions>
    </>
  );
}

function CodigoStep({ preview, initial, fromLink, joined, onJoined, onNext }: { preview: boolean; initial: string; fromLink: boolean; joined: { id: string; name: string } | null; onJoined: (s: { id: string; name: string }) => void; onNext: () => void }) {
  const { reloadMeta } = useApp();
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setErr(null);
    if (preview) {
      onJoined({ id: 'preview', name: 'Casa' });
      setBusy(false);
      return;
    }
    try {
      const sid = await db.rpc<string>('accept_invite', { p_code: code.trim() });
      const [sp] = await db.from<{ id: string; name: string }>('spaces', 'id,name').eq('id', sid);
      await reloadMeta();
      onJoined({ id: sid, name: sp?.name || 'el espacio compartido' });
    } catch {
      setErr('Ese código no funcionó. Revisá que esté bien escrito o pedí uno nuevo: sirven una sola vez y vencen en 14 días.');
    } finally {
      setBusy(false);
    }
  }

  if (joined) {
    return (
      <>
        <div className="ob-head">
          <span className="ob-icon" aria-hidden="true"><Icon name="confetti" size={28} /></span>
          <h1 className="ob-title" tabIndex={-1}>¡Ya estás en {joined.name}!</h1>
          <p className="ob-sub">Ahí ves los gastos que comparten. Tus gastos personales quedan en tu espacio, solo para vos.</p>
        </div>
        <Actions>
          <Button variant="primary" size="xl" onClick={onNext}>Continuar</Button>
        </Actions>
      </>
    );
  }

  return (
    <>
      <div className="ob-head">
        <span className="ob-icon" aria-hidden="true"><Icon name="key" size={28} /></span>
        <h1 className="ob-title" tabIndex={-1}>{fromLink ? 'Te invitaron a un espacio compartido' : 'Escribí el código que te pasaron'}</h1>
        <p className="ob-sub">{fromLink ? 'Confirmá y te unimos. Tus gastos personales siguen siendo solo tuyos.' : 'Son 12 letras y números. Lo encuentran en Ajustes, en Espacios.'}</p>
      </div>
      <div className="ob-fields">
        <label className="col gap6">
          <span className="field-label">Código</span>
          <input
            className="input ob-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\s/g, '').toLowerCase())}
            placeholder="a1b2c3d4e5f6"
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            aria-invalid={!!err}
            aria-describedby={err ? 'ob-code-err' : undefined}
          />
        </label>
        {err && <div className="error" id="ob-code-err" role="alert">{err}</div>}
      </div>
      <Actions>
        <Button variant="primary" size="xl" onClick={join} disabled={busy || code.trim().length < 6}>{busy ? 'Uniéndote…' : 'Unirme'}</Button>
        <Button variant="ghost" size="lg" onClick={onNext} disabled={busy}>Ahora no</Button>
      </Actions>
    </>
  );
}

function CuentaStep({ preview, personalId, shared, onSaved, onSkip }: { preview: boolean; personalId: string; shared: { id: string; name: string } | null; onSaved: (name: string) => void; onSkip: () => void }) {
  const { reloadMeta, bump } = useApp();
  const [kind, setKind] = useState<Kind>('credit_card');
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [last4, setLast4] = useState('');
  const [currency, setCurrency] = useState<Currency>('CRC');
  const [where, setWhere] = useState<'mine' | 'shared'>('mine');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const meta = KINDS.find((k) => k.k === kind)!;
  const card = kind !== 'cash';
  const shownName = name.trim() || (bank.trim() && card ? `${bank.trim()} ${kind === 'credit_card' ? 'crédito' : 'débito'}` : meta.name);
  const color = accountColor({ color: meta.color } as Pick<Account, 'color'>);

  async function save() {
    setBusy(true);
    setErr(null);
    if (preview) return onSaved(shownName);
    try {
      await db.insert('accounts', {
        space_id: where === 'shared' && shared ? shared.id : personalId,
        name: shownName,
        institution: bank.trim() || null,
        kind,
        currency: kind === 'credit_card' ? 'CRC' : currency,
        last4: card && /^\d{4}$/.test(last4) ? last4 : null,
        emoji: meta.emoji,
        color: meta.color,
      });
      await reloadMeta();
      bump();
      onSaved(shownName);
    } catch {
      setErr('No pudimos guardar la cuenta. Probá de nuevo o seguí sin ella.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1 className="ob-title" tabIndex={-1}>¿Con qué pagás más seguido?</h1>
        <p className="ob-sub">Con una cuenta basta para empezar. Las demás, cuando querás.</p>
      </div>

      <div className="wcard ob-card preview" style={{ background: color.bg, color: color.fg }} aria-hidden="true">
        <span className="wc-top">
          <span className="wc-name">{shownName}</span>
          <span className="wc-num">{card && last4.length === 4 ? `••••${last4}` : bank.trim()}</span>
        </span>
        <span className="wc-bottom">
          <span className="wc-sub">{meta.label}</span>
          <span className="wc-kind"><Icon name={meta.icon} size={24} solid /></span>
        </span>
      </div>

      <div className="ob-kinds" role="radiogroup" aria-label="Tipo de cuenta">
        {KINDS.map((k) => (
          <button key={k.k} role="radio" aria-checked={kind === k.k} className={kind === k.k ? 'ob-kind on' : 'ob-kind'} onClick={() => setKind(k.k)}>
            <Icon name={k.icon} size={16} solid />{k.k === 'credit_card' ? 'Crédito' : k.k === 'debit' ? 'Débito' : 'Efectivo'}
          </button>
        ))}
      </div>

      <div className="ob-fields">
        {card && (
          <div className="ob-row2">
            <label className="col gap6">
              <span className="field-label">Banco <small>(opcional)</small></span>
              <input className="input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="BAC" maxLength={30} autoComplete="off" />
            </label>
            <label className="col gap6">
              <span className="field-label">Últimos 4 <small>(opcional)</small></span>
              <input className="input" inputMode="numeric" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" autoComplete="off" />
            </label>
          </div>
        )}
        <label className="col gap6">
          <span className="field-label">Nombre <small>(opcional)</small></span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={shownName} maxLength={40} autoComplete="off" />
        </label>
        {kind !== 'credit_card' ? (
          <div className="grid2" role="radiogroup" aria-label="Moneda">
            {(['CRC', 'USD'] as const).map((c) => (
              <button key={c} role="radio" aria-checked={currency === c} className={currency === c ? 'opt on' : 'opt'} onClick={() => setCurrency(c)}>{c === 'CRC' ? '¢ Colones' : '$ Dólares'}</button>
            ))}
          </div>
        ) : (
          <span className="hint">Acepta cargos en colones y en dólares.</span>
        )}
        {shared && (
          <>
            <span className="field-label">¿Para qué gastos la usás?</span>
            <div className="grid2" role="radiogroup" aria-label="Espacio de la cuenta">
              <button role="radio" aria-checked={where === 'mine'} className={where === 'mine' ? 'opt on' : 'opt'} onClick={() => setWhere('mine')}>Los míos</button>
              <button role="radio" aria-checked={where === 'shared'} className={where === 'shared' ? 'opt on' : 'opt'} onClick={() => setWhere('shared')}>De {shared.name}</button>
            </div>
          </>
        )}
        {err && <div className="error">{err}</div>}
      </div>

      <Actions>
        <Button variant="primary" size="xl" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuenta'}</Button>
        <Button variant="ghost" size="lg" onClick={onSkip} disabled={busy}>Ahora no</Button>
      </Actions>
    </>
  );
}

function ListoStep({ first, done, busy, finish }: { first: string; done: string[]; busy: boolean; finish: (next: string) => void }) {
  return (
    <>
      <div className="ob-head">
        <span className="ob-icon big" aria-hidden="true"><Icon name="confetti" size={36} /></span>
        <h1 className="ob-title" tabIndex={-1}>{first ? `¡Listo, ${first}!` : '¡Listo!'}</h1>
        <p className="ob-sub">{done.length ? 'Esto ya quedó:' : 'Ya podés empezar. Lo demás lo configurás cuando querás.'}</p>
      </div>
      {done.length > 0 && (
        <ul className="ob-done">
          {done.map((d) => (
            <li key={d}><span className="ob-done-check" aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>{d}</li>
          ))}
        </ul>
      )}
      <div className="ob-next">
        <strong>Lo que más ayuda ahora</strong>
        <span>Anotá tu primer gasto. Toma unos segundos y ya ves cómo va tu mes.</span>
      </div>
      <Actions>
        <Button variant="primary" size="xl" onClick={() => finish('/agregar')} disabled={busy} leading={<Icon name="plusCircle" size={20} />}>Anotar mi primer gasto</Button>
        <Button variant="ghost" size="lg" onClick={() => finish('/')} disabled={busy}>Ir al inicio</Button>
        <span className="ob-foot">En Inicio te dejamos unos primeros pasos para cuando tengás tiempo.</span>
      </Actions>
    </>
  );
}
