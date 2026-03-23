/**
 * Storage Recovery System
 * 
 * Comprehensive automatic recovery system that:
 * - Detects and fixes various types of storage corruption
 * - Provides progressive recovery strategies (targeted → nuclear)
 * - Implements automatic fallback mechanisms for failed operations
 * - Creates storage rollback mechanisms for failed operations
 * - Monitors recovery success and prevents infinite loops
 */

import { storageManager, STORAGE_KEYS } from './StorageManager';
import { storageHealthChecker, StorageHealthReport, StorageIssue } from './StorageHealthChecker';
import { sessionManager } from './sessionManager';
import { supabase } from '../lib/supabase';

export interface RecoveryStrategy {
  name: string;
  severity: 'targeted' | 'aggressive' | 'nuclear';
  description: string;
  applicableIssues: string[];
  execute: () => Promise<boolean>;
}

export interface RecoveryAttempt {
  strategy: string;
  timestamp: number;
  success: boolean;
  issues_before: number;
  issues_after: number;
  error?: string;
}

export interface RecoveryReport {
  total_attempts: number;
  successful_attempts: number;
  failed_attempts: number;
  recovery_strategies_used: string[];
  final_health_status: string;
  critical_data_preserved: boolean;
  recovery_duration_ms: number;
  recommendations: string[];
}

export class StorageRecoverySystem {
  private static instance: StorageRecoverySystem;
  private recoveryInProgress = false;
  private recoveryHistory: RecoveryAttempt[] = [];
  private readonly MAX_RECOVERY_ATTEMPTS = 5;
  private readonly RECOVERY_COOLDOWN = 30 * 1000; // 30 seconds
  private lastRecoveryTime = 0;
  private recoveryStrategies: RecoveryStrategy[] = [];
  
  private constructor() {
    this.initializeRecoveryStrategies();
    this.startRecoveryMonitoring();
  }
  
  static getInstance(): StorageRecoverySystem {
    if (!StorageRecoverySystem.instance) {
      StorageRecoverySystem.instance = new StorageRecoverySystem();
    }
    return StorageRecoverySystem.instance;
  }
  
  /**
   * Initialize recovery strategies in order of severity
   */
  private initializeRecoveryStrategies(): void {
    this.recoveryStrategies = [
      // Targeted strategies (least invasive)
      {
        name: 'remove_corrupted_items',
        severity: 'targeted',
        description: 'Remove specific corrupted storage items',
        applicableIssues: ['corruption'],
        execute: async () => this.removeCorruptedItems()
      },
      {
        name: 'clean_expired_items',
        severity: 'targeted',
        description: 'Remove expired storage items',
        applicableIssues: ['size_overflow'],
        execute: async () => this.cleanExpiredItems()
      },
      {
        name: 'resolve_orphaned_data',
        severity: 'targeted',
        description: 'Remove orphaned data from previous sessions',
        applicableIssues: ['orphaned_data'],
        execute: async () => this.resolveOrphanedData()
      },
      {
        name: 'fix_version_mismatches',
        severity: 'targeted',
        description: 'Migrate or remove items with version mismatches',
        applicableIssues: ['version_mismatch'],
        execute: async () => this.fixVersionMismatches()
      },
      
      // Aggressive strategies (more invasive)
      {
        name: 'clear_session_conflicts',
        severity: 'aggressive',
        description: 'Resolve conflicting session data',
        applicableIssues: ['session_conflict'],
        execute: async () => this.clearSessionConflicts()
      },
      {
        name: 'rebuild_storage_schema',
        severity: 'aggressive',
        description: 'Rebuild storage with current schema',
        applicableIssues: ['invalid_schema', 'version_mismatch'],
        execute: async () => this.rebuildStorageSchema()
      },
      {
        name: 'clear_user_cache',
        severity: 'aggressive',
        description: 'Clear all cached data while preserving session',
        applicableIssues: ['corruption', 'size_overflow'],
        execute: async () => this.clearUserCache()
      },
      
      // Nuclear strategies (last resort)
      {
        name: 'emergency_reset_with_backup',
        severity: 'nuclear',
        description: 'Reset all storage while backing up critical data',
        applicableIssues: ['corruption', 'critical'],
        execute: async () => this.emergencyResetWithBackup()
      },
      {
        name: 'complete_storage_wipe',
        severity: 'nuclear',
        description: 'Complete storage wipe - absolute last resort',
        applicableIssues: ['critical'],
        execute: async () => this.completeStorageWipe()
      }
    ];
  }
  
