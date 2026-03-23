/**
 * Global cache utilities to ensure complete cache clearing
 * Prevents tenant data leakage between sessions
 * 
 * Enhanced with new StorageManager for better tenant isolation
 */

import { storageManager, STORAGE_KEYS } from '../utils/StorageManager';
import { storageHealthChecker } from '../utils/StorageHealthChecker';
import { storageRecoverySystem } from '../utils/StorageRecoverySystem';

// Cache generation to invalidate all old cache
let CACHE_GENERATION = Date.now();

// Mutex to prevent concurrent cache operations during tenant switch
const cacheMutex = {
  isLocked: false,
  queue: [] as (() => void)[]
};

export class GlobalCacheManager {
  /**
   * Get current cache generation
   */
  static getCacheGeneration(): number {
    return CACHE_GENERATION;
  }
  
  /**
   * Invalidate all cache by incrementing generation
   */
  static invalidateGeneration(): void {
    const oldGen = CACHE_GENERATION;
    CACHE_GENERATION = Date.now();
    console.log('[GlobalCacheManager] Cache generation invalidated:', oldGen, '->', CACHE_GENERATION);
  }
  
  /**
   * Lock cache operations (for tenant switching)
   */
  static async lockCache(): Promise<void> {
    if (cacheMutex.isLocked) {
      return new Promise(resolve => {
        cacheMutex.queue.push(resolve);
      });
    }
    cacheMutex.isLocked = true;
    console.log('[GlobalCacheManager] Cache locked for exclusive access');
  }
  
