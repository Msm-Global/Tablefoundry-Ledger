import Link from 'next/link';

export default function Home() {
  return (
    <div className="center">
      <div style={{ textAlign: 'center', width: '100%' }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Tablefoundry · Settlement Ledger</h1>
        <p style={{ color: 'var(--muted)', margin: '8px 0 0' }}>Open the owner dashboard on one device and the restaurant dashboard on another, then pair them with the code.</p>
        <div className="cards">
          <Link href="/tf"><b>TF Owner Dashboard</b><span>Enter test orders. Shows the pairing code.</span></Link>
          <Link href="/restaurant"><b>Restaurant Dashboard</b><span>Enter the pairing code to see live data.</span></Link>
        </div>
      </div>
    </div>
  );
}