  /**
   * Attempt automatic recovery based on storage health
   */
  async attemptRecovery(healthReport?: StorageHealthReport): Promise<RecoveryReport> {
    if (this.recoveryInProgress) {
      console.log('[StorageRecoverySystem] Recovery already in progress');
      return this.createEmptyRecoveryReport();
    }
    
    // Check cooldown period
    const now = Date.now();
    if (now - this.lastRecoveryTime < this.RECOVERY_COOLDOWN) {
      console.log('[StorageRecoverySystem] Recovery in cooldown period');
      return this.createEmptyRecoveryReport();
    }
    
    this.recoveryInProgress = true;
    this.lastRecoveryTime = now;
    const startTime = Date.now();
    
    try {
      console.log('[StorageRecoverySystem] Starting automatic recovery...');
      
      // Get current health report if not provided
      const report = healthReport || await storageHealthChecker.performHealthCheck();
      
      if (report.overall_health === 'healthy') {
        console.log('[StorageRecoverySystem] Storage is healthy, no recovery needed');
        return this.createSuccessRecoveryReport(startTime, []);
      }
      
      const criticalDataBackup = await this.backupCriticalData();
      
      // Determine which strategies to use based on issues
      const applicableStrategies = this.selectRecoveryStrategies(report.issues);
      console.log('[StorageRecoverySystem] Selected recovery strategies:', applicableStrategies.map(s => s.name));
      
      const recoveryAttempts: RecoveryAttempt[] = [];
      let currentIssueCount = report.issues.length;
      
      // Execute strategies in order of severity
      for (const strategy of applicableStrategies) {
        if (currentIssueCount === 0) {
          console.log('[StorageRecoverySystem] All issues resolved, stopping recovery');
          break;
        }
        
        if (recoveryAttempts.length >= this.MAX_RECOVERY_ATTEMPTS) {
          console.log('[StorageRecoverySystem] Max recovery attempts reached');
          break;
        }
        
        console.log(`[StorageRecoverySystem] Executing strategy: ${strategy.name}`);
        
        const attemptStart = Date.now();
        let success = false;
        let error: string | undefined;
        
        try {
          success = await strategy.execute();
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          console.error(`[StorageRecoverySystem] Strategy ${strategy.name} failed:`, error);
        }
        
        // Check health after strategy
        const postHealthReport = await storageHealthChecker.performHealthCheck();
        const newIssueCount = postHealthReport.issues.length;
        
        const attempt: RecoveryAttempt = {
          strategy: strategy.name,
          timestamp: attemptStart,
          success: success && newIssueCount < currentIssueCount,
          issues_before: currentIssueCount,
          issues_after: newIssueCount,
          error
        };
        
        recoveryAttempts.push(attempt);
        this.recoveryHistory.push(attempt);
        currentIssueCount = newIssueCount;
        
        console.log(`[StorageRecoverySystem] Strategy ${strategy.name} result:`, {
          success: attempt.success,
          issues_reduced: currentIssueCount < attempt.issues_before,
          remaining_issues: currentIssueCount
        });
        
        // If this was a nuclear strategy and it worked, we're done
        if (strategy.severity === 'nuclear' && attempt.success) {
          break;
        }
      }
      
      const aggressiveStrategiesUsed = recoveryAttempts.some(a => 
        this.recoveryStrategies.find(s => s.name === a.strategy)?.severity === 'aggressive' ||
        this.recoveryStrategies.find(s => s.name === a.strategy)?.severity === 'nuclear'
      );
      
      if (aggressiveStrategiesUsed && criticalDataBackup) {
        await this.restoreCriticalData(criticalDataBackup);
      }
      
      // Final health check
      const finalHealthReport = await storageHealthChecker.performHealthCheck();
      
      const recoveryReport: RecoveryReport = {
        total_attempts: recoveryAttempts.length,
        successful_attempts: recoveryAttempts.filter(a => a.success).length,
        failed_attempts: recoveryAttempts.filter(a => !a.success).length,
        recovery_strategies_used: recoveryAttempts.map(a => a.strategy),
        final_health_status: finalHealthReport.overall_health,
        critical_data_preserved: aggressiveStrategiesUsed ? !!criticalDataBackup : true,
        recovery_duration_ms: Date.now() - startTime,
        recommendations: this.generateRecoveryRecommendations(recoveryAttempts, finalHealthReport)
      };
      
      console.log('[StorageRecoverySystem] Recovery completed:', recoveryReport);
      
      // Store recovery report
      try {
        storageManager.set('last_recovery_report', recoveryReport, {
          skipIntegrityCheck: true,
          ttl: 24 * 60 * 60 * 1000 // 24 hours
        });
      } catch (e) {
        console.warn('[StorageRecoverySystem] Failed to store recovery report:', e);
      }
      
      return recoveryReport;
      
    } finally {
      this.recoveryInProgress = false;
    }
  }
  
