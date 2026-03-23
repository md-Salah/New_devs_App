/**
 * Tenant-Aware Storage System
 * 
 * Provides automatic tenant isolation and secure storage management with:
 * - Automatic tenant context enforcement
 * - Data isolation between tenants
 * - Secure encryption for sensitive data
 * - Cross-tenant contamination prevention
 * - Audit logging and compliance tracking
 * - Data migration support for tenant changes
 */

import { secureCache, CacheContext, CacheOptions, SecurityAudit } from '../lib/secureCache';

export interface StorageContext extends CacheContext {
  environment?: 'production' | 'staging' | 'development';
  region?: string;
  companyId?: string;
}

export interface IsolationPolicy {
  strictMode: boolean; // Whether to enforce strict tenant isolation
  allowCrossTenantRead: boolean; // Allow reading from other tenants (admin only)
  auditAllOperations: boolean; // Log all storage operations
  encryptSensitiveData: boolean; // Auto-encrypt sensitive data
  validateOnAccess: boolean; // Validate tenant context on each access
}

export interface StorageMetrics {
  totalSize: number;
  tenantSizes: Record<string, number>;
  operationCounts: Record<string, number>;
  violationCounts: Record<string, number>;
  lastCleanup: number;
  dataIntegrityScore: number; // 0-100
}

export interface DataMigrationPlan {
  fromTenant: string;
  toTenant: string;
  keysToMigrate: string[];
  preserveOriginal: boolean;
  encryptionRequired: boolean;
  auditRequired: boolean;
}

export class TenantIsolatedStorage {
  private static instance: TenantIsolatedStorage;
  private currentContext: StorageContext | null = null;
  private isolationPolicy: IsolationPolicy;
  private operationLog: Array<{
    timestamp: number;
    operation: string;
    tenant: string;
    key: string;
    success: boolean;
    details?: string;
  }> = [];

  private readonly SENSITIVE_KEY_PATTERNS = [
    'auth', 'token', 'session', 'password', 'secret', 'api_key',
    'credential', 'cert', 'private', 'oauth', 'jwt', 'refresh'
  ];

  private readonly SYSTEM_KEYS = [
    'device_id', 'installation_id', 'app_version', 'feature_flags'
  ];

  private constructor() {
    this.isolationPolicy = {
      strictMode: true,
      allowCrossTenantRead: false,
      auditAllOperations: true,
      encryptSensitiveData: true,
      validateOnAccess: true
    };
  }

  static getInstance(): TenantIsolatedStorage {
    if (!TenantIsolatedStorage.instance) {
      TenantIsolatedStorage.instance = new TenantIsolatedStorage();
    }
    return TenantIsolatedStorage.instance;
  }

  /**
   * Initialize storage with tenant context
   */
  initialize(context: StorageContext, policy?: Partial<IsolationPolicy>): void {
    console.log('[TenantStorage] Initializing with context:', {
      tenantId: context.tenantId,
      userId: context.userId,
      environment: context.environment || 'unknown'
    });

    // Validate context
    if (!context.tenantId || !context.userId) {
      throw new Error('Tenant ID and User ID are required for secure storage');
    }

    // Update isolation policy
    if (policy) {
      this.isolationPolicy = { ...this.isolationPolicy, ...policy };
    }

    // Check for tenant change and handle data migration
    if (this.currentContext && this.currentContext.tenantId !== context.tenantId) {
      this.handleTenantChange(this.currentContext, context);
    }

    // Set new context
    this.currentContext = context;
    secureCache.setContext(context);

    // Perform security validation
    this.validateStorageSecurity();

    this.logOperation('initialize', context.tenantId, 'context', true, 'Storage initialized');
  }

