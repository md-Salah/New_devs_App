import { supabase } from '../lib/supabase';

export const validateSession = async (): Promise<any> => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('[sessionValidator] Error getting session:', error);
      return null;
    }
    
    // Try to refresh if session exists but might be expired
    if (session) {
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshedSession) {
        return refreshedSession;
      }
    }
    
    return session;
  } catch (error) {
    console.error('[sessionValidator] Unexpected error:', error);
    return null;
  }
};

// Export as sessionValidator object for compatibility with secureApi.ts
export const sessionValidator = {
  validateSession
};