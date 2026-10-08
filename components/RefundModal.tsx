'use client';
import { useMemo, useState } from 'react';
import { ImpactRow, finalizeRefund, finalizeReversal, impact, mockRefundId, mockReversalId } from '@/lib/actions';
import { fmtTime, money, outcomeLabel, payId, providerLabel, trfId } from '@/lib/calc';
import { Modal } from './Drawer';
import { NumInput } from './Bits';
import { useTF } from './TFProvider';

function ImpactTable({ rows }: { rows: ImpactRow[] }) {
  return (
    <table className="list impact">
      <thead><tr><th>Wallet / ledger</th><th className="r">Now</th><th /><th className="r">After</th></tr></thead>
      <tbody>
        {rows.map(r => {
          const chg = Math.abs(r.after - r.before) > 0.005;
          return (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="r">{money(r.before)}</td>
              <td className="arrow">→</td>
              <td className={'r' + (chg ? ' chg' : '')} style={chg ? { color: r.after < r.before ? 'var(--bad)' : 'var(--good)' } : undefined}>{money(r.after)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const EXPLAIN = {
  RESTAURANT: 'Restaurant fault. The diner is refunded from Razorpay refund credits. The transfer reversal then pulls the restaurant’s payout back into the primary wallet; whatever the restaurant did not cover stays owed to TF.',
  LOGISTICS: 'Logistics fault. The diner is refunded from refund credits and the delivery partner owes TF that refund. The transfer reversal returns the restaurant’s payout to the primary wallet, and TF then owes the restaurant that amount.',
  TF: 'TF server fault. The diner is refunded from refund credits and TF absorbs the cost. The transfer reversal returns the restaurant’s payout to the primary wallet, and TF then owes the restaurant that amount.',
  YES: '',
};

export default function RefundModal({ orderId, kind, onClose }: { orderId: string; kind: 'refund' | 'reversal'; onClose: () => void }) {
  const { state, setState, results, credits, user } = useTF();
  const idx = state.orders.findIndex(o => o.id === orderId);
  const o = state.orders[idx];
  const r = results[idx];
  const [manual, setManual] = useState(false);
  const isRefund = kind === 'refund';
  const maxAmt = r ? (isRefund ? r.tov : r.target) : 0;

  const [amount, setAmount] = useState(maxAmt);
  const [rid, setRid] = useState('');
  const [credDed, setCredDed] = useState<number | null>(null);
  const credits_ = credDed ?? amount;
  const by = user || 'unknown';
  const amt = Math.min(Math.max(0, amount), maxAmt);

  const autoId = useMemo(() => (isRefund ? mockRefundId() : mockReversalId()), [isRefund]);
  const finalId = manual ? rid.trim() : autoId;

  const after = useMemo(() => {
    if (!o) return state;
    return isRefund
      ? finalizeRefund(state, orderId, { amount: amt, refundId: finalId || '(pending id)', method: manual ? 'manual' : 'auto', creditsDeducted: manual ? credits_ : amt, by })
      : finalizeReversal(state, orderId, { amount: amt, reversalId: finalId || '(pending id)', method: manual ? 'manual' : 'auto', by });
  }, [state, orderId, amt, finalId, manual, credits_, isRefund, by, o]);
  const rows = useMemo(() => (o ? impact(state, after, orderId) : []), [state, after, orderId, o]);

  if (!o || !r) return null;
  const insufficient = isRefund && credits < (manual ? credits_ : amt) - 0.005;
  const valid = amt > 0 && (!manual || finalId.length > 0);
  const hasRefund = !!o.refund;
  if (!isRefund && !hasRefund) return null;

  const submit = () => {
    setState(s => isRefund
      ? finalizeRefund(s, orderId, { amount: amt, refundId: finalId, method: manual ? 'manual' : 'auto', creditsDeducted: manual ? credits_ : amt, by })
      : finalizeReversal(s, orderId, { amount: amt, reversalId: finalId, method: manual ? 'manual' : 'auto', by }));
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <h2>{isRefund ? 'Review & finalise refund' : 'Reverse transfer from restaurant'}</h2>
      <div className="sub">{EXPLAIN[o.outcome]}</div>

      <div className="kv">
        <span>Order</span><span>{o.name} · {o.id}</span>
        <span>Restaurant</span><span>{o.restaurant || '—'}</span>
        <span>Delivery partner</span><span>{providerLabel(o.provider)}</span>
        <span>Why it failed</span><span>{outcomeLabel(o.outcome)}{o.reason ? ` – ${o.reason}` : ''}</span>
        <span>Issue note</span><span>{o.issue || '—'}</span>
        <span>Order value</span><span>{money(r.tov)} (food {money(r.fc)} + delivery {money(r.dc)}{r.pf ? ` + platform ${money(r.pf)}` : ''})</span>
        <span>Created</span><span>{fmtTime(o.createdAt)}</span>
        {!isRefund && <><span>Refund ID</span><span>{o.refund!.refundId} · refunded {money(o.refund!.amount)}</span></>}
      </div>

      <div className="form">
        <label>{isRefund ? 'Refund to diner (₹) – editable for partial refunds' : 'Amount to reverse from restaurant (₹)'}
          <NumInput value={amount} max={maxAmt} onChange={setAmount} />
        </label>
        <span className="hint">{isRefund ? `Max ${money(maxAmt)} (full order value)` : `Max ${money(maxAmt)} (what the restaurant actually received)`}</span>
      </div>

      <ImpactTable rows={rows} />
      {insufficient && <div className="warnbox">Refund credits ({money(credits)}) are lower than this refund. Top up the refund credits wallet (after topping up Razorpay first) to continue.</div>}

      {!manual ? (
        <div className="btns" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <button onClick={() => setManual(true)}>Values look wrong? {isRefund ? 'Refund' : 'Reverse'} manually from Razorpay dashboard</button>
          <div className="btns">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={!valid || insufficient} onClick={submit}>Verified – finalise {isRefund ? 'refund' : 'reversal'}</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <b>Manual {isRefund ? 'refund' : 'reversal'} from the Razorpay dashboard</b>
          <div className="kv">
            <span>Payment ID</span><span style={{ fontFamily: 'ui-monospace,monospace' }}>{payId(o)}</span>
            <span>Transfer ID</span><span style={{ fontFamily: 'ui-monospace,monospace' }}>{trfId(o)}</span>
            <span>{isRefund ? 'Refund amount' : 'Reverse amount'}</span><span>{money(amt)}</span>
          </div>
          <div className="hint">Use these IDs to find the {isRefund ? 'payment' : 'transfer'} in Razorpay, do it there, then come back and paste the {isRefund ? 'refund' : 'reversal'} ID. Correct the expected values above/below to what actually happened. The wallets update from the values you submit.</div>
          <div className="form">
            <label>Razorpay {isRefund ? 'refund' : 'reversal'} ID
              <input type="text" value={rid} onChange={e => setRid(e.target.value)} placeholder={isRefund ? 'rfnd_…' : 'rvrs_…'} style={{ minWidth: 240 }} />
            </label>
            {isRefund && <label>Refund credits actually deducted (₹)<NumInput value={credits_} onChange={setCredDed} /></label>}
          </div>
          <div className="btns" style={{ justifyContent: 'flex-end' }}>
            <button onClick={() => setManual(false)}>Back</button>
            <button className="primary" disabled={!valid || insufficient} onClick={submit}>Submit {isRefund ? 'refund' : 'reversal'} details</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
