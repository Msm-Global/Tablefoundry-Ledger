'use client';
import { useState } from 'react';
import { Settlement, fmtDateTime, moneyR } from '@/lib/calc';
import { AccountDetails, hasAnyDetails, paidTo } from '@/lib/account';
import { Cmd, OTP_MAX_FAILS, OTP_TTL_MS, canRegenerate, isOpen, otpBlocked, otpExpired } from '@/lib/settlement';
import { Modal } from './Drawer';
import { useNow } from './Bits';

const STATUS: Record<string, [string, string]> = {
  awaiting: ['hold', 'Awaiting your verification'], otp: ['hold', 'OTP issued'], settled: ['ok', 'Settled'],
  cancelled: ['hold', 'Cancelled by TF'], rejected: ['no', 'Marked not received'], undone: ['hold', 'Reversed by TF'],
};

export default function RestSettlement({ name, settlements, tfOwes, restOwes, send, connected, account, onAddAccount, onClose }: {
  name: string; settlements: Settlement[]; tfOwes: number; restOwes: number;
  send: (c: Cmd) => boolean; connected: boolean; account?: AccountDetails; onAddAccount: () => void; onClose: () => void;
}) {
  const now = useNow(1000);
  const open = settlements.find(isOpen);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const tfR = Math.round(tfOwes), restR = Math.round(restOwes);
  const net = Math.max(0, tfR - restR);

  const expired = open ? otpExpired(open, now) : false, blocked = open ? otpBlocked(open) : false;
  const left = open?.otpAt ? Math.max(0, open.otpAt + OTP_TTL_MS - now) : 0;

  return (
    <Modal onClose={onClose}>
      <h2>TF owes you</h2>
      <table className="list" style={{ marginTop: 10 }}><tbody>
        <tr><td>TF owes {name}</td><td className="r">{moneyR(tfOwes)}</td></tr>
        <tr><td>Less: you owe TF (netted off)</td><td className="r">− {moneyR(restOwes)}</td></tr>
        <tr><th>Net TF has to pay you</th><th className="r">{moneyR(net)}</th></tr>
      </tbody></table>

      {!hasAnyDetails(account) && (
        <div className="warnbox">
          <b>No account details added.</b> TF cannot pay you (settlement or owed payouts) until you add your bank or UPI details.
          <div style={{ marginTop: 6 }}><button className="primary" onClick={onAddAccount}>Add account details</button></div>
        </div>
      )}

      {!connected && <div className="warnbox">You are not connected to the TF dashboard right now, so actions below are disabled.</div>}

      {!open && <div className="sub" style={{ margin: '10px 0' }}>{net > 0.005 ? 'TF has not sent a settlement yet. When TF pays you, the payment details (UTR) will appear here for you to verify.' : 'Nothing to settle.'}</div>}

      {open?.status === 'awaiting' && (
        <div className="card" style={{ margin: '10px 0' }}>
          <b>TF says it paid you {moneyR(open.amount)}</b>
          <div className="kv"><span>UTR</span><span style={{ fontFamily: 'ui-monospace,monospace' }}>{open.utr}</span><span>Method</span><span>{open.method}</span><span>Paid on</span><span>{fmtDateTime(open.paidAt)}</span><span>Paid to</span><span>{paidTo(open.method, open.account)}</span></div>
          <div className="hint">Check your bank. Only verify if the money has reached your account.</div>
          {!rejecting ? (
            <div className="btns" style={{ marginTop: 8 }}>
              <button className="primary" disabled={!connected} onClick={() => send({ kind: 'verify', id: open.id })}>Verified – I received this payment</button>
              <button disabled={!connected} onClick={() => setRejecting(true)}>Not received</button>
            </div>
          ) : (
            <div className="form">
              <label>Reason (optional)<input type="text" value={reason} onChange={e => setReason(e.target.value)} style={{ minWidth: 240 }} /></label>
              <button className="primary" disabled={!connected} onClick={() => { send({ kind: 'reject', id: open.id, reason }); setRejecting(false); setReason(''); }}>Confirm not received</button>
              <button onClick={() => setRejecting(false)}>Back</button>
            </div>
          )}
        </div>
      )}

      {open?.status === 'otp' && (
        <div className="card" style={{ margin: '10px 0', textAlign: 'center' }}>
          <div className="sub">Read this OTP to TF to finish the settlement of {moneyR(open.amount)}</div>
          <div style={{ font: '700 40px/1.2 ui-monospace,monospace', letterSpacing: '.25em', margin: '8px 0', color: expired || blocked ? 'var(--muted)' : 'var(--accent)', textDecoration: expired || blocked ? 'line-through' : 'none' }}>{open.otp}</div>
          <div className="sub" style={{ color: open.otpFailed ? 'var(--bad)' : undefined }}>Failed attempts by TF: {open.otpFailed}/{OTP_MAX_FAILS}{!expired && !blocked && ` · expires in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`}</div>
          {expired && <div style={{ color: 'var(--bad)', fontSize: 13 }}>This OTP has expired.</div>}
          {blocked && !expired && <div style={{ color: 'var(--bad)', fontSize: 13 }}>3 wrong attempts. This OTP is no longer valid.</div>}
          {canRegenerate(open, now) && <button className="primary" style={{ marginTop: 8 }} disabled={!connected} onClick={() => send({ kind: 'newotp', id: open.id })}>Generate new OTP</button>}
        </div>
      )}

      <b>Settlement history</b>
      <table className="list">
        <thead><tr><th>Paid on</th><th>UTR / method / paid to</th><th className="r">Amount</th><th>Status</th></tr></thead>
        <tbody>
          {settlements.length === 0 && <tr><td colSpan={4} className="sub">No settlements yet.</td></tr>}
          {settlements.map(s => {
            const [c, l] = STATUS[s.status];
            return (
              <tr key={s.id}>
                <td>{fmtDateTime(s.paidAt)}</td>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{s.utr}<div className="sub" style={{ fontFamily: 'inherit' }}>{s.method} → {paidTo(s.method, s.account)}</div></td>
                <td className="r">{moneyR(s.amount)}</td>
                <td><span className={`pill ${c}`}>{l}</span>{s.status === 'otp' && s.otpFailed > 0 && <div className="sub">Failed attempts {s.otpFailed}/{OTP_MAX_FAILS}</div>}{s.closeReason && s.status !== 'undone' && <div className="sub">{s.closeReason}</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="btns" style={{ justifyContent: 'flex-end' }}><button onClick={onClose}>Close</button></div>
    </Modal>
  );
}
