import { Order, PayMethod, Settlement, TFState, computeAll, rkey, summarize, uid } from './calc';
import { AccountDetails, methodReady, methodNeeds } from './account';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_FAILS = 3;
export const UTR_RE = /^[A-Za-z0-9]{12,22}$/;

export type Cmd =
  | { kind: 'verify'; id: string } | { kind: 'reject'; id: string; reason: string } | { kind: 'newotp'; id: string }
  | { kind: 'account'; key: string; details: AccountDetails | null };

const log = (s: TFState, by: string, text: string): TFState => ({ ...s, audit: [{ id: uid(), ts: Date.now(), by, text }, ...s.audit].slice(0, 300) });
const patch = (s: TFState, id: string, f: (x: Settlement) => Settlement): TFState => ({ ...s, settlements: s.settlements.map(x => (x.id === id ? f(x) : x)) });
const randomOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export const isOpen = (x: Settlement) => x.status === 'awaiting' || x.status === 'otp';
export const otpExpired = (x: Settlement, now: number) => x.status === 'otp' && !!x.otpAt && now > x.otpAt + OTP_TTL_MS;
export const otpBlocked = (x: Settlement) => x.status === 'otp' && x.otpFailed >= OTP_MAX_FAILS;
/** The restaurant may generate a fresh OTP once the current one is spent (3 failures) or timed out. */
export const canRegenerate = (x: Settlement, now: number) => x.status === 'otp' && (otpBlocked(x) || otpExpired(x, now));

/** Orders that can no longer be edited/deleted because a refund or a verified settlement depends on them. */
export function lockedOrderIds(s: TFState): Set<string> {
  const ids = new Set<string>();
  s.orders.forEach(o => { if (o.refund || (o.logReceipts?.length ?? 0) > 0) ids.add(o.id); });
  s.settlements.filter(x => x.status === 'settled').forEach(x => {
    const anchor = s.orders.findIndex(o => o.id === x.anchorOrderId);
    s.orders.forEach((o, i) => { if (rkey(o.restaurant) === x.restaurantKey && i <= anchor) ids.add(o.id); });
  });
  return ids;
}

/** TF owes minus restaurant owes, each rounded to whole rupees first (e.g. 97 − 33 = 64). */
export function netPosition(s: TFState, key: string) {
  const res = computeAll(s.orders, s.settlements);
  const r = summarize(s.orders, res).restaurants.find(x => x.key === key);
  const tfOwes = r?.tfOwes ?? 0, restOwes = r?.owes ?? 0;
  const tfR = Math.round(tfOwes), restR = Math.round(restOwes);
  return { tfOwes, restOwes, tfR, restR, net: Math.max(0, tfR - restR) };
}

export const accountKey = (code: string, key: string) => `${code}|${key}`;

export function requestSettlement(s: TFState, key: string, input: { utr: string; method: PayMethod; by: string; paidAt: number; account?: AccountDetails }): { state: TFState; error?: string } {
  const utr = input.utr.trim().toUpperCase();
  if (!UTR_RE.test(utr)) return { state: s, error: 'UTR must be 12 to 22 letters and digits.' };
  if (!input.paidAt || input.paidAt > Date.now() + 60000) return { state: s, error: 'Payment date and time must be set and cannot be in the future.' };
  if (!methodReady(input.method, input.account)) return { state: s, error: `No ${methodNeeds(input.method)} details have been added by the restaurant for this payment method.` };
  if (s.settlements.some(x => x.utr === utr && x.status !== 'cancelled' && x.status !== 'rejected')) return { state: s, error: 'This UTR has already been used.' };
  if (s.settlements.some(x => x.restaurantKey === key && isOpen(x))) return { state: s, error: 'This restaurant already has a settlement in progress.' };
  const pos = netPosition(s, key);
  if (pos.net < 1) return { state: s, error: 'Nothing to settle: TF does not owe this restaurant a net amount.' };
  const name = s.orders.find(o => rkey(o.restaurant) === key)?.restaurant.trim() || '(unnamed)';
  const st: Settlement = {
    id: uid(), restaurantKey: key, restaurant: name, amount: pos.net, clearTf: pos.tfOwes, clearRest: pos.restOwes, utr, method: input.method,
    paidAt: input.paidAt, account: input.account, status: 'awaiting', createdAt: Date.now(), createdBy: input.by, otpFailed: 0, otpIssued: 0,
  };
  return { state: log({ ...s, settlements: [st, ...s.settlements] }, input.by, `Settlement of ₹${pos.net} sent to ${name} for verification (UTR ${utr})`) };
}

