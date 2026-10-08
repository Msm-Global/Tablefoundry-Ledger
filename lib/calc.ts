// ---------- types ----------
export type Outcome = 'YES' | 'RESTAURANT' | 'LOGISTICS' | 'TF';
export type Provider = 'UENGAGE' | 'PROROUTING';
export const PROVIDERS: [Provider, string][] = [['UENGAGE', 'uEngage'], ['PROROUTING', 'Pro Routing']];
export const providerLabel = (p: Provider) => PROVIDERS.find(x => x[0] === p)?.[1] ?? p;

export interface Reversal { amount: number; reversalId: string; method: 'auto' | 'manual'; at: number; by: string }
export interface Refund {
  amount: number;          // refunded to the diner
  refundId: string;
  method: 'auto' | 'manual';
  at: number;
  by: string;
  creditsDeducted: number; // taken from Razorpay refund credits
  reversal?: Reversal;     // transfer reversed from the restaurant back to the primary wallet
}
export interface Order {
  id: string;
  name: string;
  restaurant: string;
  provider: Provider;
  fc: number;
  dc: number;
  pf: number;
  outcome: Outcome;
  reason: string;
  issue: string;
  createdAt: number;
  refund?: Refund;
}
export interface WalletEntry {
  id: string; ts: number; by: string; note: string; orderId?: string;
  kind: 'topup' | 'refund' | 'refund-undo' | 'adjustment';
  amount: number; // signed
}
export interface AuditEntry { id: string; ts: number; by: string; text: string }
export interface TFState { orders: Order[]; wallet: WalletEntry[]; audit: AuditEntry[] }
export interface PublicState { orders: Order[] }
export const BLANK: TFState = { orders: [], wallet: [], audit: [] };

export const OUTCOMES: [Outcome, string][] = [
  ['YES', 'Fulfilled'],
  ['RESTAURANT', 'Failed – Restaurant fault'],
  ['LOGISTICS', 'Failed – Logistics fault'],
  ['TF', 'Failed – TF server fault'],
];
export const outcomeLabel = (o: Outcome) => OUTCOMES.find(x => x[0] === o)?.[1] ?? o;
export const REASONS: Record<Exclude<Outcome, 'YES'>, string[]> = {
  RESTAURANT: ['Wrong item sent', 'Item unavailable / out of stock', 'Order rejected by restaurant', 'Food quality complaint', 'Restaurant closed / not responding'],
  LOGISTICS: ['Delivery partner did not show up', 'Task auto-cancelled by logistics', 'Out for delivery but not delivered', 'Delivery partner could not be assigned'],
  TF: ['Server error / order sync failed', 'Payment captured but order not created', 'Other platform issue'],
};
export const defaultReason = (o: Outcome) => (o === 'YES' ? '' : REASONS[o][0]);

export const rkey = (name: string) => name.trim().toLowerCase();
export const uid = () => Math.random().toString(36).slice(2, 10);
export const newOrderId = () => 'ORD-' + Math.random().toString(36).slice(2, 8).toUpperCase();
export const payId = (o: Order) => 'pay_' + o.id.replace('ORD-', '');
export const trfId = (o: Order) => 'trf_' + o.id.replace('ORD-', '');

// ---------- engine ----------
const PG_RATE = 0.02 * 1.18;
const SPLIT_K = 1 + 0.0025 * 1.18;

export type OrderState = 'fulfilled' | 'pending' | 'refunded' | 'reversed';

export interface Result {
  prevLog: number; prevRest: number; prevTf: number;
  fc: number; dc: number; pf: number;
  tov: number; rs: number; ds: number; pfs: number;
  pgFee: number; pw: number;
  restPre: number; restPost: number; delWallet: number; pfWallet: number;
  splitFee: number; target: number; actual: number; delFinal: number; pfFinal: number;
  restDed: number; delDed: number;
  fulfilled: 'YES' | 'NO'; reason: string;
  logF: number; restF: number; tfF: number;
  refund: number; delLeft: number;
  restOwes: number; logOwes: number; tfOwes: number;
  state: OrderState; revAmt: number; transferOut: number;
}

