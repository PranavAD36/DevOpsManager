import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import Nav from '../components/Nav';

export const metadata: Metadata = {
  title: {
    default: 'DevOpsManager',
    template: '%s | DevOpsManager',
  },
  description: 'AI-powered software development management foundation',
  metadataBase: new URL('http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Nav />
        <main className="relative z-10 pt-14">{children}</main>
      </body>
    </html>
  );
}
