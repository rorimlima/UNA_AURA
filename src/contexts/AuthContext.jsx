import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    // Safety timeout: never leave loading indefinitely
    const timeout = setTimeout(() => setLoading(false), 3000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
      clearTimeout(timeout);
    }).catch(() => { setLoading(false); clearTimeout(timeout); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Ignore auth state changes during explicit logout
      if (loggingOutRef.current) return;

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        await fetchProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);


  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  /**
   * Robust sign-out: ALWAYS clears local state and redirects,
   * even if the Supabase server call fails (offline, expired session, etc.)
   */
  const signOut = useCallback(async () => {
    // Prevent double-clicks / race conditions
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;

    try {
      // Attempt server-side sign out (best-effort)
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[Auth] Server sign-out failed (will clear locally):', err?.message);
    }

    // === ALWAYS clear local state, regardless of server response ===

    // 1. Clear React state
    setUser(null);
    setProfile(null);

    // 2. Clear all Supabase auth tokens from localStorage
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('sb-') ||
           key.includes('supabase') ||
           key === 'una-aura-auth')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (e) {
      console.warn('[Auth] Could not clear localStorage:', e);
    }

    // 3. Clear sessionStorage as well
    try {
      const sessionKeysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (
          key &&
          (key.startsWith('sb-') ||
           key.includes('supabase') ||
           key === 'una-aura-auth')
        ) {
          sessionKeysToRemove.push(key);
        }
      }
      sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (e) {
      console.warn('[Auth] Could not clear sessionStorage:', e);
    }

    // 4. Force hard redirect to login — guarantees clean state
    //    Using window.location instead of React Router ensures
    //    all in-memory state is wiped clean
    loggingOutRef.current = false;
    window.location.href = '/login';
  }, []);

  async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  const isAdmin = profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signIn,
      signOut,
      resetPassword,
      isAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
