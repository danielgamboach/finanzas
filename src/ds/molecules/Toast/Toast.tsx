import React from 'react';
import './Toast.css';

/** Short confirmation at the bottom. With onUndo it offers "Deshacer" (bulk actions, 6 s). Positioning is up to the host. */
export function Toast({ message, onUndo, className }: { message: React.ReactNode; onUndo?: () => void; className?: string }) {
  return (
    <div className={['ds-toast', onUndo && 'has-undo', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      <span className="ds-toast__msg">{message}</span>
      {onUndo && <button type="button" className="ds-toast__undo" onClick={onUndo}>Deshacer</button>}
    </div>
  );
}