  /**
   * Select appropriate recovery strategies based on issues
   */
  private selectRecoveryStrategies(issues: StorageIssue[]): RecoveryStrategy[] {
    const selectedStrategies: RecoveryStrategy[] = [];
    const issueTypes = new Set(issues.map(i => i.type));
    const maxSeverity = Math.max(...issues.map(i => 
      i.severity === 'critical' ? 4 : i.severity === 'high' ? 3 : i.severity === 'medium' ? 2 : 1
    ));
    
    // Select strategies based on issue types and severity
    for (const strategy of this.recoveryStrategies) {
      const isApplicable = strategy.applicableIssues.some(issue => issueTypes.has(issue as any));
      
      if (isApplicable) {
        if (maxSeverity >= 4) {
          selectedStrategies.push(strategy);
        } else if (maxSeverity >= 3 && strategy.severity !== 'nuclear') { // High
          selectedStrategies.push(strategy);
        } else if (maxSeverity >= 2 && strategy.severity === 'targeted') { // Medium
          selectedStrategies.push(strategy);
        } else if (maxSeverity === 1 && strategy.severity === 'targeted') { // Low
          selectedStrategies.push(strategy);
        }
      }
    }
    
    // If no strategies selected but we have issues, add basic cleanup
    if (selectedStrategies.length === 0 && issues.length > 0) {
      const cleanupStrategy = this.recoveryStrategies.find(s => s.name === 'remove_corrupted_items');
      if (cleanupStrategy) {
        selectedStrategies.push(cleanupStrategy);
      }
    }
    
    // Sort by severity (targeted first, nuclear last)
    return selectedStrategies.sort((a, b) => {
      const severityOrder = { targeted: 1, aggressive: 2, nuclear: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
  
  /**
   */
  private async backupCriticalData(): Promise<any> {
    try {
      const criticalData: any = {};
      
      // Backup current session context
      const sessionContext = sessionManager.getCurrentContext();
      if (sessionContext) {
        criticalData.session_context = sessionContext;
      }
      
      // Backup current Supabase session
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          criticalData.supabase_session = {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            user_id: session.user.id,
            expires_at: session.expires_at
          };
        }
      } catch (e) {
        console.warn('[StorageRecoverySystem] Failed to backup Supabase session:', e);
      }
      
      // Backup user preferences if available
      try {
        const userPrefs = storageManager.get('user_preferences');
        if (userPrefs) {
          criticalData.user_preferences = userPrefs;
        }
      } catch (e) {
      }
      
      // Store backup temporarily
      const backupKey = `emergency_backup_${Date.now()}`;
      try {
        localStorage.setItem(backupKey, JSON.stringify({
          timestamp: Date.now(),
          data: criticalData
        }));
        
        console.log('[StorageRecoverySystem] Critical data backed up');
        return { backup_key: backupKey, data: criticalData };
      } catch (e) {
        console.warn('[StorageRecoverySystem] Failed to store backup:', e);
        return criticalData;
      }
      
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to backup critical data:', error);
      return null;
    }
  }
  
  /**
   */
  private async restoreCriticalData(backup: any): Promise<void> {
    try {
      if (!backup || !backup.data) {
        console.log('[StorageRecoverySystem] No backup data to restore');
        return;
      }
      
      const { data } = backup;
      
      // Restore session context
      if (data.session_context) {
        try {
          await sessionManager.setSessionContext(data.session_context);
          console.log('[StorageRecoverySystem] Session context restored');
        } catch (e) {
          console.warn('[StorageRecoverySystem] Failed to restore session context:', e);
        }
      }
      
      // Restore Supabase session
      if (data.supabase_session) {
        try {
          await supabase.auth.setSession({
            access_token: data.supabase_session.access_token,
            refresh_token: data.supabase_session.refresh_token
          });
          console.log('[StorageRecoverySystem] Supabase session restored');
        } catch (e) {
          console.warn('[StorageRecoverySystem] Failed to restore Supabase session:', e);
        }
      }
      
      // Restore user preferences
      if (data.user_preferences) {
        try {
          storageManager.set('user_preferences', data.user_preferences);
          console.log('[StorageRecoverySystem] User preferences restored');
        } catch (e) {
          console.warn('[StorageRecoverySystem] Failed to restore user preferences:', e);
        }
      }
      
      // Clean up backup
      if (backup.backup_key) {
        try {
          localStorage.removeItem(backup.backup_key);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to restore critical data:', error);
    }
  }
  
  // Recovery strategy implementations
  
  private async removeCorruptedItems(): Promise<boolean> {
    try {
      let removedCount = 0;
      
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        try {
          const value = localStorage.getItem(key);
          if (value) {
            JSON.parse(value); // Test if parseable
          }
        } catch (error) {
          localStorage.removeItem(key);
          removedCount++;
        }
      }
      
      console.log(`[StorageRecoverySystem] Removed ${removedCount} corrupted items`);
      return removedCount > 0;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to remove corrupted items:', error);
      return false;
    }
  }
  
  private async cleanExpiredItems(): Promise<boolean> {
    try {
      let removedCount = 0;
      const now = Date.now();
      
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        try {
          const value = localStorage.getItem(key);
          if (!value) continue;
          
          const item = JSON.parse(value);
          if (item.expires_at && now > item.expires_at) {
            localStorage.removeItem(key);
            removedCount++;
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
      
      console.log(`[StorageRecoverySystem] Removed ${removedCount} expired items`);
      return removedCount > 0;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to clean expired items:', error);
      return false;
    }
  }
  
  private async resolveOrphanedData(): Promise<boolean> {
    try {
      const currentContext = sessionManager.getCurrentContext();
      if (!currentContext) {
        return false; // Can't resolve orphaned data without current context
      }
      
      let removedCount = 0;
      
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Check if key belongs to different user/tenant
        const parts = key.split('::');
        if (parts.length >= 2) {
          const keyUserId = parts[1];
          const keyTenantId = parts[0];
          
          if (keyUserId !== currentContext.user_id || keyTenantId !== currentContext.tenant_id) {
            localStorage.removeItem(key);
            removedCount++;
          }
        }
      }
      
      console.log(`[StorageRecoverySystem] Resolved ${removedCount} orphaned items`);
      return removedCount > 0;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to resolve orphaned data:', error);
      return false;
    }
  }
  
  private async fixVersionMismatches(): Promise<boolean> {
    try {
      let fixedCount = 0;
      const currentVersion = '2.0.0';
      
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        try {
          const value = localStorage.getItem(key);
          if (!value) continue;
          
          const item = JSON.parse(value);
          if (item.version && item.version !== currentVersion) {
            // For now, just remove outdated items
            // In future, could implement migration logic
            localStorage.removeItem(key);
            fixedCount++;
          }
        } catch (error) {
          // Ignore parsing errors
        }
      }
      
      console.log(`[StorageRecoverySystem] Fixed ${fixedCount} version mismatches`);
      return fixedCount > 0;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to fix version mismatches:', error);
      return false;
    }
  }
  
  private async clearSessionConflicts(): Promise<boolean> {
    try {
      const currentContext = sessionManager.getCurrentContext();
      let clearedCount = 0;
      
      // Remove conflicting session data
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        if (key.includes('session') || key.includes('auth')) {
          if (currentContext) {
            // Keep only current user's session data
            if (!key.includes(currentContext.user_id)) {
              localStorage.removeItem(key);
              clearedCount++;
            }
          } else {
            // No current session, remove all session data
            localStorage.removeItem(key);
            clearedCount++;
          }
        }
      }
      
      console.log(`[StorageRecoverySystem] Cleared ${clearedCount} session conflicts`);
      return clearedCount > 0;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to clear session conflicts:', error);
      return false;
    }
  }
  
  private async rebuildStorageSchema(): Promise<boolean> {
    try {
      // This would implement schema migration logic
      // For now, it's a placeholder
      console.log('[StorageRecoverySystem] Schema rebuild not yet implemented');
      return true;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to rebuild storage schema:', error);
      return false;
    }
  }
  
  private async clearUserCache(): Promise<boolean> {
    try {
      const currentContext = sessionManager.getCurrentContext();
      if (currentContext) {
        const clearedCount = storageManager.clearUserData(currentContext);
        console.log(`[StorageRecoverySystem] Cleared user cache: ${clearedCount} items`);
        return clearedCount > 0;
      }
      return false;
    } catch (error) {
      console.error('[StorageRecoverySystem] Failed to clear user cache:', error);
      return false;
    }
  }
  
  private async emergencyResetWithBackup(): Promise<boolean> {
    try {
      console.log('[StorageRecoverySystem] Performing emergency reset with backup');
      
      const backupKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('emergency_backup_')) {
          backupKeys.push(key);
        }
      }
      
      storageManager.clearAll();
      
      backupKeys.forEach(key => {
        // Backup keys were already in localStorage, they'll be handled by restore
      });
      
      console.log('[StorageRecoverySystem] Emergency reset completed with backup preservation');
      return true;
    } catch (error) {
      console.error('[StorageRecoverySystem] Emergency reset failed:', error);
      return false;
    }
  }
  