export function closeSettlement(s: TFState, id: string, who: 'tf' | 'restaurant', by: string, reason: string): TFState {
  const x = s.settlements.find(y => y.id === id);
  if (!x || !isOpen(x)) return s;
  const status = who === 'tf' ? 'cancelled' : 'rejected';
  return log(patch(s, id, y => ({ ...y, status, otp: undefined, closedAt: Date.now(), closedBy: who, closeReason: reason })), by,
    who === 'tf' ? `Settlement ${x.utr} cancelled by TF${reason ? ` (${reason})` : ''}` : `Settlement ${x.utr} marked NOT received by ${x.restaurant}${reason ? ` (${reason})` : ''}`);
}

/** Restaurant confirmed receipt: issue the first OTP. */
export function restaurantVerify(s: TFState, id: string): TFState {
  const x = s.settlements.find(y => y.id === id);
  if (!x || x.status !== 'awaiting') return s;
  return log(patch(s, id, y => ({ ...y, status: 'otp', verifiedAt: Date.now(), otp: randomOtp(), otpAt: Date.now(), otpFailed: 0, otpIssued: 1 })), x.restaurant, `${x.restaurant} confirmed receipt for UTR ${x.utr}; OTP issued`);
}

export function regenerateOtp(s: TFState, id: string): TFState {
  const x = s.settlements.find(y => y.id === id);
  if (!x || !canRegenerate(x, Date.now())) return s;
  return log(patch(s, id, y => ({ ...y, otp: randomOtp(), otpAt: Date.now(), otpFailed: 0, otpIssued: y.otpIssued + 1 })), x.restaurant, `New OTP issued for UTR ${x.utr} (#${x.otpIssued + 1})`);
}

export function applyCmd(s: TFState, cmd: Cmd, code = ''): TFState {
  if (cmd.kind === 'account') {
    const accounts = { ...s.accounts };
    if (cmd.details) accounts[accountKey(code, cmd.key)] = cmd.details; else delete accounts[accountKey(code, cmd.key)];
    return { ...s, accounts };
  }
  if (cmd.kind === 'verify') return restaurantVerify(s, cmd.id);
  if (cmd.kind === 'newotp') return regenerateOtp(s, cmd.id);
  const x = s.settlements.find(y => y.id === cmd.id);
  return x ? closeSettlement(s, cmd.id, 'restaurant', x.restaurant, cmd.reason) : s;
}

/** TF ops types the OTP read out by the restaurant. */
export function submitOtp(s: TFState, id: string, code: string, by: string, now = Date.now()): { state: TFState; ok: boolean; msg: string } {
  const x = s.settlements.find(y => y.id === id);
  if (!x || x.status !== 'otp') return { state: s, ok: false, msg: 'This settlement is not waiting for an OTP.' };
  if (otpBlocked(x)) return { state: s, ok: false, msg: 'Too many wrong attempts. Ask the restaurant to generate a new OTP.' };
  if (otpExpired(x, now)) return { state: s, ok: false, msg: 'This OTP has expired. Ask the restaurant to generate a new OTP.' };
  if (code.trim() !== x.otp) {
    const n = x.otpFailed + 1;
    return { state: log(patch(s, id, y => ({ ...y, otpFailed: n })), by, `Wrong OTP entered for UTR ${x.utr} (${n}/${OTP_MAX_FAILS})`), ok: false, msg: n >= OTP_MAX_FAILS ? 'Wrong OTP. No attempts left: ask the restaurant to generate a new OTP.' : `Wrong OTP (${n}/${OTP_MAX_FAILS} failed attempts).` };
  }
  let anchor: Order | undefined;
  s.orders.forEach(o => { if (rkey(o.restaurant) === x.restaurantKey) anchor = o; });
  if (!anchor) return { state: s, ok: false, msg: 'No orders found for this restaurant.' };
  const a = anchor as Order;
  return { state: log(patch(s, id, y => ({ ...y, status: 'settled', settledAt: now, settledBy: by, anchorOrderId: a.id, otp: undefined })), by, `Settlement ${x.utr} of ₹${x.amount} to ${x.restaurant} marked settled`), ok: true, msg: 'Settled.' };
}

export function undoSettlement(s: TFState, id: string, by: string): TFState {
  const x = s.settlements.find(y => y.id === id);
  if (!x || x.status !== 'settled') return s;
  return log(patch(s, id, y => ({ ...y, status: 'undone', closedAt: Date.now(), closedBy: 'tf', closeReason: 'Undone by TF' })), by, `Settlement ${x.utr} undone; owes restored`);
}
