/**
 * Cache Debugger
 * Helps track and debug cache usage in development
 */

interface CacheEvent {
  timestamp: Date;
  type: 'hit' | 'miss' | 'stale' | 'invalidate' | 'error';
  source: 'redis' | 'local' | 'none';
  subsectionId?: string;
  details?: any;
}

class CacheDebugger {
  private events: CacheEvent[] = [];
  private enabled: boolean = false;
  private maxEvents: number = 100;

  constructor() {
    // Enable debugging in development or with query param
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      this.enabled = urlParams.get('debug_cache') === 'true' || 
                    process.env.NODE_ENV === 'development';
    }
  }

  log(event: Omit<CacheEvent, 'timestamp'>) {
    if (!this.enabled) {
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          this.enabled = true;
        }
      }

      if (!this.enabled && process.env.NODE_ENV === 'development') {
        this.enabled = true;
      }
    }

    if (!this.enabled) return;

    const fullEvent: CacheEvent = {
      ...event,
      timestamp: new Date()
    };

    this.events.push(fullEvent);
    
    // Keep only last N events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Console log with color coding
    this.consoleLog(fullEvent);
  }

  private consoleLog(event: CacheEvent) {
    const timestamp = event.timestamp.toLocaleTimeString();
    const subsection = event.subsectionId ? ` [${event.subsectionId}]` : '';
    
    let style = '';
    let emoji = '';
    
    switch (event.type) {
      case 'hit':
        style = 'color: green; font-weight: bold';
        emoji = '✅';
        break;
      case 'miss':
        style = 'color: orange; font-weight: bold';
        emoji = '❌';
        break;
      case 'stale':
        style = 'color: yellow; font-weight: bold';
        emoji = '📦';
        break;
      case 'invalidate':
        style = 'color: blue; font-weight: bold';
        emoji = '🗑️';
        break;
      case 'error':
        style = 'color: red; font-weight: bold';
        emoji = '⚠️';
        break;
    }

    console.log(
      `%c${emoji} Cache ${event.type.toUpperCase()} [${event.source.toUpperCase()}]${subsection} @ ${timestamp}`,
      style,
      event.details || ''
    );
  }

  getStats() {
    const stats = {
      total: this.events.length,
      hits: 0,
      misses: 0,
      stale: 0,
      invalidations: 0,
      errors: 0,
      redisHits: 0,
      localHits: 0,
      hitRate: 0
    };

    this.events.forEach(event => {
      switch (event.type) {
        case 'hit':
          stats.hits++;
          if (event.source === 'redis') stats.redisHits++;
          else if (event.source === 'local') stats.localHits++;
          break;
        case 'miss':
          stats.misses++;
          break;
        case 'stale':
          stats.stale++;
          break;
        case 'invalidate':
          stats.invalidations++;
          break;
        case 'error':
          stats.errors++;
          break;
      }
    });

    const totalRequests = stats.hits + stats.misses;
    if (totalRequests > 0) {
      stats.hitRate = (stats.hits / totalRequests) * 100;
    }

    return stats;
  }

  printSummary() {
    if (!this.enabled) return;

    const stats = this.getStats();
    
    console.group('📊 Cache Performance Summary');
    console.log(`Hit Rate: ${stats.hitRate.toFixed(1)}%`);
    console.log(`Total Hits: ${stats.hits} (Redis: ${stats.redisHits}, Local: ${stats.localHits})`);
    console.log(`Total Misses: ${stats.misses}`);
    console.log(`Stale Hits: ${stats.stale}`);
    console.log(`Invalidations: ${stats.invalidations}`);
    console.log(`Errors: ${stats.errors}`);
    console.groupEnd();
  }

  getEvents() {
    return this.events;
  }

  clear() {
    this.events = [];
  }

  enable() {
    this.enabled = true;
    console.log('🔍 Cache debugging enabled');
  }

  disable() {
    this.enabled = false;
    console.log('🔍 Cache debugging disabled');
  }
}

// Create singleton instance
export const cacheDebugger = new CacheDebugger();

// Export convenience functions
export function logCacheHit(source: 'redis' | 'local', subsectionId?: string, details?: any) {
  cacheDebugger.log({ type: 'hit', source, subsectionId, details });
}

export function logCacheMiss(source: 'redis' | 'local', subsectionId?: string, details?: any) {
  cacheDebugger.log({ type: 'miss', source, subsectionId, details });
}

export function logCacheStale(source: 'redis' | 'local', subsectionId?: string, details?: any) {
  cacheDebugger.log({ type: 'stale', source, subsectionId, details });
}

export function logCacheInvalidate(source: 'redis' | 'local', subsectionId?: string, details?: any) {
  cacheDebugger.log({ type: 'invalidate', source, subsectionId, details });
}

export function logCacheError(source: 'redis' | 'local', subsectionId?: string, details?: any) {
  cacheDebugger.log({ type: 'error', source, subsectionId, details });
}

// Auto-print summary every 30 seconds in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    cacheDebugger.printSummary();
  }, 30000);
}

// Add global function for console access
if (typeof window !== 'undefined') {
  (window as any).cacheDebugger = cacheDebugger;
  (window as any).cacheStats = () => cacheDebugger.printSummary();
}
