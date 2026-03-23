/**
 * Session Health Monitor - Proactively monitors and maintains session health
 * 
 * This module runs in the background to:
 * - Periodically check session validity
 * - Refresh tokens before they expire
 * - Detect and recover from session issues
 * - Ensure smooth user experience without auth interruptions
 */

import { sessionManager } from './sessionManager';
import { bootstrapPrefetch } from './bootstrapPrefetch';
import { SecureAPI } from '../lib/secureApi';
import { supabase } from '../lib/supabase';

export interface SessionHealthStatus {
  healthy: boolean;
  lastCheckTime: number;
  nextCheckTime: number;
  sessionExpiresIn?: number;
  issues?: string[];
}

class SessionHealthMonitor {
  private static instance: SessionHealthMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private lastHealthCheck: SessionHealthStatus | null = null;
  private readonly CHECK_INTERVAL = 300000; // Check every 5 minutes for better session maintenance
  private readonly REFRESH_THRESHOLD = 1800000; // Refresh if token expires in less than 30 minutes
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3; // Reduce to catch issues faster but handle them gracefully

  private constructor() {}

  static getInstance(): SessionHealthMonitor {
    if (!SessionHealthMonitor.instance) {
      SessionHealthMonitor.instance = new SessionHealthMonitor();
    }
    return SessionHealthMonitor.instance;
  }

