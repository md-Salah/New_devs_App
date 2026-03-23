import { useState, createContext, useContext, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext.new";
import { checkAndClearInvalidTokens } from "./utils/clearAuthTokens";
import { AppProvider } from "./contexts/AppContext";
import { ProtectedRoute } from "./components/ProtectedRoute.new";
import PublicRoute from "./components/PublicRoute";
import Sidebar from "./components/Sidebar";
import { getStorageInfo } from "./utils/localStorageManager";
import LocalStorageErrorBoundary from "./components/LocalStorageErrorBoundary";
import CrashPrevention from "./components/CrashPrevention";
import "./utils/crashMonitoring";
import LoginPage from "./components/LoginPage";
import Dashboard from "./components/Dashboard";
import UnauthorizedPage from "./components/UnauthorizedPage";
import RootRedirect from "./components/RootRedirect";
import Header from "./components/Header";
import "./index.css";
import ProfilePage from "./components/profile/ProfilePage";
import PropertiesList from "./components/PropertiesList";
import ReservationsList from "./components/ReservationsList";
import CleaningAssignments from "./components/CleaningAssignments";

import { Toaster } from "react-hot-toast";
import AppLoadingGate from "./components/AppLoadingGate";
import { ToastProvider } from "./contexts/ToastContext";
import GlobalToast from "./components/GlobalToast";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import localforage from "localforage";

// Create context for sidebar state
interface SidebarContextType {
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  submenuOpen: string | null;
  setSubmenuOpen: (menu: string | null) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  setIsCollapsed: () => { },
  isMobileOpen: false,
  setIsMobileOpen: () => { },
  submenuOpen: null,
  setSubmenuOpen: () => { },
});

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    return {
      isCollapsed: false,
      setIsCollapsed: () => { },
      isMobileOpen: false,
      setIsMobileOpen: () => { },
      submenuOpen: null,
      setSubmenuOpen: () => { },
    };
  }
  return context;
};

// Configure QueryClient with persistent caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
});

// Create persister using localforage (IndexedDB)
const persister = createSyncStoragePersister({
  storage: localforage as any,
});

function AppWrapper() {
  // Initialize localStorage manager on app startup
  useEffect(() => {
    try {
      checkAndClearInvalidTokens();
      const storageInfo = getStorageInfo();
      console.log("LocalStorage initialized:", storageInfo);
    } catch (error) {
      console.error("Failed to initialize localStorage:", error);
      if (
        confirm(
          "LocalStorage appears to be corrupted. Would you like to clear it and reload the app?"
        )
      ) {
        localStorage.clear();
        window.location.reload();
      }
    }
  }, []);

  return (
    <LocalStorageErrorBoundary>
      <CrashPrevention
        maxRetries={3}
        retryDelay={1000}
        enableOfflineSupport={true}
        enableMemoryMonitoring={true}
        resetOnPropsChange={true}
      >
        <Router>
          <AuthProvider>
            <AppProvider>
              <ToastProvider>
                <PersistQueryClientProvider
                  client={queryClient}
                  persistOptions={{
                    persister,
                    maxAge: 1000 * 60 * 60 * 24,
                    buster: "",
                  }}
                >
                  <AppContent />
                  <GlobalToast />
                </PersistQueryClientProvider>
              </ToastProvider>
            </AppProvider>
          </AuthProvider>
        </Router>
      </CrashPrevention>
    </LocalStorageErrorBoundary>
  );
}

function AppContent() {
  // Initialize sidebar state from localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem("sidebarCollapsed");
    return stored === "true";
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", isCollapsed.toString());
  }, [isCollapsed]);

  return (
    <SidebarContext.Provider
      value={{
        isCollapsed,
        setIsCollapsed,
        isMobileOpen,
        setIsMobileOpen,
        submenuOpen,
        setSubmenuOpen,
      }}
    >
      <AppLoadingGate>
        <Routes>
          {/* Public Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Protected Routes with Layout */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex h-screen overflow-hidden bg-gray-50">
                  <Sidebar />
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-y-auto">
                      <Routes>
                        {/* Dashboard - Blank Canvas */}
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/properties" element={<PropertiesList />} />
                        <Route path="/reservations" element={<ReservationsList />} />
                        <Route path="/cleaning" element={<CleaningAssignments />} />

                        {/* Profile - Minimal */}
                        <Route path="/profile" element={<ProfilePage />} />

                        {/* Default redirect */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </main>
                  </div>
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
        <Toaster position="top-right" />
      </AppLoadingGate>
    </SidebarContext.Provider>
  );
}

// 404 Page Not Found component
function PageNotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Page not found</p>
        <a
          href="/dashboard"
          className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

function App() {
  return <AppWrapper />;
}

export default App;
