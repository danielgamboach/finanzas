import { useState } from 'react';
import { auth } from '../lib/api';
import { Button } from '../ds';
import { pendingInvite } from './Onboarding';

export function Login() {
  const invited = !!pendingInvite();
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>(invited ? 'up' : 'in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      if (mode === 'in') await auth.signIn(email.trim(), password);
      else if (mode === 'up') {
        const logged = await auth.signUp(email.trim(), password, name.trim());
        if (!logged) setMsg('Te enviamos un correo para confirmar tu cuenta. Después volvé y entrá.');
      } else {
        await auth.recover(email.trim());
        setMsg('Si el correo existe, te llega un enlace para cambiar la contraseña.');
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      setErr(/invalid login/i.test(m) ? 'Correo o contraseña incorrectos' : /not confirmed/i.test(m) ? 'Falta confirmar tu correo' : m || 'Algo salió mal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-hero">
        <span className="login-emoji">🫶</span>
        <h1 className="headline">Tus finanzas, <strong>claras</strong> y en pareja</h1>
        <p className="muted">Gastos, presupuestos y patrimonio en colones y dólares.</p>
      </div>
      {invited && (
        <div className="login-invite" role="status">
          <span aria-hidden="true">💌</span>
          <span>Te invitaron a un espacio compartido. Creá tu cuenta, o entrá si ya tenés una, y te unimos.</span>
        </div>
      )}
      <form className="card pad col gap12" onSubmit={submit}>
        {mode === 'up' && (
          <label className="col gap6"><span className="field-label">Nombre</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required /></label>
        )}
        <label className="col gap6"><span className="field-label">Correo</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
        {mode !== 'forgot' && (
          <label className="col gap6"><span className="field-label">Contraseña</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={6} required /></label>
        )}
        {err && <div className="error">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <Button variant="primary" size="xl" type="submit" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Crear cuenta' : 'Enviar enlace'}
        </Button>
        <div className="row between small">
          {mode === 'in' ? (
            <>
              <Button variant="link" onClick={() => setMode('up')}>Crear cuenta</Button>
              <Button variant="link" onClick={() => setMode('forgot')}>Olvidé mi contraseña</Button>
            </>
          ) : (
            <Button variant="link" onClick={() => setMode('in')}>Ya tengo cuenta</Button>
          )}
        </div>
      </form>
    </div>
  );
}
