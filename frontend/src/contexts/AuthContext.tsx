import { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { imageCache } from "../lib/imageCache";
import { sessionPersistenceManager } from "../utils/SessionPersistenceManager";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Start session persistence if user is logged in
      if (session?.user) {
        sessionPersistenceManager.start();
      }
    });

    // Listen for changes on auth state
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      
      // Manage session persistence based on auth state
      if (session?.user) {
        sessionPersistenceManager.start();
      } else {
        sessionPersistenceManager.stop();
      }
    });

    // Listen for session expiry events
    const handleSessionExpired = (event: CustomEvent) => {
      console.log('[AuthContext] Session expired and could not be recovered:', event.detail);
      // Session persistence manager already stopped at this point
      // The auth state change listener will handle the UI update
    };

    window.addEventListener('session-expired', handleSessionExpired as EventListener);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('session-expired', handleSessionExpired as EventListener);
      sessionPersistenceManager.stop();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear image cache on logout
    imageCache.clearCache();
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
