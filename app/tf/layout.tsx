import { TFProvider } from '@/components/TFProvider';
import TFShell from '@/components/TFShell';

export const metadata = { title: 'TF Owner Dashboard' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <TFProvider><TFShell>{children}</TFShell></TFProvider>;
}
