/**
 * Simplified Persistent Session Recovery
 * 
 * Provides 2-layer session recovery mechanism with server validation
 * to ensure users stay authenticated across app switching and browser restarts.
 * 
 * Recovery Layers:
 * 1. Current Supabase session (fastest)
 * 2. LocalStorage session data with server validation
 * 
 * Removed layers (over-engineered):
 * - IndexedDB backup (adds complexity without significant benefit)
 * - Server-side session lookup (not implemented, adds latency)
 */

import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { SecureAPI } from '../lib/secureApi';

export interface RecoveryResult {
  success: boolean;
  session: Session | null;
  method: 'current' | 'localStorage' | 'indexedDB' | 'serverLookup' | 'failed';
  error?: string;
  requiresUserAction?: boolean;
  metadata?: {
    attempts: number;
    duration: number;
    networkStatus: 'online' | 'offline';
    recoveryScore: number; // 0-100, confidence in recovery
  };
}

export interface SessionBackup {
  session: Session;
  deviceId: string;
  timestamp: number;
  tenantId?: string;
  userId: string;
  fingerprint: string;
}

export interface RecoveryOptions {
  maxAttempts?: number;
  timeoutMs?: number;
  allowServerLookup?: boolean;
  requireServerValidation?: boolean;
  fallbackToOffline?: boolean;
}

export class PersistentSessionRecovery {
  private static instance: PersistentSessionRecovery;
  private recoveryInProgress = false;
  private lastRecoveryAttempt = 0;
  private deviceId: string;
  private recoveryCache = new Map<string, RecoveryResult>();
  
  // Configuration
  private readonly RECOVERY_COOLDOWN = 30000; // 30 seconds between attempts
  private readonly CACHE_DURATION = 300000; // 5 minutes recovery result cache
  private readonly DEFAULT_TIMEOUT = 15000; // 15 seconds default timeout

  private constructor() {
    this.deviceId = this.getOrCreateDeviceId();
  }

  static getInstance(): PersistentSessionRecovery {
    if (!PersistentSessionRecovery.instance) {
      PersistentSessionRecovery.instance = new PersistentSessionRecovery();
    }
    return PersistentSessionRecovery.instance;
  }

