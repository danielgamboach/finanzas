import { useEffect, useState } from 'react';
import { Button, Switch } from '../ds';
import { auth, db } from '../lib/api';
import { enablePush, permission, pushSupport, sendTestPush } from '../lib/push';
import { moneyRaw } from '../lib/format';
import { go, useApp } from '../store';
import { Emo, Icon } from '../ui';
import { shareInvite } from './Onboarding';

export function Ajustes() {
  const { isAdmin, profile, userId, spaces, members, profiles, accounts, categories, space, fx, toast, reloadMeta, bump, setSpaceId } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [emoji, setEmoji] = useState(profile?.emoji || '🙂');
  const [invite, setInvite] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [newSpace, setNewSpace] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState(0);

  useEffect(() => {
    setName(profile?.name || '');
    setEmoji(profile?.emoji || '🙂');
  }, [profile]);

  useEffect(() => {
    if (!space) return;
    db.from('ingest_unmatched', 'id').then((r) => setUnmatched(r.length)).catch(() => undefined);
  }, [space]);

  async function saveProfile() {
    await db.upsert('profiles', [{ id: userId, name: name.trim() || null, emoji: emoji || '🙂' }], 'id');
    await reloadMeta();
    toast('✅ Perfil guardado');
  }
  async function makeInvite() {
    if (!space) return;
    setInvite(await db.rpc<string>('create_invite', { p_space: space.id }));
  }
  async function join() {
    try {
      const sid = await db.rpc<string>('accept_invite', { p_code: joinCode });
      await reloadMeta();
      setSpaceId(sid);
      toast('🎉 Te uniste al espacio');
      go('/');
    } catch {
      toast('Código no válido o vencido');
    }
  }
  async function createSpace() {
    if (!newSpace.trim()) return;
    const sid = await db.rpc<string>('create_space', { p_name: newSpace.trim(), p_emoji: '🫶', p_kind: 'shared' });
    await reloadMeta();
    setSpaceId(sid);
    setNewSpace('');
    toast('✅ Espacio creado');
  }
  async function makeToken() {
    setToken(await db.rpc<string>('create_ingest_token', { p_label: 'Google Apps Script' }));
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Copiado'));

  const spaceMembers = members.filter((m) => m.space_id === space?.id);
  const isOwner = spaceMembers.some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <div className="screen no-nav">
      <header className="topbar">
        <Button iconOnly variant="secondary" size="md" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></Button>
        <h1 className="h2">Ajustes</h1>
        <span style={{ width: 48 }} />
      </header>

      <section className="card pad col gap12">
        <h2 className="h3">👤 Tu perfil</h2>
        <div className="row gap10">
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" />
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Nombre" />
        </div>
        <Button variant="secondary" size="lg" onClick={saveProfile}>Guardar perfil</Button>
      </section>

      <NotifSettings />

      <section className="card pad col gap12">
        <h2 className="h3">🗂️ Espacios</h2>
        {spaces.map((s) => (
          <button key={s.id} className={s.id === space?.id ? 'space-row on' : 'space-row'} onClick={() => setSpaceId(s.id)}>
            <Emo e={s.emoji} color={s.kind === 'shared' ? 'mint' : 'sky'} size={44} />
            <span className="grow col">
              <strong className="sm">{s.name}</strong>
              <span className="muted small">
                {s.kind === 'shared' ? 'Compartido · ' : 'Privado · '}
                {members.filter((m) => m.space_id === s.id).map((m) => profiles[m.user_id]?.name || 'Miembro').join(', ')}
              </span>
            </span>
            {s.id === space?.id && <Icon name="check" />}
          </button>
        ))}

        {space?.kind === 'shared' && isOwner && (
          <div className="sub-card col gap8">
            <strong className="sm">Invitar a {space.name}</strong>
            {invite ? (
              <>
                <span className="code">{invite}</span>
                <span className="muted small">Mandale el enlace, o pasale el código para que lo ponga en Ajustes, en “Unirme con código”. Sirve una vez y vence en 14 días.</span>
                <div className="grid2">
                  <Button variant="secondary" size="lg" onClick={() => shareInvite(invite, space.name).then((r) => r === 'copied' && toast('Enlace copiado'))}>Compartir enlace</Button>
                  <Button variant="secondary" size="lg" onClick={() => copy(invite)}>Copiar código</Button>
                </div>
              </>
            ) : (
              <Button variant="secondary" size="lg" onClick={makeInvite}>Generar código de invitación</Button>
            )}
          </div>
        )}

        <div className="sub-card col gap8">
          <strong className="sm">Unirme con código</strong>
          <div className="row gap8">
            <input className="input grow" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="a1b2c3d4e5f6" aria-label="Código de invitación" />
            <Button variant="primary" size="md" onClick={join} disabled={!joinCode.trim()}>Unirme</Button>
          </div>
        </div>

        <div className="sub-card col gap8">
          <strong className="sm">Nuevo espacio compartido</strong>
          <div className="row gap8">
            <input className="input grow" value={newSpace} onChange={(e) => setNewSpace(e.target.value)} placeholder="Ej. Casa, Viaje, Roomies" aria-label="Nombre del espacio" />
            <Button variant="primary" size="md" onClick={createSpace} disabled={!newSpace.trim()}>Crear</Button>
          </div>
        </div>
      </section>

      <section className="card pad col gap12">
        <div className="row between">
          <h2 className="h3">💳 Cuentas de {space?.name}</h2>
          <a className="link" href="#/cuenta/nueva">Agregar</a>
        </div>
        {accounts.filter((a) => !a.archived).map((a) => (
          <a key={a.id} className="space-row" href={`#/cuenta/${a.id}`}>
            <Emo e={a.emoji} color="gray" size={40} />
            <span className="grow col"><strong className="sm">{a.name}{a.last4 ? ` ••${a.last4}` : ''}</strong><span className="muted small">{a.institution || ''} {a.currency}</span></span>
            <Icon name="chevRight" size={18} />
          </a>
        ))}
        {accounts.length === 0 && <span className="muted small">Sin cuentas todavía.</span>}
      </section>

      <a className="card pad row gap10 link-card" href="#/recurrentes">
        <span className="grow col"><strong className="sm">🔁 Recurrentes de {space?.name}</strong><span className="muted small">Pagos fijos, suscripciones y lo que se espera pagar</span></span>
        <Icon name="chevRight" size={18} />
      </a>

      <section className="card pad col gap12">
        <h2 className="h3">📬 Vouchers automáticos</h2>
        <span className="muted small">El script de Google lee los correos del banco y los manda acá. Generá un token y pegalo en el script.</span>
        {unmatched > 0 && <span className="warn-text small">⚠️ {unmatched} voucher{unmatched > 1 ? 's' : ''} de tarjetas que no están registradas en ninguna cuenta.</span>}
        {token ? (
          <>
            <span className="code wrap">{token}</span>
            <span className="muted small">Se muestra una sola vez. Guardalo en el script.</span>
            <Button variant="secondary" size="lg" onClick={() => copy(token)}>Copiar token</Button>
          </>
        ) : (
          <Button variant="secondary" size="lg" onClick={makeToken}>Generar token</Button>
        )}
        <span className="muted small">Tipo de cambio actual: ¢{fx.toFixed(2)} por dólar (BCCR, actualizado por el script).</span>
      </section>

      {isAdmin && (
        <a className="card pad row gap10 link-card" href="#/bienvenida">
          <span className="grow col"><strong className="sm">👋 Bienvenida de usuarios nuevos</strong><span className="muted small">Vista previa de la configuración inicial. No guarda nada.</span></span>
          <Icon name="chevRight" size={18} />
        </a>
      )}
      {isAdmin && (
        <a className="card pad row gap10 link-card" href="#/sin-logo">
          <span className="grow col"><strong className="sm">📸 Comercios sin logo</strong><span className="muted small">Los de todos los espacios, para ir poniéndoles foto.</span></span>
          <Icon name="chevRight" size={18} />
        </a>
      )}

      <Button variant="destructive-outline" size="lg" onClick={() => auth.signOut()}>Cerrar sesión</Button>
      <footer className="credits">
        Uicons by <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer">Flaticon</a>
      </footer>
    </div>
  );
}

