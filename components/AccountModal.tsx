'use client';
import { useState } from 'react';
import { AccountDetails, EMPTY_ACCOUNT, bankTouched, normalizeAccount, upiTouched, validateAccount } from '@/lib/account';
import { Modal } from './Drawer';

const BANK: [keyof AccountDetails, string, string][] = [
  ['holder', 'Account holder name', 'As on the bank account'], ['bankName', 'Bank name', 'e.g. HDFC Bank'],
  ['accountNo', 'Bank account number', '9–18 digits'], ['ifsc', 'IFSC', 'e.g. HDFC0001234'], ['branch', 'Branch name', 'e.g. Indiranagar'],
];
const UPI: [keyof AccountDetails, string, string][] = [['upiId', 'UPI ID', 'name@bank'], ['upiNumber', 'UPI number', '10-digit mobile number']];

export default function AccountModal({ name, initial, onSave, onClose }: {
  name: string; initial?: AccountDetails; onSave: (d: AccountDetails | null) => void; onClose: () => void;
}) {
  const [d, setD] = useState<AccountDetails>(initial ?? EMPTY_ACCOUNT);
  const [tried, setTried] = useState(false);
  const errors = validateAccount(d);
  const empty = !bankTouched(d) && !upiTouched(d);
  const set = (k: keyof AccountDetails, v: string) => setD(x => ({ ...x, [k]: v }));
  const field = ([k, label, ph]: [keyof AccountDetails, string, string]) => (
    <label key={k}>{label}
      <input type="text" value={d[k]} placeholder={ph} onChange={e => set(k, k === 'ifsc' ? e.target.value.toUpperCase() : e.target.value)} style={{ minWidth: 220 }} />
      {tried && errors[k] && <span style={{ color: 'var(--bad)' }}>{errors[k]}</span>}
    </label>
  );
  return (
    <Modal onClose={onClose}>
      <h2>Account details – {name}</h2>
      <div className="sub">TF pays your settlements to these details. Fill in the bank section, the UPI section, or both. Leave a section fully empty if you don&apos;t use it.</div>
      <b style={{ display: 'block', marginTop: 14 }}>Bank account</b>
      <div className="form">{BANK.map(field)}</div>
      <b>UPI</b>
      <div className="form">{UPI.map(field)}</div>
      <div className="btns" style={{ justifyContent: 'space-between' }}>
        <button className="danger" disabled={!initial} onClick={() => { onSave(null); onClose(); }}>Remove details</button>
        <div className="btns">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => {
            setTried(true);
            if (empty || Object.keys(errors).length) return;
            onSave(normalizeAccount(d)); onClose();
          }}>Save details</button>
        </div>
      </div>
      {tried && empty && <div className="hint" style={{ color: 'var(--bad)' }}>Enter bank or UPI details to save.</div>}
    </Modal>
  );
}
