import type { PayMethod } from './calc';

export interface AccountDetails {
  holder: string; bankName: string; accountNo: string; ifsc: string; branch: string; // bank
  upiId: string; upiNumber: string;                                                  // UPI
}
export const EMPTY_ACCOUNT: AccountDetails = { holder: '', bankName: '', accountNo: '', ifsc: '', branch: '', upiId: '', upiNumber: '' };

const ACC_RE = /^\d{9,18}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const UPI_NUM_RE = /^\d{10}$/;

export const bankComplete = (d: AccountDetails) =>
  !!d.holder.trim() && !!d.bankName.trim() && ACC_RE.test(d.accountNo.trim()) && IFSC_RE.test(d.ifsc.trim().toUpperCase()) && !!d.branch.trim();
export const upiComplete = (d: AccountDetails) => UPI_RE.test(d.upiId.trim()) && UPI_NUM_RE.test(d.upiNumber.trim());
export const hasAnyDetails = (d?: AccountDetails) => !!d && (bankComplete(d) || upiComplete(d));

/** Whether the saved details are enough to pay by this method. */
export function methodReady(method: PayMethod, d?: AccountDetails) {
  if (!d) return false;
  if (method === 'UPI') return upiComplete(d);
  if (method === 'OTHER') return hasAnyDetails(d);
  return bankComplete(d);
}
export const methodNeeds = (method: PayMethod) => (method === 'UPI' ? 'UPI' : method === 'OTHER' ? 'bank or UPI' : 'bank');

export const bankTouched = (d: AccountDetails) => !!(d.holder || d.bankName || d.accountNo || d.ifsc || d.branch);
export const upiTouched = (d: AccountDetails) => !!(d.upiId || d.upiNumber);

export function validateAccount(d: AccountDetails): Partial<Record<keyof AccountDetails, string>> {
  const e: Partial<Record<keyof AccountDetails, string>> = {};
  if (bankTouched(d)) {
    if (!d.holder.trim()) e.holder = 'Required';
    if (!d.bankName.trim()) e.bankName = 'Required';
    if (!ACC_RE.test(d.accountNo.trim())) e.accountNo = '9 to 18 digits';
    if (!IFSC_RE.test(d.ifsc.trim().toUpperCase())) e.ifsc = 'Like HDFC0001234';
    if (!d.branch.trim()) e.branch = 'Required';
  }
  if (upiTouched(d)) {
    if (!UPI_RE.test(d.upiId.trim())) e.upiId = 'Like name@bank';
    if (!UPI_NUM_RE.test(d.upiNumber.trim())) e.upiNumber = '10-digit number';
  }
  return e;
}
export const normalizeAccount = (d: AccountDetails): AccountDetails => ({
  holder: d.holder.trim(), bankName: d.bankName.trim(), accountNo: d.accountNo.trim(), ifsc: d.ifsc.trim().toUpperCase(),
  branch: d.branch.trim(), upiId: d.upiId.trim(), upiNumber: d.upiNumber.trim(),
});

/** One-line "paid to" text for a method. */
export function paidTo(method: PayMethod, d?: AccountDetails) {
  if (!d) return '—';
  const bank = `${d.holder} · ${d.bankName} · A/c ${d.accountNo} · ${d.ifsc} · ${d.branch}`;
  const upi = `${d.upiId} · ${d.upiNumber}`;
  if (method === 'UPI') return upi;
  if (method === 'OTHER') return [bankComplete(d) ? bank : '', upiComplete(d) ? upi : ''].filter(Boolean).join('  |  ') || '—';
  return bank;
}

const key = (code: string, rkey: string) => `rest-acct:${code}:${rkey}`;
export function loadAccount(code: string, rkey: string): AccountDetails | undefined {
  try { const s = localStorage.getItem(key(code, rkey)); return s ? { ...EMPTY_ACCOUNT, ...JSON.parse(s) } : undefined; } catch { return undefined; }
}
export function saveAccount(code: string, rkey: string, d: AccountDetails | null) {
  try { d ? localStorage.setItem(key(code, rkey), JSON.stringify(d)) : localStorage.removeItem(key(code, rkey)); } catch {}
}
export function loadAllAccounts(code: string): Record<string, AccountDetails> {
  const out: Record<string, AccountDetails> = {};
  try {
    const p = `rest-acct:${code}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(p)) out[k.slice(p.length)] = { ...EMPTY_ACCOUNT, ...JSON.parse(localStorage.getItem(k)!) };
    }
  } catch {}
  return out;
}
