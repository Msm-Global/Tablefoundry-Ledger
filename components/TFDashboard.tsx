'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { BLANK, Case, LedgerState, OUTCOMES, Outcome, Result, computeAll, money, pct } from '@/lib/calc';
import { useHost } from '@/lib/pairing';
import { LineChart, StackedShareChart } from './Charts';
import { CopyButton, NumInput, StatusChip, ThemeToggle } from './Bits';

const STORE = 'tf-ledger-state-v1';
const uid = () => Math.random().toString(36).slice(2, 9);

type Row =
  | { sec: string }
  | { key: keyof Result; label: string; fmt: (v: any) => string; tone?: 'bad' | 'good' };
const txt = (v: any) => String(v);
const ROWS: Row[] = [
  { sec: 'Totals & share ratios' },
  { key: 'tov', label: 'Total order value', fmt: money },
  { key: 'rs', label: 'Restaurant share %', fmt: pct },
  { key: 'ds', label: 'Delivery share %', fmt: pct },
  { key: 'pfs', label: 'Platform fee share %', fmt: pct },
  { sec: 'Deduction 1 – payment gateway (2% + 18% GST)' },
  { key: 'pgFee', label: 'Payment gateway fee', fmt: money },
  { key: 'pw', label: 'Primary wallet amount after deduction', fmt: money },
  { sec: 'Previous owes carried in' },
  { key: 'prevLog', label: 'Logistic owe TF', fmt: money },
  { key: 'prevRest', label: 'Restaurant owe TF', fmt: money },
  { key: 'prevTf', label: 'TF owe restaurant', fmt: money },
  { sec: 'Primary wallet split' },
  { key: 'restPre', label: 'Restaurant share (before owed to TF)', fmt: money },
  { key: 'restPost', label: 'Restaurant share (after owed to TF)', fmt: money },
  { key: 'delWallet', label: 'Delivery share in primary wallet', fmt: money },
  { key: 'pfWallet', label: 'Platform fee share in primary wallet', fmt: money },
  { sec: 'Deduction 2 – Razorpay route split (0.25% + 18% GST)' },
  { key: 'splitFee', label: 'Razorpay split fee', fmt: money },
  { key: 'target', label: 'Amount to be transferred to restaurant wallet', fmt: money },
  { key: 'actual', label: 'Amount transferred to restaurant wallet', fmt: money, tone: 'good' },
  { key: 'delFinal', label: 'Final amount in delivery wallet (no route transfer)', fmt: money },
  { key: 'pfFinal', label: 'Amount to be transferred to platform wallet', fmt: money },
  { sec: 'Overall deduction' },
  { key: 'restDed', label: 'Overall deduction % to restaurant amount', fmt: pct },
  { key: 'delDed', label: 'Overall deduction % to delivery amount', fmt: pct },
  { sec: 'Fulfilment & fault' },
  { key: 'fulfilled', label: 'Order fulfilled', fmt: txt },
  { key: 'reason', label: 'Reason for not fulfilled', fmt: v => v || '—' },
  { key: 'logF', label: 'Logistic fault (no 0 / yes 1)', fmt: txt },
  { key: 'restF', label: 'Restaurant fault (no 0 / yes 1)', fmt: txt },
  { key: 'tfF', label: 'TF server fault (no 0 / yes 1)', fmt: txt },
  { sec: 'Refunds' },
  { key: 'refund', label: 'Amount refunded to diner', fmt: money },
  { key: 'delLeft', label: 'Delivery share left in TF wallet', fmt: money },
  { sec: 'Ledger after this case' },
  { key: 'restOwes', label: 'RESTAURANT OWES TF (restaurant failure)', fmt: money, tone: 'bad' },
  { key: 'logOwes', label: 'LOGISTIC OWES TF (logistics failure)', fmt: money, tone: 'bad' },
  { key: 'tfOwes', label: 'TF OWES RESTAURANT (TF server failure)', fmt: money, tone: 'bad' },
];

