import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevOpsManager',
  description: 'AI-powered software development management foundation'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
