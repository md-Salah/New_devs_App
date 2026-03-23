/**
 * City Access Hook - Uses centralized CityAccessContext for optimal performance
 * 
 * This hook now delegates to the CityAccessContext which:
 * - Fetches city access ONCE during authentication
 * - Caches data in session storage for persistence
 * - Provides instant access without refetching
 * - Handles all fallback scenarios
 */

import { useCityAccessContext } from '../contexts/CityAccessContext';

// Re-export for backward compatibility
export { useCityAccessContext } from '../contexts/CityAccessContext';

/**
 * Legacy hook for backward compatibility
 * Uses the centralized CityAccessContext under the hood
 */
export function useCityAccess() {
    const { 
        cities: accessibleCities, 
        hasAccessToCity, 
        loading, 
        error,
        isAdmin 
    } = useCityAccessContext();
    
    // Return in the legacy format that existing components expect
    return {
        accessibleCities,
        hasAccessToCity,
        loading,
        error,
        // Some components might check for admin status
        isAdmin
    };
}
