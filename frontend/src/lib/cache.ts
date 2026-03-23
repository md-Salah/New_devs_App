// Cache utility for financial data with 3-hour expiration
interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const CACHE_PREFIX = 'finance_cache_';

export class FinanceCache {
  private static generateKey(key: string, filters?: Record<string, any>): string {
    const filterString = filters ? JSON.stringify(filters) : '';
    return `${CACHE_PREFIX}${key}_${btoa(filterString)}`;
  }

  static set<T>(key: string, data: T, filters?: Record<string, any>): void {
    try {
      const cacheKey = this.generateKey(key, filters);
      const now = Date.now();
      const cacheItem: CacheItem<T> = {
        data,
        timestamp: now,
        expiresAt: now + CACHE_DURATION
      };
      
      localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      console.log(`Cache set for key: ${key}, expires in 3 hours`);
    } catch (error) {
      console.warn('Failed to set cache:', error);
    }
  }

  static get<T>(key: string, filters?: Record<string, any>): T | null {
    try {
      const cacheKey = this.generateKey(key, filters);
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        return null;
      }

      const cacheItem: CacheItem<T> = JSON.parse(cached);
      const now = Date.now();

      // Check if cache has expired
      if (now > cacheItem.expiresAt) {
        localStorage.removeItem(cacheKey);
        console.log(`Cache expired for key: ${key}`);
        return null;
      }

      console.log(`Cache hit for key: ${key}, ${Math.round((cacheItem.expiresAt - now) / 1000 / 60)} minutes remaining`);
      return cacheItem.data;
    } catch (error) {
      console.warn('Failed to get cache:', error);
      return null;
    }
  }

  static invalidate(key: string, filters?: Record<string, any>): void {
    try {
      const cacheKey = this.generateKey(key, filters);
      localStorage.removeItem(cacheKey);
      console.log(`Cache invalidated for key: ${key}`);
    } catch (error) {
      console.warn('Failed to invalidate cache:', error);
    }
  }

  static invalidateAll(): void {
    try {
      const keys = Object.keys(localStorage);
      const financeKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      financeKeys.forEach(key => localStorage.removeItem(key));
      console.log(`Invalidated ${financeKeys.length} finance cache entries`);
    } catch (error) {
      console.warn('Failed to invalidate all cache:', error);
    }
  }

  static getCacheInfo(key: string, filters?: Record<string, any>): { exists: boolean; expiresAt?: number; timeRemaining?: number } {
    try {
      const cacheKey = this.generateKey(key, filters);
      const cached = localStorage.getItem(cacheKey);
      
      if (!cached) {
        return { exists: false };
      }

      const cacheItem: CacheItem<any> = JSON.parse(cached);
      const now = Date.now();
      const timeRemaining = Math.max(0, cacheItem.expiresAt - now);

      return {
        exists: true,
        expiresAt: cacheItem.expiresAt,
        timeRemaining
      };
    } catch (error) {
      return { exists: false };
    }
  }

  static getTimeUntilExpiry(key: string, filters?: Record<string, any>): string {
    const info = this.getCacheInfo(key, filters);
    
    if (!info.exists || !info.timeRemaining) {
      return 'No cache';
    }

    const minutes = Math.floor(info.timeRemaining / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    } else {
      return `${remainingMinutes}m`;
    }
  }
}
