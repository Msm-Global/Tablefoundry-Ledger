'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { BLANK, Order, Result, Summary, TFState, computeAll, creditsBalance, primaryBalance, summarize, toPublic } from '@/lib/calc';
import { useHost, Link } from '@/lib/pairing';
import { applyCmd } from '@/lib/settlement';

const STORE = 'tf-ledger-state-v2';

interface Api {
  state: TFState;
  setState: React.Dispatch<React.SetStateAction<TFState>>;
  results: Result[];
  summary: Summary;
  credits: number;
  primary: number;
  user: string;
  pair: { code: string; status: Link; guests: number };
  origin: string;
}
const Ctx = createContext<Api | null>(null);
export const useTF = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTF outside provider');
  return c;
};

export function TFProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TFState>(BLANK);
  const [loaded, setLoaded] = useState(false);
  const [user, setUser] = useState('');
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(location.origin);
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && Array.isArray(s.orders)) setState({ orders: s.orders as Order[], wallet: s.wallet || [], audit: s.audit || [], settlements: s.settlements || [] });
    } catch {}
    setLoaded(true);
    fetch('/api/me').then(r => r.json()).then(j => setUser(j.email || '')).catch(() => {});
  }, []);
  useEffect(() => {
    if (loaded) try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  }, [state, loaded]);

  const results = useMemo(() => computeAll(state.orders, state.settlements), [state.orders, state.settlements]);
  const summary = useMemo(() => summarize(state.orders, results), [state.orders, results]);
  const pub = useMemo(() => toPublic(state), [state.orders, state.settlements]); // eslint-disable-line react-hooks/exhaustive-deps
  const pair = useHost(pub, cmd => setState(s => applyCmd(s, cmd)));

  const value = useMemo<Api>(() => ({
    state, setState, results, summary, user, origin, pair,
    credits: creditsBalance(state.wallet), primary: primaryBalance(results),
  }), [state, results, summary, user, origin, pair]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
