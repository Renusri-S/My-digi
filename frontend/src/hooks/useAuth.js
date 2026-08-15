import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase, supabaseEnabled, ADMIN_EMAIL } from '@/lib/supabase';

const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signIn: async () => ({ error: 'auth disabled' }),
  signUp: async () => ({ error: 'auth disabled' }),
  signInWithGoogle: async () => ({ error: 'auth disabled' }),
  signOut: async () => { },
  refreshProfile: async () => { },
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!supabaseEnabled || !userId) return null;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data || null);
    return data;
  }, []);

  useEffect(() => {
    if (!supabaseEnabled) { setLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s || null);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, [loadProfile]);

  const user = session?.user || null;
  const isAdmin = useMemo(() => {
    if (profile?.role === 'admin') return true;
    if (user?.email && ADMIN_EMAIL && user.email.toLowerCase() === ADMIN_EMAIL) return true;
    return false;
  }, [profile, user]);

  const signIn = useCallback(async (email, password) => {
    if (!supabaseEnabled) return { error: 'Auth is not configured yet.' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }, []);

  const signUp = useCallback(async (email, password, meta = {}) => {
    if (!supabaseEnabled) return { error: 'Auth is not configured yet.' };
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: meta, emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    return { error: error?.message, session: data?.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabaseEnabled) return { error: 'Auth is not configured yet.' };
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseEnabled) return;
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await loadProfile(user.id);
  }, [user, loadProfile]);

  const value = {
    session, user, profile, loading, isAdmin,
    signIn, signUp, signInWithGoogle, signOut, refreshProfile
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
