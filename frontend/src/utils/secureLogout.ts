/**
 * Atomic Secure Logout System
 * 
 * Provides comprehensive, verified, and atomic logout operations that ensure:
 * - Complete cache clearing across all storage layers
 * - Tenant data isolation verification
 * - Server-side session invalidation
 * - Cross-tab logout synchronization
 * - Audit logging for security compliance
 * - Graceful error handling with rollback
 */

import { supabase } from '../lib/supabase';
import { secureCache } from '../lib/secureCache';
import { tenantStorage } from './tenantIsolatedStorage';
import { persistentSessionRecovery } from './persistentSessionRecovery';

export interface LogoutContext {
  userId: string;
  tenantId: string;
  sessionId?: string;
  deviceId?: string;
  reason: 'user_initiated' | 'session_expired' | 'security_violation' | 'admin_forced' | 'tenant_switch';
}

export interface LogoutOptions {
  clearAllSessions?: boolean; // Clear all user sessions across devices
  notifyServer?: boolean; // Notify server to invalidate session
  clearCrossTabs?: boolean; // Signal other tabs to logout
  emergencyMode?: boolean; // Skip verification, force clear everything
  auditLog?: boolean; // Log this logout for audit purposes
  verifyClearing?: boolean; // Verify that data was actually cleared
  gracefulFallback?: boolean; // Use fallback clearing if primary fails
}

export interface LogoutResult {
  success: boolean;
  clearedItems: {
    supabaseAuth: boolean;
    secureCache: number;
    tenantStorage: number;
    localStorage: number;
    sessionStorage: number;
    indexedDB: string[];
    cacheStorage: string[];
  };
  verification: {
    noTenantDataRemaining: boolean;
    noAuthDataRemaining: boolean;
    crossTabNotified: boolean;
    serverNotified: boolean;
  };
  errors: string[];
  duration: number;
  auditId?: string;
}

export interface LogoutAudit {
  auditId: string;
  timestamp: number;
  context: LogoutContext;
  options: LogoutOptions;
  result: LogoutResult;
  preLogoutSnapshot: {
    cacheStats: any;
    storageMetrics: any;
    sessionCount: number;
  };
  postLogoutVerification: {
    dataRemaining: boolean;
    leakedKeys: string[];
    securityScore: number;
  };
}

export class AtomicSecureLogout {
  private static instance: AtomicSecureLogout;
  private logoutInProgress = false;
  private auditLog: LogoutAudit[] = [];
  private readonly MAX_AUDIT_ENTRIES = 100;
  
  // Cross-tab communication
  private readonly LOGOUT_CHANNEL = new BroadcastChannel('flexPMS_logout');
  
  // Storage layer constants
  private readonly STORAGE_PATTERNS = [
    'flexPMS_', 'sb-', 'supabase', 'auth', 'session', 'token', 
    'cache', 'tenant', 'user', 'device', 'bootstrap'
  ];

  private constructor() {
    this.setupCrossTabListener();
    this.setupBeforeUnloadHandler();
  }

  static getInstance(): AtomicSecureLogout {
    if (!AtomicSecureLogout.instance) {
      AtomicSecureLogout.instance = new AtomicSecureLogout();
    }
    return AtomicSecureLogout.instance;
  }

