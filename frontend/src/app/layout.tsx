import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../lib/auth-context';

export const metadata: Metadata = {
  title: 'DevOpsManager',
  description: 'AI-powered software development management foundation'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
