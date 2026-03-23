/**
 * Session Persistence Manager
 * 
 * Ensures sessions persist even when browser tabs are inactive/throttled.
 * Handles:
 * - Visibility-based session validation
 * - Proactive token refresh before expiry
 * - Network-resilient retry logic
 * - Activity tracking
 */

import { supabase } from '../lib/supabase';

export class SessionPersistenceManager {
  private static instance: SessionPersistenceManager;
  private refreshTimer: number | null = null;
  private lastActivity: number = Date.now();
  private visibilityChangeHandler: (() => void) | null = null;
  private isRefreshing: boolean = false;

  private constructor() {
    console.log('[SessionPersistence] Manager initialized');
  }

  static getInstance(): SessionPersistenceManager {
    if (!SessionPersistenceManager.instance) {
      SessionPersistenceManager.instance = new SessionPersistenceManager();
    }
    return SessionPersistenceManager.instance;
  }

  /**
   * Start session persistence monitoring
   */
  start(): void {
    console.log('[SessionPersistence] Starting session monitoring...');

    // 1. Monitor visibility changes for session recovery
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // 2. Proactive monitoring every 2 minutes
    this.refreshTimer = window.setInterval(
      () => this.checkAndRefresh(),
      2 * 60 * 1000
    );

    // 3. Track user activity
    ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
      window.addEventListener(event, () => {
        this.lastActivity = Date.now();
      }, { passive: true });
    });

    // 4. Initial check
    this.checkAndRefresh();
  }

  /**
   * Handle tab becoming visible - validate and recover session
   */
  private async handleVisibilityChange(): Promise<void> {
    if (document.visibilityState !== 'visible') {
      return;
    }

    const timeSinceActive = Date.now() - this.lastActivity;
    console.log(`[SessionPersistence] Tab visible after ${Math.floor(timeSinceActive / 1000)}s inactive`);

    // Always validate session when tab becomes visible
    await this.validateAndRecoverSession();
  }

  /**
   * Check session and refresh proactively if needed
   */
  private async checkAndRefresh(): Promise<void> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (!session || error) {
        // No session exists - this is normal for logged out users
        // Don't log as warning to avoid cluttering console
        return;
      }

      const timeUntilExpiry = (session.expires_at! * 1000) - Date.now();
      const minutesRemaining = Math.floor(timeUntilExpiry / 60000);

      // Refresh if less than 10 minutes remaining
      if (timeUntilExpiry < 10 * 60 * 1000 && timeUntilExpiry > 0) {
        console.log(`[SessionPersistence] Token expiring in ${minutesRemaining} min - refreshing proactively...`);
        await this.refreshWithRetry();
      } else if (timeUntilExpiry <= 0) {
        console.warn('[SessionPersistence] Token already expired - attempting recovery...');
        await this.refreshWithRetry();
      }
    } catch (error) {
      console.error('[SessionPersistence] Error in checkAndRefresh:', error);
    }
  }

  /**
   * Validate session and recover if invalid
   */
  private async validateAndRecoverSession(): Promise<void> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (!session || error) {
        // No session exists - user is not logged in
        // This is a normal state, not an error - don't try to recover
        return;
      }

      // Session exists - check if it needs refresh
      const timeUntilExpiry = (session.expires_at! * 1000) - Date.now();

      if (timeUntilExpiry < 5 * 60 * 1000) {
        console.log('[SessionPersistence] Token expiring soon after inactivity - refreshing...');
        await this.refreshWithRetry();
      } else {
        console.log('[SessionPersistence] ✅ Session still valid');
      }
    } catch (error) {
      console.error('[SessionPersistence] Error in validateAndRecoverSession:', error);
    }
  }

  /**
   * Refresh session with network-resilient retry logic
   */
  private async refreshWithRetry(maxRetries = 3): Promise<boolean> {
    // Prevent concurrent refresh attempts
    if (this.isRefreshing) {
      console.log('[SessionPersistence] Refresh already in progress, skipping...');
      return false;
    }

    this.isRefreshing = true;

    try {
      // First check if there's even a session to refresh
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!currentSession) {
        // No session to refresh - user is logged out
        return false;
      }

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[SessionPersistence] Refresh attempt ${attempt}/${maxRetries}...`);

          const { data, error } = await supabase.auth.refreshSession();

          if (data.session) {
            console.log(`[SessionPersistence] ✅ Refresh successful (attempt ${attempt})`);
            return true;
          }

          if (error) {
            // Don't log as warning for normal "no session" cases
            const isNoSessionError = error.message?.includes('Auth session missing') || 
                                    error.message?.includes('Invalid Refresh Token') ||
                                    error.message?.includes('not found');
            
            if (isNoSessionError) {
              // User is logged out - this is expected, not an error
              return false;
            }

            console.warn(`[SessionPersistence] Refresh attempt ${attempt} failed:`, error.message);

            // Exponential backoff before retry
            if (attempt < maxRetries) {
              const delay = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s
              console.log(`[SessionPersistence] Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        } catch (error: any) {
          // Check if this is a "no session" error
          const errorMessage = error?.message || String(error);
          const isNoSessionError = errorMessage.includes('Auth session missing') ||
                                  errorMessage.includes('Invalid Refresh Token');
          
          if (isNoSessionError) {
            // User is logged out - stop trying
            return false;
          }

          console.error(`[SessionPersistence] Refresh attempt ${attempt} exception:`, error);

          if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      console.error('[SessionPersistence] ❌ All refresh attempts failed');
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Stop session monitoring
   */
  stop(): void {
    console.log('[SessionPersistence] Stopping session monitoring...');

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
  }

  /**
   * Manually trigger session check (useful for testing)
   */
  async manualCheck(): Promise<void> {
    console.log('[SessionPersistence] Manual session check triggered');
    await this.validateAndRecoverSession();
  }
}

// Export singleton
export const sessionPersistenceManager = SessionPersistenceManager.getInstance();

// Add to window for debugging
if (typeof window !== 'undefined') {
  (window as any).debugSession = () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const expiresIn = Math.floor(((session.expires_at! * 1000) - Date.now()) / 1000);
        console.log('Session Debug:', {
          user: session.user.email,
          expiresIn: `${Math.floor(expiresIn / 60)} minutes ${expiresIn % 60} seconds`,
          expiresAt: new Date(session.expires_at! * 1000).toLocaleTimeString()
        });
      } else {
        console.log('No active session');
      }
    });
  };
}
