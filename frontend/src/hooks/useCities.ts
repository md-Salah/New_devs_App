import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext.new';
import { citiesCache } from '../lib/citiesCache';

export interface City {
  id: string;
  name: string;
  property_count?: number;
}

interface UseCitiesResult {
  cities: City[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseCitiesOptions {
  userAccessibleOnly?: boolean;
  includePropertyCount?: boolean;
}

export function useCities(options: UseCitiesOptions = {}): UseCitiesResult {
  const auth = useAuth();
  const { user } = auth;
  const authLoading = auth.status === 'initializing';
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  
  const cacheKey = citiesCache.getCacheKey(options);

  const fetchCities = useCallback(async () => {
    // Check cache first
    const cached = citiesCache.get(cacheKey);
    if (cached && !cached.loading) {
      setCities(cached.data);
      setLoading(false);
      setError(cached.error);
      return;
    }
    
    // If already fetching, just wait
    if (fetchingRef.current) {
      return;
    }
    
    try {
      fetchingRef.current = true;
      setLoading(true);
      setError(null);
      citiesCache.setLoading(cacheKey, true);

      // Wait for auth to be ready if we need user-specific data
      if (options.userAccessibleOnly) {
        if (authLoading) {
          // Still loading auth, wait
          fetchingRef.current = false;
          return;
        }
        if (!user) {
          setCities([]);
          setLoading(false);
          citiesCache.set(cacheKey, []);
          fetchingRef.current = false;
          return;
        }
      }

      // For now, directly query properties to get available cities
      // This approach works regardless of user permissions
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setCities([]);
        setLoading(false);
        return;
      }

      // Fetch tenant-scoped cities (filters API), not raw properties
      const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
      
      console.log('[useCities] 🚀 Starting API call to filters/cities');
      console.log('[useCities] Backend URL:', backend);
      console.log('[useCities] Auth token present:', !!session.access_token);
      console.log('[useCities] User:', user?.email || 'unknown');
      
      const response = await fetch(`${backend}/api/v1/fast/city-access`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('[useCities] 📡 API Response received');
      console.log('[useCities] Response status:', response.status);
      console.log('[useCities] Response ok:', response.ok);
      console.log('[useCities] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        console.error('[useCities] ❌ API Error Response');
        console.error('[useCities] Status:', response.status, response.statusText);
        
        if (response.status === 401 || response.status === 403) {
          console.error('[useCities] 🔒 Authentication/Authorization error');
          setCities([]);
          setLoading(false);
          return;
        }
        
        // Try to get error response body
        try {
          const errorBody = await response.text();
          console.error('[useCities] Error body:', errorBody);
        } catch (e) {
          console.error('[useCities] Could not read error body');
        }
        
        throw new Error(`Failed to fetch cities: ${response.status} ${response.statusText}`);
      }

      console.log('[useCities] ✅ API call successful, parsing JSON...');
      const result = await response.json();
      console.log('[useCities] 📊 Full API response:', JSON.stringify(result, null, 2));

      // Parse from city-access API format: { cities: ["london"], is_admin: false }
      let parsed: City[] = [];
      console.log('[useCities] 🔍 Analyzing city-access response structure...');
      console.log('[useCities] result.cities type:', typeof result?.cities);
      console.log('[useCities] result.cities is array:', Array.isArray(result?.cities));
      console.log('[useCities] result.cities length:', result?.cities?.length || 'undefined');
      console.log('[useCities] result.cities content:', result?.cities);
      
      const cities = Array.isArray(result?.cities) ? result.cities : [];
      console.log('[useCities] 📋 Cities extracted:', cities.length, 'items');
      
      if (cities.length > 0) {
        console.log('[useCities] 🏙️ Processing cities from city-access API...');
        // Convert simple string array to City objects
        parsed = cities
          .filter((city: any) => {
            const isValid = city && typeof city === 'string' && city.trim().length > 0;
            if (!isValid) {
              console.log('[useCities] 🚮 Filtering out invalid city:', city);
            }
            return isValid;
          })
          .map((city: string) => ({
            id: city.toLowerCase().trim(),
            name: city.charAt(0).toUpperCase() + city.slice(1).toLowerCase()
          }))
          .sort((a: City, b: City) => a.name.localeCompare(b.name));
        console.log('[useCities] 🎯 Final parsed cities (city-access API):', parsed);
      } else {
        console.log('[useCities] 💥 No cities found in city-access response');
      }

      console.log('[useCities] ✅ Setting cities in state:', parsed.length, 'cities');
      setCities(parsed);
      citiesCache.set(cacheKey, parsed);
    } catch (err: any) {
      console.error('[useCities] 💥 CRITICAL ERROR in fetch process:');
      console.error('[useCities] Error type:', typeof err);
      console.error('[useCities] Error name:', err.name);
      console.error('[useCities] Error message:', err.message);
      console.error('[useCities] Error stack:', err.stack);
      console.error('[useCities] Full error object:', err);
      
      const errorMsg = err.message || 'Failed to fetch cities';
      setError(errorMsg);
      
      // Fallback to empty when API fails
      console.log('[useCities] 🔄 Setting empty cities due to error');
      setCities([]);
      citiesCache.set(cacheKey, [], errorMsg);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [cacheKey, options.userAccessibleOnly, options.includePropertyCount, authLoading, user]);

  useEffect(() => {
    // Subscribe to cache updates
    const unsubscribe = citiesCache.subscribe(cacheKey, () => {
      const cached = citiesCache.get(cacheKey);
      if (cached) {
        setCities(cached.data);
        setLoading(cached.loading);
        setError(cached.error);
      }
    });
    
    // Initial fetch
    if (!options.userAccessibleOnly || !authLoading) {
      fetchCities();
    }
    
    return unsubscribe;
  }, [cacheKey, options.userAccessibleOnly, authLoading, fetchCities]);

  return {
    cities,
    loading,
    error,
    refetch: fetchCities
  };
}

// Helper function to get city display information with icons
export function getCityDisplayInfo(cityId: string, context?: 'default' | 'cleaning') {
  const cityMap: Record<string, { name: string; icon: string; image: string; cleaningImage?: string }> = {
    london: {
      name: 'London',
      icon: 'Landmark',
      image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1920&q=80'
    },
    paris: {
      name: 'Paris', 
      icon: 'Building',
      image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1920&q=80'
    },
    algiers: {
      name: 'Algiers',
      icon: 'MapPin', 
      image: 'https://images.unsplash.com/photo-1627221889894-c9cfa8e843bf?q=80&w=3174&auto=format&fit=crop'
    },
    lisbon: {
      name: 'Lisbon',
      icon: 'MapPin',
      image: 'https://images.unsplash.com/photo-1545208942-d4c8c7e3e1e2?auto=format&fit=crop&w=1920&q=80',
      cleaningImage: 'https://cdn2.civitatis.com/portugal/lisboa/guia/lisbon-tram-seo.jpg'
    }
  };

  const cityInfo = cityMap[cityId.toLowerCase()] || {
    name: cityId.charAt(0).toUpperCase() + cityId.slice(1).toLowerCase(),
    icon: 'MapPin',
    image: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1920&q=80'
  };

  // Return cleaning-specific image if available and requested
  if (context === 'cleaning' && cityInfo.cleaningImage) {
    return {
      ...cityInfo,
      image: cityInfo.cleaningImage
    };
  }

  return cityInfo;
}
