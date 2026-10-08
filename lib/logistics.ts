import { LogReceipt, Order, PayMethod, TFState, uid } from './calc';
import { UTR_RE } from './settlement';

const log = (s: TFState, by: string, text: string): TFState => ({ ...s, audit: [{ id: uid(), ts: Date.now(), by, text }, ...s.audit].slice(0, 300) });
export const received = (o: Order) => (o.logReceipts ?? []).reduce((a, r) => a + r.amount, 0);
/** What the delivery partner still owes TF for this failed order (the refund TF paid, less receipts). */
export const stillOwed = (o: Order) => (o.refund ? Math.max(0, o.refund.amount - received(o)) : 0);

export function addReceipt(s: TFState, orderId: string, i: { amount: number; utr: string; method: PayMethod; paidAt: number; by: string }): { state: TFState; error?: string } {
  const o = s.orders.find(x => x.id === orderId);
  if (!o || o.outcome !== 'LOGISTICS' || !o.refund) return { state: s, error: 'This order has no logistics amount owed yet.' };
  const utr = i.utr.trim().toUpperCase();
  const owed = stillOwed(o);
  if (!(i.amount > 0)) return { state: s, error: 'Enter the amount received.' };
  if (i.amount > owed + 0.005) return { state: s, error: `Amount cannot exceed what is still owed (${owed.toFixed(2)}).` };
  if (!UTR_RE.test(utr)) return { state: s, error: 'UTR must be 12 to 22 letters and digits.' };
  if (!i.paidAt || i.paidAt > Date.now() + 60000) return { state: s, error: 'Payment date and time must be set and cannot be in the future.' };
  const rec: LogReceipt = { id: uid(), amount: i.amount, utr, method: i.method, paidAt: i.paidAt, at: Date.now(), by: i.by };
  const next = { ...s, orders: s.orders.map(x => (x.id === orderId ? { ...x, logReceipts: [...(x.logReceipts ?? []), rec] } : x)) };
  return { state: log(next, i.by, `Received ${i.amount} from ${o.provider} for ${o.id} (UTR ${utr})`) };
}

export function undoReceipt(s: TFState, orderId: string, receiptId: string, by: string): TFState {
  const o = s.orders.find(x => x.id === orderId);
  const r = o?.logReceipts?.find(x => x.id === receiptId);
  if (!o || !r) return s;
  const next = { ...s, orders: s.orders.map(x => (x.id === orderId ? { ...x, logReceipts: (x.logReceipts ?? []).filter(y => y.id !== receiptId) } : x)) };
  return log(next, by, `Receipt ${r.utr} of ${r.amount} for ${o.id} undone`);
}
