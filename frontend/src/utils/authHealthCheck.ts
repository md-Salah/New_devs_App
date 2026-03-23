// Global auth health check utility
(window as any).authHealthCheck = async () => {
  const { supabase } = await import('../lib/supabase');
  
  const checks = {
    localStorage: !!localStorage.getItem('sb-auth-token'),
    sessionStorage: !!sessionStorage.getItem('sb-auth-token'),
    supabaseSession: false,
    user: null as any
  };
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    checks.supabaseSession = !!session;
    checks.user = session?.user || null;
  } catch (error) {
    console.error('Auth health check error:', error);
  }
  
  console.table(checks);
  return checks;
};