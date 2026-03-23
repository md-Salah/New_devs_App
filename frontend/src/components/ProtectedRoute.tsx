import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { usePermissions } from '../hooks/usePermissions';

interface ProtectedRouteProps {
  children: React.ReactNode;
  section?: string;
  action?: string;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, section, action = 'read', requireAdmin }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const location = useLocation();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authLoading && !permissionsLoading && user) {
      // Check authorization
      if (requireAdmin) {
        const isAdmin = user.app_metadata?.role === 'admin' || 
                       user.email === 'sid@theflexliving.com' ||
                       user.email === 'raouf@theflexliving.com' ||
                       user.email === 'michael@theflexliving.com';
        setIsAuthorized(isAdmin);
      } else if (section) {
        // Check specific permission
        const hasAccess = hasPermission(section, action);
        console.log(`[ProtectedRoute] Checking permission for ${section}:${action} - Result: ${hasAccess}`);
        setIsAuthorized(hasAccess);
      } else {
        // No specific permission required, just authentication
        setIsAuthorized(true);
      }
    }
  }, [user, authLoading, permissionsLoading, section, action, requireAdmin, hasPermission]);

  // Don't show loader here - RouteGuard handles loading states
  // This prevents double loaders
  if (authLoading || permissionsLoading || isAuthorized === null) {
    console.log('[ProtectedRoute] Still loading - auth:', authLoading, 'permissions:', permissionsLoading, 'authorized:', isAuthorized);
    // Return empty fragment - RouteGuard will show its loader
    return <>{children}</>;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check authorization
  if (!isAuthorized) {
    console.log(`[ProtectedRoute] Access denied for user ${user.email} to ${section}:${action}`);
    return <Navigate to="/unauthorized" replace />;
  }

  // Render protected content
  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col">
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
}