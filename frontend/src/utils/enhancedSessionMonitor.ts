/**
 * Enhanced Mobile-Friendly Session Monitor
 * 
 * Provides intelligent session monitoring that:
 * - Adapts to mobile app switching behavior
 * - Uses exponential backoff for network issues
 * - Implements graceful recovery patterns
 * - Reduces aggressive timeout behaviors
 * - Handles offline scenarios gracefully
 * - Provides smart battery optimization
 * - Implements user activity detection
 * - Supports background refresh strategies
 */

import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface SessionHealthStatus {
  status: 'healthy' | 'warning' | 'degraded' | 'critical' | 'offline';
  lastCheck: number;
  nextCheck: number;
  sessionExpiresIn?: number;
  consecutiveFailures: number;
  networkLatency?: number;
  userActivity: 'active' | 'idle' | 'background' | 'inactive';
  batteryOptimized: boolean;
  adaptiveInterval: number;
}

export interface MonitoringConfig {
  // Base intervals (will be adapted based on conditions)
  baseCheckInterval: number; // Default: 5 minutes
  maxCheckInterval: number;   // Maximum: 30 minutes
  minCheckInterval: number;   // Minimum: 1 minute
  
  // Failure handling
  maxConsecutiveFailures: number; // Default: 10 (increased from 3)
  exponentialBackoffMultiplier: number; // Default: 1.5
  maxBackoffDelay: number; // Maximum: 5 minutes
  
  // Token refresh timing
  refreshThreshold: number; // Refresh when token expires in X ms (default: 10 minutes)
  proactiveRefreshEnabled: boolean; // Enable proactive refresh
  
  // Mobile optimizations
  backgroundCheckInterval: number; // Longer interval when app in background
  batteryOptimizationEnabled: boolean;
  adaptToUserActivity: boolean;
  respectDataSaver: boolean;
  
  // Recovery settings
  gracefulRecoveryEnabled: boolean;
  offlineGraceDelay: number; // How long to wait before marking as offline
  networkRetryAttempts: number;
}

export interface UserActivityTracker {
  lastMouseMove: number;
  lastKeyPress: number;
  lastTouch: number;
  lastVisibilityChange: number;
  isVisible: boolean;
  userAgent: string;
  isMobile: boolean;
}

export class EnhancedSessionMonitor {
  private static instance: EnhancedSessionMonitor;
  private isMonitoring = false;
  private currentSession: Session | null = null;
  private healthStatus: SessionHealthStatus;
  private config: MonitoringConfig;
  private activityTracker: UserActivityTracker;
  
  // Timers and intervals
  private monitorInterval: NodeJS.Timeout | null = null;
  private backoffTimeout: NodeJS.Timeout | null = null;
  private proactiveRefreshTimeout: NodeJS.Timeout | null = null;
  
  // State management
  private consecutiveFailures = 0;
  private lastSuccessfulCheck = 0;
  private networkLatencyHistory: number[] = [];
  private isInBackground = false;
  private hasDataSaverMode = false;
  
  // Event listeners cleanup
  private eventCleanup: (() => void)[] = [];

  private constructor() {
    this.config = this.getDefaultConfig();
    this.activityTracker = this.initializeActivityTracker();
    this.healthStatus = this.initializeHealthStatus();
    this.setupEventListeners();
  }

  static getInstance(): EnhancedSessionMonitor {
    if (!EnhancedSessionMonitor.instance) {
      EnhancedSessionMonitor.instance = new EnhancedSessionMonitor();
    }
    return EnhancedSessionMonitor.instance;
  }