/**
 * Formulas follow the source spreadsheet, chained per restaurant (restaurant/TF owes) and per
 * delivery partner (logistics owes). Failed orders only move the owes ledger once the refund
 * (and, for TF/restaurant balances, the transfer reversal) has actually been recorded.
 */
export function computeAll(orders: Order[]): Result[] {
  const chain = new Map<string, { rest: number; tf: number }>();
  const logChain = new Map<Provider, number>();
  return orders.map(c => {
    const key = rkey(c.restaurant);
    const prev = chain.get(key) ?? { rest: 0, tf: 0 };
    const prevLog = logChain.get(c.provider) ?? 0;
    const fc = +c.fc || 0, dc = +c.dc || 0, pf = +c.pf || 0;
    const o = c.outcome, yes = o === 'YES';
    const logF = o === 'LOGISTICS' ? 1 : 0, restF = o === 'RESTAURANT' ? 1 : 0, tfF = o === 'TF' ? 1 : 0;
    const tov = fc + dc + pf;
    const rs = tov ? fc / tov : 0, ds = tov ? dc / tov : 0, pfs = tov ? pf / tov : 0;
    const pgFee = tov * PG_RATE;
    const pw = tov - pgFee;
    const restPre = pw * rs;
    const net = Math.max(0, prev.rest - prev.tf);
    const restPost = yes ? Math.max(0, restPre - net) : restPre;
    const delWallet = pw * ds;
    const pfWallet = pw * pfs;
    const target = restPost / SPLIT_K;
    const splitFee = restPost - target;
    const rf = c.refund;
    const refAmt = rf?.amount ?? 0, revAmt = rf?.reversal?.amount ?? 0;
    const state: OrderState = yes ? 'fulfilled' : !rf ? 'pending' : rf.reversal ? 'reversed' : 'refunded';

    const restOwes = yes ? Math.max(0, net - restPre) : Math.max(0, net + (restF && rf ? refAmt : 0) - (restF ? revAmt : 0));
    const logOwes = prevLog + (logF && rf ? refAmt : 0);
    const tfOwes = Math.max(0, prev.tf - prev.rest) + (logF || tfF ? revAmt : 0);

    chain.set(key, { rest: restOwes, tf: tfOwes });
    logChain.set(c.provider, logOwes);
    return {
      prevLog, prevRest: prev.rest, prevTf: prev.tf,
      fc, dc, pf, tov, rs, ds, pfs, pgFee, pw,
      restPre, restPost, delWallet, pfWallet, splitFee, target,
      actual: yes ? target : 0,
      delFinal: delWallet, pfFinal: pfWallet,
      restDed: fc ? (fc - target) / fc : 0,
      delDed: dc ? (dc - delWallet) / dc : 0,
      fulfilled: yes ? 'YES' : 'NO',
      reason: yes ? '' : c.reason || ({ RESTAURANT: 'Restaurant', LOGISTICS: 'Logistics', TF: 'TF Server' } as const)[o],
      logF, restF, tfF, refund: refAmt, delLeft: delWallet,
      restOwes, logOwes, tfOwes, state, revAmt,
      transferOut: yes ? restPost : restPre,
    } satisfies Result;
  });
}

export const creditsBalance = (w: WalletEntry[]) => w.reduce((a, e) => a + e.amount, 0);
/** Primary wallet: payments received after gateway fee, less route transfers, plus reversed transfers. */
export const primaryBalance = (r: Result[]) => r.reduce((a, x) => a + x.pw - x.transferOut + x.revAmt, 0);

