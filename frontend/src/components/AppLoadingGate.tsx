import React, { useEffect, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext.new';

interface AppLoadingGateProps {
  children: React.ReactNode;
}

/**
 * AppLoadingGate ensures that the app context and sidebar are fully loaded
 * before rendering any route content. This prevents sections from loading
 * before the sidebar is ready.
 */
const AppLoadingGate: React.FC<AppLoadingGateProps> = ({ children }) => {
  const { isLoading: appLoading, modules, permissions, refreshData } = useAppContext();
  const auth = useAuth();
  const authLoading = auth.status === 'initializing';
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  
  // Check if we have essential data loaded
  // Even if modules are empty (new tenant), permissions should exist
  const hasEssentialData = permissions.length > 0 || modules.size > 0;
  
  // Set a timeout to prevent infinite loading
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isInitialLoad && !hasEssentialData) {
        console.warn('[AppLoadingGate] Loading timeout after 5s, forcing display');
        setLoadingTimeout(true);
        // Try to refresh data one more time
        refreshData(false).catch(err => {
          console.error('[AppLoadingGate] Failed to refresh on timeout:', err);
        });
      }
    }, 5000); // 5 second timeout
    
    return () => clearTimeout(timer);
  }, [isInitialLoad, hasEssentialData, refreshData]);
  
  // Once we have data, mark that we've loaded once
  useEffect(() => {
    if ((hasEssentialData || loadingTimeout) && !hasLoadedOnce) {
      console.log('[AppLoadingGate] Initial load complete - has essential data or timeout');
      setHasLoadedOnce(true);
      // Give a small delay before hiding loading to prevent flash
      setTimeout(() => {
        setIsInitialLoad(false);
      }, 300);
    }
  }, [hasEssentialData, hasLoadedOnce, loadingTimeout]);
  
  // Determine if we should show loading
  // 1. Auth is still loading OR
  // 2. App is still loading AND we don't have essential data yet
  // 3. BUT not if we've hit the timeout (to prevent infinite loading)
  // This ensures sections don't render before sidebar is ready
  const shouldShowLoading = isInitialLoad && !loadingTimeout && (authLoading || (appLoading && !hasEssentialData));
  
  useEffect(() => {
    console.log('[AppLoadingGate] Loading state:', {
      authLoading,
      appLoading,
      hasEssentialData,
      isInitialLoad,
      hasLoadedOnce,
      shouldShowLoading,
      modulesCount: modules.size,
      permissionsCount: permissions.length
    });
  }, [authLoading, appLoading, hasEssentialData, isInitialLoad, hasLoadedOnce, shouldShowLoading, modules.size, permissions.length]);
  
  if (shouldShowLoading) {
    // Don't show loader here - RouteGuard handles all loading states
    // Just render children and let RouteGuard show its unified loader
    return <>{children}</>;
  }
  
  // Once loaded, render children (sidebar + main content)
  return <>{children}</>;
};

export default AppLoadingGate;