'use client';
import { useState } from 'react';
import { PAY_METHODS, PayMethod, Settlement, fmtTime, money } from '@/lib/calc';
import { OTP_MAX_FAILS, UTR_RE, closeSettlement, isOpen, netPosition, otpBlocked, otpExpired, OTP_TTL_MS, requestSettlement, submitOtp, undoSettlement } from '@/lib/settlement';
import { Modal } from './Drawer';
import { useNow } from './Bits';
import { useTF } from './TFProvider';

const STATUS: Record<string, [string, string]> = {
  awaiting: ['pending', 'Awaiting restaurant verification'], otp: ['refunded', 'OTP issued'], settled: ['reversed', 'Settled'],
  cancelled: ['na', 'Cancelled by TF'], rejected: ['pending', 'Restaurant: not received'], undone: ['na', 'Undone'],
};

export function TFOwesPanel() {
  const { state, setState, summary, user } = useTF();
  const [settleFor, setSettleFor] = useState<string | null>(null);
  const by = user || 'unknown';
  const total = summary.restaurants.reduce((a, x) => a + x.tfOwes, 0);

  return (
    <>
      <table className="list">
        <thead><tr><th>Restaurant</th><th className="r">TF owes</th><th className="r">Restaurant owes TF</th><th className="r">Net payable</th><th>Settlement</th></tr></thead>
        <tbody>
          {summary.restaurants.length === 0 && <tr><td colSpan={5} className="sub">No restaurants yet</td></tr>}
          {summary.restaurants.map(x => {
            const net = Math.max(0, x.tfOwes - x.owes);
            const open = state.settlements.find(s => s.restaurantKey === x.key && isOpen(s));
            return (
              <tr key={x.key}>
                <td><b>{x.name}</b></td>
                <td className="r" style={{ color: x.tfOwes > 0.005 ? 'var(--bad)' : 'var(--muted)' }}>{money(x.tfOwes)}</td>
                <td className="r" style={{ color: x.owes > 0.005 ? 'var(--bad)' : 'var(--muted)' }}>{money(x.owes)}</td>
                <td className="r"><b>{money(net)}</b></td>
                <td>
                  {open ? <OpenSettlement s={open} />
                    : <button className="primary" disabled={net < 0.005} onClick={() => setSettleFor(x.key)}>Settle {money(net)}</button>}
                </td>
              </tr>
            );
          })}
          <tr><th>Total</th><th className="r">{money(total)}</th><th /><th /><th /></tr>
        </tbody>
      </table>
      <div className="hint">Net payable is what TF owes minus what the same restaurant owes TF. Settling clears both sides. It touches no wallet.</div>

      <b>Settlement history</b>
      <table className="list">
        <thead><tr><th>When</th><th>Restaurant</th><th>UTR / method</th><th className="r">Paid</th><th>Status</th><th /></tr></thead>
        <tbody>
          {state.settlements.length === 0 && <tr><td colSpan={6} className="sub">No settlements yet.</td></tr>}
          {state.settlements.map(s => {
            const [c, l] = STATUS[s.status];
            return (
              <tr key={s.id}>
                <td>{fmtTime(s.settledAt ?? s.createdAt)}</td>
                <td>{s.restaurant}</td>
                <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{s.utr}<div className="sub" style={{ fontFamily: 'inherit' }}>{s.method}</div></td>
                <td className="r">{money(s.amount)}{s.offset > 0.005 && <div className="sub">+ {money(s.offset)} netted</div>}</td>
                <td><span className={`badge ${c}`}>{l}</span>{s.otpIssued > 1 && <div className="sub">{s.otpIssued} OTPs issued</div>}{s.closeReason && s.status !== 'undone' && <div className="sub">{s.closeReason}</div>}</td>
                <td>{s.status === 'settled' && <button onClick={() => { if (confirm('Undo this settlement? The owes are restored.')) setState(st => undoSettlement(st, s.id, by)); }}>Undo</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {settleFor && <SettleModal restaurantKey={settleFor} onClose={() => setSettleFor(null)} />}
    </>
  );
}

function OpenSettlement({ s }: { s: Settlement }) {
  const { state, setState, user } = useTF();
  const now = useNow(1000);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const by = user || 'unknown';
  const cancel = () => { const r = prompt('Reason for cancelling (optional)') ; if (r !== null) setState(st => closeSettlement(st, s.id, 'tf', by, r)); };

  if (s.status === 'awaiting') {
    return (
      <div>
        <div><b>{money(s.amount)}</b> · {s.method} · <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{s.utr}</span></div>
        <div className="sub">Waiting for the restaurant to verify receipt…</div>
        <button style={{ marginTop: 4 }} onClick={cancel}>Cancel request</button>
      </div>
    );
  }
  const expired = otpExpired(s, now), blocked = otpBlocked(s);
  const left = Math.max(0, (s.otpAt ?? 0) + OTP_TTL_MS - now);
  const dead = expired || blocked;
  return (
    <div>
      <div><b>{money(s.amount)}</b> · <span className="sub">{s.method} · {s.utr}</span></div>
      <div className="sub">Restaurant verified. Enter the OTP they read out.</div>
      <div className="row-actions" style={{ marginTop: 4 }}>
        <input type="text" inputMode="numeric" maxLength={6} placeholder="6-digit OTP" value={code} disabled={dead}
          onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setMsg(''); }} style={{ width: 120, letterSpacing: '.15em' }} />
        <button className="primary" disabled={dead || code.length !== 6} onClick={() => {
          const r = submitOtp(state, s.id, code, by);
          setState(r.state); setMsg(r.ok ? '' : r.msg); if (!r.ok) setCode('');
        }}>Verify &amp; mark settled</button>
        <button onClick={cancel}>Cancel</button>
      </div>
      <div className="sub" style={{ color: s.otpFailed ? 'var(--bad)' : undefined }}>Failed attempts: {s.otpFailed}/{OTP_MAX_FAILS}{!dead && ` · expires in ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`}</div>
      {expired && <div className="sub" style={{ color: 'var(--bad)' }}>OTP expired. Waiting for the restaurant to generate a new one.</div>}
      {blocked && !expired && <div className="sub" style={{ color: 'var(--bad)' }}>Blocked after {OTP_MAX_FAILS} wrong attempts. Waiting for the restaurant to generate a new OTP.</div>}
      {msg && <div className="sub" style={{ color: 'var(--bad)' }}>{msg}</div>}
    </div>
  );
}

function SettleModal({ restaurantKey, onClose }: { restaurantKey: string; onClose: () => void }) {
  const { state, setState, user } = useTF();
  const pos = netPosition(state, restaurantKey);
  const name = state.orders.find(o => o.restaurant.trim().toLowerCase() === restaurantKey)?.restaurant.trim() || restaurantKey;
  const [utr, setUtr] = useState('');
  const [method, setMethod] = useState<PayMethod>('NEFT');
  const [err, setErr] = useState('');
  const valid = UTR_RE.test(utr.trim());
  return (
    <Modal onClose={onClose}>
      <h2>Settle with {name}</h2>
      <div className="sub">Pay the restaurant outside this app first, then enter the payment details. The restaurant will confirm receipt and give you an OTP.</div>
      <table className="list" style={{ marginTop: 12 }}><tbody>
        <tr><td>TF owes {name}</td><td className="r">{money(pos.tfOwes)}</td></tr>
        <tr><td>Less: {name} owes TF (netted off)</td><td className="r">− {money(pos.offset)}</td></tr>
        <tr><th>Net amount to pay</th><th className="r">{money(pos.net)}</th></tr>
      </tbody></table>
      <div className="form">
        <label>UTR number<input type="text" value={utr} onChange={e => { setUtr(e.target.value); setErr(''); }} placeholder="12–22 letters/digits" style={{ minWidth: 240, textTransform: 'uppercase' }} /></label>
        <label>Payment method<select value={method} onChange={e => setMethod(e.target.value as PayMethod)}>{PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      {utr && !valid && <div className="hint" style={{ color: 'var(--bad)' }}>UTR must be 12 to 22 letters and digits.</div>}
      {err && <div className="warnbox">{err}</div>}
      <div className="btns" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!valid || pos.net < 0.005} onClick={() => {
          const r = requestSettlement(state, restaurantKey, { utr, method, by: user || 'unknown' });
          if (r.error) { setErr(r.error); return; }
          setState(r.state); onClose();
        }}>Send for verification</button>
      </div>
    </Modal>
  );
}
