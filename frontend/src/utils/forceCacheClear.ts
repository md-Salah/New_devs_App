import { supabase } from '../lib/supabase';
import { GlobalCacheManager } from '../lib/cacheUtils';
import { bootstrapPrefetch } from './bootstrapPrefetch';
import { emergencyTenantFix as comprehensiveTenantFix, getManualFixInstructions } from './emergencyTenantFixer';

/**
 * Force clear all cache and logout all users
 * This can be called from browser console or programmatically
 */
export const forceClearAllCache = async (reason: string = 'manual') => {
  console.log(`[CacheClear] Starting forced cache clear. Reason: ${reason}`);
  
  // Prevent repeated clearing by checking a flag
  const clearingKey = 'cache_clearing_in_progress';
  if (localStorage.getItem(clearingKey) === 'true') {
    console.log('[CacheClear] Cache clearing already in progress, skipping...');
    return false;
  }
  
  try {
    // Set flag to prevent loops
    localStorage.setItem(clearingKey, 'true');
    
    // 1. Clear prefetch data
    bootstrapPrefetch.clearPrefetch();
    console.log('[CacheClear] ✅ Cleared prefetch data');
    
    // 2. Clear all localStorage except the clearing flag
    const keysToKeep: string[] = [clearingKey]; // Keep the clearing flag
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !keysToKeep.includes(key)) {
        allKeys.push(key);
      }
    }
    allKeys.forEach(key => localStorage.removeItem(key));
    console.log(`[CacheClear] ✅ Cleared ${allKeys.length} localStorage items`);
    
    // 3. Clear sessionStorage
    sessionStorage.clear();
    console.log('[CacheClear] ✅ Cleared sessionStorage');
    
    // 4. Clear IndexedDB
    if ('indexedDB' in window) {
      const databases = await (window.indexedDB as any).databases?.() || [];
      for (const db of databases) {
        if (db.name) {
          await indexedDB.deleteDatabase(db.name);
          console.log(`[CacheClear] ✅ Deleted IndexedDB: ${db.name}`);
        }
      }
    }
    
    // 5. Clear Cache Storage (for PWAs/Service Workers)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(async (cacheName) => {
          await caches.delete(cacheName);
          console.log(`[CacheClear] ✅ Deleted cache: ${cacheName}`);
        })
      );
    }
    
    // 6. Use GlobalCacheManager
    await GlobalCacheManager.clearAllCache(reason);
    console.log('[CacheClear] ✅ GlobalCacheManager cleared');
    
    // 7. Sign out from Supabase
    await supabase.auth.signOut();
    console.log('[CacheClear] ✅ Signed out from Supabase');
    
    console.log('[CacheClear] ✅ All cache cleared successfully!');
    
    // 8. Clear the flag and reload the page to login
    setTimeout(() => {
      localStorage.removeItem(clearingKey);
      window.location.href = '/login';
    }, 500);
    
    return true;
  } catch (error) {
    console.error('[CacheClear] Error clearing cache:', error);
    // Clear the flag on error
    localStorage.removeItem(clearingKey);
    // Even on error, try to redirect to login
    window.location.href = '/login';
    return false;
  }
};

/**
 * Clear cache without logging out
 * Useful for debugging or refreshing data
 */
export const clearCacheOnly = async () => {
  console.log('[CacheClear] Clearing cache without logout...');
  
  try {
    // Clear prefetch
    bootstrapPrefetch.clearPrefetch();
    
    // Clear specific cache keys but preserve auth
    const keysToPreserve = ['supabase.auth.token', 'sb-'];
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const shouldPreserve = keysToPreserve.some(preserve => 
          key.includes(preserve)
        );
        if (!shouldPreserve) {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`[CacheClear] Removed ${keysToRemove.length} cache items`);
    
    // Clear IndexedDB caches
    if ('indexedDB' in window) {
      const databases = await (window.indexedDB as any).databases?.() || [];
      for (const db of databases) {
        if (db.name && db.name.includes('Cache')) {
          await indexedDB.deleteDatabase(db.name);
          console.log(`[CacheClear] Deleted cache DB: ${db.name}`);
        }
      }
    }
    
    console.log('[CacheClear] Cache cleared, refreshing data...');
    window.location.reload();
    
    return true;
  } catch (error) {
    console.error('[CacheClear] Error:', error);
    return false;
  }
};

/**
 * Addresses cases where automation user tokens persist alongside regular users
 */
