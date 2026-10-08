'use client';
import { useState } from 'react';
import { Order, PAY_METHODS, PayMethod, Provider, Result, fmtDateTime, money, outcomeLabel, payId } from '@/lib/calc';
import { addReceipt, received, stillOwed, undoReceipt } from '@/lib/logistics';
import { taskOf } from '@/lib/task';
import { Modal } from './Drawer';
import { NumInput } from './Bits';
import { useTF } from './TFProvider';

function toLocalInputs(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export function LogisticsPanel() {
  const { state, results, summary } = useTF();
  const [open, setOpen] = useState<Provider | null>(null);
  const [recv, setRecv] = useState<string | null>(null);
  const total = summary.logistics.reduce((a, x) => a + x.owes, 0);

  return (
    <>
      {summary.logistics.map(l => {
        const items = state.orders.map((o, i) => ({ o, r: results[i] })).filter(x => x.o.provider === l.provider && x.o.outcome === 'LOGISTICS');
        const isOpen = open === l.provider;
        return (
          <div key={l.provider} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <b style={{ fontSize: 15 }}>{l.label}</b>
                <div className="sub">{items.length} failed order{items.length === 1 ? '' : 's'}</div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <b style={{ color: l.owes > 0.005 ? 'var(--bad)' : 'var(--muted)', fontSize: 18 }}>{money(l.owes)}</b>
                <button disabled={!items.length} onClick={() => setOpen(isOpen ? null : l.provider)}>{isOpen ? '▴ Hide failed orders' : '▾ Show failed orders'}</button>
              </div>
            </div>
            {isOpen && (
              <div style={{ marginTop: 12 }}>
                {items.map(({ o, r }) => <OrderItem key={o.id} o={o} r={r} onReceive={() => setRecv(o.id)} />)}
              </div>
            )}
          </div>
        );
      })}
      <table className="list"><tbody><tr><th>Total owed by logistics</th><th className="r">{money(total)}</th></tr></tbody></table>
      <div className="hint">Mark money received from a partner order by order. The same UTR can be used for several orders when the partner pays in one transfer. Receipts only reduce the partner&apos;s balance, not any wallet.</div>
      {recv && <ReceiptModal orderId={recv} onClose={() => setRecv(null)} />}
    </>
  );
}

function OrderItem({ o, r, onReceive }: { o: Order; r: Result; onReceive: () => void }) {
  const { setState, user } = useTF();
  const [det, setDet] = useState(false);
  const t = taskOf(o);
  const owed = o.refund?.amount ?? 0, got = received(o), left = stillOwed(o);
  const status = !o.refund ? ['pending', 'Not yet owed – refund pending'] : left < 0.005 ? ['reversed', 'Settled'] : got > 0 ? ['refunded', `Part received · ${money(left)} pending`] : ['pending', `Owed ${money(left)}`];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <b>{o.name}</b> <span className="sub">{o.id}</span>
          <div className="sub">Task <span style={{ fontFamily: 'ui-monospace,monospace' }}>{t.taskId}</span> · {o.restaurant || '—'} · {o.reason || outcomeLabel(o.outcome)}</div>
        </div>
        <div className="row-actions">
          <span className={`badge ${status[0]}`}>{status[1]}</span>
          <button onClick={() => setDet(!det)}>{det ? '▴ Details' : '▾ Details'}</button>
          <button className="primary" disabled={!o.refund || left < 0.005} title={!o.refund ? 'Record the refund first' : undefined} onClick={onReceive}>Mark received</button>
        </div>
      </div>

      {det && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14, marginTop: 10 }}>
          <div>
            <b>Pickup (restaurant)</b>
            <div className="kv" style={{ gridTemplateColumns: '80px 1fr' }}><span>Name</span><span>{o.restaurant || '—'}</span><span>Address</span><span>{t.pickupAddress}</span><span>Phone</span><span>{t.pickupPhone}</span></div>
          </div>
          <div>
            <b>Drop (customer)</b>
            <div className="kv" style={{ gridTemplateColumns: '80px 1fr' }}><span>Name</span><span>{t.customerName}</span><span>Phone</span><span>{t.customerPhone}</span><span>Address</span><span>{t.dropAddress}</span></div>
          </div>
          <div>
            <b>Task</b>
            <div className="kv" style={{ gridTemplateColumns: '80px 1fr' }}><span>Task ID</span><span>{t.taskId}</span><span>Rider</span><span>{t.riderName}</span><span>Rider phone</span><span>{t.riderPhone}</span></div>
          </div>
          <div>
            <b>Order &amp; pricing</b>
            <div className="kv" style={{ gridTemplateColumns: '110px 1fr' }}>
              <span>Order ID</span><span>{o.id}</span><span>Payment ID</span><span>{payId(o)}</span>
              <span>Food</span><span>{money(r.fc)}</span><span>Delivery</span><span>{money(r.dc)}</span>{r.pf > 0 && <><span>Platform fee</span><span>{money(r.pf)}</span></>}
              <span>Order value</span><span><b>{money(r.tov)}</b></span><span>Created</span><span>{fmtDateTime(o.createdAt)}</span>
            </div>
          </div>
          <div>
            <b>Failure</b>
            <div className="kv" style={{ gridTemplateColumns: '90px 1fr' }}>
              <span>Reason</span><span>{o.reason || '—'}</span><span>Issue note</span><span>{o.issue || '—'}</span>
              <span>Refunded</span><span>{o.refund ? `${money(o.refund.amount)} · ${o.refund.refundId}` : 'Not yet'}</span>
              <span>Owed by partner</span><span>{money(owed)}</span><span>Received</span><span>{money(got)}</span>
            </div>
          </div>
        </div>
      )}

      {(o.logReceipts?.length ?? 0) > 0 && (
        <table className="list" style={{ margin: '10px 0 0' }}>
          <thead><tr><th>Received on</th><th>UTR / method</th><th className="r">Amount</th><th>By</th><th /></tr></thead>
          <tbody>
            {o.logReceipts!.map(x => (
              <tr key={x.id}>
                <td>{fmtDateTime(x.paidAt)}</td>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{x.utr}<div className="sub" style={{ fontFamily: 'inherit' }}>{x.method}</div></td>
                <td className="r">{money(x.amount)}</td><td>{x.by}</td>
                <td><button onClick={() => { if (confirm('Undo this receipt? The amount becomes owed again.')) setState(s => undoReceipt(s, o.id, x.id, user || 'unknown')); }}>Undo</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReceiptModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { state, setState, user } = useTF();
  const o = state.orders.find(x => x.id === orderId);
  const left = o ? stillOwed(o) : 0;
  const init = toLocalInputs();
  const [amount, setAmount] = useState(left);
  const [utr, setUtr] = useState('');
  const [method, setMethod] = useState<PayMethod>('NEFT');
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [err, setErr] = useState('');
  if (!o) return null;
  const paidAt = date && time ? new Date(`${date}T${time}`).getTime() : 0;
  return (
    <Modal onClose={onClose}>
      <h2>Mark received from {o.provider === 'UENGAGE' ? 'uEngage' : 'Pro Routing'}</h2>
      <div className="sub">{o.name} · {o.id} · still owed {money(left)}. Enter what the partner actually paid and its payment reference.</div>
      <div className="form" style={{ marginTop: 12 }}>
        <label>Amount received (₹)<NumInput value={amount} max={left} onChange={setAmount} /></label>
        <label>UTR number<input type="text" value={utr} onChange={e => { setUtr(e.target.value); setErr(''); }} placeholder="12–22 letters/digits" style={{ minWidth: 220, textTransform: 'uppercase' }} /></label>
        <label>Payment method<select value={method} onChange={e => setMethod(e.target.value as PayMethod)}>{PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Payment date<input type="date" value={date} max={toLocalInputs().date} onChange={e => setDate(e.target.value)} /></label>
        <label>Payment time<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      </div>
      <div className="hint">If this UTR was already used for another order, that is fine: partners can pay several orders in one transfer.</div>
      {err && <div className="warnbox">{err}</div>}
      <div className="btns" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!(amount > 0) || !utr.trim()} onClick={() => {
          const r = addReceipt(state, orderId, { amount, utr, method, paidAt, by: user || 'unknown' });
          if (r.error) { setErr(r.error); return; }
          setState(r.state); onClose();
        }}>Mark settled</button>
      </div>
    </Modal>
  );
}
