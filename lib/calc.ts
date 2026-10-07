export type Outcome = 'YES' | 'RESTAURANT' | 'LOGISTICS' | 'TF';

export interface Case {
  id: string;
  name: string;
  fc: number;
  dc: number;
  pf: number;
  outcome: Outcome;
}

export interface LedgerState {
  opening: { log: number; rest: number; tf: number };
  cases: Case[];
}

export const BLANK: LedgerState = { opening: { log: 0, rest: 0, tf: 0 }, cases: [] };

const PG_RATE = 0.02 * 1.18;
const SPLIT_K = 1 + 0.0025 * 1.18;

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
}

// Formulas follow the source spreadsheet (column C), chained case to case.
export function computeAll(cases: Case[], opening: LedgerState['opening']): Result[] {
  let prev = { log: +opening.log || 0, rest: +opening.rest || 0, tf: +opening.tf || 0 };
  return cases.map(c => {
    const fc = +c.fc || 0, dc = +c.dc || 0, pf = +c.pf || 0;
    const o = c.outcome;
    const yes = o === 'YES';
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
    const splitFee = pw - pw / SPLIT_K;
    const target = restPost / SPLIT_K;
    const actual = yes ? target : 0;
    const refund = yes ? 0 : tov;
    const restOwes = yes ? Math.max(0, net - restPre) : restF ? refund - target + net : net;
    const logOwes = logF ? tov + prev.log : prev.log;
    const tfOwes = Math.max(0, prev.tf - prev.rest) + (logF || tfF ? target : 0);
    const r: Result = {
      prevLog: prev.log, prevRest: prev.rest, prevTf: prev.tf,
      fc, dc, pf, tov, rs, ds, pfs, pgFee, pw,
      restPre, restPost, delWallet, pfWallet, splitFee, target, actual,
      delFinal: delWallet, pfFinal: pfWallet,
      restDed: fc ? (fc - target) / fc : 0,
      delDed: dc ? (dc - delWallet) / dc : 0,
      fulfilled: yes ? 'YES' : 'NO',
      reason: ({ YES: '', RESTAURANT: 'Restaurant', LOGISTICS: 'Logistics', TF: 'TF Server' } as const)[o] ?? '',
      logF, restF, tfF, refund, delLeft: delWallet,
      restOwes, logOwes, tfOwes,
    };
    prev = { log: logOwes, rest: restOwes, tf: tfOwes };
    return r;
  });
}

export const OUTCOMES: [Outcome, string][] = [
  ['YES', 'Fulfilled'],
  ['RESTAURANT', 'Failed – Restaurant fault'],
  ['LOGISTICS', 'Failed – Logistics fault'],
  ['TF', 'Failed – TF server fault'],
];

export interface RestRow {
  name: string; status: string; cls: 'ok' | 'no' | 'hold'; note: string;
  food: number; gateway: number; recovered: number; splitFee: number; payout: number;
  held: number; raised: number; owes: number; tfOwes: number;
}

export function restaurantRows(state: LedgerState, results: Result[]): RestRow[] {
  return results.map((r, i) => {
    const yes = r.fulfilled === 'YES';
    const gateway = yes ? r.fc - r.restPre : 0;
    const recovered = yes ? r.restPre - r.restPost : 0;
    const splitFee = yes ? r.restPost - r.target : 0;
    const held = !yes && !r.restF ? r.target : 0;
    const raised = r.restF ? r.refund - r.target : 0;
    let status: string, cls: RestRow['cls'], note: string;
    if (yes) { status = 'Paid'; cls = 'ok'; note = recovered > 0.005 ? `${m(recovered)} of earlier dues recovered from this payout` : 'Paid in full after fees'; }
    else if (r.restF) { status = 'Cancelled – your fault'; cls = 'no'; note = `Diner refunded ${m(r.refund)}; ${m(raised)} added to what you owe TF`; }
    else { status = `Cancelled – ${r.logF ? 'logistics' : 'TF server'}`; cls = 'hold'; note = `Not your fault; TF owes you ${m(r.target)} for this order`; }
    return { name: state.cases[i].name, status, cls, note, food: r.fc, gateway, recovered, splitFee, payout: r.actual, held, raised, owes: r.restOwes, tfOwes: r.tfOwes };
  });
}
const m = (n: number) => '₹' + inr(n);

export function inr(n: number) {
  return (n < 0 && n > -0.005 ? 0 : n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const money = (n: number) => '₹' + inr(n);
export const pct = (n: number) => (n * 100).toFixed(2) + '%';
