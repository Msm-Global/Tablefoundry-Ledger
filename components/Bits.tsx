'use client';
import { useEffect, useRef, useState } from 'react';
import type { Link } from '@/lib/pairing';

export function ThemeToggle() {
  return (
    <button
      onClick={() => {
        const r = document.documentElement;
        const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        r.dataset.theme = dark ? 'light' : 'dark';
      }}
    >
      Theme
    </button>
  );
}

const LABEL: Record<Link, [string, string]> = {
  starting: ['warn', 'Starting…'],
  waiting: ['warn', 'Waiting for the restaurant dashboard'],
  connecting: ['warn', 'Connecting…'],
  connected: ['ok', 'Connected'],
  reconnecting: ['warn', 'Connection lost – reconnecting…'],
  error: ['bad', 'Pairing service unreachable'],
};
export function StatusChip({ status, extra }: { status: Link; extra?: string }) {
  const [cls, text] = LABEL[status];
  return <span className={`chip ${cls}`}><i />{text}{extra ? ` ${extra}` : ''}</span>;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch {}
        setDone(true); setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? 'Copied ✓' : label}
    </button>
  );
}

/** Number input that lets you clear and retype freely, committing a number on every keystroke. */
export function NumInput({ value, onChange, disabled, max }: { value: number; onChange: (n: number) => void; disabled?: boolean; max?: number }) {
  const [txt, setTxt] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(String(value)); }, [value]);
  return (
    <input
      type="number" step="any" min="0" max={max} inputMode="decimal" value={txt} disabled={disabled}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; setTxt(String(value)); }}
      onChange={e => { setTxt(e.target.value); onChange(e.target.value === '' ? 0 : Math.max(0, +e.target.value)); }}
    />
  );
}

export function LogoutButton() {
  return (
    <button onClick={async () => { await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; }}>Sign out</button>
  );
}
