import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.new';

interface PublicRouteProps {
  children: React.ReactNode;
}

export default function PublicRoute({ children }: PublicRouteProps) {
  const auth = useAuth();
  const { user } = auth;
  const loading = auth.status === 'initializing';
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is authenticated, redirect to the intended page or dashboard
  if (user) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  // If not authenticated, show the public content (login page)
  return <>{children}</>;
}