function NotifSettings() {
  const { profile, userId, toast, reloadMeta } = useApp();
  const support = pushSupport();
  const [perm, setPerm] = useState(permission());
  const [busy, setBusy] = useState(false);

  async function activate() {
    setBusy(true);
    try {
      const p = await enablePush();
      setPerm(p);
      if (p === 'granted') toast('🔔 Notificaciones activadas');
      else if (p === 'denied') toast('Quedaron bloqueadas en este dispositivo');
    } catch {
      toast('No se pudieron activar en este dispositivo');
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const r = await sendTestPush();
      toast(r.sent ? '📨 Notificación de prueba enviada' : 'Este dispositivo no está registrado todavía');
    } catch {
      toast('No se pudo enviar la prueba');
    } finally {
      setBusy(false);
    }
  }
  async function toggle(col: 'notify_limits' | 'notify_card') {
    if (!userId) return;
    await db.update('profiles', { id: userId }, { [col]: !(profile?.[col] ?? true) });
    await reloadMeta();
  }

  return (
    <section className="card pad col gap12">
      <h2 className="h3">🔔 Notificaciones</h2>
      {support === 'ios-install' ? (
        <span className="muted small">En iPhone se activan desde la app instalada: Safari → Compartir → Agregar a inicio, y abrila desde ese ícono.</span>
      ) : support === 'unsupported' ? (
        <span className="muted small">Este navegador no permite notificaciones.</span>
      ) : perm === 'granted' ? (
        <div className="row between gap10">
          <span className="small strong-sm">✅ Activas en este dispositivo</span>
          <Button variant="secondary" size="md" onClick={test} disabled={busy}>Probar</Button>
        </div>
      ) : perm === 'denied' ? (
        <span className="muted small">Están bloqueadas para esta app. Activalas en los ajustes del navegador o del teléfono.</span>
      ) : (
        <Button variant="primary" size="lg" onClick={activate} disabled={busy}>{busy ? 'Activando…' : 'Activar en este dispositivo'}</Button>
      )}
      <div className="field-row bare">
        <span className="col"><span>⚠️ Límites de categorías</span><small>Al llegar al 80% y al 100%</small></span>
        <Switch checked={profile?.notify_limits ?? true} label="Avisos de límites" onChange={() => toggle('notify_limits')} />
      </div>
      <div className="field-row bare">
        <span className="col"><span>💳 Pago de la tarjeta</span><small>El día de pago, con el monto de la semana</small></span>
        <Switch checked={profile?.notify_card ?? true} label="Aviso de pago de tarjeta" onChange={() => toggle('notify_card')} />
      </div>
    </section>
  );
}
