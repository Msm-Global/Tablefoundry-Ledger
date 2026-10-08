'use client';
import { useMemo, useState } from 'react';
import { adjust, topUp, undoRefund, undoReversal } from '@/lib/actions';
import { Order, Result, fmtTime, money, outcomeLabel, providerLabel, rkey } from '@/lib/calc';
import { Drawer } from './Drawer';
import RefundModal from './RefundModal';
import { NumInput } from './Bits';
import { useTF } from './TFProvider';

type Panel = null | 'credits' | 'primary' | 'refunds' | 'tfowes' | 'restowes' | 'logowes';
const STATE_BADGE: Record<string, [string, string]> = {
  fulfilled: ['na', 'Fulfilled'], pending: ['pending', 'Refund pending'], refunded: ['refunded', 'Refunded · reversal due'], reversed: ['reversed', 'Refunded · reversed'],
};

const plural = (n: number) => `${n} restaurant${n === 1 ? '' : 's'}`;

export default function Operations() {
  const { state, setState, results, summary, credits, primary, user } = useTF();
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<{ id: string; kind: 'refund' | 'reversal' } | null>(null);
  const [fRest, setFRest] = useState('');
  const [fState, setFState] = useState('');
  const by = user || 'unknown';

  const pending = state.orders.map((o, i) => ({ o, r: results[i] })).filter(x => x.r.state === 'pending');
  const pendingTotal = pending.reduce((a, x) => a + x.r.tov, 0);
  const tfOwesTotal = summary.restaurants.reduce((a, x) => a + x.tfOwes, 0);
  const restOwesTotal = summary.restaurants.reduce((a, x) => a + x.owes, 0);
  const logTotal = summary.logistics.reduce((a, x) => a + x.owes, 0);
  const sum = (k: keyof Result) => results.reduce((a, r) => a + (r[k] as number), 0);

  const doUndoRefund = (id: string) => { if (confirm('Undo this refund? The refund credits are added back and the order returns to "Refund pending".')) setState(s => undoRefund(s, id, by)); };
  const doUndoReversal = (id: string) => { if (confirm('Undo this transfer reversal?')) setState(s => undoReversal(s, id, by)); };

  const Actions = ({ o, r }: { o: Order; r: Result }) => {
    if (r.state === 'fulfilled') return <span className="sub">—</span>;
    return (
      <div className="row-actions">
        {r.state === 'pending' && <button className="primary" onClick={() => setModal({ id: o.id, kind: 'refund' })}>Review refund</button>}
        {r.state === 'refunded' && <>
          <button className="primary" onClick={() => setModal({ id: o.id, kind: 'reversal' })} disabled={!o.refund}>Reverse transfer</button>
          <button onClick={() => doUndoRefund(o.id)}>Undo refund</button>
        </>}
        {r.state === 'reversed' && <button onClick={() => doUndoReversal(o.id)}>Undo reversal</button>}
        {r.state === 'pending' && <button className="sub" disabled title="Refund first. A reversal needs a refund ID" style={{ fontSize: 12 }}>Reverse transfer</button>}
      </div>
    );
  };
  const Badge = ({ s }: { s: string }) => { const [c, l] = STATE_BADGE[s]; return <span className={`badge ${c}`}>{l}</span>; };

  const rows = state.orders.map((o, i) => ({ o, r: results[i] }))
    .filter(x => (!fRest || rkey(x.o.restaurant) === fRest) && (!fState || x.r.state === fState))
    .reverse();

  return (
    <>
      <div className="widgets">
        <button className={`widget ${pendingTotal > credits + 0.005 ? 'warn' : ''}`} onClick={() => setPanel('credits')}>
          <div className="l">Refund credits wallet</div><div className="v">{money(credits)}</div><div className="s">Click for refund ledger & top-up</div>
        </button>
        <button className="widget" onClick={() => setPanel('primary')}>
          <div className="l">Primary wallet</div><div className="v">{money(primary)}</div><div className="s">Delivery share + reversed transfers</div>
        </button>
        <button className={`widget ${pending.length ? 'warn' : ''}`} onClick={() => setPanel('refunds')}>
          <div className="l">Refund requests</div><div className="v">{pending.length}</div><div className="s">{pending.length ? `${money(pendingTotal)} to refund` : 'Nothing pending'}</div>
        </button>
        <button className={`widget ${tfOwesTotal > 0.005 ? 'bad' : ''}`} onClick={() => setPanel('tfowes')}>
          <div className="l">TF owes restaurants</div><div className="v">{money(tfOwesTotal)}</div><div className="s">{plural(summary.restaurants.filter(x => x.tfOwes > 0.005).length)}</div>
        </button>
        <button className={`widget ${restOwesTotal > 0.005 ? 'bad' : ''}`} onClick={() => setPanel('restowes')}>
          <div className="l">Restaurants owe TF</div><div className="v">{money(restOwesTotal)}</div><div className="s">{plural(summary.restaurants.filter(x => x.owes > 0.005).length)}</div>
        </button>
        <button className={`widget ${logTotal > 0.005 ? 'bad' : ''}`} onClick={() => setPanel('logowes')}>
          <div className="l">Logistics owe TF</div><div className="v">{money(logTotal)}</div><div className="s">{summary.logistics.map(l => `${l.label} ${money(l.owes)}`).join(' · ')}</div>
        </button>
        <div className="widget static"><div className="l">Orders</div><div className="v">{state.orders.length}</div><div className="s">{results.filter(r => r.fulfilled === 'YES').length} fulfilled</div></div>
        <div className="widget static"><div className="l">Total order value</div><div className="v">{money(sum('tov'))}</div><div className="s">Gateway fees {money(sum('pgFee'))}</div></div>
      </div>

      <h2 style={{ fontSize: 15, margin: '18px 0 0' }}>Orders</h2>
      <div className="filters">
        <select value={fRest} onChange={e => setFRest(e.target.value)}>
          <option value="">All restaurants</option>
          {summary.restaurants.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
        <select value={fState} onChange={e => setFState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Refund pending</option><option value="refunded">Refunded · reversal due</option>
          <option value="reversed">Refunded · reversed</option><option value="fulfilled">Fulfilled</option>
        </select>
        <span className="sub">{rows.length} of {state.orders.length}</span>
      </div>
      {state.orders.length === 0 ? (
        <div className="card empty">No orders yet. Create test orders on the “Order simulator” tab.</div>
      ) : (
        <div className="tablewrap">
          <table className="list" style={{ margin: 0 }}>
            <thead><tr><th>Order</th><th>Restaurant</th><th>Partner</th><th>Outcome</th><th className="r">Order value</th><th>Refund status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map(({ o, r }) => (
                <tr key={o.id}>
                  <td><b>{o.name}</b><div className="sub">{o.id}</div></td>
                  <td>{o.restaurant || '—'}</td>
                  <td>{providerLabel(o.provider)}</td>
                  <td>{outcomeLabel(o.outcome)}{o.reason && <div className="sub">{o.reason}</div>}{o.issue && <div className="sub">“{o.issue}”</div>}</td>
                  <td className="r">{money(r.tov)}</td>
                  <td><Badge s={r.state} /></td>
                  <td><Actions o={o} r={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel === 'credits' && <CreditsPanel onClose={() => setPanel(null)} />}
      {panel === 'primary' && (
        <Drawer title="Primary wallet" sub="Payments received after the gateway fee, less transfers to restaurants, plus reversed transfers." onClose={() => setPanel(null)}>
          <PrimaryLedger />
        </Drawer>
      )}
      {panel === 'refunds' && (
        <Drawer title="Refund requests" sub="Failed orders and their refund status." onClose={() => setPanel(null)}>
          <RefundList Actions={Actions} Badge={Badge} />
        </Drawer>
      )}
      {panel === 'tfowes' && (
        <Drawer title="TF owes restaurants" sub="Payouts TF owes after failed orders (logistics or TF server faults), per restaurant." onClose={() => setPanel(null)}>
          <table className="list"><thead><tr><th>Restaurant</th><th className="r">TF owes</th></tr></thead><tbody>
            {summary.restaurants.length === 0 && <tr><td colSpan={2} className="sub">No restaurants yet</td></tr>}
            {summary.restaurants.map(x => <tr key={x.key}><td>{x.name}</td><td className="r" style={{ color: x.tfOwes > 0.005 ? 'var(--bad)' : 'var(--muted)' }}>{money(x.tfOwes)}</td></tr>)}
            <tr><th>Total</th><th className="r">{money(tfOwesTotal)}</th></tr>
          </tbody></table>
        </Drawer>
      )}
      {panel === 'restowes' && (
        <Drawer title="Restaurants owe TF" sub="Amounts restaurants owe after restaurant-fault refunds, per restaurant." onClose={() => setPanel(null)}>
          <table className="list"><thead><tr><th>Restaurant</th><th className="r">Owes TF</th></tr></thead><tbody>
            {summary.restaurants.length === 0 && <tr><td colSpan={2} className="sub">No restaurants yet</td></tr>}
            {summary.restaurants.map(x => <tr key={x.key}><td>{x.name}</td><td className="r" style={{ color: x.owes > 0.005 ? 'var(--bad)' : 'var(--muted)' }}>{money(x.owes)}</td></tr>)}
            <tr><th>Total</th><th className="r">{money(restOwesTotal)}</th></tr>
          </tbody></table>
        </Drawer>
      )}
      {panel === 'logowes' && (
        <Drawer title="Logistics owe TF" sub="Refunds for logistics-fault orders, tracked separately per delivery partner." onClose={() => setPanel(null)}>
          <table className="list"><thead><tr><th>Delivery partner</th><th className="r">Owes TF</th></tr></thead><tbody>
            {summary.logistics.map(x => <tr key={x.provider}><td>{x.label}</td><td className="r" style={{ color: x.owes > 0.005 ? 'var(--bad)' : 'var(--muted)' }}>{money(x.owes)}</td></tr>)}
            <tr><th>Total</th><th className="r">{money(logTotal)}</th></tr>
          </tbody></table>
        </Drawer>
      )}
      {modal && <RefundModal orderId={modal.id} kind={modal.kind} onClose={() => setModal(null)} />}
    </>
  );
}

function RefundList({ Actions, Badge }: { Actions: (p: { o: Order; r: Result }) => React.ReactNode; Badge: (p: { s: string }) => React.ReactNode }) {
  const { state, results } = useTF();
  const [f, setF] = useState('pending');
  const items = state.orders.map((o, i) => ({ o, r: results[i] })).filter(x => x.r.state !== 'fulfilled' && (f === 'all' || x.r.state === f)).reverse();
  return (
    <>
      <div className="filters">
        <select value={f} onChange={e => setF(e.target.value)}>
          <option value="pending">Refund pending</option><option value="refunded">Refunded · reversal due</option><option value="reversed">Refunded · reversed</option><option value="all">All failed orders</option>
        </select>
        <span className="sub">{items.length} orders</span>
      </div>
      <table className="list">
        <thead><tr><th>Order / restaurant</th><th>Why</th><th className="r">Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} className="sub">Nothing here.</td></tr>}
          {items.map(({ o, r }) => (
            <tr key={o.id}>
              <td><b>{o.name}</b> <span className="sub">{o.id}</span><div>{o.restaurant || '—'} · {providerLabel(o.provider)}</div></td>
              <td>{outcomeLabel(o.outcome)}{o.reason && <div className="sub">{o.reason}</div>}{o.issue && <div className="sub">“{o.issue}”</div>}</td>
              <td className="r">{money(r.tov)}</td>
              <td><Badge s={r.state} /></td>
              <td><Actions o={o} r={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function PrimaryLedger() {
  const { state, results, primary } = useTF();
  let bal = 0;
  const lines: { key: string; label: string; amt: number; bal: number }[] = [];
  state.orders.forEach((o, i) => {
    const r = results[i];
    const push = (label: string, amt: number) => { if (Math.abs(amt) < 0.005) return; bal += amt; lines.push({ key: o.id + label, label: `${o.name} · ${label}`, amt, bal }); };
    push('payment received (after gateway fee)', r.pw);
    push('route transfer to restaurant', -r.transferOut);
    push('transfer reversed from restaurant', r.revAmt);
  });
  return (
    <>
      <div className="kpi" style={{ marginBottom: 10 }}><div className="l">Balance</div><div className="v">{money(primary)}</div></div>
      <table className="list"><thead><tr><th>Entry</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead><tbody>
        {lines.length === 0 && <tr><td colSpan={3} className="sub">No movements yet.</td></tr>}
        {lines.map(l => <tr key={l.key}><td>{l.label}</td><td className="r" style={{ color: l.amt < 0 ? 'var(--bad)' : 'var(--good)' }}>{l.amt < 0 ? '−' : '+'}{money(Math.abs(l.amt))}</td><td className="r">{money(l.bal)}</td></tr>)}
      </tbody></table>
    </>
  );
}

function CreditsPanel({ onClose }: { onClose: () => void }) {
  const { state, setState, credits, user } = useTF();
  const by = user || 'unknown';
  const [amt, setAmt] = useState(0);
  const [note, setNote] = useState('');
  const [adj, setAdj] = useState(0);
  const [adjNote, setAdjNote] = useState('');
  const [adjSign, setAdjSign] = useState<1 | -1>(-1);

  const ledger = useMemo(() => {
    let b = 0;
    return [...state.wallet].reverse().map(e => { b += e.amount; return { e, bal: b }; }).reverse();
  }, [state.wallet]);
  const refunds = state.orders.filter(o => o.refund).sort((a, b) => b.refund!.at - a.refund!.at);
  const KIND: Record<string, string> = { topup: 'Top-up', refund: 'Refund', 'refund-undo': 'Refund undone', adjustment: 'Adjustment' };

  return (
    <Drawer title="Refund credits wallet" sub="Mirrors the Razorpay refund credits balance. Top up Razorpay first, then record the top-up here." onClose={onClose}>
      <div className="kpi" style={{ marginBottom: 10 }}><div className="l">Balance</div><div className="v">{money(credits)}</div></div>

      <b>Top up</b>
      <div className="form">
        <label>Amount (₹)<NumInput value={amt} onChange={setAmt} /></label>
        <label>Note<input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Razorpay top-up ref" /></label>
        <button className="primary" disabled={amt <= 0} onClick={() => { setState(s => topUp(s, amt, note, by)); setAmt(0); setNote(''); }}>Add to wallet</button>
      </div>
      <b>Manual adjustment</b>
      <div className="form">
        <label>Direction<select value={adjSign} onChange={e => setAdjSign(+e.target.value as 1 | -1)}><option value={1}>Add</option><option value={-1}>Deduct</option></select></label>
        <label>Amount (₹)<NumInput value={adj} onChange={setAdj} /></label>
        <label>Reason (required)<input type="text" value={adjNote} onChange={e => setAdjNote(e.target.value)} /></label>
        <button disabled={adj <= 0 || !adjNote.trim()} onClick={() => { setState(s => adjust(s, adjSign * adj, adjNote.trim(), by)); setAdj(0); setAdjNote(''); }}>Apply adjustment</button>
      </div>

      <b>Refund ledger</b>
      <table className="list"><thead><tr><th>When</th><th>Order / restaurant</th><th>Reason &amp; issue</th><th className="r">Refunded</th><th>IDs</th><th>By</th></tr></thead><tbody>
        {refunds.length === 0 && <tr><td colSpan={6} className="sub">No refunds yet.</td></tr>}
        {refunds.map(o => (
          <tr key={o.id}>
            <td>{fmtTime(o.refund!.at)}</td>
            <td><b>{o.name}</b> <span className="sub">{o.id}</span><div>{o.restaurant || '—'} · {providerLabel(o.provider)}</div></td>
            <td>{outcomeLabel(o.outcome)}{o.reason && <div className="sub">{o.reason}</div>}{o.issue && <div className="sub">“{o.issue}”</div>}</td>
            <td className="r">{money(o.refund!.amount)}{o.refund!.reversal && <div className="sub">reversed {money(o.refund!.reversal.amount)}</div>}</td>
            <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{o.refund!.refundId} ({o.refund!.method}){o.refund!.reversal && <div>{o.refund!.reversal.reversalId}</div>}</td>
            <td>{o.refund!.by}</td>
          </tr>
        ))}
      </tbody></table>

      <b>Wallet ledger</b>
      <table className="list"><thead><tr><th>When</th><th>Type</th><th>Note</th><th className="r">Amount</th><th className="r">Balance</th><th>By</th></tr></thead><tbody>
        {ledger.length === 0 && <tr><td colSpan={6} className="sub">No wallet entries yet. Add a top-up to start.</td></tr>}
        {ledger.map(({ e, bal }) => (
          <tr key={e.id}><td>{fmtTime(e.ts)}</td><td>{KIND[e.kind]}</td><td>{e.note || '—'}</td>
            <td className="r" style={{ color: e.amount < 0 ? 'var(--bad)' : 'var(--good)' }}>{e.amount < 0 ? '−' : '+'}{money(Math.abs(e.amount))}</td><td className="r">{money(bal)}</td><td>{e.by}</td></tr>
        ))}
      </tbody></table>

      <b>Activity log</b>
      <table className="list"><tbody>
        {state.audit.slice(0, 40).map(a => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.ts)}</td><td>{a.text}</td><td>{a.by}</td></tr>)}
        {state.audit.length === 0 && <tr><td className="sub">Nothing yet.</td></tr>}
      </tbody></table>
    </Drawer>
  );
}