  /**
   * Store data with automatic tenant isolation
   */
  set<T>(key: string, value: T, options: Partial<CacheOptions> = {}): boolean {
    this.validateContext();
    
    const isSensitive = this.isSensitiveKey(key);
    const isSystem = this.isSystemKey(key);
    
    const cacheOptions: CacheOptions = {
      encrypt: isSensitive && this.isolationPolicy.encryptSensitiveData,
      auditLog: this.isolationPolicy.auditAllOperations,
      category: this.getCategoryForKey(key),
      skipTenantValidation: isSystem,
      ...options
    };

    try {
      const success = secureCache.set(key, value, cacheOptions);
      
      if (success) {
        this.logOperation('set', this.currentContext!.tenantId, key, true);
      } else {
        this.logOperation('set', this.currentContext!.tenantId, key, false, 'Cache write failed');
      }
      
      return success;
      
    } catch (error) {
      this.logOperation('set', this.currentContext!.tenantId, key, false, String(error));
      console.error('[TenantStorage] Set operation failed:', error);
      return false;
    }
  }

  /**
   * Get data with tenant validation
   */
  get<T>(key: string, options: Partial<CacheOptions> = {}): T | null {
    this.validateContext();
    
    const isSystem = this.isSystemKey(key);
    
    const cacheOptions: CacheOptions = {
      auditLog: this.isolationPolicy.auditAllOperations,
      skipTenantValidation: isSystem,
      ...options
    };

    try {
      const value = secureCache.get<T>(key, cacheOptions);
      
      if (value !== null) {
        this.logOperation('get', this.currentContext!.tenantId, key, true);
      } else {
        this.logOperation('get', this.currentContext!.tenantId, key, false, 'Key not found');
      }
      
      return value;
      
    } catch (error) {
      this.logOperation('get', this.currentContext!.tenantId, key, false, String(error));
      console.error('[TenantStorage] Get operation failed:', error);
      return null;
    }
  }

  /**
   * Remove data with tenant validation
   */
  remove(key: string, options: Partial<CacheOptions> = {}): boolean {
    this.validateContext();
    
    const isSystem = this.isSystemKey(key);
    
    const cacheOptions: CacheOptions = {
      auditLog: this.isolationPolicy.auditAllOperations,
      skipTenantValidation: isSystem,
      ...options
    };

    try {
      const success = secureCache.delete(key, cacheOptions);
      this.logOperation('remove', this.currentContext!.tenantId, key, success);
      return success;
      
    } catch (error) {
      this.logOperation('remove', this.currentContext!.tenantId, key, false, String(error));
      console.error('[TenantStorage] Remove operation failed:', error);
      return false;
    }
  }

  /**
   * Clear all data for current tenant
   */
  clearTenant(): number {
    this.validateContext();
    
    try {
      console.log('[TenantStorage] Clearing all data for tenant:', this.currentContext!.tenantId);
      const clearedCount = secureCache.clearTenantCache();
      this.logOperation('clearTenant', this.currentContext!.tenantId, 'all', true, `Cleared ${clearedCount} entries`);
      return clearedCount;
      
    } catch (error) {
      this.logOperation('clearTenant', this.currentContext!.tenantId, 'all', false, String(error));
      console.error('[TenantStorage] Clear tenant failed:', error);
      return 0;
    }
  }

  /**
   */
  emergencyClear(): number {
    console.warn('[TenantStorage] EMERGENCY CLEAR: Removing ALL tenant data');
    
    try {
      const clearedCount = secureCache.clearAllCache();
      this.operationLog = [];
      this.currentContext = null;
      
      console.warn(`[TenantStorage] Emergency clear completed: ${clearedCount} entries removed`);
      return clearedCount;
      
    } catch (error) {
      console.error('[TenantStorage] Emergency clear failed:', error);
      return 0;
    }
  }

