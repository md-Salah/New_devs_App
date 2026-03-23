/**
 * Cache Diagnostics and Management Utilities
 * Helps diagnose and resolve tenant cache issues and SecureAPI caching problems
 */

import { SecureAPI } from '../lib/secureApi';

export interface CacheDiagnostics {
  tenantId: string | null;
  propertiesCount: number;
  cacheAge: number;
  lastFetched: string | null;
  indexedDbSize: number;
  localStorageKeys: string[];
  sessionStorageKeys: string[];
  secureApi?: {
    totalCacheEntries: number;
    cleaningCacheEntries: number;
    suspiciousEntries: number;
    oldestCacheAge: number;
  };
}

export interface CleaningCacheIssue {
  type: 'empty_overdue' | 'stale_cache' | 'suspicious_result' | 'race_condition';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  endpoint?: string;
  data?: any;
  recommendation: string;
}

export interface TenantMismatchReport {
  userEmail: string;
  expectedTenantId: string;
  actualTenantId: string | null;
  propertiesInExpectedTenant: number;
  propertiesInActualTenant: number;
  recommendation: string;
}

/**
 * Clear all cache data to force fresh API calls
 */
export async function clearAllCaches(): Promise<void> {
  console.log('🧹 Clearing all cache data...');
  
  // Clear localStorage
  const localStorageKeys = Object.keys(localStorage);
  const relevantLocalKeys = localStorageKeys.filter(key => 
    key.includes('properties') || 
    key.includes('tenant') || 
    key.includes('cache') ||
    key.includes('auth')
  );
  
  relevantLocalKeys.forEach(key => {
    localStorage.removeItem(key);
    console.log(`   Removed localStorage key: ${key}`);
  });
  
  // Clear sessionStorage  
  const sessionStorageKeys = Object.keys(sessionStorage);
  const relevantSessionKeys = sessionStorageKeys.filter(key => 
    key.includes('properties') || 
    key.includes('tenant') || 
    key.includes('cache') ||
    key.includes('auth')
  );
  
  relevantSessionKeys.forEach(key => {
    sessionStorage.removeItem(key);
    console.log(`   Removed sessionStorage key: ${key}`);
  });
  
  // Clear IndexedDB cache
  try {
    await clearIndexedDBCache();
  } catch (error) {
    console.warn('Failed to clear IndexedDB:', error);
  }
  
  console.log('✅ All caches cleared successfully');
}

/**
 * Clear IndexedDB cache specifically for properties
 */
export async function clearIndexedDBCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const deleteReq = indexedDB.deleteDatabase('PropertiesCache');
    
    deleteReq.onerror = () => {
      console.error('Failed to delete IndexedDB');
      reject(deleteReq.error);
    };
    
    deleteReq.onsuccess = () => {
      console.log('   Cleared IndexedDB PropertiesCache');
      resolve();
    };
    
    deleteReq.onblocked = () => {
      console.warn('IndexedDB deletion blocked - close other tabs');
      resolve();
    };
  });
}

/**
 * Get current cache diagnostics information including SecureAPI cache
 */
export async function getCacheDiagnostics(): Promise<CacheDiagnostics> {
  const localStorageKeys = Object.keys(localStorage);
  const sessionStorageKeys = Object.keys(sessionStorage);
  
  // Try to get tenant info from localStorage
  const tenantId = localStorage.getItem('tenant_id') || 
                   localStorage.getItem('currentTenant') ||
                   null;
  
  // Try to get properties count from cache
  let propertiesCount = 0;
  let cacheAge = 0;
  let lastFetched = null;
  
  try {
    const propertiesCache = localStorage.getItem('properties_cache');
    if (propertiesCache) {
      const parsed = JSON.parse(propertiesCache);
      propertiesCount = parsed.data?.length || 0;
      lastFetched = parsed.timestamp || null;
      cacheAge = lastFetched ? Date.now() - new Date(lastFetched).getTime() : 0;
    }
  } catch (error) {
    console.warn('Could not parse properties cache:', error);
  }
  
  // Get IndexedDB size estimate
  let indexedDbSize = 0;
  try {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      indexedDbSize = estimate.usage || 0;
    }
  } catch (error) {
    console.warn('Could not estimate IndexedDB usage:', error);
  }
  
  // Get SecureAPI cache diagnostics
  let secureApiDiagnostics;
  try {
    const apiDiagnostics = SecureAPI.getCacheDiagnostics();
    secureApiDiagnostics = {
      totalCacheEntries: apiDiagnostics.totalCacheEntries,
      cleaningCacheEntries: apiDiagnostics.cleaningCacheEntries,
      suspiciousEntries: apiDiagnostics.suspiciousEntries.length,
      oldestCacheAge: apiDiagnostics.oldestCacheAge
    };
  } catch (error) {
    console.warn('Could not get SecureAPI diagnostics:', error);
  }
  
  return {
    tenantId,
    propertiesCount,
    cacheAge,
    lastFetched,
    indexedDbSize,
    localStorageKeys: localStorageKeys.filter(key => 
      key.includes('properties') || key.includes('tenant') || key.includes('cache')
    ),
    sessionStorageKeys: sessionStorageKeys.filter(key => 
      key.includes('properties') || key.includes('tenant') || key.includes('cache')
    ),
    secureApi: secureApiDiagnostics
  };
}

