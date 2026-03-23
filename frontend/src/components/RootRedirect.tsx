import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.new';

export default function RootRedirect() {
  const auth = useAuth();
  const { user } = auth;
  const loading = auth.status === 'initializing';

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user is authenticated, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // If not authenticated, redirect to login
  return <Navigate to="/login" replace />;
}