  /**
   * Migrate data from one tenant to another (admin operation)
   */
  async migrateTenantData(plan: DataMigrationPlan): Promise<{ success: boolean; migratedCount: number; errors: string[] }> {
    console.log('[TenantStorage] Starting data migration:', plan);
    
    if (!this.isolationPolicy.allowCrossTenantRead) {
      throw new Error('Cross-tenant operations not allowed in current policy');
    }

    const errors: string[] = [];
    let migratedCount = 0;

    try {
      for (const key of plan.keysToMigrate) {
        try {
          // Read from source tenant context
          const sourceContext: StorageContext = {
            ...this.currentContext!,
            tenantId: plan.fromTenant
          };
          
          // Temporarily switch context
          const originalContext = this.currentContext;
          this.currentContext = sourceContext;
          secureCache.setContext(sourceContext);
          
          const value = this.get(key, { skipTenantValidation: true });
          
          if (value !== null) {
            // Switch to target tenant context
            const targetContext: StorageContext = {
              ...originalContext!,
              tenantId: plan.toTenant
            };
            
            this.currentContext = targetContext;
            secureCache.setContext(targetContext);
            
            // Store in target tenant
            const success = this.set(key, value, {
              encrypt: plan.encryptionRequired,
              auditLog: plan.auditRequired
            });
            
            if (success) {
              migratedCount++;
              
              // Remove from source if not preserving
              if (!plan.preserveOriginal) {
                this.currentContext = sourceContext;
                secureCache.setContext(sourceContext);
                this.remove(key, { skipTenantValidation: true });
              }
            } else {
              errors.push(`Failed to store ${key} in target tenant`);
            }
          } else {
            errors.push(`Key ${key} not found in source tenant`);
          }
          
          // Restore original context
          this.currentContext = originalContext;
          secureCache.setContext(originalContext!);
          
        } catch (error) {
          errors.push(`Migration error for ${key}: ${error}`);
        }
      }

      const success = errors.length === 0;
      console.log(`[TenantStorage] Migration completed: ${migratedCount} items, ${errors.length} errors`);
      
      return { success, migratedCount, errors };
      
    } catch (error) {
      console.error('[TenantStorage] Migration failed:', error);
      return { success: false, migratedCount, errors: [String(error)] };
    }
  }

  /**
   * Validate storage security and integrity
   */
  validateStorageSecurity(): { 
    valid: boolean; 
    violations: SecurityAudit[]; 
    recommendations: string[] 
  } {
    console.log('[TenantStorage] Validating storage security...');
    
    try {
      // Get cache integrity report
      const integrityResult = secureCache.validateCacheIntegrity();
      
      // Get security audit log
      const auditLog = secureCache.getSecurityAuditLog();
      
      // Find recent violations
      const recentViolations = auditLog.filter(
        audit => audit.securityIssue && (Date.now() - audit.timestamp) < 24 * 60 * 60 * 1000
      );

      // Generate recommendations
      const recommendations: string[] = [];
      
      if (!integrityResult.valid) {
        recommendations.push('Cache integrity issues detected - consider clearing corrupted entries');
      }
      
      if (recentViolations.length > 0) {
        recommendations.push(`${recentViolations.length} security violations in last 24h - review access patterns`);
      }
      
      if (!this.isolationPolicy.strictMode) {
        recommendations.push('Enable strict mode for better tenant isolation');
      }

      const result = {
        valid: integrityResult.valid && recentViolations.length === 0,
        violations: recentViolations,
        recommendations
      };

      console.log('[TenantStorage] Security validation completed:', result);
      return result;
      
    } catch (error) {
      console.error('[TenantStorage] Security validation failed:', error);
      return {
        valid: false,
        violations: [],
        recommendations: ['Security validation failed - consider emergency clear']
      };
    }
  }

  /**
   * Get comprehensive storage metrics
   */
  getMetrics(): StorageMetrics {
    try {
      const cacheStats = secureCache.getStats();
      const auditLog = secureCache.getSecurityAuditLog();
      
      const operationCounts: Record<string, number> = {};
      const violationCounts: Record<string, number> = {};
      
      this.operationLog.forEach(op => {
        operationCounts[op.operation] = (operationCounts[op.operation] || 0) + 1;
      });
      
      auditLog.forEach(audit => {
        if (audit.securityIssue) {
          violationCounts[audit.securityIssue] = (violationCounts[audit.securityIssue] || 0) + 1;
        }
      });

      return {
        totalSize: cacheStats.sizeBytes,
        tenantSizes: cacheStats.tenantBreakdown,
        operationCounts,
        violationCounts,
        lastCleanup: cacheStats.oldestEntry,
        dataIntegrityScore: cacheStats.securityViolations === 0 ? 100 : 
          Math.max(0, 100 - (cacheStats.securityViolations * 10))
      };
      
    } catch (error) {
      console.error('[TenantStorage] Error getting metrics:', error);
      return {
        totalSize: 0,
        tenantSizes: {},
        operationCounts: {},
        violationCounts: {},
        lastCleanup: Date.now(),
        dataIntegrityScore: 0
      };
    }
  }

