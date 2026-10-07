'use client';
import { useEffect, useMemo, useState } from 'react';
import { computeAll, money, restaurantRows } from '@/lib/calc';
import { normalizeCode, useGuest } from '@/lib/pairing';
import { LineChart, PairedBars } from './Charts';
import { StatusChip, ThemeToggle } from './Bits';

const KEY = 'restaurant-pair-code';

export default function RestaurantDashboard() {
  const [code, setCode] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl = normalizeCode(new URLSearchParams(location.search).get('code') || '');
    let saved = '';
    try { saved = sessionStorage.getItem(KEY) || ''; } catch {}
    setCode(fromUrl.length === 6 ? fromUrl : saved.length === 6 ? saved : null);
    setReady(true);
  }, []);

  const pair = (c: string | null) => {
    setCode(c);
    try { c ? sessionStorage.setItem(KEY, c) : sessionStorage.removeItem(KEY); } catch {}
    if (!c) history.replaceState(null, '', location.pathname);
  };

  if (!ready) return null;
  if (!code) {
    const ok = normalizeCode(input).length === 6;
    return (
      <div className="center">
        <form className="panel" onSubmit={e => { e.preventDefault(); if (ok) pair(normalizeCode(input)); }}>
          <h1>Tablefoundry · Restaurant Dashboard</h1>
          <p>Enter the 6-character pairing code shown on the TF Owner dashboard.</p>
          <input className="codeinput" autoFocus maxLength={7} placeholder="ABC123" value={input} onChange={e => setInput(e.target.value)} aria-label="Pairing code" />
          <button className="primary" disabled={!ok} type="submit">Connect</button>
        </form>
      </div>
    );
  }
  return <Paired code={code} onUnpair={() => pair(null)} />;
}