export default function TFDashboard() {
  const [state, setState] = useState<LedgerState>(BLANK);
  const [loaded, setLoaded] = useState(false);
  const { code, status, guests } = useHost(state);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(location.origin);
    try {
      const s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && Array.isArray(s.cases)) setState(s);
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
  }, [state, loaded]);

  const results = useMemo(() => computeAll(state.cases, state.opening), [state]);
  const edit = (i: number, patch: Partial<Case>) => setState(s => ({ ...s, cases: s.cases.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addCase = () => setState(s => {
    const p = s.cases[s.cases.length - 1];
    return { ...s, cases: [...s.cases, { id: uid(), name: `Case ${s.cases.length + 1}`, fc: p?.fc ?? 100, dc: p?.dc ?? 30, pf: p?.pf ?? 0, outcome: 'YES' }] };
  });
  const dup = (i: number) => setState(s => { const c = s.cases[i]; const cs = [...s.cases]; cs.splice(i + 1, 0, { ...c, id: uid(), name: c.name + ' copy' }); return { ...s, cases: cs }; });
  const del = (i: number) => setState(s => ({ ...s, cases: s.cases.filter((_, j) => j !== i) }));

  const sum = (k: keyof Result) => results.reduce((a, r) => a + (r[k] as number), 0);
  const last = results[results.length - 1];
  const fulfilled = results.filter(r => r.fulfilled === 'YES').length;
  const kpis: [string, React.ReactNode, string?][] = [
    ['Orders', <>{results.length} <span className="sub">({fulfilled} fulfilled)</span></>],
    ['Total order value', money(sum('tov'))],
    ['Refunded to diners', money(sum('refund'))],
    ['Paid to restaurants', money(sum('actual')), 'good'],
    ['In delivery wallet', money(sum('delFinal'))],
    ['Gateway fees', money(sum('pgFee'))],
    ['Logistics owes TF', money(last?.logOwes ?? state.opening.log), (last?.logOwes ?? 0) > 0.005 ? 'bad' : ''],
    ['Restaurant owes TF', money(last?.restOwes ?? state.opening.rest), (last?.restOwes ?? 0) > 0.005 ? 'bad' : ''],
    ['TF owes restaurant', money(last?.tfOwes ?? state.opening.tf), (last?.tfOwes ?? 0) > 0.005 ? 'bad' : ''],
  ];
  const names = state.cases.map(c => c.name);

  const downloadCsv = () => {
    const q = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [['Particulars', ...names].map(q).join(','),
      ['Food cost', ...state.cases.map(c => c.fc)].map(q).join(','),
      ['Delivery cost', ...state.cases.map(c => c.dc)].map(q).join(','),
      ['Platform fee', ...state.cases.map(c => c.pf)].map(q).join(','),
      ['Outcome', ...state.cases.map(c => c.outcome)].map(q).join(','),
      ...ROWS.filter((r): r is Extract<Row, { key: keyof Result }> => 'key' in r).map(r => [r.label, ...results.map(x => x[r.key])].map(q).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'tf-settlement-ledger.csv'; a.click();
  };

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Tablefoundry · TF Owner Dashboard</h1>
          <div className="sub">Enter test cases here. Every change appears instantly on the paired restaurant dashboard.</div>
        </div>
        <div className="btns">
          <button className="primary" onClick={addCase}>+ Add case</button>
          <button onClick={downloadCsv} disabled={!state.cases.length}>Download CSV</button>
          <button className="danger" onClick={() => { if (confirm('Delete all cases?')) setState(s => ({ ...s, cases: [] })); }}>Clear all</button>
          <ThemeToggle />
        </div>
      </header>

      <div className="pair">
        <div>
          <div className="lab">PAIRING CODE – give this to the restaurant dashboard</div>
          <div className="code">{code || '······'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <StatusChip status={status} extra={guests > 1 ? `(${guests} dashboards)` : ''} />
          <div className="btns">
            <CopyButton text={code} label="Copy code" />
            <CopyButton text={`${origin}/restaurant?code=${code}`} label="Copy restaurant link" />
          </div>
        </div>
      </div>

      <div className="kpis">
        {kpis.map(([l, v, c]) => <div key={l} className={`kpi ${c || ''}`}><div className="l">{l}</div><div className="v">{v}</div></div>)}
      </div>

      {results.length > 0 && (
        <div className="grid2">
          <div className="card">
            <h2>Ledger balances after each case</h2>
            <div className="sub">Running debt between parties</div>
            <LineChart labels={names} series={[
              { name: 'Logistics owes TF', color: 'var(--c-log)', values: results.map(r => r.logOwes) },
              { name: 'Restaurant owes TF', color: 'var(--c-rest)', values: results.map(r => r.restOwes) },
              { name: 'TF owes restaurant', color: 'var(--c-tf)', values: results.map(r => r.tfOwes) },
            ]} />
            <div className="legend">
              <span><i style={{ background: 'var(--c-log)' }} />Logistics owes TF</span>
              <span><i style={{ background: 'var(--c-rest)' }} />Restaurant owes TF</span>
              <span><i style={{ background: 'var(--c-tf)' }} />TF owes restaurant</span>
            </div>
          </div>
          <div className="card">
            <h2>Where each order&apos;s money goes</h2>
            <div className="sub">Share of total order value</div>
            <StackedShareChart labels={names} bars={results.map(r => {
              const failed = r.fulfilled === 'NO';
              return { total: r.tov, parts: failed
                ? [{ name: 'Refunded', color: 'var(--s-ref)', value: r.tov }]
                : [{ name: 'Restaurant payout', color: 'var(--s-rest)', value: r.actual },
                   { name: 'Delivery/platform wallet', color: 'var(--s-del)', value: r.delFinal + r.pfFinal },
                   { name: 'Fees & recovered debt', color: 'var(--s-fee)', value: r.tov - r.actual - r.delFinal - r.pfFinal }] };
            })} />
            <div className="legend">
              <span><i style={{ background: 'var(--s-rest)' }} />Restaurant payout</span>
              <span><i style={{ background: 'var(--s-del)' }} />Delivery wallet</span>
              <span><i style={{ background: 'var(--s-fee)' }} />Fees &amp; recovered debt</span>
              <span><i style={{ background: 'var(--s-ref)' }} />Refunded</span>
            </div>
          </div>
        </div>
      )}

      <div className="open">
        <b>Opening ledger (before Case 1)</b>
        {([['log', 'Logistic owes TF'], ['rest', 'Restaurant owes TF'], ['tf', 'TF owes Restaurant']] as const).map(([k, l]) => (
          <label key={k}>{l}<NumInput value={state.opening[k]} onChange={n => setState(s => ({ ...s, opening: { ...s.opening, [k]: n } }))} /></label>
        ))}
      </div>

      <div className="tablewrap">
        {state.cases.length === 0 ? (
          <div className="empty">No cases yet. Click “+ Add case” to enter your first test order.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                {state.cases.map((c, i) => (
                  <th key={c.id}><div className="colhead">
                    <button title="Duplicate" onClick={() => dup(i)}>⧉</button>
                    <button title="Delete" onClick={() => del(i)}>✕</button>
                  </div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="sec"><th>Order inputs</th>{state.cases.map(c => <td key={c.id} />)}</tr>
              <tr className="inp"><th>Case name</th>{state.cases.map((c, i) => (
                <td key={c.id}><input type="text" value={c.name} onChange={e => edit(i, { name: e.target.value })} style={{ width: '100%', textAlign: 'right', fontWeight: 600 }} /></td>
              ))}</tr>
              {([['fc', 'Food cost / restaurant share'], ['dc', 'Delivery cost'], ['pf', 'Platform fee']] as const).map(([k, l]) => (
                <tr className="inp" key={k}><th>{l}</th>{state.cases.map((c, i) => <td key={c.id}><NumInput value={c[k]} onChange={n => edit(i, { [k]: n })} /></td>)}</tr>
              ))}
              <tr className="inp"><th>Order outcome</th>{state.cases.map((c, i) => (
                <td key={c.id}><select value={c.outcome} style={{ width: '100%' }} onChange={e => edit(i, { outcome: e.target.value as Outcome })}>
                  {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></td>
              ))}</tr>
              {ROWS.map((r, ri) => 'sec' in r ? (
                <tr className="sec" key={ri}><th>{r.sec}</th>{state.cases.map(c => <td key={c.id} />)}</tr>
              ) : (
                <tr key={ri}><th>{r.label}</th>{results.map((x, i) => {
                  const v = x[r.key];
                  const n = typeof v === 'number' ? v : 0;
                  const cls = r.tone === 'bad' && n > 0.005 ? ' pos-bad' : r.tone === 'good' && n > 0.005 ? ' pos-good' : typeof v === 'number' && Math.abs(n) < 0.005 ? ' zero' : '';
                  return <td key={state.cases[i].id} className={'n calc' + cls} title={typeof v === 'number' ? String(v) : ''}>{r.fmt(v)}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="note">Formulas follow the source spreadsheet: gateway fee 2% + 18% GST on order value; route split fee 0.25% + 18% GST divided out of the restaurant amount; restaurant debt (net of what TF owes it) is recovered from a fulfilled order&apos;s restaurant share. Data is saved in this browser.</div>
    </div>
  );
}
