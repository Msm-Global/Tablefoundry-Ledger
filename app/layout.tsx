import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Tablefoundry Settlement Ledger', description: 'Paired TF owner and restaurant settlement dashboards' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