function Paired({ code, onUnpair }: { code: string; onUnpair: () => void }) {
  const { state, status, message } = useGuest(code);
  const results = useMemo(() => (state ? computeAll(state.cases, state.opening) : []), [state]);
  const rows = useMemo(() => (state ? restaurantRows(state, results) : []), [state, results]);

  const sum = (k: 'gateway' | 'splitFee' | 'recovered' | 'payout' | 'held' | 'raised' | 'food') => rows.reduce((a, r) => a + r[k], 0);
  const last = rows[rows.length - 1];
  const owes = last?.owes ?? (state?.opening.rest || 0);
  const tfOwes = last?.tfOwes ?? (state?.opening.tf || 0);
  const net = tfOwes - owes;
  const paid = rows.filter(r => r.cls === 'ok').length;
  const names = rows.map(r => r.name);

  const downloadCsv = () => {
    const q = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"';
    const head = ['Order', 'Outcome', 'Food value', 'Gateway fee', 'Dues recovered', 'Route split fee', 'Payout received', 'Held by TF', 'Added to dues', 'You owe TF', 'TF owes you', 'Note'];
    const lines = [head.map(q).join(','), ...rows.map(r => [r.name, r.status, r.food, r.gateway, r.recovered, r.splitFee, r.payout, r.held, r.raised, r.owes, r.tfOwes, r.note].map(q).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'restaurant-ledger.csv'; a.click();
  };

  const kpis: [string, React.ReactNode, string?][] = [
    ['Orders', <>{rows.length} <span className="sub">({paid} paid, {rows.length - paid} cancelled)</span></>],
    ['Food value (fulfilled)', money(results.filter(r => r.fulfilled === 'YES').reduce((a, r) => a + r.fc, 0))],
    ['Payouts received', money(sum('payout')), 'good'],
    ['Gateway + split fees', money(sum('gateway') + sum('splitFee'))],
    ['Dues recovered by TF', money(sum('recovered'))],
    ['You owe TF', money(owes), owes > 0.005 ? 'bad' : ''],
    ['TF owes you', money(tfOwes), tfOwes > 0.005 ? 'good' : ''],
    ['Net position', (net >= 0 ? '+' : '−') + money(Math.abs(net)), net > 0.005 ? 'good' : net < -0.005 ? 'bad' : ''],
  ];
  const z = (v: number) => (v < 0.005 ? ' zero' : '');

  return (
    <div className="wrap rest">
      <header>
        <div>
          <h1>Tablefoundry · Restaurant Dashboard</h1>
          <div className="sub">Live, read-only view of what you earn, pay and owe. Orders are entered on the TF Owner dashboard.</div>
        </div>
        <div className="btns">
          <StatusChip status={status} />
          <span className="chip">Code {code}</span>
          <button onClick={downloadCsv} disabled={!rows.length}>Download CSV</button>
          <button onClick={onUnpair}>Change code</button>
          <ThemeToggle />
        </div>
      </header>

      {message && status !== 'connected' && <div className="banner">{message}</div>}
      {status !== 'connected' && state && <div className="banner">Showing the last data received. Updates will resume when the connection is back.</div>}

      {!state ? (
        <div className="card empty">{status === 'error' ? 'Unable to connect.' : 'Connecting to the TF Owner dashboard…'}</div>
      ) : (
        <>
          <div className="kpis">
            {kpis.map(([l, v, c]) => <div key={l} className={`kpi ${c || ''}`}><div className="l">{l}</div><div className="v">{v}</div></div>)}
          </div>
          {rows.length > 0 && (
            <div className="grid2">
              <div className="card">
                <h2>Food value vs payout received</h2>
                <div className="sub">Per order, after gateway fee, route split fee and debt recovery</div>
                <PairedBars labels={names}
                  a={{ name: 'Food value', color: 'var(--s-ref)', values: rows.map(r => r.food) }}
                  b={{ name: 'Payout received', color: 'var(--good)', values: rows.map(r => r.payout) }} />
                <div className="legend">
                  <span><i style={{ background: 'var(--s-ref)' }} />Food value</span>
                  <span><i style={{ background: 'var(--good)' }} />Payout received</span>
                </div>
              </div>
              <div className="card">
                <h2>Running balance with TF</h2>
                <div className="sub">After each order</div>
                <LineChart labels={names} series={[
                  { name: 'You owe TF', color: 'var(--c-rest)', values: rows.map(r => r.owes) },
                  { name: 'TF owes you', color: 'var(--c-tf)', values: rows.map(r => r.tfOwes) },
                ]} />
                <div className="legend">
                  <span><i style={{ background: 'var(--c-rest)' }} />You owe TF</span>
                  <span><i style={{ background: 'var(--c-tf)' }} />TF owes you</span>
                </div>
              </div>
            </div>
          )}
          <div className="tablewrap">
            {rows.length === 0 ? <div className="empty">No orders yet. Cases added on the TF Owner dashboard will appear here instantly.</div> : (
              <table>
                <thead><tr>
                  {['Order', 'Outcome', 'Food value', 'Gateway fee', 'Dues recovered', 'Route split fee', 'Payout received', 'Held by TF for you', 'Added to your dues', 'You owe TF', 'TF owes you', 'What happened'].map((h, i) => <th key={h} style={i === 11 ? { textAlign: 'left' } : undefined}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <th className="rowh">{r.name}</th>
                      <td className="n"><span className={`pill ${r.cls}`}>{r.status}</span></td>
                      <td className="n">{money(r.food)}</td>
                      <td className={'n' + z(r.gateway)}>{money(r.gateway)}</td>
                      <td className={'n' + z(r.recovered)}>{money(r.recovered)}</td>
                      <td className={'n' + z(r.splitFee)}>{money(r.splitFee)}</td>
                      <td className={'n' + (r.payout > 0.005 ? ' pos-good' : ' zero')}>{money(r.payout)}</td>
                      <td className={'n' + z(r.held)}>{money(r.held)}</td>
                      <td className={'n' + z(r.raised)}>{money(r.raised)}</td>
                      <td className={'n' + (r.owes > 0.005 ? ' pos-bad' : ' zero')}>{money(r.owes)}</td>
                      <td className={'n' + (r.tfOwes > 0.005 ? ' pos-good' : ' zero')}>{money(r.tfOwes)}</td>
                      <td className="t">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr>
                  <th className="rowh">Total</th><td />
                  <td className="n">{money(sum('food'))}</td><td className="n">{money(sum('gateway'))}</td><td className="n">{money(sum('recovered'))}</td>
                  <td className="n">{money(sum('splitFee'))}</td><td className="n">{money(sum('payout'))}</td><td className="n">{money(sum('held'))}</td>
                  <td className="n">{money(sum('raised'))}</td><td className="n">{money(owes)}</td><td className="n">{money(tfOwes)}</td><td />
                </tr></tfoot>
              </table>
            )}
          </div>
          <div className="note">Gateway fee is 2% + 18% GST (2.36%) on the order, borne in proportion to food value. Route split fee is 0.25% + 18% GST on the amount transferred to you. If you owe TF, it is recovered from your next fulfilled order&apos;s payout (net of anything TF owes you).</div>
        </>
      )}
    </div>
  );
}
