'use client';
import { useEffect } from 'react';

export function Drawer({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={title}>
        <button className="x" onClick={onClose}>✕ Close</button>
        <h2>{title}</h2>
        {sub && <div className="sub" style={{ marginBottom: 12 }}>{sub}</div>}
        {children}
      </aside>
    </>
  );
}

export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <>
      <div className="scrim m" onClick={onClose} />
      <div className="modal" role="dialog">{children}</div>
    </>
  );
}
