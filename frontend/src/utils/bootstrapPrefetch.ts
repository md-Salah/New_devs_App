import { SecureAPI } from '../lib/secureApi';
import { sessionManager } from './sessionManager';

// Use the same backend URL as SecureAPI
// In production, if VITE_BACKEND_URL is misconfigured, try to use a sensible default
const getBackendUrl = () => {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL;
  
  // If we have a configured URL that's not the frontend URL, use it
  if (configuredUrl && !configuredUrl.includes('pms.base360.ai')) {
    return configuredUrl;
  }
  
  // In production, if we're on pms.base360.ai, the backend is on the same domain
  if (window.location.hostname === 'pms.base360.ai') {
    console.log('[BootstrapPrefetch] Using production backend at pms.base360.ai');
    return 'https://pms.base360.ai';
  }
  
  // Default to localhost for development
  return 'http://localhost:8000';
};

const BACKEND_URL = getBackendUrl();

// Singleton to manage prefetch promise
class BootstrapPrefetchManager {
  private prefetchPromise: Promise<any> | null = null;
  private prefetchData: any = null;
  private prefetchStartTime: number = 0;
  private readonly MAX_RETRY_ATTEMPTS = 2; // Reduced retries for faster failure
  private readonly RETRY_DELAY_BASE = 500; // Reduced base delay for faster retries
  private retryCount = 0;
  private isAvailable = true; // Track if endpoint is available
  
  /**
   * Start prefetching bootstrap data with proper session validation and retry logic
   * This runs in parallel with other initialization
   * Non-blocking - failures won't affect auth flow
   */
  async startPrefetch(accessToken?: string): Promise<void> {
    // Skip if endpoint is not available (previously got 404)
    if (!this.isAvailable) {
      console.log('[BootstrapPrefetch] Bootstrap endpoint not available, skipping');
      return;
    }
    
    // Only prefetch if we haven't already started
    if (this.prefetchPromise) {
      console.log('[BootstrapPrefetch] Already prefetching, skipping duplicate request');
      return;
    }
    
    console.log('[BootstrapPrefetch] Starting bootstrap data prefetch (non-blocking)');
    this.prefetchStartTime = Date.now();
    this.retryCount = 0;
    
    // Start the prefetch with retry logic - but make it non-blocking
    this.prefetchPromise = this.performPrefetchWithRetry(accessToken)
      .catch((error) => {
        // Log error but don't throw - this is optional optimization
        console.warn('[BootstrapPrefetch] Bootstrap prefetch failed (non-critical):', error);
        // Return empty data so the app can continue
        return {
          user: null,
          tenant: null,
          company_settings: null,
          permissions: [],
          modules: [],
          smart_views: {},
          subsections: [],
          metadata: {},
          cache_info: { cache_hit: false, error: error.message }
        };
      });
    
    // Don't await here - let it run in background completely
  }
  
  /**
   * Performs the prefetch with retry logic
   */
  private async performPrefetchWithRetry(providedToken?: string): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`[BootstrapPrefetch] Prefetch attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}`);
        
        // Get a valid session token
        let accessToken = providedToken;
        
        // If no token provided or this is a retry, validate and get fresh token
        if (!accessToken || attempt > 1) {
          console.log('[BootstrapPrefetch] Validating session for prefetch...');
          const session = await sessionManager.ensureValidSession();
          
          if (!session || !session.access_token) {
            throw new Error('No valid session available for prefetch');
          }
          
          accessToken = session.access_token;
          console.log('[BootstrapPrefetch] Got valid session token');
        }
        
        console.log('[BootstrapPrefetch] Using backend URL:', BACKEND_URL);
        
        // Make the actual request (correct endpoint is /api/v1/bootstrap, not /api/v1/auth/bootstrap)
        const response = await fetch(`${BACKEND_URL}/api/v1/bootstrap`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'X-Request-Priority': 'high', // Signal this is a high priority request
          },
        });
        
        if (!response.ok) {
          // If we get 404, the endpoint doesn't exist - don't retry
          if (response.status === 404) {
            console.log('[BootstrapPrefetch] Endpoint not found (404) - disabling bootstrap prefetch');
            this.isAvailable = false;
            throw new Error(`Bootstrap endpoint not available (404) - this is non-critical`);
          }
          
          // If we get 401, the token might be invalid
          if (response.status === 401) {
            console.log('[BootstrapPrefetch] Got 401, invalidating session cache');
            sessionManager.invalidateCache();
            
            // On retry, we'll get a fresh token
            if (attempt < this.MAX_RETRY_ATTEMPTS) {
              throw new Error(`Authentication failed (401), will retry with fresh token`);
            }
          }
          
          throw new Error(`Bootstrap prefetch failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        this.prefetchData = data;
        const elapsed = Date.now() - this.prefetchStartTime;
        console.log(`[BootstrapPrefetch] Prefetch completed successfully in ${elapsed}ms`);
        this.retryCount = 0; // Reset retry count on success
        return data;
        
      } catch (error) {
        lastError = error as Error;
        console.error(`[BootstrapPrefetch] Attempt ${attempt} failed:`, error);
        
        // Don't retry if endpoint doesn't exist (404) or is marked unavailable
        if (!this.isAvailable || (error as Error).message.includes('404')) {
          console.log('[BootstrapPrefetch] Endpoint unavailable, stopping retries');
          break;
        }
        
        if (attempt < this.MAX_RETRY_ATTEMPTS) {
          // Exponential backoff with jitter
          const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt - 1) + Math.random() * 500;
          console.log(`[BootstrapPrefetch] Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error('Bootstrap prefetch failed after all retries');
  }
  
  /**
   * Get the prefetch promise if available
   * This allows AppContext to await the already-in-progress request
   */
  getPrefetchPromise(): Promise<any> | null {
    return this.prefetchPromise;
  }
  
  /**
   * Get prefetched data if available
   */
  getPrefetchedData(): any {
    return this.prefetchData;
  }
  
  /**
   * Clear prefetch data (on logout, tenant change, etc)
   */
  clearPrefetch(): void {
    console.log('[BootstrapPrefetch] Clearing prefetch data');
    this.prefetchPromise = null;
    this.prefetchData = null;
    this.prefetchStartTime = 0;
  }
  
  /**
   * Check if we have valid prefetched data
   */
  hasPrefetchedData(): boolean {
    return this.prefetchData !== null;
  }
}

// Export singleton instance
export const bootstrapPrefetch = new BootstrapPrefetchManager();