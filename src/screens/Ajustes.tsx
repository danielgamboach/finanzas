import { useEffect, useState } from 'react';
import { auth, db } from '../lib/api';
import { moneyRaw } from '../lib/format';
import type { Recurring } from '../lib/types';
import { go, useApp } from '../store';
import { Emo, Icon } from '../ui';

export function Ajustes() {
  const { profile, userId, spaces, members, profiles, accounts, categories, space, fx, toast, reloadMeta, bump, setSpaceId } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [emoji, setEmoji] = useState(profile?.emoji || '🙂');
  const [invite, setInvite] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [newSpace, setNewSpace] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [unmatched, setUnmatched] = useState(0);

  useEffect(() => {
    setName(profile?.name || '');
    setEmoji(profile?.emoji || '🙂');
  }, [profile]);

  useEffect(() => {
    if (!space) return;
    db.from<Recurring>('recurring').eq('space_id', space.id).order('day_of_month').then(setRecurring).catch(() => undefined);
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
  async function toggleRec(r: Recurring) {
    await db.update('recurring', { id: r.id }, { active: !r.active });
    setRecurring(recurring.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)));
  }
  async function deleteRec(r: Recurring) {
    if (!confirm(`¿Eliminar "${r.merchant}" de los recurrentes? Los movimientos ya creados se quedan.`)) return;
    await db.remove('recurring', { id: r.id });
    setRecurring(recurring.filter((x) => x.id !== r.id));
    bump();
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('Copiado'));

  const spaceMembers = members.filter((m) => m.space_id === space?.id);
  const isOwner = spaceMembers.some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <div className="screen no-nav">
      <header className="topbar">
        <button className="round" onClick={() => history.back()} aria-label="Volver"><Icon name="back" /></button>
        <h1 className="h2">Ajustes</h1>
        <span style={{ width: 48 }} />
      </header>

      <section className="card pad col gap12">
        <h2 className="h3">👤 Tu perfil</h2>
        <div className="row gap10">
          <input className="input emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} aria-label="Emoji" />
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Nombre" />
        </div>
        <button className="btn-light" onClick={saveProfile}>Guardar perfil</button>
      </section>

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
                <span className="muted small">Pasale este código. Lo pone en Ajustes → “Unirme con código”. Vence en 14 días.</span>
                <button className="btn-light" onClick={() => copy(invite)}>Copiar código</button>
              </>
            ) : (
              <button className="btn-light" onClick={makeInvite}>Generar código de invitación</button>
            )}
          </div>
        )}

        <div className="sub-card col gap8">
          <strong className="sm">Unirme con código</strong>
          <div className="row gap8">
            <input className="input grow" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="a1b2c3d4e5f6" aria-label="Código de invitación" />
            <button className="btn-dark sm" onClick={join} disabled={!joinCode.trim()}>Unirme</button>
          </div>
        </div>

        <div className="sub-card col gap8">
          <strong className="sm">Nuevo espacio compartido</strong>
          <div className="row gap8">
            <input className="input grow" value={newSpace} onChange={(e) => setNewSpace(e.target.value)} placeholder="Ej. Casa, Viaje, Roomies" aria-label="Nombre del espacio" />
            <button className="btn-dark sm" onClick={createSpace} disabled={!newSpace.trim()}>Crear</button>
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

      <section className="card pad col gap12">
        <h2 className="h3">🔁 Recurrentes de {space?.name}</h2>
        {recurring.length === 0 ? (
          <span className="muted small">Al guardar un movimiento podés marcar “Repetir cada mes”.</span>
        ) : (
          recurring.map((r) => {
            const c = categories.find((x) => x.id === r.category_id);
            return (
              <div key={r.id} className="row gap10">
                <Emo e={c?.emoji || '🔁'} color={c?.color} size={40} />
                <span className="grow col">
                  <strong className="sm">{r.merchant}</strong>
                  <span className="muted small">Día {r.day_of_month} · {moneyRaw(Number(r.amount), r.currency)}</span>
                </span>
                <button role="switch" aria-checked={r.active} aria-label={`Activo: ${r.merchant}`} className={r.active ? 'switch on' : 'switch'} onClick={() => toggleRec(r)}><span /></button>
                <button className="icon-btn" aria-label={`Eliminar ${r.merchant}`} onClick={() => deleteRec(r)}><Icon name="trash" size={18} /></button>
              </div>
            );
          })
        )}
      </section>

      <section className="card pad col gap12">
        <h2 className="h3">📬 Vouchers automáticos</h2>
        <span className="muted small">El script de Google lee los correos del banco y los manda acá. Generá un token y pegalo en el script.</span>
        {unmatched > 0 && <span className="warn-text small">⚠️ {unmatched} voucher{unmatched > 1 ? 's' : ''} de tarjetas que no están registradas en ninguna cuenta.</span>}
        {token ? (
          <>
            <span className="code wrap">{token}</span>
            <span className="muted small">Se muestra una sola vez. Guardalo en el script.</span>
            <button className="btn-light" onClick={() => copy(token)}>Copiar token</button>
          </>
        ) : (
          <button className="btn-light" onClick={makeToken}>Generar token</button>
        )}
        <span className="muted small">Tipo de cambio actual: ₡{fx.toFixed(2)} por dólar (BCCR, actualizado por el script).</span>
      </section>

      <button className="btn-danger" onClick={() => auth.signOut()}>Cerrar sesión</button>
    </div>
  );
}
