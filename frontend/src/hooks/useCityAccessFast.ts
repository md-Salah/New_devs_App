import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.new';
import { supabase } from '../lib/supabase';
import { getApiBase } from '../lib/apiBase';

interface CityAccessResponse {
  cities: string[];
  is_admin: boolean;
  response_time_ms: number;
  cache_hit: boolean;
  error?: string;
}

// Admin emails for frontend checks (should match backend)
const ADMIN_EMAILS = [
  'sid@theflexliving.com',
  'raouf@theflexliving.com',
  'michael@theflexliving.com',
  'yazid@theflexliving.com',
];

export function useCityAccessFast() {
  const auth = useAuth();
  const { user } = auth;
  const authLoading = auth.status === 'initializing';
  const [accessibleCities, setAccessibleCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    responseTime: 0,
    cacheHit: false,
  });
  
  // Use ref to prevent duplicate fetches
  const fetchingRef = useRef(false);
  const lastFetchRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchCityAccess = async () => {
      // Wait for auth to complete
      if (authLoading) {
        return;
      }

      if (!user) {
        setAccessibleCities([]);
        setLoading(false);
        setError(null);
        return;
      }

      // Prevent duplicate fetches for the same user
      const fetchKey = `${user.id}`;
      if (fetchingRef.current || lastFetchRef.current === fetchKey) {
        return;
      }

      fetchingRef.current = true;
      lastFetchRef.current = fetchKey;

      try {
        const startTime = Date.now();
        setError(null);
        
        const { data: { session } } = await supabase.auth.getSession();
        const backend = getApiBase();
        
        console.log('[useCityAccessFast] Fetching from fast endpoint for user:', {
          email: user.email,
          userId: user.id,
        });
        
        // Use the new fast endpoint
        const resp = await fetch(`${backend}/api/v1/fast/city-access`, {
          headers: {
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'Content-Type': 'application/json'
          }
        });
        
        const fetchTime = Date.now() - startTime;
        
        if (resp.ok) {
          const json: CityAccessResponse = await resp.json();
          
          console.log('[useCityAccessFast] Response:', {
            cities: json.cities,
            responseTimeMs: json.response_time_ms,
            cacheHit: json.cache_hit,
            totalFetchTime: fetchTime,
          });
          
          setAccessibleCities(json.cities || []);
          setPerformanceMetrics({
            responseTime: json.response_time_ms || fetchTime,
            cacheHit: json.cache_hit || false,
          });
          
          // Log performance metrics
          if (json.cache_hit) {
            console.log(`[useCityAccessFast] ⚡ Cache HIT - ${json.response_time_ms}ms`);
          } else {
            console.log(`[useCityAccessFast] 🔄 Cache MISS - ${json.response_time_ms}ms`);
          }
        } else {
          console.error('[useCityAccessFast] Failed to fetch cities:', resp.status, resp.statusText);
          
          // Fallback to local admin check
          const isAdmin = ADMIN_EMAILS.includes(user.email || '') || 
                         user.app_metadata?.role === 'admin';
          
          if (isAdmin) {
            // Admin fallback - give access to all cities
            const fallbackCities = ['london', 'paris', 'algiers', 'lisbon'];
            console.log('[useCityAccessFast] Admin fallback activated:', fallbackCities);
            setAccessibleCities(fallbackCities);
          } else {
            setAccessibleCities([]);
          }
          
          setError(`Failed to fetch cities: ${resp.statusText}`);
        }
      
      } catch (error: any) {
        console.error('[useCityAccessFast] Error fetching city access:', error);
        setError('Failed to load city permissions');
        
        // Admin fallback on error
        const isAdmin = ADMIN_EMAILS.includes(user.email || '') || 
                       user.app_metadata?.role === 'admin';
        
        if (isAdmin) {
          const fallbackCities = ['london', 'paris', 'algiers', 'lisbon'];
          console.log('[useCityAccessFast] Admin error fallback:', fallbackCities);
          setAccessibleCities(fallbackCities);
        } else {
          setAccessibleCities([]);
        }
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchCityAccess();
  }, [user, authLoading]);

  const hasAccessToCity = (city: string): boolean => {
    if (!user) return false;
    
    // Check admin status
    const isAdmin = ADMIN_EMAILS.includes(user.email || '') || 
                   user.app_metadata?.role === 'admin';
    if (isAdmin) return true;
    
    // Normalize city for case-insensitive comparison
    const normalizedCity = city?.toLowerCase()?.trim();
    const normalizedAccessibleCities = accessibleCities.map(c => c.toLowerCase().trim());
    
    return normalizedAccessibleCities.includes(normalizedCity);
  };

  const refreshCityAccess = async () => {
    // Force a refresh by clearing the last fetch key
    lastFetchRef.current = null;
    
    // Re-trigger the effect
    const currentUser = user;
    if (currentUser) {
      setLoading(true);
      // The effect will automatically run
    }
  };

  return {
    accessibleCities,
    hasAccessToCity,
    loading,
    error,
    performanceMetrics,
    refreshCityAccess,
  };
}

// Export a version that's compatible with the old hook interface
export function useCityAccess() {
  const result = useCityAccessFast();
  
  // Return the same interface as the old hook for backward compatibility
  return {
    accessibleCities: result.accessibleCities,
    hasAccessToCity: result.hasAccessToCity,
    loading: result.loading,
    error: result.error,
  };
}
