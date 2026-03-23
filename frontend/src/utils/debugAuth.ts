// Debug authentication utilities
(window as any).debugAuth = {
  getTokens: () => {
    return {
      localStorage: localStorage.getItem('sb-auth-token'),
      sessionStorage: sessionStorage.getItem('sb-auth-token'),
    };
  },
  
  clearTokens: () => {
    localStorage.removeItem('sb-auth-token');
    sessionStorage.removeItem('sb-auth-token');
    console.log('Auth tokens cleared');
  },
  
  getSession: async () => {
    const { supabase } = await import('../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },
  
  getUser: async () => {
    const { supabase } = await import('../lib/supabase');
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
};