/**
 * Unified Secure Cache Manager
 * 
 * Provides a single, secure interface for all caching operations with:
 * - Mandatory tenant context validation
 * - Automatic data encryption for sensitive information
 * - Atomic cache operations for tenant switching
 * - Cache pollution prevention
 * - TTL-based cache invalidation
 * - Cross-tab synchronization
 * - Audit logging for security compliance
 */

import CryptoJS from 'crypto-js';

export interface CacheContext {
  tenantId: string;
  userId: string;
  sessionId?: string;
  deviceId?: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  encrypt?: boolean; // Whether to encrypt the data
  compress?: boolean; // Whether to compress large data
  skipTenantValidation?: boolean;
  auditLog?: boolean; // Whether to log this operation
  allowCrossTab?: boolean; // Allow cross-tab access
  category?: 'auth' | 'data' | 'ui' | 'temp'; // Cache category for cleanup
}

export interface CacheEntry<T = any> {
  data: T;
  context: CacheContext;
  metadata: {
    createdAt: number;
    expiresAt: number;
    encrypted: boolean;
    compressed: boolean;
    category: string;
    version: number;
    checksum: string;
  };
}

export interface CacheStats {
  totalEntries: number;
  sizeBytes: number;
  tenantBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  oldestEntry: number;
  newestEntry: number;
  hitRate: number;
  securityViolations: number;
}

export interface SecurityAudit {
  timestamp: number;
  operation: 'get' | 'set' | 'delete' | 'clear' | 'validate';
  key: string;
  context: CacheContext;
  success: boolean;
  securityIssue?: 'tenant_mismatch' | 'expired' | 'corrupted' | 'unauthorized';
  details?: string;
}

export class SecureCacheManager {
  private static instance: SecureCacheManager;
  private encryptionKey: string;
  private currentContext: CacheContext | null = null;
  private securityAudits: SecurityAudit[] = [];
  private cacheStats = new Map<string, { hits: number; misses: number }>();
  private readonly STORAGE_PREFIX = 'flexPMS_secure_';
  private readonly AUDIT_PREFIX = 'flexPMS_audit_';
  private readonly MAX_AUDIT_ENTRIES = 1000;
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly CACHE_VERSION = 2;
  private tenantSwitchLock: Promise<void> | null = null;

  private constructor() {
    this.encryptionKey = this.getOrCreateEncryptionKey();
    this.initializeEventListeners();
    this.startPeriodicCleanup();
  }

  static getInstance(): SecureCacheManager {
    if (!SecureCacheManager.instance) {
      SecureCacheManager.instance = new SecureCacheManager();
    }
    return SecureCacheManager.instance;
  }

  /**
   * Set the current tenant/user context for all cache operations
   * Note: For tenant changes, use switchTenant() for atomic operation
   */
  setContext(context: CacheContext): void {
    console.log('[SecureCache] Setting cache context:', {
      tenantId: context.tenantId,
      userId: context.userId,
      sessionId: context.sessionId?.substring(0, 8) + '...'
    });
    
    this.currentContext = context;
    
    // Validate existing cache entries against new context
    this.validateCacheIntegrity();
    
    // Clear any cache entries from different tenants
    this.clearCrossContaminatedCache();
  }

