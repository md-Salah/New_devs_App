import React, { ReactNode, useState, useEffect, useCallback } from 'react';
import { AlertCircle, Wifi, WifiOff, Clock, Shield } from 'lucide-react';

// Types for degradation levels
export type DegradationLevel = 'none' | 'minimal' | 'moderate' | 'severe';

export interface DegradationState {
  level: DegradationLevel;
  reasons: string[];
  capabilities: {
    canSave: boolean;
    canLoad: boolean;
    canSync: boolean;
    canNotify: boolean;
  };
}

export interface FeatureConfig {
  name: string;
  essential: boolean;
  fallback?: ReactNode;
  retryInterval?: number;
  maxRetries?: number;
}

// Monitor system health and determine degradation level
export const useSystemHealth = () => {
  const [degradationState, setDegradationState] = useState<DegradationState>({
    level: 'none',
    reasons: [],
    capabilities: {
      canSave: true,
      canLoad: true,
      canSync: true,
      canNotify: true,
    },
  });

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [apiHealth, setApiHealth] = useState<'healthy' | 'degraded' | 'down'>('healthy');
  const [memoryPressure, setMemoryPressure] = useState<'low' | 'medium' | 'high'>('low');

  // Network monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // API health monitoring - disabled in production to prevent 405 errors
  useEffect(() => {
    // Skip health monitoring in production - use backend URL to detect production
    const backendUrl = import.meta.env.VITE_BACKEND_URL || window.location.origin;
    const isProduction = backendUrl === 'https://pms.base360.ai' || backendUrl.endsWith('://pms.base360.ai');
    
    console.log(`[Health Monitor] Backend URL: ${backendUrl}, Is Production: ${isProduction}`);
    
    if (isProduction) {
      console.log('[Health Monitor] Production detected - health monitoring disabled');
      setApiHealth('healthy');
      return;
    }
    
    console.log('[Health Monitor] Development/staging detected - enabling health monitoring');

    let healthCheckInterval: NodeJS.Timeout;

    const checkApiHealth = async () => {
      try {
        const response = await fetch('/api/v1/health', { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          setApiHealth('healthy');
        } else if (response.status >= 500) {
          setApiHealth('down');
        } else {
          setApiHealth('degraded');
        }
      } catch (error) {
        setApiHealth('down');
      }
    };

    // Check immediately and then every 30 seconds
    checkApiHealth();
    healthCheckInterval = setInterval(checkApiHealth, 30000);

    return () => clearInterval(healthCheckInterval);
  }, []);

  // Memory monitoring
  useEffect(() => {
    let memoryCheckInterval: NodeJS.Timeout;

    const checkMemoryPressure = () => {
      if ('memory' in performance) {
        const memInfo = (performance as any).memory;
        const usedPercent = (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
        
        if (usedPercent > 85) {
          setMemoryPressure('high');
        } else if (usedPercent > 70) {
          setMemoryPressure('medium');
        } else {
          setMemoryPressure('low');
        }
      }
    };

    checkMemoryPressure();
    memoryCheckInterval = setInterval(checkMemoryPressure, 15000);

    return () => clearInterval(memoryCheckInterval);
  }, []);

  // Update degradation state based on health metrics
  useEffect(() => {
    const reasons: string[] = [];
    let level: DegradationLevel = 'none';

    // Network issues
    if (!isOnline) {
      reasons.push('No internet connection');
      level = 'severe';
    }

    // API issues
    if (apiHealth === 'down') {
      reasons.push('Server unavailable');
      level = level === 'severe' ? 'severe' : 'moderate';
    } else if (apiHealth === 'degraded') {
      reasons.push('Server performance issues');
      level = level === 'none' ? 'minimal' : level;
    }

    // Memory pressure
    if (memoryPressure === 'high') {
      reasons.push('High memory usage');
      level = level === 'none' ? 'minimal' : level;
    }

    // Calculate capabilities based on degradation level
    const capabilities = {
      canSave: isOnline && apiHealth !== 'down',
      canLoad: apiHealth !== 'down',
      canSync: isOnline && apiHealth === 'healthy',
      canNotify: memoryPressure !== 'high',
    };

    setDegradationState({
      level,
      reasons,
      capabilities,
    });
  }, [isOnline, apiHealth, memoryPressure]);

  return {
    degradationState,
    isOnline,
    apiHealth,
    memoryPressure,
  };
};

// Component for graceful degradation of features
interface GracefulFeatureProps {
  name: string;
  essential?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
  dependencies?: Array<'network' | 'api' | 'memory'>;
  retryInterval?: number;
  maxRetries?: number;
}

export const GracefulFeature: React.FC<GracefulFeatureProps> = ({
  name,
  essential = false,
  fallback,
  children,
  dependencies = ['network', 'api'],
  retryInterval = 30000,
  maxRetries = 3,
}) => {
  const { degradationState, isOnline, apiHealth, memoryPressure } = useSystemHealth();
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  // Check if feature should be available based on dependencies
  const isFeatureAvailable = useCallback(() => {
    if (dependencies.includes('network') && !isOnline) return false;
    if (dependencies.includes('api') && apiHealth === 'down') return false;
    if (dependencies.includes('memory') && memoryPressure === 'high') return false;
    return true;
  }, [dependencies, isOnline, apiHealth, memoryPressure]);

  // Auto-retry mechanism
  useEffect(() => {
    if (!isFeatureAvailable() && retryCount < maxRetries && !isRetrying) {
      const timeoutId = setTimeout(() => {
        setIsRetrying(true);
        setRetryCount(prev => prev + 1);
        
        // Reset retry state after a short delay
        setTimeout(() => setIsRetrying(false), 1000);
      }, retryInterval);

      return () => clearTimeout(timeoutId);
    }
  }, [isFeatureAvailable, retryCount, maxRetries, retryInterval, isRetrying]);

  // Reset retry count when feature becomes available
  useEffect(() => {
    if (isFeatureAvailable()) {
      setRetryCount(0);
    }
  }, [isFeatureAvailable]);

  if (isFeatureAvailable()) {
    return <>{children}</>;
  }

  // Show fallback or degraded state
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default fallback UI
  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {isRetrying ? (
            <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          ) : dependencies.includes('network') && !isOnline ? (
            <WifiOff className="w-5 h-5 text-yellow-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-600" />
          )}
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            {essential ? 'Essential Feature Unavailable' : 'Feature Temporarily Unavailable'}
          </h3>
          <div className="mt-1 text-sm text-yellow-700">
            <p>{name} is currently unavailable. {degradationState.reasons.join(', ')}.</p>
            {retryCount < maxRetries && (
              <p className="mt-1">
                {isRetrying ? 'Retrying...' : `Will retry automatically (${retryCount}/${maxRetries})`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for managing offline-capable data
export const useOfflineCapableData = <T,>(
  fetchFn: () => Promise<T>,
  cacheKey: string,
  options: {
    ttl?: number; // Time to live in milliseconds
    retryInterval?: number;
    fallbackData?: T;
  } = {}
) => {
  const { ttl = 300000, retryInterval = 30000, fallbackData } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  
  const { degradationState, isOnline } = useSystemHealth();

  // Load from cache
  const loadFromCache = useCallback(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        
        setData(cachedData);
        setLastUpdated(new Date(timestamp));
        setIsStale(age > ttl);
        
        return cachedData;
      }
    } catch (err) {
      console.warn('Failed to load from cache:', err);
    }
    return null;
  }, [cacheKey, ttl]);

  // Save to cache
  const saveToCache = useCallback((data: T) => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.warn('Failed to save to cache:', err);
    }
  }, [cacheKey]);

  // Fetch fresh data
  const fetchFreshData = useCallback(async () => {
    if (!degradationState.capabilities.canLoad) {
      return loadFromCache() || fallbackData;
    }

    setLoading(true);
    setError(null);

    try {
      const freshData = await fetchFn();
      setData(freshData);
      setLastUpdated(new Date());
      setIsStale(false);
      saveToCache(freshData);
      return freshData;
    } catch (err) {
      setError(err as Error);
      // Return cached data if fetch fails
      return loadFromCache() || fallbackData;
    } finally {
      setLoading(false);
    }
  }, [fetchFn, degradationState.capabilities.canLoad, loadFromCache, saveToCache, fallbackData]);

  // Initial load
  useEffect(() => {
    const cachedData = loadFromCache();
    if (!cachedData) {
      fetchFreshData();
    }
  }, [loadFromCache, fetchFreshData]);

  // Auto-refresh when back online
  useEffect(() => {
    if (isOnline && isStale) {
      fetchFreshData();
    }
  }, [isOnline, isStale, fetchFreshData]);

  // Periodic refresh for stale data
  useEffect(() => {
    if (isStale && degradationState.capabilities.canLoad) {
      const intervalId = setInterval(fetchFreshData, retryInterval);
      return () => clearInterval(intervalId);
    }
  }, [isStale, degradationState.capabilities.canLoad, retryInterval, fetchFreshData]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    isStale,
    refresh: fetchFreshData,
    isOfflineMode: !degradationState.capabilities.canLoad,
  };
};

// System health status component
export const SystemHealthIndicator: React.FC = () => {
  const { degradationState, isOnline, apiHealth, memoryPressure } = useSystemHealth();

  if (degradationState.level === 'none') {
    return null;
  }

  const getStatusColor = () => {
    switch (degradationState.level) {
      case 'minimal': return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'moderate': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'severe': return 'bg-red-100 border-red-300 text-red-800';
      default: return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  const getIcon = () => {
    if (!isOnline) return <WifiOff className="w-4 h-4" />;
    if (apiHealth === 'down') return <AlertCircle className="w-4 h-4" />;
    return <Clock className="w-4 h-4" />;
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm p-3 rounded-lg border ${getStatusColor()}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="ml-3">
          <h4 className="text-sm font-medium">
            System Status: {degradationState.level.charAt(0).toUpperCase() + degradationState.level.slice(1)} Degradation
          </h4>
          <ul className="mt-1 text-xs">
            {degradationState.reasons.map((reason, index) => (
              <li key={index}>• {reason}</li>
            ))}
          </ul>
          
          <div className="mt-2 text-xs">
            <div className="flex space-x-3">
              <span className={degradationState.capabilities.canSave ? 'text-green-600' : 'text-red-600'}>
                Save: {degradationState.capabilities.canSave ? '✓' : '✗'}
              </span>
              <span className={degradationState.capabilities.canSync ? 'text-green-600' : 'text-red-600'}>
                Sync: {degradationState.capabilities.canSync ? '✓' : '✗'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default {
  useSystemHealth,
  GracefulFeature,
  useOfflineCapableData,
  SystemHealthIndicator,
};