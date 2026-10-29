import { useMenu } from '../lib/menu';
import { useEffect, useState } from 'react';
import { ActionBar, Button, ListGroup, ListRow, PageHeader, Switch } from '../ds';
import { auth, db } from '../lib/api';
import { enablePush, permission, pushSupport, sendTestPush } from '../lib/push';
import { go, navigateBack, useApp } from '../store';
import { Emo, Icon } from '../ui';
import { shareInvite } from './Onboarding';
import { accountIcon } from './Patrimonio';

export function Ajustes() {
  const menu = useMenu();
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
    toast('Perfil guardado');
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
      toast('Te uniste al espacio');
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
    toast('Espacio creado');
  }
  async function makeToken() {
    setToken(await db.rpc<string>('create_ingest_token', { p_label: 'Google Apps Script' }));
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Copiado'));

  const spaceMembers = members.filter((m) => m.space_id === space?.id);
  const isOwner = spaceMembers.some((m) => m.user_id === userId && m.role === 'owner');

  const dirty = (name.trim() || '') !== (profile?.name || '') || (emoji || '🙂') !== (profile?.emoji || '🙂');
  const activeAccounts = accounts.filter((a) => !a.archived);

  return (
    <div className="page no-nav">
      <PageHeader title="Ajustes" onBack={menu ? undefined : navigateBack} onMenu={menu?.open} />
      <div className="page-body">
        <ListGroup title="Tu perfil">
          <div className="set-form">
            <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" />
            <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Nombre" />
          </div>
        </ListGroup>

        <NotifSettings />

        <ListGroup title="Espacios">
          {spaces.map((s) => {
            const on = s.id === space?.id;
            return (
              <ListRow
                key={s.id}
                leading={<Emo e={s.emoji} color={s.kind === 'shared' ? 'mint' : 'sky'} size={40} />}
                title={s.name}
                detail={[s.kind === 'shared' ? 'Compartido' : 'Privado', members.filter((m) => m.space_id === s.id).map((m) => profiles[m.user_id]?.name || 'Miembro').join(', ')]}
                actions={on ? <span className="set-check" aria-label="Espacio actual"><Icon name="check" size={16} stroke={2.4} /></span> : undefined}
                onClick={on ? undefined : () => setSpaceId(s.id)}
                label={on ? undefined : `Cambiar a ${s.name}`}
              />
            );
          })}
          {space?.kind === 'shared' && isOwner && (
            <ListRow
              title={`Invitar a ${space.name}`}
              detail={invite ? 'Sirve una vez y vence en 14 días' : 'Con un enlace o un código'}
              actions={!invite ? <Button variant="secondary" size="xs" onClick={makeInvite}>Generar</Button> : undefined}
              below={invite ? (
                <div className="set-stack">
                  <span className="code">{invite}</span>
                  <div className="grid2">
                    <Button variant="primary" size="sm" onClick={() => shareInvite(invite, space.name).then((r) => r === 'copied' && toast('Enlace copiado'))}>Compartir enlace</Button>
                    <Button variant="secondary" size="sm" onClick={() => copy(invite)}>Copiar código</Button>
                  </div>
                </div>
              ) : undefined}
            />
          )}
          <ListRow
            title="Unirme con código"
            detail="Si alguien te invitó a su espacio"
            below={
              <div className="set-inline">
                <input className="input grow" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="a1b2c3d4e5f6" aria-label="Código de invitación" />
                <Button variant="primary" size="sm" onClick={join} disabled={!joinCode.trim()}>Unirme</Button>
              </div>
            }
          />
          <ListRow
            title="Nuevo espacio compartido"
            detail="Para la casa, un viaje o roomies"
            below={
              <div className="set-inline">
                <input className="input grow" value={newSpace} onChange={(e) => setNewSpace(e.target.value)} placeholder="Ej. Casa, Viaje, Roomies" aria-label="Nombre del espacio" />
                <Button variant="primary" size="sm" onClick={createSpace} disabled={!newSpace.trim()}>Crear</Button>
              </div>
            }
          />
        </ListGroup>

        <ListGroup title={`Cuentas de ${space?.name || 'este espacio'}`} action={<a href="#/cuenta/nueva">Agregar</a>}>
          {activeAccounts.length === 0 ? (
            <ListRow title="Sin cuentas todavía" detail="Agregá la primera" chevron href="#/cuenta/nueva" />
          ) : activeAccounts.map((a) => {
            const ic = accountIcon(a);
            return <ListRow key={a.id} leading={<ListRow.Icon name={ic.name} color={ic.color} />} title={a.name} detail={[a.institution || '', a.currency, a.last4 ? `**${a.last4}` : '']} chevron href={`#/cuenta/${a.id}`} />;
          })}
        </ListGroup>

        <ListGroup title="Más">
          <ListRow leading={<ListRow.Icon name="repeat" />} title="Recurrentes" detail="Pagos fijos y suscripciones" chevron href="#/recurrentes" />
          {isAdmin && <ListRow leading={<ListRow.Icon name="user" />} title="Bienvenida de usuarios nuevos" detail="Vista previa. No guarda nada." chevron href="#/bienvenida" />}
          {isAdmin && <ListRow leading={<ListRow.Icon name="camera" />} title="Comercios sin logo" detail="De todos los espacios" chevron href="#/sin-logo" />}
        </ListGroup>

        <ListGroup title="Vouchers automáticos" note="El script de Google lee los correos del banco y los manda acá. Generá un token y pegalo en el script.">
          {unmatched > 0 && <ListRow title={`${unmatched} voucher${unmatched > 1 ? 's' : ''} sin cuenta`} detail="De tarjetas que no están en ninguna cuenta" detailTone="warning" />}
          <ListRow
            title="Token del script"
            detail={token ? 'Se muestra una sola vez. Guardalo en el script.' : 'Uno nuevo por cada script'}
            actions={token ? <Button variant="primary" size="xs" onClick={() => copy(token)}>Copiar</Button> : <Button variant="secondary" size="xs" onClick={makeToken}>Generar</Button>}
            below={token ? <span className="code wrap">{token}</span> : undefined}
          />
          <ListRow title="Tipo de cambio" detail="BCCR, actualizado por el script" value={`¢${fx.toFixed(2)}`} />
        </ListGroup>

        <Button variant="ghost" size="md" block className="danger" leading={<Icon name="logout" size={16} />} onClick={() => auth.signOut()}>Cerrar sesión</Button>
        <footer className="credits">
          Uicons by <a href="https://www.flaticon.com/uicons" target="_blank" rel="noopener noreferrer">Flaticon</a>
        </footer>
      </div>
      {dirty && (
        <ActionBar>
          <Button variant="primary" size="lg" block onClick={saveProfile}>Guardar perfil</Button>
        </ActionBar>
      )}
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
      if (p === 'granted') toast('Notificaciones activadas');
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
      toast(r.sent ? 'Notificación de prueba enviada' : 'Este dispositivo no está registrado todavía');
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

  const status = support === 'ios-install'
    ? 'En iPhone se activan desde la app instalada: Safari → Compartir → Agregar a inicio, y abrila desde ese ícono.'
    : support === 'unsupported'
      ? 'Este navegador no permite notificaciones.'
      : perm === 'denied' ? 'Están bloqueadas para esta app. Activalas en los ajustes del navegador o del teléfono.' : null;
  return (
    <ListGroup title="Notificaciones" note={status}>
      {support !== 'ios-install' && support !== 'unsupported' && perm !== 'denied' && (
        <ListRow
          title="Este dispositivo"
          detail={perm === 'granted' ? 'Activas' : 'Todavía no activas'}
          detailTone={perm === 'granted' ? 'success' : 'muted'}
          actions={perm === 'granted'
            ? <Button variant="secondary" size="xs" onClick={test} disabled={busy}>Probar</Button>
            : <Button variant="primary" size="xs" onClick={activate} disabled={busy}>{busy ? 'Activando…' : 'Activar'}</Button>}
        />
      )}
      <ListRow title="Límites de categorías" detail="Al llegar al 80% y al 100%" actions={<Switch checked={profile?.notify_limits ?? true} label="Avisos de límites" onChange={() => toggle('notify_limits')} />} />
      <ListRow title="Pago de la tarjeta" detail="El día de pago, con el monto de la semana" actions={<Switch checked={profile?.notify_card ?? true} label="Aviso de pago de tarjeta" onChange={() => toggle('notify_card')} />} />
    </ListGroup>
  );
}