export const emergencyAuthCleanup = async () => {
  console.log('🚨 EMERGENCY AUTH CLEANUP - Resolving JWT Token Conflicts');
  
  try {
    // 1. Check for conflicting JWT tokens
    console.log('🔍 Checking for JWT token conflicts...');
    
    const checkLocalStorageForTokens = () => {
      const tokens = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
          const value = localStorage.getItem(key);
          if (value && value.includes('automation@theflex.global')) {
            tokens.push({ key, type: 'automation_conflict' });
          } else if (value && value.includes('noam@stayhomely.de')) {
            tokens.push({ key, type: 'correct_user' });
          }
        }
      }
      return tokens;
    };
    
    const conflictingTokens = checkLocalStorageForTokens();
    console.log('🔍 Token analysis:', conflictingTokens);
    
    // 2. If automation tokens detected, force complete cleanup
    const hasAutomationConflict = conflictingTokens.some(t => t.type === 'automation_conflict');
    
    if (hasAutomationConflict) {
      console.log('🚨 AUTOMATION TOKEN CONFLICT DETECTED - Performing nuclear cleanup');
      
      // Nuclear option: clear everything
      localStorage.clear();
      sessionStorage.clear();
      
      // Clear IndexedDB
      if ('indexedDB' in window) {
        try {
          const databases = await (window.indexedDB as any).databases?.() || [];
          for (const db of databases) {
            if (db.name) {
              await indexedDB.deleteDatabase(db.name);
              console.log(`🗑️ Deleted IndexedDB: ${db.name}`);
            }
          }
        } catch (e) {
          console.log('⚠️ IndexedDB cleanup error:', e);
        }
      }
      
      // Clear Cache Storage
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          for (const cacheName of cacheNames) {
            await caches.delete(cacheName);
            console.log(`🗑️ Deleted cache: ${cacheName}`);
          }
        } catch (e) {
          console.log('⚠️ Cache cleanup error:', e);
        }
      }
      
      // Sign out from Supabase
      try {
        await supabase.auth.signOut();
        console.log('🔓 Supabase sign out completed');
      } catch (e) {
        console.log('⚠️ Supabase sign out error:', e);
      }
      
      console.log('✅ NUCLEAR CLEANUP COMPLETED');
      console.log('🔄 REDIRECTING TO LOGIN - USE INCOGNITO MODE');
      
      // Force redirect with cache busting
      setTimeout(() => {
        window.location.href = '/login?cleanup=' + Date.now();
      }, 1000);
      
      return true;
    } else {
      console.log('✅ No automation token conflicts detected');
      return false;
    }
    
  } catch (error) {
    console.error('🚨 Emergency cleanup failed:', error);
    // Fallback: still try to redirect to login
    window.location.href = '/login?emergency=' + Date.now();
    return false;
  }
};

/**
 * Forces correct Homely tenant ID and clears conflicting data
 */
export const emergencyTenantFix = async () => {
  console.log('🚨 EMERGENCY TENANT FIX - Resolving 403 Forbidden & Branding Issues');
  console.log('================================================================');
  
  const CORRECT_HOMELY_TENANT_ID = '5a382f72-aec3-40f1-9063-89476ae00669';
  const WRONG_TENANT_ID = 'a860bda4-b44f-471c-9464-8456bbeb7d38';
  
  try {
    // Step 1: Detect tenant conflicts
    console.log('1. Detecting tenant conflicts...');
    let conflicts = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes(WRONG_TENANT_ID)) {
        console.log(`   ❌ Found wrong tenant data: ${key}`);
        localStorage.removeItem(key);
        conflicts++;
      }
    }
    
    // Step 2: Force correct tenant context in StorageManager
    console.log('2. Setting correct tenant context...');
    try {
      // Assuming user ID from logs
      const userId = '4812e0ac-13c8-4b61-af32-b492889f6221';
      const email = 'noam@stayhomely.de';
      
      if (typeof window !== 'undefined' && (window as any).storageManager) {
        (window as any).storageManager.setContext({
          tenant_id: CORRECT_HOMELY_TENANT_ID,
          user_id: userId,
          email: email
        });
        console.log('   ✅ StorageManager context updated');
      }
    } catch (e) {
      console.log('   ⚠️ StorageManager not available:', e);
    }
    
    // Step 3: Clear corrupted cache entries
    console.log('3. Clearing corrupted tenant data...');
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('tenant') || key.includes('auth_cache') || key.includes('bootstrap'))) {
        try {
          const value = localStorage.getItem(key);
          if (value && value.includes(WRONG_TENANT_ID)) {
            keysToRemove.push(key);
          }
        } catch (e) {
          // If we can't parse, might be corrupted
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`   ✅ Removed: ${key}`);
    });
    
    console.log('');
    console.log('✅ EMERGENCY TENANT FIX COMPLETE!');
    console.log('===================================');
    console.log(`Conflicts resolved: ${conflicts}`);
    console.log(`Cache entries cleaned: ${keysToRemove.length}`);
    console.log(`Correct tenant ID enforced: ${CORRECT_HOMELY_TENANT_ID}`);
    console.log('');
    console.log('🔄 Reloading page to apply fixes...');
    
    setTimeout(() => {
      window.location.reload();
    }, 2000);
    
    return true;
  } catch (error) {
    console.error('🚨 Emergency tenant fix failed:', error);
    return false;
  }
};