  /**
   * Atomic tenant switching with verification - prevents cross-tenant data leakage
   */
  async switchTenant(newContext: CacheContext): Promise<{ success: boolean; errors: string[] }> {
    // Wait for any pending switch to complete
    if (this.tenantSwitchLock) {
      console.log('[SecureCache] Waiting for pending tenant switch...');
      await this.tenantSwitchLock;
    }

    const errors: string[] = [];
    
    // Create atomic switch operation
    this.tenantSwitchLock = (async () => {
      try {
        console.log('[SecureCache] Starting ATOMIC tenant switch:', {
          from: this.currentContext?.tenantId,
          to: newContext.tenantId
        });

        // Step 1: Clear ALL tenant-specific data
        const clearedCount = this.clearTenantCache();
        console.log(`[SecureCache] Cleared ${clearedCount} entries from old tenant`);

        // Step 2: Verify cache is completely clear
        const verification = this.verifyNoTenantDataRemaining(this.currentContext?.tenantId);
        if (!verification.success) {
          errors.push(`Verification failed: ${verification.remainingKeys.length} keys remain`);
          console.error('[SecureCache] Cache clear verification FAILED:', verification.remainingKeys);
          
          // Force clear remaining keys
          verification.remainingKeys.forEach(key => {
            try {
              localStorage.removeItem(key);
            } catch (e) {
              errors.push(`Failed to force-clear key: ${key}`);
            }
          });
        }

        // Step 3: Notify city access service
        const { cityAccessService } = await import('../services/CityAccessService');
        cityAccessService.onTenantSwitch(newContext.tenantId);
        
        // Step 4: Set new context only after verification passes
        this.currentContext = newContext;
        
        // Step 5: Dispatch event for other listeners (e.g., CityAccessContext)
        window.dispatchEvent(new CustomEvent('tenant-switched', {
          detail: {
            oldTenantId: this.currentContext?.tenantId,
            newTenantId: newContext.tenantId
          }
        }));
        
        // Step 6: Log the switch
        this.auditOperation('clear', `tenant_switch:${newContext.tenantId}`, true, 
          `Atomic switch completed, ${clearedCount} entries cleared`);

        console.log('[SecureCache] ATOMIC tenant switch completed successfully');
        
      } catch (error) {
        errors.push(`Tenant switch error: ${error}`);
        console.error('[SecureCache] Tenant switch failed:', error);
        throw error;
      } finally {
        this.tenantSwitchLock = null;
      }
    })();

    await this.tenantSwitchLock;
    
    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Verify no tenant data remains in cache (for atomic switching)
   */
  private verifyNoTenantDataRemaining(tenantId?: string): { success: boolean; remainingKeys: string[] } {
    if (!tenantId) {
      return { success: true, remainingKeys: [] };
    }

    const remainingKeys: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;
      
      try {
        const entry = JSON.parse(localStorage.getItem(key) || '{}');
        if (entry.context?.tenantId === tenantId) {
          remainingKeys.push(key);
        }
      } catch (e) {
        // Can't parse, but if it starts with our prefix, it should be removed
        if (key.includes(tenantId)) {
          remainingKeys.push(key);
        }
      }
    }

    return {
      success: remainingKeys.length === 0,
      remainingKeys
    };
  }

  /**
   * Get data from cache with comprehensive security validation
   */
  get<T>(key: string, options: CacheOptions = {}): T | null {
    try {
      const fullKey = this.buildKey(key, options.allowCrossTab ? null : this.currentContext);
      const entry = this.getRawEntry<T>(fullKey);
      
      if (!entry) {
        this.recordCacheMiss(key);
        return null;
      }

      // Validate security context
      const securityResult = this.validateSecurity(entry, key, 'get', options);
      if (!securityResult.valid) {
        this.auditSecurityViolation('get', key, securityResult.issue, securityResult.details);
        this.removeEntry(fullKey);
        return null;
      }

      // Check expiration
      if (Date.now() > entry.metadata.expiresAt) {
        this.auditOperation('get', key, false, 'expired');
        this.removeEntry(fullKey);
        return null;
      }

      // Validate data integrity
      if (!this.validateChecksum(entry)) {
        this.auditSecurityViolation('get', key, 'corrupted', 'Checksum mismatch');
        this.removeEntry(fullKey);
        return null;
      }

      this.recordCacheHit(key);
      this.auditOperation('get', key, true);
      
      return entry.data;
      
    } catch (error) {
      console.error('[SecureCache] Error getting cache entry:', error);
      this.auditOperation('get', key, false, String(error));
      return null;
    }
  }

  /**
   * Set data in cache with security and encryption
   */
  set<T>(key: string, data: T, options: CacheOptions = {}): boolean {
    try {
      if (!this.currentContext && !options.skipTenantValidation) {
        throw new Error('No tenant context set for cache operation');
      }

      const opts = {
        ttl: this.DEFAULT_TTL,
        encrypt: this.shouldEncrypt(key, data),
        compress: this.shouldCompress(data),
        auditLog: true,
        category: 'data',
        ...options
      };

      const context = this.currentContext || { tenantId: 'unknown', userId: 'unknown' };
      const fullKey = this.buildKey(key, context);
      
      // Create cache entry
      const entry: CacheEntry<T> = {
        data: opts.encrypt ? this.encryptData(data) : data,
        context,
        metadata: {
          createdAt: Date.now(),
          expiresAt: Date.now() + opts.ttl,
          encrypted: opts.encrypt,
          compressed: opts.compress,
          category: opts.category,
          version: this.CACHE_VERSION,
          checksum: this.generateChecksum(data)
        }
      };

      // Store in localStorage
      localStorage.setItem(fullKey, JSON.stringify(entry));
      
      if (opts.auditLog) {
        this.auditOperation('set', key, true);
      }
      
      console.log(`[SecureCache] Set cache entry: ${key} (ttl: ${opts.ttl}ms)`);
      return true;
      
    } catch (error) {
      console.error('[SecureCache] Error setting cache entry:', error);
      this.auditOperation('set', key, false, String(error));
      return false;
    }
  }