  /**
   * Start enhanced session monitoring with mobile optimizations
   */
  startMonitoring(session: Session, config?: Partial<MonitoringConfig>): void {
    if (this.isMonitoring) {
      console.log('[SessionMonitor] Already monitoring, updating session');
      this.updateSession(session);
      return;
    }

    console.log('[SessionMonitor] Starting enhanced mobile-friendly monitoring');
    
    if (config) {
      this.config = { ...this.config, ...config };
    }

    this.currentSession = session;
    this.isMonitoring = true;
    this.consecutiveFailures = 0;
    this.lastSuccessfulCheck = Date.now();
    
    // Reset health status
    this.healthStatus = this.initializeHealthStatus();
    
    // Start monitoring
    this.scheduleNextCheck();
    
    // Schedule proactive refresh if enabled
    if (this.config.proactiveRefreshEnabled) {
      this.scheduleProactiveRefresh();
    }
    
    console.log('[SessionMonitor] Enhanced monitoring started with config:', {
      baseInterval: this.config.baseCheckInterval,
      mobile: this.activityTracker.isMobile,
      batteryOptimized: this.healthStatus.batteryOptimized
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    console.log('[SessionMonitor] Stopping enhanced monitoring');
    
    this.isMonitoring = false;
    this.currentSession = null;
    
    // Clear all timers
    this.clearTimers();
    
    // Reset state
    this.consecutiveFailures = 0;
    this.networkLatencyHistory = [];
    
    this.healthStatus.status = 'offline';
  }

  /**
   * Get current health status
   */
  getHealthStatus(): SessionHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Force immediate health check
   */
  async checkHealth(): Promise<SessionHealthStatus> {
    if (!this.isMonitoring || !this.currentSession) {
      this.healthStatus.status = 'offline';
      return this.getHealthStatus();
    }

    await this.performHealthCheck();
    return this.getHealthStatus();
  }

  /**
   * Update session being monitored
   */
  updateSession(session: Session): void {
    this.currentSession = session;
    this.consecutiveFailures = 0;
    this.lastSuccessfulCheck = Date.now();
    
    // Reschedule proactive refresh
    if (this.config.proactiveRefreshEnabled) {
      this.scheduleProactiveRefresh();
    }
    
    console.log('[SessionMonitor] Session updated');
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Adjust current monitoring if active
    if (this.isMonitoring) {
      this.scheduleNextCheck();
    }
    
    console.log('[SessionMonitor] Configuration updated:', updates);
  }

  /**
   * Private implementation methods
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.currentSession) {
      this.healthStatus.status = 'offline';
      return;
    }

    const checkStart = Date.now();
    
    try {
      console.log('[SessionMonitor] Performing health check...');
      
      // Check if we're online
      if (!navigator.onLine) {
        this.handleOfflineState();
        return;
      }

      // Check token expiration
      const tokenStatus = this.checkTokenExpiration();
      if (tokenStatus === 'expired') {
        await this.handleExpiredToken();
        return;
      } else if (tokenStatus === 'expiring') {
        this.healthStatus.status = 'warning';
      }

      // Validate session with Supabase
      const isValid = await this.validateSessionWithSupabase();
      
      if (isValid) {
        this.handleSuccessfulCheck(checkStart);
      } else {
        this.handleFailedCheck('Session validation failed');
      }

    } catch (error) {
      console.error('[SessionMonitor] Health check error:', error);
      this.handleFailedCheck(String(error));
    }
  }

  private checkTokenExpiration(): 'valid' | 'expiring' | 'expired' {
    if (!this.currentSession?.expires_at) {
      return 'valid';
    }

    const now = Date.now();
    const expiresAt = this.currentSession.expires_at * 1000;
    const timeUntilExpiry = expiresAt - now;

    if (timeUntilExpiry <= 0) {
      return 'expired';
    }

    if (timeUntilExpiry <= this.config.refreshThreshold) {
      return 'expiring';
    }

    return 'valid';
  }

  private async validateSessionWithSupabase(): Promise<boolean> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      return !error && !!user;
    } catch (error) {
      console.error('[SessionMonitor] Session validation error:', error);
      return false;
    }
  }

  private async handleExpiredToken(): Promise<void> {
    console.log('[SessionMonitor] Token expired, attempting refresh...');
    
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();
      
      if (error || !session) {
        console.error('[SessionMonitor] Token refresh failed:', error);
        this.healthStatus.status = 'critical';
        this.consecutiveFailures = this.config.maxConsecutiveFailures; // Force logout
      } else {
        console.log('[SessionMonitor] Token refreshed successfully');
        this.currentSession = session;
        this.healthStatus.status = 'healthy';
        this.consecutiveFailures = 0;
        this.lastSuccessfulCheck = Date.now();
      }
    } catch (error) {
      console.error('[SessionMonitor] Token refresh error:', error);
      this.healthStatus.status = 'critical';
    }
  }

  private handleSuccessfulCheck(checkStart: number): void {
    const latency = Date.now() - checkStart;
    this.networkLatencyHistory.push(latency);
    
    // Keep only recent latency measurements
    if (this.networkLatencyHistory.length > 10) {
      this.networkLatencyHistory.shift();
    }

    this.healthStatus.networkLatency = latency;
    this.healthStatus.status = 'healthy';
    this.healthStatus.lastCheck = Date.now();
    this.consecutiveFailures = 0;
    this.lastSuccessfulCheck = Date.now();

    // Reset adaptive interval on success
    this.healthStatus.adaptiveInterval = this.getAdaptiveInterval();
    
    console.log(`[SessionMonitor] Health check successful (${latency}ms)`);
    this.scheduleNextCheck();
  }

  private handleFailedCheck(reason: string): void {
    this.consecutiveFailures++;
    this.healthStatus.consecutiveFailures = this.consecutiveFailures;
    this.healthStatus.lastCheck = Date.now();

    console.warn(`[SessionMonitor] Health check failed (${this.consecutiveFailures}/${this.config.maxConsecutiveFailures}): ${reason}`);

    // Determine status based on failure count
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      this.healthStatus.status = 'critical';
      this.handleCriticalFailure();
    } else if (this.consecutiveFailures >= this.config.maxConsecutiveFailures * 0.7) {
      this.healthStatus.status = 'degraded';
    } else {
      this.healthStatus.status = 'warning';
    }

    // Apply exponential backoff
    this.scheduleNextCheckWithBackoff();
  }

  private handleOfflineState(): void {
    console.log('[SessionMonitor] Device offline, entering grace period');
    
    this.healthStatus.status = 'offline';
    this.healthStatus.lastCheck = Date.now();
    
    // Schedule check with longer interval when offline
    this.scheduleNextCheck(this.config.backgroundCheckInterval);
  }

  private handleCriticalFailure(): void {
    console.error('[SessionMonitor] Critical session failure detected');
    
    // In the original implementation, this would force logout
    // In our enhanced version, we're more graceful
    
    if (this.config.gracefulRecoveryEnabled) {
      console.log('[SessionMonitor] Attempting graceful recovery...');
      
      // Try to recover session before giving up
      this.attemptGracefulRecovery();
    } else {
      console.warn('[SessionMonitor] Max failures reached, but graceful recovery disabled');
      // Don't force logout immediately - let the app handle this
    }
  }

  private async attemptGracefulRecovery(): Promise<void> {
    try {
      console.log('[SessionMonitor] Attempting session recovery...');
      
      // Try to get fresh session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (!error && session) {
        console.log('[SessionMonitor] Session recovery successful');
        this.currentSession = session;
        this.consecutiveFailures = 0;
        this.healthStatus.status = 'healthy';
        this.lastSuccessfulCheck = Date.now();
        return;
      }
      
      // Try refresh as last resort
      const { data: { session: refreshedSession }, error: refreshError } = 
        await supabase.auth.refreshSession();
      
      if (!refreshError && refreshedSession) {
        console.log('[SessionMonitor] Recovery via refresh successful');
        this.currentSession = refreshedSession;
        this.consecutiveFailures = 0;
        this.healthStatus.status = 'healthy';
        this.lastSuccessfulCheck = Date.now();
      } else {
        console.error('[SessionMonitor] Graceful recovery failed');
        // Let the app decide what to do (don't force logout)
      }
      
    } catch (error) {
      console.error('[SessionMonitor] Recovery attempt failed:', error);
    }
  }

  private scheduleNextCheck(customInterval?: number): void {
    this.clearTimers();
    
    const interval = customInterval || this.getAdaptiveInterval();
    this.healthStatus.adaptiveInterval = interval;
    this.healthStatus.nextCheck = Date.now() + interval;
    
    this.monitorInterval = setTimeout(() => {
      this.performHealthCheck();
    }, interval);
  }

  private scheduleNextCheckWithBackoff(): void {
    const backoffDelay = Math.min(
      this.config.baseCheckInterval * Math.pow(this.config.exponentialBackoffMultiplier, this.consecutiveFailures - 1),
      this.config.maxBackoffDelay
    );
    
    console.log(`[SessionMonitor] Scheduling next check with backoff: ${backoffDelay}ms`);
    this.scheduleNextCheck(backoffDelay);
  }

  private scheduleProactiveRefresh(): void {
    if (!this.currentSession?.expires_at || this.proactiveRefreshTimeout) {
      return;
    }

    const now = Date.now();
    const expiresAt = this.currentSession.expires_at * 1000;
    const refreshTime = expiresAt - this.config.refreshThreshold;
    const delay = Math.max(0, refreshTime - now);

    if (delay > 0) {
      this.proactiveRefreshTimeout = setTimeout(async () => {
        console.log('[SessionMonitor] Executing proactive token refresh...');
        
        try {
          const { data: { session }, error } = await supabase.auth.refreshSession();
          
          if (!error && session) {
            console.log('[SessionMonitor] Proactive refresh successful');
            this.currentSession = session;
            this.scheduleProactiveRefresh(); // Schedule next refresh
          } else {
            console.error('[SessionMonitor] Proactive refresh failed:', error);
          }
        } catch (error) {
          console.error('[SessionMonitor] Proactive refresh error:', error);
        }
      }, delay);
      
      console.log(`[SessionMonitor] Proactive refresh scheduled in ${delay}ms`);
    }
  }

  private getAdaptiveInterval(): number {
    let interval = this.config.baseCheckInterval;

    // Adapt based on user activity
    if (this.config.adaptToUserActivity) {
      const userActivity = this.getUserActivityLevel();
      
      switch (userActivity) {
        case 'active':
          interval = this.config.baseCheckInterval;
          break;
        case 'idle':
          interval = this.config.baseCheckInterval * 2;
          break;
        case 'background':
          interval = this.config.backgroundCheckInterval;
          break;
        case 'inactive':
          interval = this.config.maxCheckInterval;
          break;
      }
    }

    // Adapt based on network conditions
    if (this.networkLatencyHistory.length > 0) {
      const avgLatency = this.networkLatencyHistory.reduce((a, b) => a + b, 0) / this.networkLatencyHistory.length;
      
      // Increase interval if network is slow
      if (avgLatency > 5000) { // 5 seconds
        interval *= 2;
      }
    }

    // Apply battery optimization
    if (this.config.batteryOptimizationEnabled && this.isBatteryOptimizationNeeded()) {
      interval *= 1.5;
      this.healthStatus.batteryOptimized = true;
    } else {
      this.healthStatus.batteryOptimized = false;
    }

    // Apply data saver mode
    if (this.config.respectDataSaver && this.hasDataSaverMode) {
      interval *= 2;
    }

    // Ensure interval is within bounds
    return Math.max(
      this.config.minCheckInterval,
      Math.min(interval, this.config.maxCheckInterval)
    );
  }

  private getUserActivityLevel(): 'active' | 'idle' | 'background' | 'inactive' {
    const now = Date.now();
    const idleThreshold = 30000; // 30 seconds
    const inactiveThreshold = 300000; // 5 minutes

    // Check if app is in background
    if (!this.activityTracker.isVisible) {
      return 'background';
    }

    // Check for recent user input
    const lastActivity = Math.max(
      this.activityTracker.lastMouseMove,
      this.activityTracker.lastKeyPress,
      this.activityTracker.lastTouch
    );

    const timeSinceActivity = now - lastActivity;

    if (timeSinceActivity < idleThreshold) {
      return 'active';
    } else if (timeSinceActivity < inactiveThreshold) {
      return 'idle';
    } else {
      return 'inactive';
    }
  }

  private isBatteryOptimizationNeeded(): boolean {
    // Check if device is on battery and low
    if ('getBattery' in navigator) {
      // This API is deprecated but still useful where available
      return false; // Simplified for now
    }
    
    // Fallback: optimize on mobile devices
    return this.activityTracker.isMobile;
  }

  private clearTimers(): void {
    if (this.monitorInterval) {
      clearTimeout(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.backoffTimeout) {
      clearTimeout(this.backoffTimeout);
      this.backoffTimeout = null;
    }
    
    if (this.proactiveRefreshTimeout) {
      clearTimeout(this.proactiveRefreshTimeout);
      this.proactiveRefreshTimeout = null;
    }
  }

  private initializeActivityTracker(): UserActivityTracker {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    return {
      lastMouseMove: Date.now(),
      lastKeyPress: Date.now(),
      lastTouch: Date.now(),
      lastVisibilityChange: Date.now(),
      isVisible: !document.hidden,
      userAgent,
      isMobile
    };
  }

  private initializeHealthStatus(): SessionHealthStatus {
    return {
      status: 'offline',
      lastCheck: 0,
      nextCheck: 0,
      consecutiveFailures: 0,
      userActivity: 'active',
      batteryOptimized: false,
      adaptiveInterval: this.config.baseCheckInterval
    };
  }

  private getDefaultConfig(): MonitoringConfig {
    return {
      baseCheckInterval: 5 * 60 * 1000, // 5 minutes (increased from 30s)
      maxCheckInterval: 30 * 60 * 1000, // 30 minutes
      minCheckInterval: 60 * 1000,      // 1 minute
      
      maxConsecutiveFailures: 10, // Increased from 3
      exponentialBackoffMultiplier: 1.5,
      maxBackoffDelay: 5 * 60 * 1000, // 5 minutes
      
      refreshThreshold: 10 * 60 * 1000, // 10 minutes (increased from 30s)
      proactiveRefreshEnabled: true,
      
      backgroundCheckInterval: 15 * 60 * 1000, // 15 minutes
      batteryOptimizationEnabled: true,
      adaptToUserActivity: true,
      respectDataSaver: true,
      
      gracefulRecoveryEnabled: true,
      offlineGraceDelay: 30 * 1000, // 30 seconds
      networkRetryAttempts: 3
    };
  }

  private setupEventListeners(): void {
    // Visibility change (app switching)
    const visibilityHandler = () => {
      this.activityTracker.isVisible = !document.hidden;
      this.activityTracker.lastVisibilityChange = Date.now();
      
      if (!document.hidden && this.isMonitoring) {
        // App became visible, do a health check
        console.log('[SessionMonitor] App became visible, performing health check');
        this.performHealthCheck();
      }
    };
    
    document.addEventListener('visibilitychange', visibilityHandler);
    this.eventCleanup.push(() => document.removeEventListener('visibilitychange', visibilityHandler));

    // User activity tracking
    const activityHandler = () => {
      this.activityTracker.lastMouseMove = Date.now();
    };
    
    const keyHandler = () => {
      this.activityTracker.lastKeyPress = Date.now();
    };
    
    const touchHandler = () => {
      this.activityTracker.lastTouch = Date.now();
    };

    document.addEventListener('mousemove', activityHandler, { passive: true });
    document.addEventListener('keydown', keyHandler, { passive: true });
    document.addEventListener('touchstart', touchHandler, { passive: true });
    
    this.eventCleanup.push(() => {
      document.removeEventListener('mousemove', activityHandler);
      document.removeEventListener('keydown', keyHandler);
      document.removeEventListener('touchstart', touchHandler);
    });

    // Network status
    const onlineHandler = () => {
      console.log('[SessionMonitor] Network back online');
      if (this.isMonitoring) {
        this.performHealthCheck();
      }
    };
    
    const offlineHandler = () => {
      console.log('[SessionMonitor] Network offline');
      this.handleOfflineState();
    };

    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
    
    this.eventCleanup.push(() => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('offline', offlineHandler);
    });

    // Data saver detection
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      if (connection && 'saveData' in connection) {
        this.hasDataSaverMode = connection.saveData;
      }
    }
  }

  /**
   * Cleanup when monitor is destroyed
   */
  destroy(): void {
    this.stopMonitoring();
    
    // Remove event listeners
    this.eventCleanup.forEach(cleanup => cleanup());
    this.eventCleanup = [];
  }
}

// Export singleton instance
export const enhancedSessionMonitor = EnhancedSessionMonitor.getInstance();