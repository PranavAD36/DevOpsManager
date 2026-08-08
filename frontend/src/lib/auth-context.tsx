'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { createClient } from './supabase/client';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errorMessage(error: { message: string } | null) {
  return error?.message ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    session,
    loading,
    async signIn(email, password) {
      const { error } = await createClient().auth.signInWithPassword({ email, password });
      return { error: errorMessage(error), needsConfirmation: false };
    },
    async signUp(email, password, displayName) {
      const { data, error } = await createClient().auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName || undefined } },
      });
      return { error: errorMessage(error), needsConfirmation: Boolean(data.user && !data.session) };
    },
    async signOut() {
      const { error } = await createClient().auth.signOut();
      return { error: errorMessage(error) };
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