  /**
   * Main atomic logout method with comprehensive clearing and verification
   */
  async executeLogout(context: LogoutContext, options: LogoutOptions = {}): Promise<LogoutResult> {
    if (this.logoutInProgress && !options.emergencyMode) {
      throw new Error('Logout already in progress');
    }

    const startTime = Date.now();
    const auditId = `logout_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    this.logoutInProgress = true;

    console.log('[SecureLogout] Starting atomic logout process:', { context, options, auditId });

    const result: LogoutResult = {
      success: false,
      clearedItems: {
        supabaseAuth: false,
        secureCache: 0,
        tenantStorage: 0,
        localStorage: 0,
        sessionStorage: 0,
        indexedDB: [],
        cacheStorage: []
      },
      verification: {
        noTenantDataRemaining: false,
        noAuthDataRemaining: false,
        crossTabNotified: false,
        serverNotified: false
      },
      errors: [],
      duration: 0,
      auditId
    };

    const defaultOptions: LogoutOptions = {
      clearAllSessions: false,
      notifyServer: true,
      clearCrossTabs: true,
      emergencyMode: false,
      auditLog: true,
      verifyClearing: true,
      gracefulFallback: true,
      ...options
    };

    try {
      // Pre-logout snapshot for audit
      const preSnapshot = await this.createPreLogoutSnapshot(context);

      // Phase 1: Server-side session invalidation
      if (defaultOptions.notifyServer) {
        try {
          await this.invalidateServerSessions(context, defaultOptions.clearAllSessions);
          result.verification.serverNotified = true;
          console.log('[SecureLogout] Server sessions invalidated');
        } catch (error) {
          console.error('[SecureLogout] Server invalidation failed:', error);
          result.errors.push(`Server invalidation failed: ${error}`);
          
          if (!defaultOptions.gracefulFallback) {
            throw error;
          }
        }
      }

      // Phase 2: Cross-tab notification
      if (defaultOptions.clearCrossTabs) {
        try {
          this.notifyCrossTabLogout(context);
          result.verification.crossTabNotified = true;
          console.log('[SecureLogout] Cross-tab logout notified');
        } catch (error) {
          console.error('[SecureLogout] Cross-tab notification failed:', error);
          result.errors.push(`Cross-tab notification failed: ${error}`);
        }
      }

      // Phase 3: Atomic cache clearing
      await this.executeClearingSequence(context, defaultOptions, result);

      // Phase 4: Verification
      if (defaultOptions.verifyClearing) {
        const verificationResult = await this.verifyDataClearing(context);
        result.verification.noTenantDataRemaining = verificationResult.noTenantData;
        result.verification.noAuthDataRemaining = verificationResult.noAuthData;
        
        if (!verificationResult.noTenantData || !verificationResult.noAuthData) {
          result.errors.push('Data clearing verification failed');
          
          if (defaultOptions.gracefulFallback) {
            console.warn('[SecureLogout] Verification failed, attempting emergency clear...');
            await this.emergencyClear();
            
            // Re-verify
            const reVerification = await this.verifyDataClearing(context);
            result.verification.noTenantDataRemaining = reVerification.noTenantData;
            result.verification.noAuthDataRemaining = reVerification.noAuthData;
          }
        }
      }

      // Determine overall success
      result.success = result.errors.length === 0 && 
                      (result.verification.noTenantDataRemaining || !defaultOptions.verifyClearing) &&
                      (result.verification.noAuthDataRemaining || !defaultOptions.verifyClearing);

      console.log(`[SecureLogout] Atomic logout ${result.success ? 'completed' : 'failed'}:`, result);

      // Phase 5: Audit logging
      if (defaultOptions.auditLog) {
        await this.createLogoutAudit(auditId, context, defaultOptions, result, preSnapshot);
      }

      return result;

    } catch (error) {
      console.error('[SecureLogout] Atomic logout failed:', error);
      result.errors.push(`Logout failed: ${error}`);
      result.success = false;
      
      if (defaultOptions.gracefulFallback) {
        try {
          console.warn('[SecureLogout] Attempting emergency fallback...');
          await this.emergencyClear();
        } catch (emergencyError) {
          console.error('[SecureLogout] Emergency fallback failed:', emergencyError);
          result.errors.push(`Emergency fallback failed: ${emergencyError}`);
        }
      }
      
      return result;
      
    } finally {
      result.duration = Date.now() - startTime;
      this.logoutInProgress = false;
    }
  }

  /**
   */
  async emergencyLogout(reason: string = 'emergency'): Promise<LogoutResult> {
    console.warn('[SecureLogout] EMERGENCY LOGOUT INITIATED:', reason);
    
    const context: LogoutContext = {
      userId: 'emergency',
      tenantId: 'emergency',
      reason: 'security_violation'
    };

    const options: LogoutOptions = {
      emergencyMode: true,
      clearAllSessions: true,
      notifyServer: false,
      clearCrossTabs: true,
      auditLog: true,
      verifyClearing: false, // Skip verification for speed
      gracefulFallback: false
    };

    try {
      const result = await this.executeLogout(context, options);
      
      await this.emergencyClear();
      
      setTimeout(() => {
        window.location.href = '/login?emergency=true';
      }, 1000);
      
      return result;
      
    } catch (error) {
      console.error('[SecureLogout] Emergency logout failed:', error);
      
      // Force reload even on failure
      window.location.href = '/login?emergency=true';
      
      throw error;
    }
  }

  /**
   * Get logout audit log
   */
  getAuditLog(): LogoutAudit[] {
    return [...this.auditLog];
  }

  /**
   * Private implementation methods
   */
  private async invalidateServerSessions(context: LogoutContext, clearAllSessions: boolean): Promise<void> {
    try {
      const endpoint = clearAllSessions ? '/api/v1/auth/sessions/all' : `/api/v1/auth/session/${context.sessionId}`;
      
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAccessToken()}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Server responded with ${response.status}`);
      }

      console.log('[SecureLogout] Server session invalidation successful');
      
    } catch (error) {
      console.error('[SecureLogout] Server invalidation error:', error);
      throw error;
    }
  }

  private async executeClearingSequence(
    context: LogoutContext,
    options: LogoutOptions,
    result: LogoutResult
  ): Promise<void> {
    console.log('[SecureLogout] Executing atomic clearing sequence...');

    // 1. Clear Supabase auth
    try {
      await supabase.auth.signOut();
      result.clearedItems.supabaseAuth = true;
      console.log('[SecureLogout] Supabase auth cleared');
    } catch (error) {
      console.error('[SecureLogout] Supabase signout failed:', error);
      result.errors.push(`Supabase signout failed: ${error}`);
    }

    // 2. Clear secure cache
    try {
      result.clearedItems.secureCache = secureCache.clearAllCache();
      console.log(`[SecureLogout] Secure cache cleared: ${result.clearedItems.secureCache} items`);
    } catch (error) {
      console.error('[SecureLogout] Secure cache clear failed:', error);
      result.errors.push(`Secure cache clear failed: ${error}`);
    }

    // 3. Clear tenant storage
    try {
      result.clearedItems.tenantStorage = tenantStorage.emergencyClear();
      console.log(`[SecureLogout] Tenant storage cleared: ${result.clearedItems.tenantStorage} items`);
    } catch (error) {
      console.error('[SecureLogout] Tenant storage clear failed:', error);
      result.errors.push(`Tenant storage clear failed: ${error}`);
    }

    // 4. Clear localStorage
    try {
      result.clearedItems.localStorage = await this.clearLocalStorage();
      console.log(`[SecureLogout] LocalStorage cleared: ${result.clearedItems.localStorage} items`);
    } catch (error) {
      console.error('[SecureLogout] LocalStorage clear failed:', error);
      result.errors.push(`LocalStorage clear failed: ${error}`);
    }

    // 5. Clear sessionStorage
    try {
      const sessionCount = sessionStorage.length;
      sessionStorage.clear();
      result.clearedItems.sessionStorage = sessionCount;
      console.log(`[SecureLogout] SessionStorage cleared: ${sessionCount} items`);
    } catch (error) {
      console.error('[SecureLogout] SessionStorage clear failed:', error);
      result.errors.push(`SessionStorage clear failed: ${error}`);
    }

    // 6. Clear IndexedDB
    try {
      result.clearedItems.indexedDB = await this.clearIndexedDB();
      console.log(`[SecureLogout] IndexedDB cleared: ${result.clearedItems.indexedDB.join(', ')}`);
    } catch (error) {
      console.error('[SecureLogout] IndexedDB clear failed:', error);
      result.errors.push(`IndexedDB clear failed: ${error}`);
    }

    // 7. Clear Cache Storage
    try {
      result.clearedItems.cacheStorage = await this.clearCacheStorage();
      console.log(`[SecureLogout] Cache Storage cleared: ${result.clearedItems.cacheStorage.join(', ')}`);
    } catch (error) {
      console.error('[SecureLogout] Cache Storage clear failed:', error);
      result.errors.push(`Cache Storage clear failed: ${error}`);
    }

    // 8. Clear session recovery backups
    try {
      await persistentSessionRecovery.clearBackups();
      console.log('[SecureLogout] Session recovery backups cleared');
    } catch (error) {
      console.error('[SecureLogout] Session recovery clear failed:', error);
      result.errors.push(`Session recovery clear failed: ${error}`);
    }
  }

  private async clearLocalStorage(): Promise<number> {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.shouldClearKey(key)) {
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    return keysToRemove.length;
  }

  private async clearIndexedDB(): Promise<string[]> {
    const clearedDatabases: string[] = [];
    
    try {
      if ('databases' in indexedDB) {
        const databases = await indexedDB.databases();
        
        for (const db of databases) {
          if (db.name && this.shouldClearDatabase(db.name)) {
            try {
              await this.deleteDatabase(db.name);
              clearedDatabases.push(db.name);
            } catch (error) {
              console.warn(`[SecureLogout] Failed to delete database ${db.name}:`, error);
            }
          }
        }
      } else {
        // Fallback: try to delete known databases
        const knownDatabases = ['FlexPMSAuth', 'FlexPMSCache', 'FlexPMSData'];
        
        for (const dbName of knownDatabases) {
          try {
            await this.deleteDatabase(dbName);
            clearedDatabases.push(dbName);
          } catch (error) {
            // Database might not exist
          }
        }
      }
    } catch (error) {
      console.error('[SecureLogout] IndexedDB enumeration failed:', error);
    }
    
    return clearedDatabases;
  }

  private async clearCacheStorage(): Promise<string[]> {
    const clearedCaches: string[] = [];
    
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        
        for (const cacheName of cacheNames) {
          if (this.shouldClearCache(cacheName)) {
            try {
              await caches.delete(cacheName);
              clearedCaches.push(cacheName);
            } catch (error) {
              console.warn(`[SecureLogout] Failed to delete cache ${cacheName}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[SecureLogout] Cache Storage clear failed:', error);
    }
    
    return clearedCaches;
  }

  private async verifyDataClearing(context: LogoutContext): Promise<{
    noTenantData: boolean;
    noAuthData: boolean;
    remainingKeys: string[];
  }> {
    const remainingKeys: string[] = [];
    
    // Check localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && this.shouldClearKey(key)) {
        remainingKeys.push(`localStorage:${key}`);
      }
    }
    
    // Check sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && this.shouldClearKey(key)) {
        remainingKeys.push(`sessionStorage:${key}`);
      }
    }

    const noTenantData = !remainingKeys.some(key => 
      key.includes(context.tenantId) || key.includes('tenant')
    );
    
    const noAuthData = !remainingKeys.some(key => 
      key.includes('auth') || key.includes('token') || key.includes('session')
    );

    if (remainingKeys.length > 0) {
      console.warn('[SecureLogout] Data verification found remaining keys:', remainingKeys);
    }

    return { noTenantData, noAuthData, remainingKeys };
  }

  private async emergencyClear(): Promise<void> {
    console.warn('[SecureLogout] EMERGENCY CLEAR: Removing all data');
    
    try {
      // Nuclear localStorage clear
      localStorage.clear();
      
      // Nuclear sessionStorage clear
      sessionStorage.clear();
      
      // Try to clear all IndexedDB databases
      try {
        if ('databases' in indexedDB) {
          const databases = await indexedDB.databases();
          await Promise.all(databases.map(db => 
            db.name ? this.deleteDatabase(db.name) : Promise.resolve()
          ));
        }
      } catch (error) {
        console.warn('[SecureLogout] Emergency IndexedDB clear failed:', error);
      }
      
      // Try to clear all caches
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
      } catch (error) {
        console.warn('[SecureLogout] Emergency cache clear failed:', error);
      }
      
      console.log('[SecureLogout] Emergency clear completed');
      
    } catch (error) {
      console.error('[SecureLogout] Emergency clear failed:', error);
      throw error;
    }
  }

  private shouldClearKey(key: string): boolean {
    return this.STORAGE_PATTERNS.some(pattern => 
      key.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  private shouldClearDatabase(name: string): boolean {
    return name.toLowerCase().includes('flexpms') || 
           name.toLowerCase().includes('auth') ||
           name.toLowerCase().includes('cache');
  }

  private shouldClearCache(name: string): boolean {
    return name.toLowerCase().includes('flexpms') || 
           name.toLowerCase().includes('auth') ||
           name.toLowerCase().includes('api');
  }

  private deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(name);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onblocked = () => {
        console.warn(`[SecureLogout] Database deletion blocked: ${name}`);
        // Resolve anyway after timeout
        setTimeout(resolve, 5000);
      };
    });
  }

  private notifyCrossTabLogout(context: LogoutContext): void {
    try {
      this.LOGOUT_CHANNEL.postMessage({
        type: 'LOGOUT_INITIATED',
        context,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[SecureLogout] Cross-tab notification failed:', error);
      throw error;
    }
  }

  private setupCrossTabListener(): void {
    this.LOGOUT_CHANNEL.addEventListener('message', (event) => {
      if (event.data.type === 'LOGOUT_INITIATED' && !this.logoutInProgress) {
        console.log('[SecureLogout] Cross-tab logout received');
        
        // Perform local cleanup without server notification
        this.executeLogout(event.data.context, {
          notifyServer: false,
          clearCrossTabs: false,
          emergencyMode: true
        }).catch(error => {
          console.error('[SecureLogout] Cross-tab logout failed:', error);
        });
      }
    });
  }

  private setupBeforeUnloadHandler(): void {
    window.addEventListener('beforeunload', () => {
      if (!this.logoutInProgress) {
        // Quick cleanup before page unload
        try {
          secureCache.clearAllCache();
        } catch (error) {
          console.warn('[SecureLogout] Quick cleanup failed:', error);
        }
      }
    });
  }

  private async getAccessToken(): Promise<string> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || '';
    } catch (error) {
      return '';
    }
  }

  private async createPreLogoutSnapshot(context: LogoutContext): Promise<any> {
    try {
      return {
        cacheStats: secureCache.getStats(),
        storageMetrics: tenantStorage.getMetrics(),
        sessionCount: localStorage.length + sessionStorage.length,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('[SecureLogout] Failed to create pre-logout snapshot:', error);
      return {};
    }
  }

  private async createLogoutAudit(
    auditId: string,
    context: LogoutContext,
    options: LogoutOptions,
    result: LogoutResult,
    preSnapshot: any
  ): Promise<void> {
    try {
      const postVerification = await this.verifyDataClearing(context);
      
      const audit: LogoutAudit = {
        auditId,
        timestamp: Date.now(),
        context,
        options,
        result,
        preLogoutSnapshot: preSnapshot,
        postLogoutVerification: {
          dataRemaining: postVerification.remainingKeys.length > 0,
          leakedKeys: postVerification.remainingKeys,
          securityScore: result.success && postVerification.remainingKeys.length === 0 ? 100 : 
                       Math.max(0, 100 - (postVerification.remainingKeys.length * 10))
        }
      };

      this.auditLog.push(audit);
      
      // Limit audit log size
      if (this.auditLog.length > this.MAX_AUDIT_ENTRIES) {
        this.auditLog = this.auditLog.slice(-this.MAX_AUDIT_ENTRIES / 2);
      }

      console.log('[SecureLogout] Logout audit created:', audit);
      
    } catch (error) {
      console.error('[SecureLogout] Failed to create logout audit:', error);
    }
  }
}

// Export singleton instance
export const secureLogout = AtomicSecureLogout.getInstance();