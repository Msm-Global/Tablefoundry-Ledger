'use client';
import { useMemo } from 'react';
import { Order, OUTCOMES, Outcome, PROVIDERS, Provider, REASONS, Result, defaultReason, money, newOrderId, pct, uid } from '@/lib/calc';
import { NumInput } from './Bits';
import { useTF } from './TFProvider';

type Row = { sec: string } | { key: keyof Result; label: string; fmt: (v: any) => string; tone?: 'bad' | 'good' };
const txt = (v: any) => String(v);
const STATE_LABEL: Record<string, string> = { fulfilled: 'Fulfilled', pending: 'Refund pending', refunded: 'Refunded (transfer not reversed)', reversed: 'Refunded + transfer reversed' };
const ROWS: Row[] = [
  { sec: 'Totals & share ratios' },
  { key: 'tov', label: 'Total order value', fmt: money },
  { key: 'rs', label: 'Restaurant share %', fmt: pct },
  { key: 'ds', label: 'Delivery share %', fmt: pct },
  { key: 'pfs', label: 'Platform fee share %', fmt: pct },
  { sec: 'Deduction 1 – payment gateway (2% + 18% GST)' },
  { key: 'pgFee', label: 'Payment gateway fee', fmt: money },
  { key: 'pw', label: 'Primary wallet amount after deduction', fmt: money },
  { sec: 'Previous owes carried in (this restaurant / this delivery partner)' },
  { key: 'prevLog', label: 'Logistic owe TF', fmt: money },
  { key: 'prevRest', label: 'Restaurant owe TF', fmt: money },
  { key: 'prevTf', label: 'TF owe restaurant', fmt: money },
  { sec: 'Primary wallet split' },
  { key: 'restPre', label: 'Restaurant share (before owed to TF)', fmt: money },
  { key: 'restPost', label: 'Restaurant share (after owed to TF)', fmt: money },
  { key: 'delWallet', label: 'Delivery share in primary wallet', fmt: money },
  { key: 'pfWallet', label: 'Platform fee share in primary wallet', fmt: money },
  { sec: 'Deduction 2 – Razorpay route split (0.25% + 18% GST)' },
  { key: 'splitFee', label: 'Razorpay split fee (on restaurant transfer)', fmt: money },
  { key: 'target', label: 'Amount to be transferred to restaurant wallet', fmt: money },
  { key: 'actual', label: 'Amount transferred to restaurant wallet', fmt: money, tone: 'good' },
  { key: 'delFinal', label: 'Final amount in primary wallet (delivery share, no route transfer)', fmt: money },
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
  { key: 'state', label: 'Refund status', fmt: v => STATE_LABEL[v] },
  { key: 'refund', label: 'Amount refunded to diner', fmt: money },
  { key: 'revAmt', label: 'Transfer reversed from restaurant', fmt: money },
  { key: 'delLeft', label: 'Delivery share left in primary wallet', fmt: money },
  { sec: 'Ledger after this order' },
  { key: 'restOwes', label: 'RESTAURANT OWES TF (restaurant failure)', fmt: money, tone: 'bad' },
  { key: 'logOwes', label: 'LOGISTIC OWES TF (logistics failure)', fmt: money, tone: 'bad' },
  { key: 'tfOwes', label: 'TF OWES RESTAURANT (TF server failure)', fmt: money, tone: 'bad' },
];