/**
 * Force refresh properties cache by invalidating and refetching
 */
export async function forceRefreshPropertiesCache(): Promise<void> {
  console.log('🔄 Forcing properties cache refresh...');
  
  try {
    // Clear properties-specific cache
    const cacheKeys = Object.keys(localStorage).filter(key => 
      key.includes('properties') || key.includes('Properties')
    );
    
    cacheKeys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`   Invalidated cache key: ${key}`);
    });
    
    // Clear IndexedDB properties cache
    await clearIndexedDBCache();
    
    // Make a fresh API call with force_refresh=true
    const response = await fetch('/api/v1/properties/all?force_refresh=true', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Fresh properties fetched: ${data.properties?.length || 0} properties`);
      
      if (data.properties?.length === 0) {
        console.warn('⚠️ Still getting 0 properties after forced refresh - tenant assignment issue likely persists');
      }
    } else {
      console.error('❌ Failed to fetch fresh properties:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('❌ Error during forced cache refresh:', error);
    throw error;
  }
}

/**
 */
export function detectTenantMismatchIssues(): string[] {
  const issues: string[] = [];
  
  // Check if we have 0 properties but successful API responses
  const propertiesData = localStorage.getItem('properties_cache');
  if (propertiesData) {
    try {
      const parsed = JSON.parse(propertiesData);
      if (parsed.data?.length === 0 && parsed.status === 'success') {
        issues.push('Properties cache shows 0 properties despite successful API response');
      }
    } catch (error) {
      issues.push('Properties cache data is corrupted');
    }
  }
  
  // Check for missing tenant information
  const tenantId = localStorage.getItem('tenant_id');
  if (!tenantId) {
    issues.push('No tenant_id found in localStorage');
  }
  
  // Check for authentication token issues
  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) {
    issues.push('No access token found - user may need to re-authenticate');
  }
  
  return issues;
}

/**
 * Detect cleaning cache-specific issues
 */
export function detectCleaningCacheIssues(): CleaningCacheIssue[] {
  const issues: CleaningCacheIssue[] = [];
  
  try {
    const apiDiagnostics = SecureAPI.getCacheDiagnostics();
    
    // Check for suspicious empty overdue results
    if (apiDiagnostics.suspiciousEntries.length > 0) {
      issues.push({
        type: 'empty_overdue',
        severity: 'critical',
        message: `Found ${apiDiagnostics.suspiciousEntries.length} suspicious empty overdue cleaning results`,
        data: apiDiagnostics.suspiciousEntries,
        recommendation: 'Clear cleaning cache using clearCleaningCache() and retry'
      });
    }
    
    // Check for stale cache entries
    if (apiDiagnostics.oldestCacheAge > 30000) { // 30 seconds
      issues.push({
        type: 'stale_cache',
        severity: 'medium',
        message: `Oldest cache entry is ${Math.round(apiDiagnostics.oldestCacheAge / 1000)}s old`,
        data: { age: apiDiagnostics.oldestCacheAge },
        recommendation: 'Clear old cache entries'
      });
    }
    
    // Check for high cache usage
    if (apiDiagnostics.totalCacheEntries > 50) {
      issues.push({
        type: 'suspicious_result',
        severity: 'medium',
        message: `High cache usage: ${apiDiagnostics.totalCacheEntries} entries`,
        data: { count: apiDiagnostics.totalCacheEntries },
        recommendation: 'Monitor for memory issues and consider clearing cache'
      });
    }
    
  } catch (error) {
    issues.push({
      type: 'race_condition',
      severity: 'high',
      message: 'Could not access SecureAPI cache diagnostics',
      data: { error: error instanceof Error ? error.message : String(error) },
      recommendation: 'Reload the page to reset cache state'
    });
  }
  
  return issues;
}

/**
 * Auto-repair common cleaning cache issues
 */
export async function autoRepairCleaningCache(): Promise<{ repaired: boolean; actions: string[] }> {
  const issues = detectCleaningCacheIssues();
  const actions: string[] = [];
  let repaired = false;
  
  const suspiciousIssues = issues.filter(issue => issue.type === 'empty_overdue');
  if (suspiciousIssues.length > 0) {
    try {
      const cleared = SecureAPI.clearEndpointCache('cleaning/reports');
      actions.push(`Cleared ${cleared} suspicious cleaning cache entries`);
      repaired = true;
    } catch (error) {
      actions.push('Failed to clear cleaning cache entries');
    }
  }
  
  // Clear stale cache if very old
  const staleIssues = issues.filter(issue => issue.type === 'stale_cache');
  if (staleIssues.length > 0) {
    const age = staleIssues[0].data?.age || 0;
    if (age > 60000) { // 1 minute
      try {
        SecureAPI.clearCache();
        actions.push('Cleared all stale cache entries');
        repaired = true;
      } catch (error) {
        actions.push('Failed to clear stale cache');
      }
    }
  }
  
  if (!repaired) {
    actions.push('No cleaning cache repairs needed');
  }
  
  console.log('🔧 Cleaning Cache Auto-Repair:', { repaired, actions });
  return { repaired, actions };
}

/**
 * Force clear all cleaning-related cache
 */
export function clearCleaningCache(): { success: boolean; cleared: number } {
  try {
    const cleared = SecureAPI.clearEndpointCache('cleaning/reports');
    console.log(`🧹 Cleared ${cleared} cleaning cache entries`);
    return { success: true, cleared };
  } catch (error) {
    console.error('❌ Failed to clear cleaning cache:', error);
    return { success: false, cleared: 0 };
  }
}

/**
 * Display comprehensive cache diagnostics in console for debugging
 */
export async function logCacheDiagnostics(): Promise<void> {
  console.log('🔍 COMPREHENSIVE CACHE DIAGNOSTICS REPORT');
  console.log('==========================================');
  
  const diagnostics = await getCacheDiagnostics();
  
  console.log(`Tenant ID: ${diagnostics.tenantId || 'NOT FOUND'}`);
  console.log(`Properties Count: ${diagnostics.propertiesCount}`);
  console.log(`Cache Age: ${Math.round(diagnostics.cacheAge / 1000)}s`);
  console.log(`Last Fetched: ${diagnostics.lastFetched || 'NEVER'}`);
  console.log(`IndexedDB Size: ${Math.round(diagnostics.indexedDbSize / 1024)}KB`);
  console.log(`LocalStorage Keys: ${diagnostics.localStorageKeys.length}`);
  console.log(`SessionStorage Keys: ${diagnostics.sessionStorageKeys.length}`);
  
  // SecureAPI cache diagnostics
  if (diagnostics.secureApi) {
    console.log('\n📡 SECUREAPI CACHE:');
    console.log(`Total Entries: ${diagnostics.secureApi.totalCacheEntries}`);
    console.log(`Cleaning Entries: ${diagnostics.secureApi.cleaningCacheEntries}`);
    console.log(`Suspicious Entries: ${diagnostics.secureApi.suspiciousEntries}`);
    console.log(`Oldest Age: ${Math.round(diagnostics.secureApi.oldestCacheAge / 1000)}s`);
  }
  
  const tenantIssues = detectTenantMismatchIssues();
  const cleaningIssues = detectCleaningCacheIssues();
  
  if (tenantIssues.length > 0) {
    console.log('\n⚠️ TENANT ISSUES:');
    tenantIssues.forEach(issue => console.log(`  - ${issue}`));
  }
  
  if (cleaningIssues.length > 0) {
    console.log('\n🧹 CLEANING CACHE ISSUES:');
    cleaningIssues.forEach(issue => {
      console.log(`  - [${issue.severity}] ${issue.message}`);
      console.log(`    💡 ${issue.recommendation}`);
    });
  }
  
  if (tenantIssues.length === 0 && cleaningIssues.length === 0) {
    console.log('\n✅ No cache issues detected');
  } else {
    console.log('\n🔧 REPAIR OPTIONS:');
    console.log('  - autoRepairCleaningCache() - Auto-fix cleaning issues');
    console.log('  - clearCleaningCache() - Clear cleaning cache manually');
    console.log('  - clearAllCaches() - Nuclear option: clear everything');
  }
}

// Export for global access during debugging
if (typeof window !== 'undefined') {
  (window as any).cacheDiagnostics = {
    clearAllCaches,
    forceRefreshPropertiesCache,
    getCacheDiagnostics,
    logCacheDiagnostics,
    detectTenantMismatchIssues,
    detectCleaningCacheIssues,
    autoRepairCleaningCache,
    clearCleaningCache
  };
  
  console.log('🔧 Enhanced cache diagnostics available:');
  console.log('  cacheDiagnostics.logCacheDiagnostics() - Full diagnostics report');
  console.log('  cacheDiagnostics.autoRepairCleaningCache() - Auto-fix cleaning issues');
  console.log('  cacheDiagnostics.clearCleaningCache() - Clear cleaning cache');
}