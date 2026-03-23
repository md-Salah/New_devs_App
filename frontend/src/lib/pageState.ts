import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Define the structure of our page state
interface PageState {
  url: string;
  scrollPosition: { x: number; y: number };
  timestamp: number;
  metadata?: {
    title?: string;
    lastInteraction?: number;
  };
}

// Storage key for page state
const STORAGE_KEY = 'fl_page_state';
const STATE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const DEBOUNCE_DELAY = 100; // Debounce delay in milliseconds

// Flag to track if user-initiated navigation is in progress
let userNavigating = false;

// Flag to track if this is the first load/refresh
let isInitialPageLoad = true;

// Last known location - used to detect redirects
let lastKnownLocation = '';

// Function to set navigation state
export function setUserNavigating(value: boolean): void {
  userNavigating = value;
  
  // If user is navigating, set a short-lived flag in sessionStorage
  // This helps track navigation across component boundaries
  if (value) {
    sessionStorage.setItem('user_navigating', 'true');
    // Clear the flag after a short delay to ensure it's not left on permanently
    setTimeout(() => {
      sessionStorage.removeItem('user_navigating');
    }, 2000);
  }
}

// Function to check if user is navigating
export function isUserNavigating(): boolean {
  return userNavigating || sessionStorage.getItem('user_navigating') === 'true';
}

// Function to save page state with debouncing
let saveTimeout: NodeJS.Timeout;
export function savePageState(url: string, scrollPosition: { x: number; y: number }): void {
  try {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const state: PageState = {
        url,
        scrollPosition,
        timestamp: Date.now(),
        metadata: {
          title: document.title,
          lastInteraction: Date.now()
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      
      // Also save to sessionStorage for refresh handling
      sessionStorage.setItem('last_path', url);
      
      // Update last known location
      lastKnownLocation = url;
    }, DEBOUNCE_DELAY);
  } catch (error) {
    console.warn('Failed to save page state:', error);
  }
}

// Function to get saved page state
export function getSavedPageState(): PageState | null {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (!savedState) return null;

    const state: PageState = JSON.parse(savedState);

    // Check if state has expired
    if (Date.now() - state.timestamp > STATE_EXPIRY) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return state;
  } catch (error) {
    console.warn('Failed to retrieve page state:', error);
    return null;
  }
}

// Function to clear saved state
export function clearPageState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem('last_path');
    sessionStorage.removeItem('user_navigating');
  } catch (error) {
    console.warn('Failed to clear page state:', error);
  }
}

// Function to handle scroll restoration
export function restoreScrollPosition(savedState: PageState): void {
  // Use requestAnimationFrame to ensure DOM is ready
  requestAnimationFrame(() => {
    try {
      window.scrollTo({
        left: savedState.scrollPosition.x,
        top: savedState.scrollPosition.y,
        behavior: 'instant' // Use instant to avoid smooth scrolling on page load
      });
    } catch (error) {
      console.warn('Failed to restore scroll position:', error);
    }
  });
}

// Function to check if this is a page refresh
export function isPageRefresh(): boolean {
  // Using performance navigation type if available
  if (window.performance && performance.navigation) {
    return performance.navigation.type === 1;
  }
  
  // Fallback for browsers that don't support performance API
  return document.readyState === 'complete';
}

// Hook to handle page visibility changes
export function usePageVisibility(): void {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Skip page visibility handling for daily-cs-task routes to prevent redirect issues
  const isDailyCSTaskRoute = location.pathname.includes('/daily-cs-task/');
  if (isDailyCSTaskRoute) {
    console.log('Skipping page visibility handling for daily-cs-task route');
    return;
  }

  // Detect location changes and track them as redirects if needed
  useEffect(() => {
    const currentUrl = location.pathname + location.search + location.hash;
    
    // If we have a last location and it's different, this might be a redirect
    if (lastKnownLocation && lastKnownLocation !== currentUrl) {
      console.log('Location changed from', lastKnownLocation, 'to', currentUrl);
      
      // Update both storages with the new location
      savePageState(currentUrl, { x: window.scrollX, y: window.scrollY });
      sessionStorage.setItem('last_path', currentUrl);
    }
    
    // Update last known location
    lastKnownLocation = currentUrl;
  }, [location]);

  useEffect(() => {
    let lastSaveTime = Date.now();
    const SAVE_THROTTLE = 1000; // Minimum time between saves
    
    // Save current page state immediately on mount
    const currentUrl = location.pathname + location.search + location.hash;
    savePageState(
      currentUrl,
      {
        x: window.scrollX,
        y: window.scrollY
      }
    );
    
    // Update last known location on mount
    lastKnownLocation = currentUrl;
    
    // If this is a page refresh, we need to handle it differently
    if (isInitialPageLoad) {
      const isRefresh = isPageRefresh();
      console.log('Page load detected:', isRefresh ? 'REFRESH' : 'INITIAL LOAD');
      
      // For refreshes, ensure we stay on the current path
      if (isRefresh && currentUrl !== '/' && currentUrl !== '/login') {
        sessionStorage.setItem('last_path', currentUrl);
      }
      
      isInitialPageLoad = false;
    }

    // Update the last known location
    lastKnownLocation = currentUrl;

    // Function to handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Save state when page becomes hidden
        const currentUrl = location.pathname + location.search + location.hash;
        savePageState(
          currentUrl,
          {
            x: window.scrollX,
            y: window.scrollY
          }
        );
      } else {
        // Page becomes visible again - do not auto-navigate
        console.log('Tab became visible, maintaining current state without navigation');
        
        // Only save the current state, don't navigate
        const currentUrl = location.pathname + location.search + location.hash;
        savePageState(
          currentUrl,
          {
            x: window.scrollX,
            y: window.scrollY
          }
        );
      }
    };

    // Function to handle scroll with throttling
    const handleScroll = () => {
      const now = Date.now();
      if (now - lastSaveTime >= SAVE_THROTTLE) {
        const currentUrl = location.pathname + location.search + location.hash;
        savePageState(
          currentUrl,
          {
            x: window.scrollX,
            y: window.scrollY
          }
        );
        lastSaveTime = now;
      }
    };

    // Function to handle beforeunload
    const handleBeforeUnload = () => {
      const currentUrl = location.pathname + location.search + location.hash;
      savePageState(
        currentUrl,
        {
          x: window.scrollX,
          y: window.scrollY
        }
      );
      
      // Use sessionStorage specifically for handling refreshes
      sessionStorage.setItem('last_path', currentUrl);
    };

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Restore scroll position if returning to a saved state
    const savedState = getSavedPageState();
    if (savedState && savedState.url === location.pathname + location.search + location.hash) {
      restoreScrollPosition(savedState);
    } else {
      // If no saved state or different page, scroll to top
      window.scrollTo(0, 0);
    }

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(saveTimeout);
    };
  }, [location, navigate]);
}

// Hook to use in form components to ensure state is preserved during form submissions
export function useFormStatePreservation(): {
  preserveStateBeforeSubmit: () => void;
} {
  const location = useLocation();
  
  const preserveStateBeforeSubmit = () => {
    const currentUrl = location.pathname + location.search + location.hash;
    console.log('Preserving state before form submission:', currentUrl);
    
    // Save to both localStorage and sessionStorage
    savePageState(currentUrl, { x: window.scrollX, y: window.scrollY });
    sessionStorage.setItem('last_path', currentUrl);
    
    // Set a flag to indicate this is a form submission
    sessionStorage.setItem('form_submission', 'true');
  };
  
  return { preserveStateBeforeSubmit };
}