/**
 * Specifically addresses wrong tenant ID being cached/displayed
 */
export const fixTenantIssue = async () => {
  console.log('🔧 IMMEDIATE TENANT/LOGO FIX');
  console.log('=============================');
  
  try {
    // Step 1: Nuclear cache clear
    console.log('1. Performing nuclear cache clear...');
    localStorage.clear();
    sessionStorage.clear();
    
    // Step 2: Clear specific Supabase storage
    console.log('2. Clearing Supabase storage...');
    try {
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.log('localStorage already cleared');
    }
    
    // Step 3: Clear IndexedDB
    if ('indexedDB' in window) {
      try {
        const databases = await (window.indexedDB as any).databases?.() || [];
        for (const db of databases) {
          if (db.name) {
            await indexedDB.deleteDatabase(db.name);
            console.log(`   ✅ Deleted DB: ${db.name}`);
          }
        }
      } catch (e) {
        console.log('   ⚠️ IndexedDB clear error:', e);
      }
    }
    
    // Step 4: Force Supabase sign out
    console.log('3. Forcing complete Supabase logout...');
    try {
      await supabase.auth.signOut();
      console.log('   ✅ Supabase signed out');
    } catch (e) {
      console.log('   ⚠️ Already signed out or error:', e);
    }
    
    console.log('');
    console.log('✅ TENANT FIX COMPLETE!');
    console.log('=====================');
    console.log('');
    console.log('🔄 NEXT STEPS (CRITICAL):');
    console.log('1. Close ALL browser tabs for this application');
    console.log('2. Close the ENTIRE browser (not just tabs)');
    console.log('3. Open browser in INCOGNITO/PRIVATE mode');
    console.log('4. Go to login page');
    console.log('5. Login with: noam@stayhomely.de');
    console.log('');
    console.log('❌ DO NOT use regular browser mode');
    console.log('❌ DO NOT login with automation@theflex.global');
    console.log('✅ ONLY use incognito mode');
    console.log('✅ ONLY login with noam@stayhomely.de');
    console.log('');
    console.log('After login, you should see:');
    console.log('• Homely logo (not Flex logo)');
    console.log('• Berlin city access');
    console.log('• Homely tenant ID: 5a382f72-aec3-40f1-9063-89476ae00669');
    
    // Auto-redirect with instructions
    console.log('');
    console.log('🔄 Auto-redirecting to login in 5 seconds...');
    console.log('⚠️  REMEMBER: Use incognito mode!');
    
    setTimeout(() => {
      window.location.href = '/login?tenant_fix=' + Date.now();
    }, 5000);
    
    return true;
  } catch (error) {
    console.error('🚨 Tenant fix failed:', error);
    // Force redirect anyway
    window.location.href = '/login?emergency_fix=' + Date.now();
    return false;
  }
};

// Make functions available globally for console access
if (typeof window !== 'undefined') {
  (window as any).forceClearAllCache = forceClearAllCache;
  (window as any).clearCacheOnly = clearCacheOnly;
  (window as any).emergencyAuthCleanup = emergencyAuthCleanup;
  (window as any).emergencyTenantFix = emergencyTenantFix;
  (window as any).fixTenantIssue = fixTenantIssue;
  (window as any).comprehensiveTenantFix = comprehensiveTenantFix;
  (window as any).getManualFixInstructions = getManualFixInstructions;
  
  console.log(`
🔧 Cache Management Commands Available:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• forceClearAllCache()     - Clear all cache and logout
• clearCacheOnly()         - Clear cache but stay logged in  
• emergencyAuthCleanup()   - Fix JWT token conflicts (automation user)
• emergencyTenantFix()     - 🚨 Fix 403 errors & wrong branding (BASIC)
• comprehensiveTenantFix() - 🚨 ADVANCED: Comprehensive tenant conflict detection & fix

🚨 IMMEDIATE FIXES:
• emergencyTenantFix()     - Quick fix for 403 Forbidden & Homely branding issues  
• comprehensiveTenantFix() - 🆕 COMPREHENSIVE: Detects all tenant conflicts & provides detailed fix
• fixTenantIssue()         - Nuclear fix for wrong tenant/logo display

💡 NEW: For comprehensive tenant analysis, try: comprehensiveTenantFix()
💡 For quick 403 fixes, try: emergencyTenantFix()
  `);
}