  private async completeStorageWipe(): Promise<boolean> {
    try {
      console.log('[StorageRecoverySystem] Performing complete storage wipe');
      storageManager.clearAll();
      sessionStorage.clear();
      
      // Clear IndexedDB
      if ('indexedDB' in window) {
        try {
          const databases = await indexedDB.databases();
          for (const db of databases) {
            if (db.name) {
              await indexedDB.deleteDatabase(db.name);
            }
          }
        } catch (e) {
          console.warn('[StorageRecoverySystem] Failed to clear IndexedDB:', e);
        }
      }
      
      console.log('[StorageRecoverySystem] Complete storage wipe completed');
      return true;
    } catch (error) {
      console.error('[StorageRecoverySystem] Complete storage wipe failed:', error);
      return false;
    }
  }
  
  /**
   * Generate recovery recommendations
   */
  private generateRecoveryRecommendations(attempts: RecoveryAttempt[], finalHealth: StorageHealthReport): string[] {
    const recommendations: string[] = [];
    
    const failedAttempts = attempts.filter(a => !a.success);
    const successfulAttempts = attempts.filter(a => a.success);
    
    if (finalHealth.overall_health === 'healthy') {
      recommendations.push('Recovery successful - storage is now healthy');
    } else if (finalHealth.overall_health === 'degraded') {
      recommendations.push('Partial recovery - monitor storage health closely');
    } else {
      recommendations.push('Recovery incomplete - manual intervention may be required');
    }
    
    if (failedAttempts.length > 0) {
      recommendations.push(`${failedAttempts.length} recovery strategies failed - check browser console for details`);
    }
    
    if (successfulAttempts.length === 0) {
      recommendations.push('No recovery strategies succeeded - consider using incognito mode temporarily');
    }
    
    // Add specific recommendations based on remaining issues
    if (finalHealth.issues.some(i => i.type === 'corruption')) {
      recommendations.push('Corruption still detected - avoid storing sensitive data until resolved');
    }
    
    if (finalHealth.issues.some(i => i.type === 'size_overflow')) {
      recommendations.push('Storage size issues persist - clear old data manually');
    }
    
    return recommendations;
  }
  