  /**
   * Export audit log for compliance
   */
  exportAuditLog(): Array<{
    timestamp: string;
    operation: string;
    tenant: string;
    key: string;
    success: boolean;
    details?: string;
  }> {
    return this.operationLog.map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString()
    }));
  }

  /**
   * Private helper methods
   */
  private validateContext(): void {
    if (!this.currentContext) {
      throw new Error('No tenant context set - call initialize() first');
    }

    if (this.isolationPolicy.validateOnAccess) {
      if (!this.currentContext.tenantId || !this.currentContext.userId) {
        throw new Error('Invalid tenant context - missing required fields');
      }
    }
  }

  private isSensitiveKey(key: string): boolean {
    return this.SENSITIVE_KEY_PATTERNS.some(pattern => 
      key.toLowerCase().includes(pattern)
    );
  }

  private isSystemKey(key: string): boolean {
    return this.SYSTEM_KEYS.some(systemKey => 
      key.toLowerCase().includes(systemKey)
    );
  }

  private getCategoryForKey(key: string): 'auth' | 'data' | 'ui' | 'temp' {
    if (this.isSensitiveKey(key)) return 'auth';
    if (key.includes('ui_') || key.includes('preference')) return 'ui';
    if (key.includes('temp_') || key.includes('cache_')) return 'temp';
    return 'data';
  }

  private handleTenantChange(oldContext: StorageContext, newContext: StorageContext): void {
    console.warn('[TenantStorage] Tenant change detected:', {
      from: oldContext.tenantId,
      to: newContext.tenantId
    });

    // Clear data from old tenant to prevent contamination
    const originalContext = this.currentContext;
    this.currentContext = oldContext;
    secureCache.setContext(oldContext);
    
    this.clearTenant();
    
    // Restore context for new tenant
    this.currentContext = originalContext;
    
    this.logOperation('tenantChange', newContext.tenantId, 'context', true, 
      `Changed from ${oldContext.tenantId} to ${newContext.tenantId}`);
  }

  private logOperation(
    operation: string,
    tenant: string,
    key: string,
    success: boolean,
    details?: string
  ): void {
    this.operationLog.push({
      timestamp: Date.now(),
      operation,
      tenant,
      key,
      success,
      details
    });

    // Limit log size
    if (this.operationLog.length > 10000) {
      this.operationLog = this.operationLog.slice(-5000);
    }
  }

  /**
   * Update isolation policy (admin operation)
   */
  updateIsolationPolicy(updates: Partial<IsolationPolicy>): void {
    const oldPolicy = { ...this.isolationPolicy };
    this.isolationPolicy = { ...this.isolationPolicy, ...updates };
    
    console.log('[TenantStorage] Isolation policy updated:', {
      old: oldPolicy,
      new: this.isolationPolicy
    });

    this.logOperation('policyUpdate', this.currentContext?.tenantId || 'unknown', 'policy', true, 
      JSON.stringify(updates));
  }

  /**
   * Get current isolation policy
   */
  getIsolationPolicy(): IsolationPolicy {
    return { ...this.isolationPolicy };
  }

  /**
   */
  reset(): void {
    console.warn('[TenantStorage] RESET: Clearing all storage state');
    
    this.emergencyClear();
    this.currentContext = null;
    this.operationLog = [];
    this.isolationPolicy = {
      strictMode: true,
      allowCrossTenantRead: false,
      auditAllOperations: true,
      encryptSensitiveData: true,
      validateOnAccess: true
    };
  }
}

// Export singleton instance
export const tenantStorage = TenantIsolatedStorage.getInstance();

// Export for use with React hooks
export const useTenantStorage = () => {
  return {
    set: tenantStorage.set.bind(tenantStorage),
    get: tenantStorage.get.bind(tenantStorage),
    remove: tenantStorage.remove.bind(tenantStorage),
    clear: tenantStorage.clearTenant.bind(tenantStorage),
    getMetrics: tenantStorage.getMetrics.bind(tenantStorage),
    validateSecurity: tenantStorage.validateStorageSecurity.bind(tenantStorage)
  };
};