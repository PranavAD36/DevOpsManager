'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { useAuth } from '../lib/auth-context';

type AuthFormProps = { mode: 'login' | 'signup' };

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (mode === 'signup' && password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const result = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password, displayName.trim());
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (mode === 'signup' && result.needsConfirmation) {
      setMessage('Account created. Check your email to confirm your account.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">DevOpsManager</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="mt-2 text-sm text-slate-400">{mode === 'login' ? 'Sign in to continue to your workspace.' : 'Start with a secure Supabase account.'}</p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {mode === 'signup' && <label className="block text-sm text-slate-300">Display name<input className="auth-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></label>}
          <label className="block text-sm text-slate-300">Email<input className="auth-input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label className="block text-sm text-slate-300">Password<input className="auth-input" type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {mode === 'signup' && <label className="block text-sm text-slate-300">Confirm password<input className="auth-input" type="password" required minLength={6} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label>}
          {error && <p className="text-sm text-rose-400" role="alert">{error}</p>}
          {message && <p className="text-sm text-emerald-400" role="status">{message}</p>}
          <button className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60" disabled={submitting} type="submit">{submitting ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">{mode === 'login' ? 'Need an account? ' : 'Already registered? '}<Link className="text-cyan-400 hover:text-cyan-300" href={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Link></p>
      </section>
    </main>
  );
}
