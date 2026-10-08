'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTF } from './TFProvider';
import { CopyButton, LogoutButton, StatusChip, ThemeToggle } from './Bits';

export default function TFShell({ children }: { children: React.ReactNode }) {
  const { pair, origin, user } = useTF();
  const path = usePathname();
  const tabs = [['/tf', 'Operations'], ['/tf/simulator', 'Order simulator']];
  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Tablefoundry · TF Owner Dashboard</h1>
          <div className="sub">{user ? `Signed in as ${user}` : ' '}</div>
        </div>
        <div className="btns"><ThemeToggle /><LogoutButton /></div>
      </header>

      <div className="pair">
        <div>
          <div className="lab">PAIRING CODE – give this to the restaurant dashboard</div>
          <div className="code">{pair.code || '······'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <StatusChip status={pair.status} extra={pair.guests > 1 ? `(${pair.guests} dashboards)` : ''} />
          <div className="btns">
            <CopyButton text={pair.code} label="Copy code" />
            <CopyButton text={`${origin}/restaurant?code=${pair.code}`} label="Copy restaurant link" />
          </div>
        </div>
      </div>

      <nav className="tabs">
        {tabs.map(([href, label]) => <Link key={href} href={href} className={path === href ? 'on' : ''}>{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
