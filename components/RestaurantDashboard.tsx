'use client';
import { useEffect, useMemo, useState } from 'react';
import { computeAll, money, restaurantRows } from '@/lib/calc';
import { normalizeCode, useGuest } from '@/lib/pairing';
import { LineChart, PairedBars } from './Charts';
import { StatusChip, ThemeToggle, LogoutButton } from './Bits';
import RestSettlement from './RestSettlement';
import AccountModal from './AccountModal';
import { AccountDetails, hasAnyDetails, loadAccount, loadAllAccounts, saveAccount } from '@/lib/account';
import { isOpen } from '@/lib/settlement';

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
  const { state, status, message, send } = useGuest(code);
  const [settleOpen, setSettleOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [accts, setAccts] = useState<Record<string, AccountDetails>>({});
  const [sel, setSel] = useState('');
  useEffect(() => { try { setSel(sessionStorage.getItem('restaurant-sel') || ''); } catch {} }, []);

  const results = useMemo(() => (state ? computeAll(state.orders, state.settlements) : []), [state]);
  const allRows = useMemo(() => (state ? restaurantRows(state.orders, results) : []), [state, results]);
  const restaurants = useMemo(() => {
    const m = new Map<string, string>();
    allRows.forEach(r => m.set(r.key, r.restaurant));
    return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows]);
  const current = restaurants.find(r => r.key === sel)?.key ?? restaurants[0]?.key ?? '';
  const pick = (k: string) => { setSel(k); try { sessionStorage.setItem('restaurant-sel', k); } catch {} };
  const rows = useMemo(() => allRows.filter(r => r.key === current), [allRows, current]);
  useEffect(() => { setAccts(loadAllAccounts(code)); }, [code]);
  const account = accts[current] ?? (current ? loadAccount(code, current) : undefined);
  const saveAcct = (d: AccountDetails | null) => {
    saveAccount(code, current, d);
    setAccts(a => { const n = { ...a }; if (d) n[current] = d; else delete n[current]; return n; });
    send({ kind: 'account', key: current, details: d });
  };
  // Re-send every saved account to TF whenever the connection (re)opens.
  useEffect(() => {
    if (status !== 'connected') return;
    Object.entries(loadAllAccounts(code)).forEach(([k, d]) => send({ kind: 'account', key: k, details: d }));
  }, [status, code]); // eslint-disable-line react-hooks/exhaustive-deps
  const resFor = useMemo(() => (state ? results.filter((_, i) => allRows[i].key === current) : []), [state, results, allRows, current]);

  const sum = (k: 'gateway' | 'splitFee' | 'recovered' | 'payout' | 'held' | 'raised' | 'food') => rows.reduce((a, r) => a + r[k], 0);
  const mySettlements = useMemo(() => (state ? state.settlements.filter(x => x.restaurantKey === current) : []), [state, current]);
  const needsAction = mySettlements.some(x => x.status === 'awaiting');
  const last = rows[rows.length - 1];
  const owes = last?.owes ?? 0;
  const tfOwes = last?.tfOwes ?? 0;
  const net = tfOwes - owes;
  const paid = rows.filter(r => r.cls === 'ok').length;
  const refundPending = rows.filter(r => r.refundLabel === 'Refund pending').length;
  const names = rows.map(r => r.name);

  const downloadCsv = () => {
    const q = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"';
    const head = ['Order', 'Outcome', 'Refund', 'Food value', 'Gateway fee', 'Dues recovered', 'Route split fee', 'Payout received', 'Held by TF', 'Added to dues', 'You owe TF', 'TF owes you', 'Note'];
    const lines = [head.map(q).join(','), ...rows.map(r => [r.name, r.status, r.refundLabel, r.food, r.gateway, r.recovered, r.splitFee, r.payout, r.held, r.raised, r.owes, r.tfOwes, r.note].map(q).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'restaurant-ledger.csv'; a.click();
  };

  const kpis: [string, React.ReactNode, string?, string?][] = [
    ['Orders', <>{rows.length} <span className="sub">({paid} paid, {rows.length - paid} cancelled)</span></>],
    ['Food value (fulfilled)', money(resFor.filter(r => r.fulfilled === 'YES').reduce((a, r) => a + r.fc, 0))],
    ['Payouts received', money(sum('payout')), 'good'],
    ['Gateway + split fees', money(sum('gateway') + sum('splitFee'))],
    ['Dues recovered by TF', money(sum('recovered'))],
    ['Refunds pending', String(refundPending), refundPending ? 'bad' : ''],
    ['You owe TF', money(owes), owes > 0.005 ? 'bad' : ''],
    ['TF owes you', money(tfOwes), tfOwes > 0.005 ? 'good' : '', 'settle'],
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
          <button onClick={() => setAcctOpen(true)} disabled={!current}>Account details{current && !hasAnyDetails(account) ? ' ⚠' : ''}</button>
          <button onClick={downloadCsv} disabled={!rows.length}>Download CSV</button>
          <button onClick={onUnpair}>Change code</button>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {message && status !== 'connected' && <div className="banner">{message}</div>}
      {status !== 'connected' && state && <div className="banner">Showing the last data received. Updates will resume when the connection is back.</div>}

      {!state ? (
        <div className="card empty">{status === 'error' ? 'Unable to connect.' : 'Connecting to the TF Owner dashboard…'}</div>
      ) : (
        <>
          <div className="filters">
            <label className="sub">Restaurant&nbsp;
              <select value={current} onChange={e => pick(e.target.value)} disabled={!restaurants.length}>
                {restaurants.length === 0 && <option>No restaurants yet</option>}
                {restaurants.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
              </select>
            </label>
          </div>
          <div className="kpis">
            {kpis.map(([l, v, c, k]) => k === 'settle'
              ? <button key={l} className={`kpi click ${c || ''}`} onClick={() => setSettleOpen(true)}><div className="l">{l}</div><div className="v">{v}</div><div className="sub" style={needsAction ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{!hasAnyDetails(account) && current ? 'No account details added' : needsAction ? 'Settlement awaiting your verification' : mySettlements.some(isOpen) ? 'Settlement in progress' : 'Click for settlement'}</div></button>
              : <div key={l} className={`kpi ${c || ''}`}><div className="l">{l}</div><div className="v">{v}</div></div>)}
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
            {rows.length === 0 ? <div className="empty">No orders yet for this restaurant. Orders added on the TF Owner dashboard will appear here instantly.</div> : (
              <table>
                <thead><tr>
                  {['Order', 'Outcome', 'Refund', 'Food value', 'Gateway fee', 'Dues recovered', 'Route split fee', 'Payout received', 'Held by TF for you', 'Added to your dues', 'You owe TF', 'TF owes you', 'What happened'].map((h, i, a) => <th key={h} style={i === a.length - 1 ? { textAlign: 'left' } : undefined}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <th className="rowh">{r.name}</th>
                      <td className="n"><span className={`pill ${r.cls}`}>{r.status}</span></td>
                      <td className="n">{r.refundLabel === '—' ? <span className="zero">—</span> : <span className={`pill ${r.refundLabel === 'Refunded' ? 'ok' : 'hold'}`}>{r.refundLabel}</span>}</td>
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
                  <th className="rowh">Total</th><td /><td />
                  <td className="n">{money(sum('food'))}</td><td className="n">{money(sum('gateway'))}</td><td className="n">{money(sum('recovered'))}</td>
                  <td className="n">{money(sum('splitFee'))}</td><td className="n">{money(sum('payout'))}</td><td className="n">{money(sum('held'))}</td>
                  <td className="n">{money(sum('raised'))}</td><td className="n">{money(owes)}</td><td className="n">{money(tfOwes)}</td><td />
                </tr></tfoot>
              </table>
            )}
          </div>
          {settleOpen && <RestSettlement name={restaurants.find(r => r.key === current)?.name ?? ''} settlements={mySettlements} tfOwes={tfOwes} restOwes={owes} send={send} connected={status === 'connected'} account={account} onAddAccount={() => { setSettleOpen(false); setAcctOpen(true); }} onClose={() => setSettleOpen(false)} />}
          {acctOpen && <AccountModal name={restaurants.find(r => r.key === current)?.name ?? ''} initial={account} onSave={saveAcct} onClose={() => setAcctOpen(false)} />}
          <div className="note">Gateway fee is 2% + 18% GST (2.36%) on the order, borne in proportion to food value. Route split fee is 0.25% + 18% GST on the amount transferred to you. If you owe TF, it is recovered from your next fulfilled order&apos;s payout (net of anything TF owes you). Cancelled orders change your balances only after TF processes the refund.</div>
        </>
      )}
    </div>
  );
}
