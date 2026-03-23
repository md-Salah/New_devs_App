/**
 * Global cities cache to prevent duplicate API calls
 */

interface City {
  id: string;
  name: string;
  property_count?: number;
}

interface CacheEntry {
  data: City[];
  timestamp: number;
  loading: boolean;
  error: string | null;
}

class CitiesCache {
  private cache: Map<string, CacheEntry> = new Map();
  private listeners: Map<string, Set<() => void>> = new Map();
  private TTL = 5 * 60 * 1000; // 5 minutes cache

  getCacheKey(options: { userAccessibleOnly?: boolean; includePropertyCount?: boolean }): string {
    return `${options.userAccessibleOnly ? 'user' : 'all'}_${options.includePropertyCount ? 'count' : 'nocount'}`;
  }

  get(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if cache is expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry;
  }

  set(key: string, data: City[], error: string | null = null): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      loading: false,
      error
    });
    this.notifyListeners(key);
  }

  setLoading(key: string, loading: boolean): void {
    const entry = this.cache.get(key);
    if (entry) {
      entry.loading = loading;
      this.cache.set(key, entry);
    } else {
      this.cache.set(key, {
        data: [],
        timestamp: Date.now(),
        loading,
        error: null
      });
    }
    this.notifyListeners(key);
  }

  subscribe(key: string, callback: () => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  private notifyListeners(key: string): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      listeners.forEach(callback => callback());
    }
  }

  clear(): void {
    this.cache.clear();
    this.listeners.forEach(listeners => listeners.clear());
  }
}

export const citiesCache = new CitiesCache();