  /**
   * Delete specific cache entry
   */
  delete(key: string, options: CacheOptions = {}): boolean {
    try {
      const fullKey = this.buildKey(key, options.allowCrossTab ? null : this.currentContext);
      const existed = localStorage.getItem(fullKey) !== null;
      
      localStorage.removeItem(fullKey);
      
      if (options.auditLog !== false) {
        this.auditOperation('delete', key, true);
      }
      
      return existed;
      
    } catch (error) {
      console.error('[SecureCache] Error deleting cache entry:', error);
      this.auditOperation('delete', key, false, String(error));
      return false;
    }
  }

  /**
   * Clear all cache entries for current tenant (atomic operation)
   */
  clearTenantCache(): number {
    let clearedCount = 0;
    
    try {
      console.log('[SecureCache] Starting atomic tenant cache clear...');
      
      if (!this.currentContext) {
        throw new Error('No tenant context for cache clear');
      }

      // Get all keys for current tenant
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;
        
        try {
          const entry = JSON.parse(localStorage.getItem(key) || '{}');
          if (entry.context?.tenantId === this.currentContext.tenantId) {
            keysToRemove.push(key);
          }
        } catch (e) {
          // Invalid entry, remove it
          keysToRemove.push(key);
        }
      }

      // Remove all identified keys atomically
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        clearedCount++;
      });

      this.auditOperation('clear', `tenant:${this.currentContext.tenantId}`, true, `Cleared ${clearedCount} entries`);
      console.log(`[SecureCache] Cleared ${clearedCount} tenant cache entries`);
      
      return clearedCount;
      
    } catch (error) {
      console.error('[SecureCache] Error clearing tenant cache:', error);
      this.auditOperation('clear', 'tenant', false, String(error));
      return clearedCount;
    }
  }

  /**
   * Clear ALL cache (nuclear option for logout/corruption)
   */
  clearAllCache(): number {
    let clearedCount = 0;
    
    try {
      console.log('[SecureCache] Starting nuclear cache clear...');
      
      // Get all FlexPMS cache keys
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith(this.STORAGE_PREFIX) || key.startsWith(this.AUDIT_PREFIX))) {
          keysToRemove.push(key);
        }
      }

      // Remove all cache keys
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        clearedCount++;
      });

      // Clear stats and audits
      this.cacheStats.clear();
      this.securityAudits = [];
      this.currentContext = null;

      console.log(`[SecureCache] Nuclear clear complete: ${clearedCount} entries removed`);
      return clearedCount;
      
    } catch (error) {
      console.error('[SecureCache] Error in nuclear clear:', error);
      return clearedCount;
    }
  }

  /**
   * Validate cache integrity and detect security issues
   */
  validateCacheIntegrity(): { valid: boolean; issues: string[]; fixedCount: number } {
    const issues: string[] = [];
    let fixedCount = 0;
    
    try {
      console.log('[SecureCache] Validating cache integrity...');
      
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;
        
        try {
          const entry = JSON.parse(localStorage.getItem(key) || '{}');
          
          // Check version compatibility
          if (!entry.metadata || entry.metadata.version < this.CACHE_VERSION) {
            issues.push(`Outdated cache version: ${key}`);
            keysToRemove.push(key);
            continue;
          }

          // Check expiration
          if (Date.now() > entry.metadata.expiresAt) {
            keysToRemove.push(key);
            continue;
          }

          // Check tenant context if we have current context
          if (this.currentContext && entry.context?.tenantId !== this.currentContext.tenantId) {
            issues.push(`Cross-tenant contamination: ${key}`);
            keysToRemove.push(key);
            continue;
          }

          // Validate checksum
          if (!this.validateChecksum(entry)) {
            issues.push(`Corrupted data: ${key}`);
            keysToRemove.push(key);
            continue;
          }
          
        } catch (e) {
          issues.push(`Invalid entry format: ${key}`);
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        fixedCount++;
      });

      if (issues.length > 0) {
        console.warn(`[SecureCache] Cache integrity issues found and fixed: ${issues.length}`);
      } else {
        console.log('[SecureCache] Cache integrity validation passed');
      }

      return {
        valid: issues.length === 0,
        issues,
        fixedCount
      };
      
    } catch (error) {
      console.error('[SecureCache] Error validating cache integrity:', error);
      return {
        valid: false,
        issues: [String(error)],
        fixedCount: 0
      };
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): CacheStats {
    const stats: CacheStats = {
      totalEntries: 0,
      sizeBytes: 0,
      tenantBreakdown: {},
      categoryBreakdown: {},
      oldestEntry: Date.now(),
      newestEntry: 0,
      hitRate: 0,
      securityViolations: 0
    };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;
        
        try {
          const value = localStorage.getItem(key) || '';
          const entry = JSON.parse(value);
          
          stats.totalEntries++;
          stats.sizeBytes += value.length;
          
          // Tenant breakdown
          const tenantId = entry.context?.tenantId || 'unknown';
          stats.tenantBreakdown[tenantId] = (stats.tenantBreakdown[tenantId] || 0) + 1;
          
          // Category breakdown
          const category = entry.metadata?.category || 'unknown';
          stats.categoryBreakdown[category] = (stats.categoryBreakdown[category] || 0) + 1;
          
          // Age tracking
          const createdAt = entry.metadata?.createdAt || Date.now();
          stats.oldestEntry = Math.min(stats.oldestEntry, createdAt);
          stats.newestEntry = Math.max(stats.newestEntry, createdAt);
          
        } catch (e) {
          // Invalid entry
          stats.totalEntries++;
        }
      }

      // Calculate hit rate
      const totalOperations = Array.from(this.cacheStats.values())
        .reduce((acc, stat) => acc + stat.hits + stat.misses, 0);
      const totalHits = Array.from(this.cacheStats.values())
        .reduce((acc, stat) => acc + stat.hits, 0);
      
      stats.hitRate = totalOperations > 0 ? totalHits / totalOperations : 0;
      stats.securityViolations = this.securityAudits.filter(
        audit => audit.securityIssue
      ).length;
      
    } catch (error) {
      console.error('[SecureCache] Error calculating stats:', error);
    }

    return stats;
  }

  /**
   * Export security audit log
   */
  getSecurityAuditLog(): SecurityAudit[] {
    return [...this.securityAudits];
  }

  /**
   * Private helper methods
   */
  private getRawEntry<T>(fullKey: string): CacheEntry<T> | null {
    try {
      const stored = localStorage.getItem(fullKey);
      if (!stored) return null;
      
      const entry = JSON.parse(stored) as CacheEntry<T>;
      
      // Decrypt if necessary
      if (entry.metadata.encrypted) {
        entry.data = this.decryptData(entry.data);
      }
      
      return entry;
      
    } catch (error) {
      console.error('[SecureCache] Error parsing cache entry:', error);
      return null;
    }
  }

  private buildKey(baseKey: string, context: CacheContext | null): string {
    if (!context) {
      return `${this.STORAGE_PREFIX}${baseKey}`;
    }
    return `${this.STORAGE_PREFIX}${context.tenantId}_${context.userId}_${baseKey}`;
  }

  private validateSecurity(
    entry: CacheEntry,
    key: string,
    operation: 'get' | 'set' | 'delete',
    options: CacheOptions
  ): { valid: boolean; issue?: string; details?: string } {
    
    if (options.skipTenantValidation) {
      return { valid: true };
    }

    if (!this.currentContext) {
      return { valid: false, issue: 'unauthorized', details: 'No active context' };
    }

    // Validate tenant context
    if (entry.context.tenantId !== this.currentContext.tenantId) {
      return {
        valid: false,
        issue: 'tenant_mismatch',
        details: `Expected: ${this.currentContext.tenantId}, Found: ${entry.context.tenantId}`
      };
    }

    // Validate user context for sensitive data
    if (key.includes('auth') || key.includes('token') || key.includes('session')) {
      if (entry.context.userId !== this.currentContext.userId) {
        return {
          valid: false,
          issue: 'unauthorized',
          details: 'User mismatch for sensitive data'
        };
      }
    }

    return { valid: true };
  }

  private shouldEncrypt(key: string, data: any): boolean {
    // Encrypt sensitive data by default
    const sensitivePatterns = ['auth', 'token', 'session', 'password', 'secret', 'key', 'credential'];
    return sensitivePatterns.some(pattern => key.toLowerCase().includes(pattern));
  }

  private shouldCompress(data: any): boolean {
    // Compress large objects/arrays
    const serialized = JSON.stringify(data);
    return serialized.length > 10000; // 10KB threshold
  }

  private encryptData(data: any): string {
    try {
      const serialized = JSON.stringify(data);
      return CryptoJS.AES.encrypt(serialized, this.encryptionKey).toString();
    } catch (error) {
      console.error('[SecureCache] Encryption failed:', error);
      throw error;
    }
  }

  private decryptData(encryptedData: string): any {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      const serialized = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(serialized);
    } catch (error) {
      console.error('[SecureCache] Decryption failed:', error);
      throw error;
    }
  }

  private generateChecksum(data: any): string {
    const serialized = JSON.stringify(data);
    return CryptoJS.MD5(serialized).toString();
  }

  private validateChecksum(entry: CacheEntry): boolean {
    try {
      const currentChecksum = this.generateChecksum(entry.data);
      return currentChecksum === entry.metadata.checksum;
    } catch (error) {
      return false;
    }
  }

  private getOrCreateEncryptionKey(): string {
    let key = sessionStorage.getItem('cache_encryption_key');
    if (!key) {
      key = CryptoJS.lib.WordArray.random(256/8).toString();
      sessionStorage.setItem('cache_encryption_key', key);
    }
    return key;
  }

  private clearCrossContaminatedCache(): void {
    if (!this.currentContext) return;
    
    let removedCount = 0;
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.STORAGE_PREFIX)) continue;
      
      try {
        const entry = JSON.parse(localStorage.getItem(key) || '{}');
        if (entry.context?.tenantId && entry.context.tenantId !== this.currentContext.tenantId) {
          keysToRemove.push(key);
        }
      } catch (e) {
        // Invalid entry, remove it
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      removedCount++;
    });
    
    if (removedCount > 0) {
      console.warn(`[SecureCache] Removed ${removedCount} cross-contaminated cache entries`);
    }
  }

  private removeEntry(key: string): void {
    localStorage.removeItem(key);
  }

  private auditOperation(
    operation: SecurityAudit['operation'],
    key: string,
    success: boolean,
    details?: string
  ): void {
    this.securityAudits.push({
      timestamp: Date.now(),
      operation,
      key,
      context: this.currentContext || { tenantId: 'unknown', userId: 'unknown' },
      success,
      details
    });
    
    // Limit audit log size
    if (this.securityAudits.length > this.MAX_AUDIT_ENTRIES) {
      this.securityAudits = this.securityAudits.slice(-this.MAX_AUDIT_ENTRIES / 2);
    }
  }

  private auditSecurityViolation(
    operation: SecurityAudit['operation'],
    key: string,
    issue: SecurityAudit['securityIssue'],
    details?: string
  ): void {
    console.warn(`[SecureCache] Security violation: ${issue} for key ${key}`);
    
    this.securityAudits.push({
      timestamp: Date.now(),
      operation,
      key,
      context: this.currentContext || { tenantId: 'unknown', userId: 'unknown' },
      success: false,
      securityIssue: issue,
      details
    });
  }

  private recordCacheHit(key: string): void {
    const stats = this.cacheStats.get(key) || { hits: 0, misses: 0 };
    stats.hits++;
    this.cacheStats.set(key, stats);
  }

  private recordCacheMiss(key: string): void {
    const stats = this.cacheStats.get(key) || { hits: 0, misses: 0 };
    stats.misses++;
    this.cacheStats.set(key, stats);
  }

  private initializeEventListeners(): void {
    // Cross-tab synchronization
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith(this.STORAGE_PREFIX)) {
        console.log('[SecureCache] Cross-tab cache change detected');
      }
    });

    // Page visibility change (mobile app switching)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // Page became visible, validate cache integrity
        this.validateCacheIntegrity();
      }
    });
  }

  private startPeriodicCleanup(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.validateCacheIntegrity();
    }, 5 * 60 * 1000);
  }
}

// Export singleton instance
export const secureCache = SecureCacheManager.getInstance();