export default function Simulator() {
  const { state, setState, results } = useTF();
  const orders = state.orders;
  const restaurants = useMemo(() => [...new Set(orders.map(o => o.restaurant.trim()).filter(Boolean))], [orders]);

  const edit = (i: number, patch: Partial<Order>) => setState(s => ({ ...s, orders: s.orders.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const add = () => setState(s => {
    const p = s.orders[s.orders.length - 1];
    const o: Order = { id: newOrderId(), name: `Order ${s.orders.length + 1}`, restaurant: p?.restaurant ?? 'Restaurant A', provider: p?.provider ?? 'UENGAGE', fc: p?.fc ?? 100, dc: p?.dc ?? 30, pf: p?.pf ?? 0, outcome: 'YES', reason: '', issue: '', createdAt: Date.now() };
    return { ...s, orders: [...s.orders, o] };
  });
  const dup = (i: number) => setState(s => { const c = s.orders[i]; const cs = [...s.orders]; cs.splice(i + 1, 0, { ...c, id: newOrderId(), name: c.name + ' copy', refund: undefined, createdAt: Date.now() }); return { ...s, orders: cs }; });
  const del = (i: number) => setState(s => ({ ...s, orders: s.orders.filter((_, j) => j !== i) }));
  const reset = () => { if (confirm('Delete ALL orders, the refund wallet ledger and the activity log?')) setState({ orders: [], wallet: [], audit: [] }); };

  const downloadCsv = () => {
    const q = (v: unknown) => '"' + String(v).replace(/"/g, '""') + '"';
    const inputs: [string, (o: Order) => unknown][] = [['Restaurant', o => o.restaurant], ['Delivery partner', o => o.provider], ['Food cost', o => o.fc], ['Delivery cost', o => o.dc], ['Platform fee', o => o.pf], ['Outcome', o => o.outcome], ['Reason', o => o.reason], ['Issue note', o => o.issue]];
    const lines = [['Particulars', ...orders.map(o => o.name)].map(q).join(','),
      ...inputs.map(([l, f]) => [l, ...orders.map(f)].map(q).join(',')),
      ...ROWS.filter((r): r is Extract<Row, { key: keyof Result }> => 'key' in r).map(r => [r.label, ...results.map(x => x[r.key])].map(q).join(','))];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = 'order-simulator.csv'; a.click();
  };

  const cells = (render: (o: Order, i: number) => React.ReactNode, cls = '') => orders.map((o, i) => <td key={o.id} className={cls}>{render(o, i)}</td>);
  const locked = (o: Order) => !!o.refund;

  return (
    <>
      <div className="filters" style={{ justifyContent: 'space-between' }}>
        <div className="sub">Test-order creation screen. Create fake orders here, then process refunds on the Operations screen. Orders with a refund recorded are locked until the refund is undone.</div>
        <div className="btns">
          <button className="primary" onClick={add}>+ Add order</button>
          <button onClick={downloadCsv} disabled={!orders.length}>Download CSV</button>
          <button className="danger" onClick={reset}>Reset everything</button>
        </div>
      </div>
      <datalist id="rests">{restaurants.map(r => <option key={r} value={r} />)}</datalist>

      <div className="tablewrap">
        {orders.length === 0 ? <div className="empty">No orders yet. Click “+ Add order” to create your first test order.</div> : (
          <table>
            <thead>
              <tr>
                <th>Particulars</th>
                {orders.map((o, i) => (
                  <th key={o.id}><div className="colhead">
                    {locked(o) && <span title="Locked: refund recorded">🔒</span>}
                    <button title="Duplicate" onClick={() => dup(i)}>⧉</button>
                    <button title={locked(o) ? 'Undo the refund first' : 'Delete'} disabled={locked(o)} onClick={() => del(i)}>✕</button>
                  </div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="sec"><th>Order inputs</th>{orders.map(o => <td key={o.id} />)}</tr>
              <tr className="inp"><th>Order name</th>{cells((o, i) => <input type="text" value={o.name} disabled={locked(o)} onChange={e => edit(i, { name: e.target.value })} style={{ width: '100%', textAlign: 'right', fontWeight: 600 }} />)}</tr>
              <tr className="inp"><th>Order ID</th>{cells(o => <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{o.id}</span>, 'n')}</tr>
              <tr className="inp"><th>Restaurant</th>{cells((o, i) => <input type="text" list="rests" value={o.restaurant} disabled={locked(o)} onChange={e => edit(i, { restaurant: e.target.value })} style={{ width: '100%', textAlign: 'right' }} />)}</tr>
              <tr className="inp"><th>Delivery partner</th>{cells((o, i) => (
                <select value={o.provider} disabled={locked(o)} style={{ width: '100%' }} onChange={e => edit(i, { provider: e.target.value as Provider })}>
                  {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>))}</tr>
              {([['fc', 'Food cost / restaurant share'], ['dc', 'Delivery cost'], ['pf', 'Platform fee']] as const).map(([k, l]) => (
                <tr className="inp" key={k}><th>{l}</th>{cells((o, i) => <NumInput value={o[k]} disabled={locked(o)} onChange={n => edit(i, { [k]: n })} />)}</tr>
              ))}
              <tr className="inp"><th>Order outcome</th>{cells((o, i) => (
                <select value={o.outcome} disabled={locked(o)} style={{ width: '100%' }} onChange={e => { const v = e.target.value as Outcome; edit(i, { outcome: v, reason: defaultReason(v) }); }}>
                  {OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>))}</tr>
              <tr className="inp"><th>Reason for not fulfilled</th>{cells((o, i) => o.outcome === 'YES' ? <span className="sub">—</span> : (
                <select value={o.reason} disabled={locked(o)} style={{ width: '100%' }} onChange={e => edit(i, { reason: e.target.value })}>
                  {REASONS[o.outcome].map(r => <option key={r} value={r}>{r}</option>)}
                </select>))}</tr>
              <tr className="inp"><th>Issue note (what went wrong)</th>{cells((o, i) => o.outcome === 'YES' ? <span className="sub">—</span> : (
                <input type="text" value={o.issue} disabled={locked(o)} placeholder="Describe the issue" onChange={e => edit(i, { issue: e.target.value })} style={{ width: '100%' }} />))}</tr>
              {ROWS.map((r, ri) => 'sec' in r ? (
                <tr className="sec" key={ri}><th>{r.sec}</th>{orders.map(o => <td key={o.id} />)}</tr>
              ) : (
                <tr key={ri}><th>{r.label}</th>{results.map((x, i) => {
                  const v = x[r.key];
                  const n = typeof v === 'number' ? v : 0;
                  const cls = r.tone === 'bad' && n > 0.005 ? ' pos-bad' : r.tone === 'good' && n > 0.005 ? ' pos-good' : typeof v === 'number' && Math.abs(n) < 0.005 ? ' zero' : '';
                  return <td key={orders[i].id} className={'n calc' + cls} title={typeof v === 'number' ? String(v) : ''}>{r.fmt(v)}</td>;
                })}</tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="note">Owes are tracked per restaurant, and logistics owes per delivery partner. A failed order does not move the owes ledger until its refund is recorded on the Operations screen (and, for TF/restaurant balances, its transfer is reversed). Data is saved in this browser.</div>
    </>
  );
}
