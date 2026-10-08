import { Order, TFState, computeAll, creditsBalance, primaryBalance, summarize, rkey, providerLabel, uid } from './calc';

const log = (s: TFState, by: string, text: string): TFState => ({ ...s, audit: [{ id: uid(), ts: Date.now(), by, text }, ...s.audit].slice(0, 300) });
const patchOrder = (s: TFState, id: string, f: (o: Order) => Order): TFState => ({ ...s, orders: s.orders.map(o => (o.id === id ? f(o) : o)) });
const find = (s: TFState, id: string) => s.orders.find(o => o.id === id)!;

export const mockRefundId = () => 'rfnd_SIM' + Math.random().toString(36).slice(2, 10).toUpperCase();
export const mockReversalId = () => 'rvrs_SIM' + Math.random().toString(36).slice(2, 10).toUpperCase();

export function topUp(s: TFState, amount: number, note: string, by: string): TFState {
  const e = { id: uid(), ts: Date.now(), by, note, kind: 'topup' as const, amount };
  return log({ ...s, wallet: [e, ...s.wallet] }, by, `Refund credits topped up by ${amount}${note ? ` (${note})` : ''}`);
}
export function adjust(s: TFState, amount: number, note: string, by: string): TFState {
  const e = { id: uid(), ts: Date.now(), by, note, kind: 'adjustment' as const, amount };
  return log({ ...s, wallet: [e, ...s.wallet] }, by, `Refund credits adjusted by ${amount} (${note})`);
}

export interface RefundInput { amount: number; refundId: string; method: 'auto' | 'manual'; creditsDeducted: number; by: string }
export function finalizeRefund(s: TFState, orderId: string, i: RefundInput): TFState {
  const o = find(s, orderId);
  const e = { id: uid(), ts: Date.now(), by: i.by, note: `Refund ${i.refundId} – ${o.name}`, kind: 'refund' as const, amount: -i.creditsDeducted, orderId };
  const next = patchOrder(s, orderId, x => ({ ...x, refund: { amount: i.amount, refundId: i.refundId, method: i.method, at: Date.now(), by: i.by, creditsDeducted: i.creditsDeducted } }));
  return log({ ...next, wallet: [e, ...next.wallet] }, i.by, `Refund ${i.refundId} of ${i.amount} finalised for ${o.id} (${i.method})`);
}
export function undoRefund(s: TFState, orderId: string, by: string): TFState {
  const o = find(s, orderId);
  if (!o.refund || o.refund.reversal) return s;
  const e = { id: uid(), ts: Date.now(), by, note: `Refund ${o.refund.refundId} undone – ${o.name}`, kind: 'refund-undo' as const, amount: o.refund.creditsDeducted, orderId };
  const next = patchOrder(s, orderId, x => ({ ...x, refund: undefined }));
  return log({ ...next, wallet: [e, ...next.wallet] }, by, `Refund ${o.refund.refundId} undone for ${o.id}`);
}
export interface ReversalInput { amount: number; reversalId: string; method: 'auto' | 'manual'; by: string }
export function finalizeReversal(s: TFState, orderId: string, i: ReversalInput): TFState {
  const o = find(s, orderId);
  if (!o.refund) return s;
  const next = patchOrder(s, orderId, x => ({ ...x, refund: { ...x.refund!, reversal: { amount: i.amount, reversalId: i.reversalId, method: i.method, at: Date.now(), by: i.by } } }));
  return log(next, i.by, `Transfer reversal ${i.reversalId} of ${i.amount} finalised for ${o.id} (${i.method})`);
}
export function undoReversal(s: TFState, orderId: string, by: string): TFState {
  const o = find(s, orderId);
  if (!o.refund?.reversal) return s;
  const id = o.refund.reversal.reversalId;
  return log(patchOrder(s, orderId, x => ({ ...x, refund: { ...x.refund!, reversal: undefined } })), by, `Transfer reversal ${id} undone for ${o.id}`);
}

export function metrics(s: TFState) {
  const res = computeAll(s.orders, s.settlements);
  return { credits: creditsBalance(s.wallet), primary: primaryBalance(res), sum: summarize(s.orders, res) };
}

export interface ImpactRow { label: string; before: number; after: number }
/** Before/after of every wallet and ledger line this order touches. */
export function impact(before: TFState, after: TFState, orderId: string): ImpactRow[] {
  const o = find(before, orderId);
  const a = metrics(before), b = metrics(after);
  const pick = (m: ReturnType<typeof metrics>) => ({
    rest: m.sum.restaurants.find(r => r.key === rkey(o.restaurant)),
    log: m.sum.logistics.find(l => l.provider === o.provider)!,
  });
  const pa = pick(a), pb = pick(b);
  const name = o.restaurant.trim() || '(unnamed)';
  return [
    { label: 'Refund credits wallet', before: a.credits, after: b.credits },
    { label: 'Primary wallet', before: a.primary, after: b.primary },
    { label: `${name} owes TF`, before: pa.rest?.owes ?? 0, after: pb.rest?.owes ?? 0 },
    { label: `TF owes ${name}`, before: pa.rest?.tfOwes ?? 0, after: pb.rest?.tfOwes ?? 0 },
    { label: `${providerLabel(o.provider)} owes TF`, before: pa.log.owes, after: pb.log.owes },
  ];
}
