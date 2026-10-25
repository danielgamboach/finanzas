import { useEffect, useState } from 'react';
import { dismissPrompt, enablePush, permission, promptDismissed, pushSupport, refreshPush, sendTestPush } from '../lib/push';
import { useApp } from '../store';

/** Full-screen, dismissible invitation to turn on notifications, shown until answered. */
export function NotifPrompt() {
  const { toast, profile } = useApp();
  const support = pushSupport();
  const [show, setShow] = useState(() => !promptDismissed() && (support === 'ios-install' || (support === 'ok' && permission() === 'default')));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshPush();
  }, []);

  // new people get it as a step of "Primeros pasos" instead of a prompt on their first visit
  if (!show || !profile || !profile.onboarded_at || !profile.setup_hidden) return null;
  const close = () => {
    dismissPrompt();
    setShow(false);
  };

  async function activate() {
    setBusy(true);
    try {
      const p = await enablePush();
      if (p === 'granted') {
        toast('🔔 Notificaciones activadas');
        sendTestPush().catch(() => undefined);
      } else if (p === 'denied') toast('Quedaron bloqueadas. Podés activarlas en los ajustes del teléfono.');
      close();
    } catch {
      toast('No se pudieron activar en este dispositivo');
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notif-prompt" role="dialog" aria-modal="true" aria-labelledby="np-title">
      <div className="np-card">
        <span className="np-emoji" aria-hidden="true">🔔</span>
        <h1 id="np-title" className="np-title">Activá las notificaciones</h1>
        <p className="np-sub">Solo para lo importante, nada de spam.</p>
        <ul className="np-list">
          <li><span aria-hidden="true">⚠️</span><span>Cuando una categoría llega al <strong>80%</strong> y al <strong>100%</strong> de su límite.</span></li>
          <li><span aria-hidden="true">💳</span><span>El día de pago, <strong>cuánto toca pagar de la tarjeta</strong>.</span></li>
        </ul>
        {support === 'ios-install' ? (
          <>
            <div className="np-ios">
              <strong>En iPhone primero hay que instalar la app</strong>
              <span>Tocá <b>Compartir</b> <span aria-hidden="true">⬆️</span> en Safari, elegí <b>Agregar a inicio</b> y abrila desde ese ícono. Ahí te vamos a pedir el permiso.</span>
            </div>
            <button className="btn-dark big" onClick={close}>Entendido</button>
          </>
        ) : (
          <>
            <button className="btn-dark big" onClick={activate} disabled={busy}>{busy ? 'Activando…' : 'Activar notificaciones'}</button>
            <button className="btn-light" onClick={close}>Ahora no</button>
          </>
        )}
        <span className="np-foot">Podés cambiarlo cuando quieras en Ajustes.</span>
      </div>
    </div>
  );
}
