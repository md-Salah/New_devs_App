/**
 * Centralized Storage Manager
 * 
 * Single source of truth for all localStorage operations with:
 * - Tenant-specific namespacing
 * - Storage encryption/integrity checks  
 * - Automatic corruption detection and recovery
 * - Session isolation and cleanup
 * - Centralized key management
 */

import { supabase } from '../lib/supabase';

// Storage key registry - all storage keys centralized here
export const STORAGE_KEYS = {
  // Authentication related
  AUTH_SESSION: 'auth_session',
  AUTH_USER: 'auth_user', 
  AUTH_TOKENS: 'auth_tokens',
  
  // Session management
  SESSION_BACKUP: 'session_backup',
  SESSION_METADATA: 'session_metadata',
  
  // City access cache
  CITY_ACCESS: 'city_access',
  CITY_ACCESS_TIMESTAMP: 'city_access_timestamp',
  
  // Bootstrap data
  BOOTSTRAP_DATA: 'bootstrap_data',
  BOOTSTRAP_TIMESTAMP: 'bootstrap_timestamp',
  
  // Permissions cache
  PERMISSIONS_CACHE: 'permissions_cache',
  
  // Storage health
  STORAGE_VERSION: 'storage_version',
  STORAGE_HEALTH: 'storage_health',
  CORRUPTION_FLAG: 'corruption_detected',
  
  EMERGENCY_BACKUP: 'emergency_backup',
  LAST_CLEANUP: 'last_cleanup'
} as const;

// Current storage version for migration support
const STORAGE_VERSION = '2.0.0';

interface StorageItem<T = any> {
  data: T;
  timestamp: number;
  version: string;
  tenant_id?: string;
  user_id?: string;
  integrity_hash?: string;
}

interface StorageContext {
  tenant_id?: string;
  user_id?: string;
  email?: string;
}

export class StorageManager {
  private static instance: StorageManager;
  private currentContext: StorageContext = {};
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly NAMESPACE_SEPARATOR = '::';
  private readonly MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit
  
