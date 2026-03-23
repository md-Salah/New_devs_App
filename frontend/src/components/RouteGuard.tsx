import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.new';
import { usePermissions } from '../hooks/usePermissions';
import { AlertCircle } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  section?: string | string[]; // Can now accept array of sections
  action?: string;
  fallbackPath?: string;
}

// État de vérification des permissions
type CheckState = 'initial' | 'checking' | 'authorized' | 'unauthorized' | 'no-user';

export default function RouteGuard({ 
  children, 
  section = '', 
  action = 'read',
  fallbackPath = '/unauthorized'
}: RouteGuardProps) {
  // DEBUGGING TEST - This should show in console immediately
  console.log('🚨 DEBUGGING IS ACTIVE - RouteGuard loaded with section:', section, 'action:', action);
  const auth = useAuth();
  const { user } = auth;
  const authLoading = auth.status === 'initializing';
  const { hasPermission, loading: permissionsLoading, refreshPermissions } = usePermissions();
  const location = useLocation();
  
  // État unifié pour éviter les transitions chaotiques
  const [checkState, setCheckState] = useState<CheckState>('initial');
  
  // Refs pour éviter les vérifications multiples
  const isCheckingRef = useRef(false);
  const lastCheckedPermissionRef = useRef<string>('');
  const refreshAttemptsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  
  // NEW: Ref to track current state without causing re-renders
  const checkStateRef = useRef<CheckState>('initial');
  
  // NEW: Track if we've done initial load
  const hasInitialLoadRef = useRef(false);
  
  // Clé de permission stable - handle both string and array
  const permissionKey = useMemo(() => {
    const sectionStr = Array.isArray(section) ? section.join('|') : section;
    return `${sectionStr}:${action}`;
  }, [section, action]);
  
  // Vérification admin mémorisée
  const isAdmin = useMemo(() => {
    if (!user) return false;
    const adminResult = user.app_metadata?.role === 'admin' ||
           user.email === 'sid@theflexliving.com' ||
           user.email === 'raouf@theflexliving.com' ||
           user.email === 'michael@theflexliving.com';
    
    console.log(`[RouteGuard] Admin Check:`, {
      userEmail: user.email,
      appMetadataRole: user.app_metadata?.role,
      userMetadataRole: (user as any)?.user_metadata?.role,
      isAdmin: adminResult,
      permissionKey,
      section,
      action
    });
    
    return adminResult;
  }, [user, permissionKey, section, action]);

  const performCheck = useCallback(async () => {
    // Si on est déjà en train de vérifier, on attend
    if (isCheckingRef.current) {
      return;
    }
    
    // Si on a déjà vérifié cette permission et que rien n'a changé
    if (lastCheckedPermissionRef.current === permissionKey && 
        checkStateRef.current !== 'initial' && 
        !authLoading && 
        !permissionsLoading) {
      return;
    }

    // IMPORTANT: We must wait for permissions to fully load before making any decisions
    if (authLoading || permissionsLoading) {
      console.log('[RouteGuard] Still loading - auth:', authLoading, 'permissions:', permissionsLoading);
      // Keep showing loading state until everything is ready
      if (checkStateRef.current === 'initial') {
        checkStateRef.current = 'checking';
        setCheckState('checking');
      }
      return;
    }

    isCheckingRef.current = true;
    lastCheckedPermissionRef.current = permissionKey;

    try {
      // Only show loading animation on first check or route change
      // This prevents flickering on re-renders
      if (checkStateRef.current === 'initial' && mountedRef.current) {
        checkStateRef.current = 'checking';
        setCheckState('checking');
        
        // Only add delay on very first load to prevent flash
        if (!hasInitialLoadRef.current) {
          hasInitialLoadRef.current = true;
          // Reduced delay to make auth feel snappier
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (!mountedRef.current) return;

      // Vérification utilisateur
      if (!user) {
        checkStateRef.current = 'no-user';
        setCheckState('no-user');
        return;
      }

      // Fast path pour admin
      if (isAdmin) {
        console.log(`[RouteGuard] ✅ Admin access granted for ${permissionKey}`);
        checkStateRef.current = 'authorized';
        setCheckState('authorized');
        return;
      }

      // If no section specified, just check if user is authenticated
      if (!section) {
        checkStateRef.current = 'authorized';
        setCheckState('authorized');
        return;
      }

      // Vérification permission standard - check if ANY section has permission
      let authorized = false;
      const sections = Array.isArray(section) ? section : [section];

      console.log(`[RouteGuard] Checking permissions for ${permissionKey}:`, {
        sections,
        action,
        permissionsLoading,
        userEmail: user?.email,
        hasPermissionFunction: typeof hasPermission
      });

      for (const sec of sections) {
        const hasAccess = hasPermission(sec, action);
        console.log(`[RouteGuard] Permission check: ${sec}:${action} = ${hasAccess}`);
        if (hasAccess) {
          authorized = true;
          break;
        }
      }

      console.log(`[RouteGuard] Final authorization result: ${authorized} for ${permissionKey}`);

      // Tentative de refresh si nécessaire
      if (!authorized && !refreshAttemptsRef.current.has(permissionKey)) {
        refreshAttemptsRef.current.add(permissionKey);

        try {
          await refreshPermissions();
          // Re-vérifier après refresh - check all sections again
          for (const sec of sections) {
            if (hasPermission(sec, action)) {
              authorized = true;
              break;
            }
          }
        } catch (error) {
          console.error('[RouteGuard] Permission refresh failed:', error);
        }
      }
      
      if (!mountedRef.current) return;
      
      // Mise à jour finale de l'état
      const newState = authorized ? 'authorized' : 'unauthorized';
      checkStateRef.current = newState;
      setCheckState(newState);
      
    } finally {
      isCheckingRef.current = false;
    }
  }, [user, authLoading, permissionsLoading, section, action, hasPermission, 
      permissionKey, isAdmin, refreshPermissions]); // Removed checkState from deps

  // Effect for initial load and dependency changes
  useEffect(() => {
    mountedRef.current = true;
    
    // This prevents premature unauthorized redirects
    if (!authLoading && !permissionsLoading) {
      console.log('[RouteGuard] Both auth and permissions loaded, performing check...');
      performCheck();
    } else {
      console.log('[RouteGuard] Waiting for loading to complete - auth:', authLoading, 'permissions:', permissionsLoading);
      // Ensure we're in checking state while waiting
      if (checkStateRef.current === 'initial') {
        checkStateRef.current = 'checking';
        setCheckState('checking');
      }
    }
    
    return () => {
      mountedRef.current = false;
    };
  }, [authLoading, permissionsLoading, performCheck]);

  // IMPROVED: Only reset when actually changing to a different permission
  useEffect(() => {
    // If we're changing to a truly different permission (not just re-rendering)
    if (lastCheckedPermissionRef.current && 
        lastCheckedPermissionRef.current !== permissionKey &&
        checkStateRef.current !== 'initial') {
      // Reset state for new permission check
      checkStateRef.current = 'initial';
      setCheckState('initial');
      refreshAttemptsRef.current.clear();
      
      // Clear the last checked to allow new check
      lastCheckedPermissionRef.current = '';
    }
  }, [permissionKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear refs to prevent memory leaks
      refreshAttemptsRef.current.clear();
    };
  }, []);

  // Rendu basé sur l'état unifié
  switch (checkState) {
    case 'initial':
    case 'checking':
      // Loading state with Base360 AI branding
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="relative">
              <div 
                className="text-3xl font-bold text-primary mb-2"
                style={{ 
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' 
                }}
              >
                Base360 AI
              </div>
              <div className="flex justify-center space-x-1">
                <div 
                  className="w-2 h-2 bg-primary/70 rounded-full"
                  style={{ 
                    animation: 'bounce 1.4s infinite',
                    animationDelay: '0ms' 
                  }}
                />
                <div 
                  className="w-2 h-2 bg-primary/70 rounded-full"
                  style={{ 
                    animation: 'bounce 1.4s infinite',
                    animationDelay: '200ms' 
                  }}
                />
                <div 
                  className="w-2 h-2 bg-primary/70 rounded-full"
                  style={{ 
                    animation: 'bounce 1.4s infinite',
                    animationDelay: '400ms' 
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      );

    case 'no-user':
      // Redirection vers login
      return <Navigate to="/login" state={{ from: location }} replace />;

    case 'unauthorized':
      // Affichage non autorisé ou redirection
      if (fallbackPath && fallbackPath !== location.pathname) {
        return <Navigate to={fallbackPath} replace />;
      }
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="mt-6 text-center text-2xl font-bold text-gray-900">
              Access Denied
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              You don't have permission to access this section.
            </p>
            <p className="mt-4 text-center text-xs text-gray-500">
              Required permission: {Array.isArray(section) ? section.join(' or ') : section}:{action}
            </p>
            <div className="mt-6">
              <button
                onClick={() => window.history.back()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      );

    case 'authorized':
      // Affichage du contenu autorisé
      return <>{children}</>;

    default:
      // Fallback (ne devrait jamais arriver)
      return null;
  }
}