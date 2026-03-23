// Authentication debugger
console.log('[Auth Debugger] Loaded');

// Add global auth debugging functions
(window as any).authDebug = {
  status: async () => {
    const { supabase } = await import('../lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const { data: { user } } = await supabase.auth.getUser();
    
    console.group('Authentication Status');
    console.log('Session:', session);
    console.log('User:', user);
    console.log('LocalStorage tokens:', localStorage.getItem('sb-auth-token'));
    console.groupEnd();
    
    return { session, user };
  },
  
  inspect: () => {
    console.group('Auth Storage Inspection');
    console.log('LocalStorage:', { ...localStorage });
    console.log('SessionStorage:', { ...sessionStorage });
    console.groupEnd();
  }
};