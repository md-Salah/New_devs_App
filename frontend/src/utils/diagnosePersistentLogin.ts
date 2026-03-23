/**
 * Diagnostic utility to identify persistent login issues
 */

import { supabase } from '../lib/supabase';

export async function diagnosePersistentLogin() {
  console.log('🔍 Starting persistent login diagnosis...\n');
  
  // 1. Check localStorage
  console.log('1. Checking localStorage:');
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
  const storedData = localStorage.getItem(storageKey);
  
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      console.log('✅ Found stored session');
      console.log('  - Has access_token:', !!parsed?.currentSession?.access_token);
      console.log('  - Has refresh_token:', !!parsed?.currentSession?.refresh_token);
      console.log('  - Expires at:', new Date(parsed?.expiresAt * 1000).toLocaleString());
      
      const now = Date.now() / 1000;
      const expiresAt = parsed?.expiresAt || 0;
      if (expiresAt < now) {
        console.log('  ⚠️ Token is expired');
      } else {
        console.log('  ✅ Token is still valid');
      }
    } catch (e) {
      console.error('❌ Failed to parse stored session:', e);
    }
  } else {
    console.log('❌ No session found in localStorage with key:', storageKey);
  }
  
  // 2. Check Supabase can get session
  console.log('\n2. Checking Supabase getSession():');
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('❌ Error getting session:', error);
  } else if (session) {
    console.log('✅ Supabase found session');
    console.log('  - User ID:', session.user?.id);
    console.log('  - Email:', session.user?.email);
    console.log('  - Expires at:', new Date(session.expires_at! * 1000).toLocaleString());
  } else {
    console.log('❌ Supabase could not find session');
  }
  
  // 3. Check if session can be refreshed
  console.log('\n3. Attempting to refresh session:');
  const { data: { session: refreshed }, error: refreshError } = await supabase.auth.refreshSession();
  
  if (refreshError) {
    console.error('❌ Refresh failed:', refreshError);
  } else if (refreshed) {
    console.log('✅ Session refreshed successfully');
    console.log('  - New expires at:', new Date(refreshed.expires_at! * 1000).toLocaleString());
  } else {
    console.log('❌ No session to refresh');
  }
  
  // 4. Check browser settings
  console.log('\n4. Browser checks:');
  console.log('  - localStorage available:', typeof(Storage) !== "undefined");
  console.log('  - Cookies enabled:', navigator.cookieEnabled);
  
  // Try to write and read from localStorage
  try {
    localStorage.setItem('test-persist', 'test');
    const test = localStorage.getItem('test-persist');
    localStorage.removeItem('test-persist');
    console.log('  - localStorage read/write:', test === 'test' ? '✅ Working' : '❌ Failed');
  } catch (e) {
    console.log('  - localStorage read/write: ❌ Blocked');
  }
  
  // 5. Summary
  console.log('\n📋 DIAGNOSIS SUMMARY:');
  if (storedData && session) {
    console.log('✅ Session persistence appears to be working');
    console.log('   If users are still being logged out, check:');
    console.log('   - Browser privacy settings (blocking localStorage)');
    console.log('   - Incognito/private mode');
    console.log('   - Third-party cookie blocking');
  } else if (storedData && !session) {
    console.log('⚠️ Session exists in storage but Supabase cannot retrieve it');
    console.log('   Possible causes:');
    console.log('   - Session expired and needs refresh');
    console.log('   - Supabase client initialization issue');
    console.log('   - Storage key mismatch');
  } else if (!storedData) {
    console.log('❌ No session in localStorage');
    console.log('   Possible causes:');
    console.log('   - User never logged in');
    console.log('   - localStorage was cleared');
    console.log('   - Browser blocking storage');
    console.log('   - Wrong storage key being used');
  }
  
  return {
    hasStoredSession: !!storedData,
    hasActiveSession: !!session,
    canRefresh: !!refreshed,
    storageWorking: typeof(Storage) !== "undefined"
  };
}

// Make available in console for testing
if (typeof window !== 'undefined') {
  (window as any).diagnosePersistentLogin = diagnosePersistentLogin;
}