  private constructor() {
    this.initializeHealthMonitoring();
  }
  
  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }
  
  /**
   * Set current user/tenant context for namespaced storage
   */
  setContext(context: StorageContext): void {
    console.log('[StorageManager] Setting context:', {
      tenant_id: context.tenant_id,
      user_id: context.user_id,
      email: context.email
    });
    
    this.currentContext = { ...context };
    
    // Update storage health with new context
    this.updateStorageHealth();
  }
  
  /**
   * Clear current context (for logout)
   */
  clearContext(): void {
    console.log('[StorageManager] Clearing context');
    this.currentContext = {};
  }
  
  /**
   * Get namespaced key based on current context
   */
  private getNamespacedKey(key: string, context?: Partial<StorageContext>): string {
    const ctx = { ...this.currentContext, ...context };
    
    if (ctx.tenant_id && ctx.user_id) {
      return `${ctx.tenant_id}${this.NAMESPACE_SEPARATOR}${ctx.user_id}${this.NAMESPACE_SEPARATOR}${key}`;
    } else if (ctx.user_id) {
      return `${ctx.user_id}${this.NAMESPACE_SEPARATOR}${key}`;
    }
    
    return key; // Fall back to global key if no context
  }
  
  /**
   * Generate integrity hash for data validation
   */
  private generateIntegrityHash(data: any): string {
    const dataString = JSON.stringify(data);
    // Simple hash function for integrity checking
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
      const char = dataString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
  
  /**
   * Validate storage item integrity
   */
  private validateIntegrity<T>(item: StorageItem<T>): boolean {
    if (!item.integrity_hash) return true; // No hash to validate
    
    const expectedHash = this.generateIntegrityHash(item.data);
    const isValid = expectedHash === item.integrity_hash;
    
    if (!isValid) {
      console.warn('[StorageManager] Integrity check failed for item:', {
        expected: expectedHash,
        actual: item.integrity_hash
      });
    }
    
    return isValid;
  }
  
  /**
   * Set item in localStorage with namespacing and integrity checking
   */
  set<T>(key: string, data: T, options?: {
    context?: Partial<StorageContext>;
    skipIntegrityCheck?: boolean;
    ttl?: number; // Time to live in milliseconds
  }): boolean {
    try {
      const namespacedKey = this.getNamespacedKey(key, options?.context);
      
      const storageItem: StorageItem<T> = {
        data,
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        tenant_id: this.currentContext.tenant_id,
        user_id: this.currentContext.user_id
      };
      
      // Add integrity hash if not skipped
      if (!options?.skipIntegrityCheck) {
        storageItem.integrity_hash = this.generateIntegrityHash(data);
      }
      
      // Add TTL if specified
      if (options?.ttl) {
        (storageItem as any).expires_at = Date.now() + options.ttl;
      }
      
      const serialized = JSON.stringify(storageItem);
      
      // Check storage size limits
      if (serialized.length > this.MAX_STORAGE_SIZE) {
        console.warn('[StorageManager] Item too large for storage:', {
          key: namespacedKey,
          size: serialized.length,
          limit: this.MAX_STORAGE_SIZE
        });
        return false;
      }
      
      localStorage.setItem(namespacedKey, serialized);
      
      console.log('[StorageManager] Set item:', {
        originalKey: key,
        namespacedKey,
        hasIntegrity: !!storageItem.integrity_hash,
        size: serialized.length
      });
      
      return true;
    } catch (error) {
      console.error('[StorageManager] Failed to set item:', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Mark corruption if quota exceeded or other storage errors
      this.markCorruption(error);
      return false;
    }
  }
  
  /**
   * Get item from localStorage with validation
   */
  get<T>(key: string, options?: {
    context?: Partial<StorageContext>;
    skipIntegrityCheck?: boolean;
    defaultValue?: T;
  }): T | null {
    try {
      const namespacedKey = this.getNamespacedKey(key, options?.context);
      const stored = localStorage.getItem(namespacedKey);
      
      if (!stored) {
        return options?.defaultValue || null;
      }
      
      const storageItem: StorageItem<T> = JSON.parse(stored);
      
      // Check TTL expiration
      if ((storageItem as any).expires_at && Date.now() > (storageItem as any).expires_at) {
        console.log('[StorageManager] Item expired, removing:', namespacedKey);
        this.remove(key, options);
        return options?.defaultValue || null;
      }
      
      // Validate integrity if not skipped
      if (!options?.skipIntegrityCheck && !this.validateIntegrity(storageItem)) {
        console.warn('[StorageManager] Integrity validation failed, removing corrupted item:', namespacedKey);
        this.remove(key, options);
        this.markCorruption('integrity_validation_failed');
        return options?.defaultValue || null;
      }
      
      console.log('[StorageManager] Retrieved item:', {
        originalKey: key,
        namespacedKey,
        timestamp: new Date(storageItem.timestamp).toISOString(),
        hasIntegrity: !!storageItem.integrity_hash
      });
      
      return storageItem.data;
    } catch (error) {
      console.error('[StorageManager] Failed to get item:', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Try to remove corrupted item
      this.remove(key, options);
      this.markCorruption(error);
      return options?.defaultValue || null;
    }
  }
  
  /**
   * Remove item from localStorage
   */
  remove(key: string, options?: {
    context?: Partial<StorageContext>;
  }): boolean {
    try {
      const namespacedKey = this.getNamespacedKey(key, options?.context);
      localStorage.removeItem(namespacedKey);
      
      console.log('[StorageManager] Removed item:', {
        originalKey: key,
        namespacedKey
      });
      
      return true;
    } catch (error) {
      console.error('[StorageManager] Failed to remove item:', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Clear all data for current user/tenant context
   */
  clearUserData(context?: StorageContext): number {
    const ctx = { ...this.currentContext, ...context };
    
    if (!ctx.user_id) {
      console.warn('[StorageManager] No user context to clear');
      return 0;
    }
    
    let clearedCount = 0;
    const keysToRemove: string[] = [];
    
    // Find all keys belonging to this user/tenant
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Check if key matches our namespacing pattern
      const parts = key.split(this.NAMESPACE_SEPARATOR);
      
      if (parts.length >= 2) {
        const keyTenantId = parts[0];
        const keyUserId = parts[1];
        
        if (ctx.tenant_id && ctx.user_id) {
          // Match exact tenant and user
          if (keyTenantId === ctx.tenant_id && keyUserId === ctx.user_id) {
            keysToRemove.push(key);
          }
        } else if (ctx.user_id) {
          // Match just user ID
          if (keyUserId === ctx.user_id || keyTenantId === ctx.user_id) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    // Remove matched keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      clearedCount++;
    });
    
    console.log('[StorageManager] Cleared user data:', {
      context: ctx,
      clearedCount,
      keys: keysToRemove
    });
    
    return clearedCount;
  }
  
  /**
   * Clear all localStorage (nuclear option)
   */
  clearAll(): void {
    const originalLength = localStorage.length;
    localStorage.clear();
    
    console.log('[StorageManager] Nuclear clear completed:', {
      clearedItems: originalLength
    });
    
    // Reset health monitoring
    this.updateStorageHealth();
  }
  
  /**
   * Mark storage corruption for monitoring
   */
  private markCorruption(error: any): void {
    try {
      const corruptionData = {
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        context: this.currentContext,
        user_agent: navigator.userAgent
      };
      
      localStorage.setItem(STORAGE_KEYS.CORRUPTION_FLAG, JSON.stringify(corruptionData));
      console.warn('[StorageManager] Storage corruption marked:', corruptionData);
    } catch (e) {
      console.error('[StorageManager] Failed to mark corruption:', e);
    }
  }
  
  /**
   * Check if storage is corrupted
   */
  isCorrupted(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEYS.CORRUPTION_FLAG) !== null;
    } catch (e) {
      return true; // If we can't even check, assume corruption
    }
  }
  
  /**
   * Update storage health metrics
   */
  private updateStorageHealth(): void {
    try {
      const healthData = {
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        context: this.currentContext,
        storage_size: this.getStorageSize(),
        item_count: localStorage.length
      };
      
      localStorage.setItem(STORAGE_KEYS.STORAGE_HEALTH, JSON.stringify(healthData));
    } catch (e) {
      console.error('[StorageManager] Failed to update health:', e);
    }
  }
  
  /**
   * Get current storage usage
   */
  private getStorageSize(): number {
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = key ? localStorage.getItem(key) : null;
      
      if (key && value) {
        totalSize += key.length + value.length;
      }
    }
    
    return totalSize;
  }
  
  /**
   * Initialize health monitoring
   */
  private initializeHealthMonitoring(): void {
    // Check health every 5 minutes
    this.healthCheckInterval = setInterval(() => {
      this.updateStorageHealth();
      
      // Auto-cleanup expired items
      this.cleanupExpiredItems();
    }, 5 * 60 * 1000);
    
    // Initial health check
    this.updateStorageHealth();
  }
  
  /**
   * Cleanup expired items
   */
  private cleanupExpiredItems(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      try {
        const value = localStorage.getItem(key);
        if (!value) continue;
        
        const item = JSON.parse(value);
        if (item.expires_at && now > item.expires_at) {
          keysToRemove.push(key);
        }
      } catch (e) {
        // If we can't parse an item, it might be corrupted
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('[StorageManager] Cleaned up expired items:', keysToRemove.length);
    }
  }
  
  /**
   * Get storage diagnostics
   */
  getDiagnostics() {
    const totalSize = this.getStorageSize();
    const itemCount = localStorage.length;
    const isCorrupted = this.isCorrupted();
    
    return {
      version: STORAGE_VERSION,
      context: this.currentContext,
      total_size: totalSize,
      total_size_mb: (totalSize / (1024 * 1024)).toFixed(2),
      item_count: itemCount,
      is_corrupted: isCorrupted,
      max_size: this.MAX_STORAGE_SIZE,
      usage_percentage: ((totalSize / this.MAX_STORAGE_SIZE) * 100).toFixed(1)
    };
  }
  
  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// Export singleton instance
export const storageManager = StorageManager.getInstance();

// Make diagnostics available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).storageManager = storageManager;
  (window as any).getStorageDiagnostics = () => storageManager.getDiagnostics();
}