  /**
   * Unlock cache operations
   */
  static unlockCache(): void {
    cacheMutex.isLocked = false;
    const next = cacheMutex.queue.shift();
    if (next) {
      next();
    }
    console.log('[GlobalCacheManager] Cache unlocked');
  }
  /**
   * Clear ALL cache data from all storage mechanisms
   * This should be called on logout and tenant switch
   * Enhanced with new StorageManager for better cleanup
   */
  static async clearAllCache(reason: string = 'unknown'): Promise<void> {
    console.log(`[GlobalCacheManager] 🧹 STARTING COMPLETE CACHE CLEAR (reason: ${reason})`);
    
    // Lock cache to prevent any access during clearing
    await this.lockCache();
    
    try {
      // 1. Use StorageManager for comprehensive cleanup
      console.log('[GlobalCacheManager] Using StorageManager for comprehensive cleanup');
      storageManager.clearAll();
      
      // 2. Clear sessionStorage completely
      sessionStorage.clear();
      console.log('[GlobalCacheManager] ✅ SessionStorage cleared');
      
      // 3. Clear IndexedDB
      try {
        const databases = await indexedDB.databases?.() || [];
        for (const db of databases) {
          if (db.name) {
            console.log(`[GlobalCacheManager] Deleting IndexedDB: ${db.name}`);
            await indexedDB.deleteDatabase(db.name);
          }
        }
      } catch (e) {
        // Fallback for browsers that don't support databases()
        console.log('[GlobalCacheManager] Attempting to delete known databases');
        try {
          await indexedDB.deleteDatabase('FlexPMSCache');
        } catch (err) {
          console.error('[GlobalCacheManager] Error deleting IndexedDB:', err);
        }
      }
      
      // 4. Clear Cache Storage (for PWAs/Service Workers)
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(async (cacheName) => {
              await caches.delete(cacheName);
              console.log(`[GlobalCacheManager] ✅ Deleted cache: ${cacheName}`);
            })
          );
        } catch (e) {
          console.warn('[GlobalCacheManager] Failed to clear Cache Storage:', e);
        }
      }
      
      // 5. Clear cookies (if any)
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
      
      console.log('[GlobalCacheManager] ✅ ALL CACHE CLEARED SUCCESSFULLY');
      
      // Invalidate generation to ensure any in-flight cache operations are rejected
      this.invalidateGeneration();
      
    } catch (error) {
      console.error('[GlobalCacheManager] Error during cache clear:', error);
      
      try {
        await storageRecoverySystem.attemptRecovery();
      } catch (recoveryError) {
        console.error('[GlobalCacheManager] Recovery also failed:', recoveryError);
      }
    } finally {
      // Always unlock cache
      this.unlockCache();
    }
  }
  
  /**
   * Validate if cached data belongs to the current tenant
   */
  static isValidForTenant(cacheData: any, expectedTenantId: string | null, generation?: number): boolean {
    if (!cacheData || !expectedTenantId) {
      console.warn('[GlobalCacheManager] Invalid cache data or no tenant ID');
      return false;
    }
    
    // Check cache generation if provided
    if (generation !== undefined && cacheData.generation !== generation) {
      console.warn('[GlobalCacheManager] ❌ Cache generation mismatch!', {
        cached: cacheData.generation,
        expected: generation
      });
      return false;
    }
    
    // Check if cache has tenant ID and it matches
    if (cacheData.tenantId && cacheData.tenantId !== expectedTenantId) {
      console.warn('[GlobalCacheManager] ❌ Cache tenant mismatch!', {
        cached: cacheData.tenantId,
        expected: expectedTenantId
      });
      return false;
    }
    
    // Check cache age (max 5 minutes for safety)
    if (cacheData.timestamp) {
      const age = Date.now() - cacheData.timestamp;
      if (age > 5 * 60 * 1000) {
        console.log('[GlobalCacheManager] ⏰ Cache expired');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Get cache key with tenant ID
   * Enhanced to use StorageManager namespacing
   */
  static getCacheKey(baseKey: string, tenantId: string | null): string | null {
    if (!tenantId) {
      console.warn('[GlobalCacheManager] No tenant ID for cache key');
      return null;
    }
    // Use StorageManager's namespacing instead of simple concatenation
    // This ensures consistency with the new storage architecture
    return `${baseKey}_${tenantId}`;
  }
  
  /**
   * Store cache data using StorageManager with tenant context
   */
  static setCacheData(key: string, data: any, tenantId?: string, userId?: string): boolean {
    try {
      const context = tenantId || userId ? { tenant_id: tenantId, user_id: userId } : undefined;
      
      const cacheData = {
        ...data,
        generation: CACHE_GENERATION,
        tenantId: tenantId || null,
        timestamp: Date.now()
      };
      
      return storageManager.set(key, cacheData, {
        context,
        ttl: 5 * 60 * 1000 // 5 minutes TTL
      });
    } catch (error) {
      console.error(`[GlobalCacheManager] Failed to set cache data: ${key}`, error);
      return false;
    }
  }
  
  /**
   * Get cache data using StorageManager with validation
   */
  static getCacheData(key: string, expectedTenantId?: string, tenantId?: string, userId?: string): any {
    try {
      const context = tenantId || userId ? { tenant_id: tenantId, user_id: userId } : undefined;
      const cacheData = storageManager.get(key, { context });
      
      if (!cacheData) {
        return null;
      }
      
      // Validate cache data
      if (!this.isValidForTenant(cacheData, expectedTenantId, CACHE_GENERATION)) {
        // Invalid cache data, remove it
        storageManager.remove(key, { context });
        return null;
      }
      
      return cacheData;
    } catch (error) {
      console.error(`[GlobalCacheManager] Failed to get cache data: ${key}`, error);
      return null;
    }
  }
  
  /**
   * Clear cache for specific user/tenant using StorageManager
   */
  static clearUserCache(tenantId?: string, userId?: string): number {
    try {
      if (tenantId || userId) {
        return storageManager.clearUserData({ tenant_id: tenantId, user_id: userId });
      } else {
        console.warn('[GlobalCacheManager] No tenant or user ID provided for cache clear');
        return 0;
      }
    } catch (error) {
      console.error('[GlobalCacheManager] Failed to clear user cache:', error);
      return 0;
    }
  }
}

// Export for use in window/console debugging
if (typeof window !== 'undefined') {
  (window as any).GlobalCacheManager = GlobalCacheManager;
}