export interface Summary {
  restaurants: { key: string; name: string; owes: number; tfOwes: number }[];
  logistics: { provider: Provider; label: string; owes: number }[];
}
export function summarize(orders: Order[], results: Result[]): Summary {
  const rest = new Map<string, { key: string; name: string; owes: number; tfOwes: number }>();
  const log = new Map<Provider, number>();
  orders.forEach((o, i) => {
    rest.set(rkey(o.restaurant), { key: rkey(o.restaurant), name: o.restaurant.trim() || '(unnamed)', owes: results[i].restOwes, tfOwes: results[i].tfOwes });
    log.set(o.provider, results[i].logOwes);
  });
  return {
    restaurants: [...rest.values()].sort((a, b) => a.name.localeCompare(b.name)),
    logistics: PROVIDERS.map(([p, label]) => ({ provider: p, label, owes: log.get(p) ?? 0 })),
  };
}

// ---------- restaurant view ----------
export interface RestRow {
  restaurant: string; key: string; name: string; status: string; cls: 'ok' | 'no' | 'hold'; note: string;
  refundLabel: string;
  food: number; gateway: number; recovered: number; splitFee: number; payout: number;
  held: number; raised: number; owes: number; tfOwes: number;
}

export function restaurantRows(orders: Order[], results: Result[]): RestRow[] {
  return results.map((r, i) => {
    const o = orders[i];
    const yes = r.fulfilled === 'YES';
    const gateway = yes ? r.fc - r.restPre : 0;
    const recovered = yes ? r.restPre - r.restPost : 0;
    const splitFee = yes ? r.restPost - r.target : 0;
    const reversed = r.state === 'reversed';
    const held = !yes && !r.restF && reversed ? r.revAmt : 0;
    const raised = r.restF && r.state !== 'pending' ? Math.max(0, r.refund - r.revAmt) : 0;
    const refundLabel = yes ? '—' : r.state === 'pending' ? 'Refund pending' : 'Refunded';
    let status: string, cls: RestRow['cls'], note: string;
    if (yes) { status = 'Paid'; cls = 'ok'; note = recovered > 0.005 ? `${m(recovered)} of earlier dues recovered from this payout` : 'Paid in full after fees'; }
    else if (r.restF) {
      status = 'Cancelled – your fault'; cls = 'no';
      note = r.state === 'pending' ? 'Diner refund requested. No change to your balance until it is processed' : `Diner refunded ${m(r.refund)}; ${m(raised)} owed to TF after reversal`;
    } else {
      status = `Cancelled – ${r.logF ? 'logistics' : 'TF server'}`; cls = 'hold';
      note = r.state === 'pending' ? 'Not your fault. Refund requested; no change to your balance yet' : reversed ? `Not your fault; TF owes you ${m(r.revAmt)} for this order` : 'Not your fault. Diner refunded; transfer reversal in progress';
    }
    return {
      restaurant: o.restaurant.trim() || '(unnamed)', key: rkey(o.restaurant), name: o.name, status, cls, note, refundLabel,
      food: r.fc, gateway, recovered, splitFee, payout: yes ? r.actual : 0, held, raised, owes: r.restOwes, tfOwes: r.tfOwes,
    };
  });
}
const m = (n: number) => '₹' + inr(n);

export function inr(n: number) {
  return (n < 0 && n > -0.005 ? 0 : n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const money = (n: number) => (n < -0.005 ? '−₹' + inr(-n) : '₹' + inr(n));
export const pct = (n: number) => (n * 100).toFixed(2) + '%';
export const fmtTime = (ts: number) => new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What the restaurant dashboard receives: no wallet, no audit trail, no operator identities. */
export function toPublic(s: TFState): PublicState {
  return {
    orders: s.orders.map(o => ({
      ...o,
      refund: o.refund && {
        amount: o.refund.amount, refundId: '', method: 'auto', at: o.refund.at, by: '', creditsDeducted: 0,
        reversal: o.refund.reversal && { amount: o.refund.reversal.amount, reversalId: '', method: 'auto', at: o.refund.reversal.at, by: '' },
      },
    })),
  };
}