  /**
   * Main recovery method with comprehensive fallback strategy
   */
  async recoverSession(options: RecoveryOptions = {}): Promise<RecoveryResult> {
    const startTime = Date.now();
    const opts = {
      maxAttempts: 3,
      timeoutMs: this.DEFAULT_TIMEOUT,
      allowServerLookup: true,
      requireServerValidation: true,
      fallbackToOffline: true,
      ...options
    };

    // Prevent concurrent recovery attempts
    if (this.recoveryInProgress) {
      console.log('[SessionRecovery] Recovery already in progress');
      await this.waitForRecoveryComplete();
    }

    // Check cooldown period
    if (Date.now() - this.lastRecoveryAttempt < this.RECOVERY_COOLDOWN) {
      console.log('[SessionRecovery] Recovery on cooldown');
      return this.createResult(false, null, 'failed', 'Recovery on cooldown');
    }

    // Check cache for recent recovery result
    const cacheKey = JSON.stringify(opts);
    const cachedResult = this.recoveryCache.get(cacheKey);
    if (cachedResult && (Date.now() - this.lastRecoveryAttempt) < this.CACHE_DURATION) {
      console.log('[SessionRecovery] Returning cached recovery result');
      return cachedResult;
    }

    this.recoveryInProgress = true;
    this.lastRecoveryAttempt = Date.now();
    
    let attempts = 0;
    let lastError = '';

    try {
      console.log('[SessionRecovery] Starting comprehensive session recovery...');

      while (attempts < opts.maxAttempts) {
        attempts++;
        console.log(`[SessionRecovery] Recovery attempt ${attempts}/${opts.maxAttempts}`);

        // Layer 1: Current Supabase session
        try {
          const currentResult = await this.recoverFromCurrentSession();
          if (currentResult.success) {
            console.log('[SessionRecovery] Recovered from current session');
            return this.cacheAndReturn(cacheKey, currentResult, startTime, attempts);
          }
          lastError = currentResult.error || 'Current session failed';
        } catch (error) {
          console.warn('[SessionRecovery] Current session recovery failed:', error);
          lastError = String(error);
        }

        // Layer 2: LocalStorage with server validation
        try {
          const localStorageResult = await this.recoverFromLocalStorage(opts.requireServerValidation);
          if (localStorageResult.success) {
            console.log('[SessionRecovery] Recovered from localStorage');
            return this.cacheAndReturn(cacheKey, localStorageResult, startTime, attempts);
          }
          lastError = localStorageResult.error || 'LocalStorage recovery failed';
        } catch (error) {
          console.warn('[SessionRecovery] LocalStorage recovery failed:', error);
          lastError = String(error);
        }

        // Layers 3 & 4 removed for simplicity:
        // - IndexedDB backup adds complexity without significant benefit
        // - Server-side lookup not implemented and adds latency
        // Two-layer recovery (Supabase + localStorage) is sufficient

        // Wait before retry (exponential backoff)
        if (attempts < opts.maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
          console.log(`[SessionRecovery] Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // All recovery methods failed
      console.error('[SessionRecovery] All recovery methods failed');
      const failureResult = this.createResult(
        false, 
        null, 
        'failed', 
        `All recovery attempts failed. Last error: ${lastError}`,
        true // requires user action
      );
      
      return this.cacheAndReturn(cacheKey, failureResult, startTime, attempts);

    } finally {
      this.recoveryInProgress = false;
    }
  }

  /**
   * Layer 1: Recover from current Supabase session
   */
  private async recoverFromCurrentSession(): Promise<RecoveryResult> {
    console.log('[SessionRecovery] Attempting recovery from current session...');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      return this.createResult(false, null, 'current', `Session error: ${error.message}`);
    }
    
    if (!session) {
      return this.createResult(false, null, 'current', 'No current session found');
    }

    // Validate session hasn't expired
    if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
      console.log('[SessionRecovery] Current session expired, attempting refresh...');
      
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError || !refreshedSession) {
        return this.createResult(false, null, 'current', 'Session expired and refresh failed');
      }
      
      return this.createResult(true, refreshedSession, 'current');
    }

    return this.createResult(true, session, 'current');
  }

  /**
   * Layer 2: Recover from localStorage with optional server validation
   */
  private async recoverFromLocalStorage(requireServerValidation: boolean = true): Promise<RecoveryResult> {
    console.log('[SessionRecovery] Attempting recovery from localStorage...');
    
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
      const storedData = localStorage.getItem(storageKey);
      
      if (!storedData) {
        return this.createResult(false, null, 'localStorage', 'No stored session data');
      }

      const parsed = JSON.parse(storedData);
      if (!parsed?.currentSession?.access_token) {
        return this.createResult(false, null, 'localStorage', 'Invalid stored session data');
      }

      const storedSession = parsed.currentSession;

      // Check if stored session is expired
      if (storedSession.expires_at && storedSession.expires_at * 1000 <= Date.now()) {
        console.log('[SessionRecovery] Stored session expired, attempting refresh...');
        
        if (!storedSession.refresh_token) {
          return this.createResult(false, null, 'localStorage', 'Stored session expired and no refresh token');
        }

        const { data: { session: refreshedSession }, error: refreshError } = 
          await supabase.auth.refreshSession({ refresh_token: storedSession.refresh_token });
        
        if (refreshError || !refreshedSession) {
          return this.createResult(false, null, 'localStorage', 'Stored session expired and refresh failed');
        }
        
        // Validate with server if required
        if (requireServerValidation && navigator.onLine) {
          const isValid = await this.validateSessionWithServer(refreshedSession);
          if (!isValid) {
            return this.createResult(false, null, 'localStorage', 'Server validation failed for refreshed session');
          }
        }
        
        return this.createResult(true, refreshedSession, 'localStorage');
      }

      // Use stored session directly
      const session: Session = {
        access_token: storedSession.access_token,
        refresh_token: storedSession.refresh_token,
        expires_in: storedSession.expires_in,
        expires_at: storedSession.expires_at,
        token_type: storedSession.token_type || 'bearer',
        user: storedSession.user
      };

      // Validate with server if required
      if (requireServerValidation && navigator.onLine) {
        const isValid = await this.validateSessionWithServer(session);
        if (!isValid) {
          return this.createResult(false, null, 'localStorage', 'Server validation failed');
        }
      }

      return this.createResult(true, session, 'localStorage');
      
    } catch (error) {
      return this.createResult(false, null, 'localStorage', `localStorage parsing error: ${error}`);
    }
  }

  /**
   * Clear recovery cache
   */
  async clearBackups(): Promise<boolean> {
    try {
      console.log('[SessionRecovery] Clearing recovery cache...');
      this.recoveryCache.clear();
      console.log('[SessionRecovery] Recovery cache cleared');
      return true;
    } catch (error) {
      console.error('[SessionRecovery] Failed to clear recovery cache:', error);
      return false;
    }
  }

  /**
   * Validate session with server
   */
  private async validateSessionWithServer(session: Session): Promise<boolean> {
    try {
      const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/auth/validate-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          session_id: `session_${session.user.id}_${this.deviceId}`,
          device_id: this.deviceId,
          user_id: session.user.id,
        }),
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.valid === true;
      
    } catch (error) {
      console.warn('[SessionRecovery] Server validation failed:', error);
      return false; // Assume invalid if server unreachable
    }
  }

  /**
   * Generate device fingerprint for security
   */
  private async generateDeviceFingerprint(): Promise<string> {
    const data = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      platform: navigator.platform,
      deviceId: this.deviceId
      // Removed timestamp for stable fingerprinting
    };
    
    const encoder = new TextEncoder();
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Utility methods
   */
  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  }

  private createResult(
    success: boolean,
    session: Session | null,
    method: RecoveryResult['method'],
    error?: string,
    requiresUserAction: boolean = false
  ): RecoveryResult {
    return {
      success,
      session,
      method,
      error,
      requiresUserAction,
      metadata: {
        attempts: 1,
        duration: 0,
        networkStatus: navigator.onLine ? 'online' : 'offline',
        recoveryScore: success ? 100 : 0
      }
    };
  }

  private cacheAndReturn(
    cacheKey: string,
    result: RecoveryResult,
    startTime: number,
    attempts: number
  ): RecoveryResult {
    result.metadata!.duration = Date.now() - startTime;
    result.metadata!.attempts = attempts;
    
    this.recoveryCache.set(cacheKey, result);
    return result;
  }

  private async waitForRecoveryComplete(): Promise<void> {
    while (this.recoveryInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// Export singleton instance
export const persistentSessionRecovery = PersistentSessionRecovery.getInstance();