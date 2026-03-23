import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../contexts/AuthContext.new';
import { AppProvider } from '../contexts/AppContext';
import { PermissionsProvider } from '../hooks/usePermissions';
import { CityAccessProvider } from '../contexts/CityAccessContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { ToastProvider } from '../contexts/ToastContext';
import { GoogleMapsProvider } from './GoogleMapsProvider';
import LocalStorageErrorBoundary from './LocalStorageErrorBoundary';
import AppContent from './AppContent';
import GlobalToast from './GlobalToast';

const queryClient = new QueryClient();

function AppWrapper() {
  return (
    <LocalStorageErrorBoundary>
      <Router>
        <AuthProvider>
          <CityAccessProvider>
            <AppProvider>
              <PermissionsProvider>
                <NotificationProvider>
                  <ToastProvider>
                    <QueryClientProvider client={queryClient}>
                      <GoogleMapsProvider>
                        <AppContent />
                        <GlobalToast />
                      </GoogleMapsProvider>
                    </QueryClientProvider>
                  </ToastProvider>
                </NotificationProvider>
              </PermissionsProvider>
            </AppProvider>
          </CityAccessProvider>
        </AuthProvider>
      </Router>
    </LocalStorageErrorBoundary>
  );
}

export default AppWrapper;