  /**
   * Starts the health monitoring process
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      console.log('[SessionHealthMonitor] Already monitoring');
      return;
    }

    console.log('[SessionHealthMonitor] Starting session health monitoring');
    this.isMonitoring = true;
    this.consecutiveFailures = 0;

    // Perform initial check
    this.performHealthCheck();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stops the health monitoring process
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    console.log('[SessionHealthMonitor] Stopping session health monitoring');
    this.isMonitoring = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Performs a health check on the current session
   */
  private async performHealthCheck(): Promise<void> {
    try {
      console.log('[SessionHealthMonitor] Performing health check...');
      
      const validation = await sessionManager.validateSession();
      const now = Date.now();
      const issues: string[] = [];
      let sessionExpiresIn: number | undefined;

      if (!validation.isValid || !validation.session) {
        issues.push('Session is invalid or missing');
        
        // Attempt to recover
        console.log('[SessionHealthMonitor] Session invalid, attempting recovery...');
        const recovered = await sessionManager.refreshSession();
        
        if (recovered) {
          console.log('[SessionHealthMonitor] Session recovered successfully');
          // Clear SecureAPI cache to use new token
          SecureAPI.setAccessToken(recovered.access_token);
          // Clear bootstrap prefetch to refresh with new session
          bootstrapPrefetch.clearPrefetch();
        } else {
          issues.push('Failed to recover session');
          this.consecutiveFailures++;
        }
      } else {
        const session = validation.session;
        
        // Check token expiration
        if (session.expires_at) {
          sessionExpiresIn = session.expires_at * 1000 - now;
          
          if (sessionExpiresIn < 0) {
            issues.push('Token has expired');
          } else if (sessionExpiresIn < this.REFRESH_THRESHOLD) {
            // Proactively refresh token before it expires
            console.log(`[SessionHealthMonitor] Token expiring in ${Math.round(sessionExpiresIn / 1000)}s, refreshing...`);
            
            const refreshed = await sessionManager.refreshSession();
            if (refreshed) {
              console.log('[SessionHealthMonitor] Token refreshed proactively');
              SecureAPI.setAccessToken(refreshed.access_token);
              sessionExpiresIn = refreshed.expires_at ? refreshed.expires_at * 1000 - now : undefined;
            } else {
              issues.push('Failed to refresh expiring token');
            }
          }
        }

        // Reset consecutive failures on successful check
        if (issues.length === 0) {
          this.consecutiveFailures = 0;
        }
      }

      // Update health status
      this.lastHealthCheck = {
        healthy: issues.length === 0,
        lastCheckTime: now,
        nextCheckTime: now + this.CHECK_INTERVAL,
        sessionExpiresIn,
        issues: issues.length > 0 ? issues : undefined
      };

      if (issues.length > 0) {
        console.warn('[SessionHealthMonitor] Health check found issues:', issues);
        
        // If we've had too many consecutive failures, take drastic action
        if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          console.error('[SessionHealthMonitor] Too many consecutive failures, clearing auth state');
          await this.handleCriticalFailure();
        }
      } else {
        console.log('[SessionHealthMonitor] Health check passed');
      }
    } catch (error) {
      console.error('[SessionHealthMonitor] Health check error:', error);
      this.consecutiveFailures++;
      
      this.lastHealthCheck = {
        healthy: false,
        lastCheckTime: Date.now(),
        nextCheckTime: Date.now() + this.CHECK_INTERVAL,
        issues: ['Health check failed: ' + (error as Error).message]
      };
      
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        await this.handleCriticalFailure();
      }
    }
  }

  /**
   */
  private async handleCriticalFailure(): Promise<void> {
    console.error('[SessionHealthMonitor] Handling critical session failure');
    
    try {
      // Stop monitoring to prevent loops
      this.stopMonitoring();
      
      // Try one last time to refresh the session
      console.log('[SessionHealthMonitor] Attempting final session recovery...');
      const recovered = await sessionManager.refreshSession();
      
      if (recovered) {
        console.log('[SessionHealthMonitor] Final recovery successful, resuming monitoring');
        // Reset failures and resume monitoring
        this.consecutiveFailures = 0;
        this.startMonitoring();
        return;
      }
      
      // Try to recover session from storage one more time
      console.log('[SessionHealthMonitor] Attempting to recover session from storage...');
      
      try {
        // Force Supabase to check localStorage again
        const { data: { session: storageSession } } = await supabase.auth.getSession();
        
        if (storageSession) {
          console.log('[SessionHealthMonitor] Session recovered from storage!');
          // Reset failures and resume monitoring
          this.consecutiveFailures = 0;
          this.startMonitoring();
          return;
        }
      } catch (storageError) {
        console.error('[SessionHealthMonitor] Storage recovery failed:', storageError);
      }
      
      // Only log the issue, don't clear auth or redirect
      // This prevents losing user work and unwanted logouts
      const publicPaths = ['/login', '/signup', '/reset-password', '/public'];
      const isPublicPath = publicPaths.some(path => window.location.pathname.includes(path));
      
      if (typeof window !== 'undefined' && !isPublicPath) {
        console.warn('[SessionHealthMonitor] Session issues detected after', this.consecutiveFailures, 'attempts.');
        console.warn('[SessionHealthMonitor] User may need to refresh the page if issues persist.');
        // DO NOT automatically clear auth state or redirect
        // Just reset the failure counter to try again later
        this.consecutiveFailures = 0;
      }
    } catch (error) {
      console.error('[SessionHealthMonitor] Error handling critical failure:', error);
      // Reset failures to prevent infinite loops
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Gets the current health status
   */
  getHealthStatus(): SessionHealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Checks if the session is currently healthy
   */
  isHealthy(): boolean {
    return this.lastHealthCheck?.healthy || false;
  }

  /**
   * Forces an immediate health check
   */
  async checkNow(): Promise<SessionHealthStatus> {
    await this.performHealthCheck();
    return this.lastHealthCheck || {
      healthy: false,
      lastCheckTime: Date.now(),
      nextCheckTime: Date.now() + this.CHECK_INTERVAL,
      issues: ['No health check performed yet']
    };
  }

  /**
   * Resets the monitor state
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.lastHealthCheck = null;
    console.log('[SessionHealthMonitor] Monitor state reset');
  }
}

// Export singleton instance
export const sessionHealthMonitor = SessionHealthMonitor.getInstance();