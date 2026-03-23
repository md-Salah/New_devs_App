// Authentication testing utilities
(window as any).testAuth = {
  login: async (email: string, password: string) => {
    const { supabase } = await import('../lib/supabase');
    const result = await supabase.auth.signInWithPassword({ email, password });
    console.log('Login result:', result);
    return result;
  },
  
  logout: async () => {
    const { supabase } = await import('../lib/supabase');
    const result = await supabase.auth.signOut();
    console.log('Logout result:', result);
    return result;
  },
  
  refresh: async () => {
    const { supabase } = await import('../lib/supabase');
    const result = await supabase.auth.refreshSession();
    console.log('Refresh result:', result);
    return result;
  }
};