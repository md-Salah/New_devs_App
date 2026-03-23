/**
 * City Access Service - Single Source of Truth for User Cities
 * 
 * Provides centralized city fetching with:
 * - Request deduplication (prevents duplicate concurrent requests)
 * - Tenant isolation (clears cache on tenant switch)
 * - Error handling (typed errors for better UX)
 * - Caching (reduces unnecessary API calls)
 */

import type { City } from '../types';

export class CityAccessError extends Error {
  constructor(
    public code: 'MISSING_TENANT' | 'FETCH_FAILED' | 'NO_ACCESS' | 'NETWORK_ERROR',
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'CityAccessError';
  }
}

interface CityContext {
  userId: string;
  tenantId: string;
  email: string;
}

export class CityAccessService {
  private static instance: CityAccessService;
  private cities: City[] = [];
  private currentTenantId: string | null = null;
  private fetchPromise: Promise<City[]> | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    console.log('[CityAccessService] Initialized');
  }

  static getInstance(): CityAccessService {
    if (!CityAccessService.instance) {
      CityAccessService.instance = new CityAccessService();
    }
    return CityAccessService.instance;
  }

  /**
   * Get cities for user - single source of truth
   * All requests coalesce here to prevent duplicates
   */
  async getCities(context: CityContext): Promise<City[]> {
    const startTime = Date.now();

    try {
      // Validate tenant context FIRST
      if (!context.tenantId) {
        throw new CityAccessError(
          'MISSING_TENANT',
          'Cannot fetch cities without tenant context. Please re-login.',
          { userId: context.userId, email: context.email }
        );
      }

      // Tenant changed - clear cache
      if (this.currentTenantId && this.currentTenantId !== context.tenantId) {
        console.log('[CityAccessService] Tenant changed, clearing cache', {
          from: this.currentTenantId,
          to: context.tenantId
        });
        this.clearCache();
      }

      // Return pending request if exists (deduplication)
      if (this.fetchPromise) {
        console.log('[CityAccessService] Returning pending request');
        return await this.fetchPromise;
      }

      // Return cached if still valid
      if (this.isCacheValid(context.tenantId)) {
        console.log('[CityAccessService] Returning cached cities', {
          count: this.cities.length,
          age: Date.now() - this.lastFetchTime
        });
        return this.cities;
      }

      // Create new fetch
      console.log('[CityAccessService] Fetching cities from API', {
        userId: context.userId,
        tenantId: context.tenantId
      });
      
      this.fetchPromise = this.fetchCitiesFromAPI(context);

      try {
        this.cities = await this.fetchPromise;
        this.currentTenantId = context.tenantId;
        this.lastFetchTime = Date.now();
        
        this.trackFetch({
          success: true,
          cityCount: this.cities.length,
          tenantId: context.tenantId,
          userId: context.userId,
          latency: Date.now() - startTime,
          source: 'api'
        });
        
        return this.cities;
      } finally {
        this.fetchPromise = null;
      }
    } catch (error) {
      this.trackFetch({
        success: false,
        cityCount: 0,
        tenantId: context.tenantId,
        userId: context.userId,
        latency: Date.now() - startTime,
        source: 'api',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Fetch cities from backend API
   */
  private async fetchCitiesFromAPI(context: CityContext): Promise<City[]> {
    try {
      // Get access token from session storage or auth context
      const token = await this.getAccessToken();
      if (!token) {
        throw new CityAccessError('NETWORK_ERROR', 'No authentication token available');
      }

      const url = `${import.meta.env.VITE_BACKEND_URL || ''}/api/v1/fast/city-access?user_id=${context.userId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Tenant-ID': context.tenantId,
          'X-User-ID': context.userId
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 400) {
          throw new CityAccessError(
            'MISSING_TENANT',
            'Server could not determine tenant context',
            { status: response.status, body: errorText }
          );
        }
        
        if (response.status === 403) {
          throw new CityAccessError(
            'NO_ACCESS',
            'You do not have access to any cities',
            { status: response.status, body: errorText }
          );
        }
        
        throw new CityAccessError(
          'FETCH_FAILED',
          `Failed to fetch cities: ${response.statusText}`,
          { status: response.status, body: errorText }
        );
      }

      const data = await response.json();
      const cities = data.cities || [];
      
      console.log('[CityAccessService] Fetched cities successfully', {
        count: cities.length,
        tenantId: context.tenantId
      });
      
      return cities;
      
    } catch (error) {
      if (error instanceof CityAccessError) {
        throw error;
      }
      
      // Network or other errors
      throw new CityAccessError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : 'Unknown network error',
        { originalError: error }
      );
    }
  }

  /**
   * Get access token from storage or Supabase session
   */
  private async getAccessToken(): Promise<string | null> {
    try {
      // Try to import supabase client
      const { supabase } = await import('../lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('[CityAccessService] Failed to get access token:', error);
      return null;
    }
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(tenantId: string): boolean {
    if (this.cities.length === 0) return false;
    if (this.currentTenantId !== tenantId) return false;
    if (Date.now() - this.lastFetchTime > this.CACHE_DURATION) return false;
    return true;
  }

  /**
   * Clear cache - called on tenant switch
   */
  clearCache(): void {
    console.log('[CityAccessService] Clearing cache');
    this.cities = [];
    this.currentTenantId = null;
    this.fetchPromise = null;
    this.lastFetchTime = 0;
  }

  /**
   * Called by SecureCache when tenant switches
   */
  onTenantSwitch(newTenantId: string): void {
    if (this.currentTenantId !== newTenantId) {
      console.log('[CityAccessService] Tenant switch detected', {
        from: this.currentTenantId,
        to: newTenantId
      });
      this.clearCache();
    }
  }

  /**
   * Get current cached cities (if any)
   */
  getCachedCities(): City[] {
    return [...this.cities]; // Return copy to prevent mutations
  }

  /**
   * Check if cities are currently being fetched
   */
  isFetching(): boolean {
    return this.fetchPromise !== null;
  }

  /**
   * Track fetch metrics for monitoring
   */
  private trackFetch(result: {
    success: boolean;
    cityCount: number;
    tenantId: string | null;
    userId: string;
    latency: number;
    source: 'cache' | 'api';
    error?: string;
  }): void {
    // Log to console for debugging
    if (!result.success) {
      console.error('[CityAccessService] Fetch failed', result);
    } else if (result.cityCount === 0) {
      console.warn('[CityAccessService] No cities returned', result);
    }

    // Alert on security issues
    if (!result.tenantId) {
      console.error('[CityAccessService] SECURITY: Fetch without tenant context!', result);
    }

    // analytics.track('city_access_fetch', result);
  }
}

// Export singleton instance
export const cityAccessService = CityAccessService.getInstance();