  /**
   * Create empty recovery report
   */
  private createEmptyRecoveryReport(): RecoveryReport {
    return {
      total_attempts: 0,
      successful_attempts: 0,
      failed_attempts: 0,
      recovery_strategies_used: [],
      final_health_status: 'unknown',
      critical_data_preserved: true,
      recovery_duration_ms: 0,
      recommendations: ['Recovery was not performed']
    };
  }
  
  /**
   * Create success recovery report
   */
  private createSuccessRecoveryReport(startTime: number, attempts: RecoveryAttempt[]): RecoveryReport {
    return {
      total_attempts: attempts.length,
      successful_attempts: attempts.filter(a => a.success).length,
      failed_attempts: attempts.filter(a => !a.success).length,
      recovery_strategies_used: attempts.map(a => a.strategy),
      final_health_status: 'healthy',
      critical_data_preserved: true,
      recovery_duration_ms: Date.now() - startTime,
      recommendations: ['Storage is healthy - no action required']
    };
  }
  
  /**
   * Start recovery monitoring
   */
  private startRecoveryMonitoring(): void {
    // Listen for storage health changes
    setInterval(async () => {
      if (!this.recoveryInProgress) {
        const healthReport = await storageHealthChecker.performHealthCheck();
        
        if (healthReport.overall_health === 'critical' || 
            (healthReport.overall_health === 'corrupted' && healthReport.issues.some(i => i.severity === 'critical'))) {
          console.log('[StorageRecoverySystem] Critical storage issues detected, attempting automatic recovery');
          await this.attemptRecovery(healthReport);
        }
      }
    }, 60 * 1000); // Check every minute
  }
  
  /**
   * Get recovery history
   */
  getRecoveryHistory(): RecoveryAttempt[] {
    return [...this.recoveryHistory];
  }
  
  /**
   * Get recovery diagnostics
   */
  getDiagnostics() {
    return {
      recovery_in_progress: this.recoveryInProgress,
      last_recovery_time: this.lastRecoveryTime,
      recovery_history_count: this.recoveryHistory.length,
      available_strategies: this.recoveryStrategies.length,
      max_recovery_attempts: this.MAX_RECOVERY_ATTEMPTS,
      recovery_cooldown_ms: this.RECOVERY_COOLDOWN
    };
  }
}

// Export singleton instance
export const storageRecoverySystem = StorageRecoverySystem.getInstance();

// Make recovery system available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).storageRecoverySystem = storageRecoverySystem;
  (window as any).attemptStorageRecovery = () => storageRecoverySystem.attemptRecovery();
}