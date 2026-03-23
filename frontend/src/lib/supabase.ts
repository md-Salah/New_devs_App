import { localAuthClient } from './localAuthClient';

console.log('✅ Using local authentication client instead of Supabase');

// Use local auth client instead of Supabase
export const supabase = localAuthClient;

if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      console.log('✅ Session found on page load:', session.user.email);
    } else {
      console.log('ℹ️ No session found on page load');
    }
  });
}

// For admin operations, use the FastAPI backend instead of direct admin client
export const adminClient = supabase; // Frontend uses same client, backend handles admin operations

// export default supabase; // Removed to prevent mixed export confusion