'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicState } from './calc';

export type Link = 'starting' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'error';

// No look-alike characters (0/O, 1/I/L) so codes are easy to read out loud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newCode = () => Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const peerId = (code: string) => `tfledger-${code}`;

type Msg = { type: 'state'; state: PublicState } | { type: 'ping' };

/** TF owner side: registers a peer under the pairing code and pushes state to every paired restaurant dashboard. */
export function useHost(state: PublicState) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Link>('starting');
  const [guests, setGuests] = useState(0);
  const conns = useRef(new Set<any>());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    let peer: any;
    let retry: any;

    const start = async (wanted: string, attempt: number) => {
      const { default: Peer } = await import('peerjs');
      if (cancelled) return;
      const p = new Peer(peerId(wanted));
      peer = p;
      p.on('open', () => {
        if (cancelled) return;
        try { sessionStorage.setItem('tf-pair-code', wanted); } catch {}
        setCode(wanted);
        setStatus(conns.current.size ? 'connected' : 'waiting');
      });
      p.on('error', (e: any) => {
        if (cancelled) return;
        if (e.type === 'unavailable-id') {
          // Usually our own previous tab/refresh still registered: retry the same code a few times, then pick a new one.
          p.destroy();
          retry = setTimeout(() => start(attempt < 3 ? wanted : newCode(), attempt + 1), 1500);
        } else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) {
          setStatus('error');
        }
      });
      p.on('disconnected', () => { if (!cancelled && !p.destroyed) { setStatus('reconnecting'); p.reconnect(); } });
      p.on('connection', (conn: any) => {
        conn.on('open', () => {
          conns.current.add(conn);
          setGuests(conns.current.size);
          setStatus('connected');
          conn.send({ type: 'state', state: stateRef.current } satisfies Msg);
        });
        const drop = () => {
          conns.current.delete(conn);
          setGuests(conns.current.size);
          setStatus(s => (s === 'connected' && conns.current.size === 0 ? 'waiting' : s));
        };
        conn.on('close', drop);
        conn.on('error', drop);
      });
    };

    let saved = '';
    try { saved = sessionStorage.getItem('tf-pair-code') || ''; } catch {}
    start(saved || newCode(), 0);
    return () => { cancelled = true; clearTimeout(retry); peer?.destroy(); conns.current.clear(); };
  }, []);

  useEffect(() => {
    conns.current.forEach(c => c.open && c.send({ type: 'state', state } satisfies Msg));
  }, [state]);

  useEffect(() => {
    const t = setInterval(() => conns.current.forEach(c => c.open && c.send({ type: 'ping' } satisfies Msg)), 5000);
    return () => clearInterval(t);
  }, []);

  return { code, status, guests };
}

/** Restaurant side: connects to the TF dashboard by pairing code and mirrors its state; retries automatically. */
export function useGuest(code: string | null) {
  const [state, setState] = useState<PublicState | null>(null);
  const [status, setStatus] = useState<Link>('starting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    let peer: any, conn: any, timer: any, lastMsg = Date.now();
    setStatus('connecting'); setMessage('');

    const schedule = (text?: string) => {
      if (cancelled) return;
      if (text) setMessage(text);
      setStatus(s => (s === 'connected' || s === 'reconnecting' ? 'reconnecting' : 'connecting'));
      clearTimeout(timer);
      timer = setTimeout(connect, 2500);
    };
    const connect = () => {
      if (cancelled || !peer || peer.destroyed) return;
      if (peer.disconnected) peer.reconnect();
      try { conn?.close(); } catch {}
      conn = peer.connect(peerId(code), { reliable: true });
      conn.on('open', () => { lastMsg = Date.now(); setStatus('connected'); setMessage(''); });
      conn.on('data', (d: Msg) => { lastMsg = Date.now(); if (d?.type === 'state') setState(d.state); });
      conn.on('close', () => schedule());
      conn.on('error', () => schedule());
    };

    (async () => {
      const { default: Peer } = await import('peerjs');
      if (cancelled) return;
      peer = new Peer();
      peer.on('open', connect);
      peer.on('disconnected', () => { if (!cancelled && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (e: any) => {
        if (e.type === 'peer-unavailable') schedule('No TF dashboard found with that code yet. Check the code, or make sure the TF dashboard is open. Still trying…');
        else if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(e.type)) { setStatus('error'); setMessage('Cannot reach the pairing service. Check your internet connection.'); }
      });
    })();

    const watchdog = setInterval(() => {
      if (conn?.open && Date.now() - lastMsg > 15000) { try { conn.close(); } catch {} schedule(); }
    }, 3000);

    return () => { cancelled = true; clearTimeout(timer); clearInterval(watchdog); try { conn?.close(); } catch {} peer?.destroy(); };
  }, [code]);

  return { state, status, message };
}
