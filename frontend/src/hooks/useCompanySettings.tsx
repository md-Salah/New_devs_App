import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { SecureAPI } from '../lib/secureApi';
import { useAppContext } from '../contexts/AppContext';
// No direct supabase/AuthContext dependency; rely on SecureAPI token management

interface CompanySettings {
  id?: string; // UUID
  company_name: string;
  logo_url: string | null;
  tenant_id?: string | null;
  domain?: string | null;
  header_color?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  favicon_url?: string | null;
}

// Global state for company settings to ensure instant updates across components
// IMPORTANT: Use neutral defaults (Base360) - never show tenant-specific data
let globalSettings: CompanySettings = {
  company_name: 'Base360', // Neutral default - not tenant-specific
  logo_url: null,
  tenant_id: null,
  domain: null,
  header_color: '#1a1a1a', // Neutral dark color
  primary_color: '#ffffff', // Neutral white
  secondary_color: '#f5f5f5', // Neutral light gray
  accent_color: '#0066cc', // Neutral blue
  favicon_url: null
};

const globalListeners: Set<(settings: CompanySettings) => void> = new Set();
let loadingPromise: Promise<void> | null = null;
let lastLoadTime: number = 0;
let hasLoadedOnce: boolean = false;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

const notifyListeners = (settings: CompanySettings) => {
  globalSettings = settings;
  globalListeners.forEach(listener => listener(settings));
};

export function useCompanySettings() {
  const [settings, setSettings] = useState<CompanySettings>(globalSettings);
  const [loading, setLoading] = useState(false); // Start with false since we have default values
  const [error, setError] = useState<string | null>(null);
  // Track user id to reset branding cache on user switch if needed
  const userId: string | null = null;

  const updateLocalSettings = useCallback((newSettings: CompanySettings) => {
    setSettings(newSettings);
  }, []);

  useEffect(() => {
    globalListeners.add(updateLocalSettings);
    return () => { globalListeners.delete(updateLocalSettings); };
  }, [updateLocalSettings]);

  // Load settings on mount and whenever tenant changes (after AppContext resolves)
  const { tenant } = useAppContext();
  useEffect(() => {
    const neutral: CompanySettings = {
      company_name: 'Base360',
      logo_url: null,
      tenant_id: null,
      domain: null,
      header_color: '#1a1a1a',
      primary_color: '#ffffff',
      secondary_color: '#f5f5f5',
      accent_color: '#0066cc',
      favicon_url: null
    };
    notifyListeners(neutral);
    
    // 🧹 AGGRESSIVE CACHE CLEARING: Clear any cached company data from previous tenants
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || '';
        // Clear any bootstrap data that might contain wrong tenant company settings
        if (key.startsWith('app_bootstrap_data_') || 
            key.includes('company_settings') ||
            key.includes('branding')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (e) {
          console.warn(`Failed to remove cached key ${key}:`, e);
        }
      });
      console.log('[useCompanySettings] 🧹 Cleared', keysToRemove.length, 'cached branding items for tenant change');
    } catch (e) {
      console.warn('[useCompanySettings] Failed to clear cached branding data:', e);
    }
    
    lastLoadTime = 0; // force reload
    const t = setTimeout(() => { loadSettings(); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const loadSettings = async () => {
    // Check if data is still fresh (within cache duration)
    const now = Date.now();
    if (hasLoadedOnce && (now - lastLoadTime) < CACHE_DURATION) {
      // Data is still fresh, no need to reload
      setLoading(false);
      return;
    }

    // If a request is already in progress, wait for it
    if (loadingPromise) {
      setLoading(true);
      try {
        await loadingPromise;
      } finally {
        setLoading(false);
      }
      return;
    }

    // Create a new loading promise to prevent concurrent requests
    loadingPromise = (async () => {
      try {
        setLoading(true);
        setError(null);
        let data: any = null;
        try {
          data = await SecureAPI.getCompanySettings();
        } catch (e) {
          // 🔒 ENHANCED FALLBACK: Carefully validate bootstrap cache for tenant consistency
          console.warn('[useCompanySettings] API call failed, attempting bootstrap fallback:', e);
          try {
            let bestKey: string | null = null;
            let bestTs = 0;
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i) || '';
              if (k.startsWith('app_bootstrap_data_')) {
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const ts = parsed?.timestamp || 0;
                if (ts > bestTs) { bestTs = ts; bestKey = k; }
              }
            }
            
            if (bestKey) {
              const raw = localStorage.getItem(bestKey)!;
              const parsed = JSON.parse(raw);
              const bd = parsed?.data || {};
              
              const bootstrapTenantId = bd?.metadata?.tenant_id;
              const currentTenantId = tenant?.id;
              
              if (bootstrapTenantId && currentTenantId && bootstrapTenantId !== currentTenantId) {
                console.warn('[useCompanySettings] 🚨 BOOTSTRAP_TENANT_MISMATCH:', {
                  bootstrap_tenant: bootstrapTenantId,
                  current_tenant: currentTenantId,
                  action: 'IGNORING_BOOTSTRAP_DATA'
                });
                // Don't use bootstrap data from wrong tenant
                data = null;
              } else {
                // Bootstrap data is safe to use
                data = {
                  company_name: bd?.company_settings?.company_name || bd?.company_name || null,
                  logo_url: bd?.company_settings?.logo_url || bd?.logo_url || null,
                  tenant_id: bootstrapTenantId || null,
                  domain: bd?.company_settings?.domain || null,
                  header_color: bd?.company_settings?.header_color || undefined,
                  primary_color: bd?.company_settings?.primary_color || undefined,
                  secondary_color: bd?.company_settings?.secondary_color || undefined,
                  accent_color: bd?.company_settings?.accent_color || undefined,
                  favicon_url: bd?.company_settings?.favicon_url || null,
                };
                console.log('[useCompanySettings] ✅ Bootstrap fallback data validated and used');
              }
            }
          } catch (fallbackError) {
            console.warn('[useCompanySettings] Bootstrap fallback failed:', fallbackError);
          }
        }

        // Use data from API or bootstrap fallback - never persist tenant branding across users
        const resolvedCompanyName = data?.company_name || 'Base360';

        const newSettings = {
          company_name: resolvedCompanyName,
          logo_url: data?.logo_url ?? null,
          tenant_id: data?.tenant_id ?? null,
          domain: data?.domain ?? null,
          header_color: data?.header_color ?? '#1a1a1a', // Neutral defaults
          primary_color: data?.primary_color ?? '#ffffff',
          secondary_color: data?.secondary_color ?? '#f5f5f5',
          accent_color: data?.accent_color ?? '#0066cc',
          favicon_url: data?.favicon_url ?? null
        };

        // Update global state and notify all listeners
        notifyListeners(newSettings);
        hasLoadedOnce = true;
        lastLoadTime = Date.now();
      } catch (err) {
        console.error('Error loading company settings:', err);
        // On unexpected failure, use neutral defaults
        const fallbackSettings = {
          ...globalSettings,
          company_name: 'Base360', // Always use neutral default on error
        };
        notifyListeners(fallbackSettings);
        setError('Failed to load company settings');
      } finally {
        loadingPromise = null;
        setLoading(false);
      }
    })();

    await loadingPromise;
  };

  const updateSettings = useCallback(async (newSettings: Partial<CompanySettings>) => {
    try {
      const updatedSettings = { ...globalSettings, ...newSettings };
      
      // Optimistically update global state for instant UI updates
      notifyListeners(updatedSettings);

      // Persist via secure backend
      await SecureAPI.updateCompanySettings({
        company_name: updatedSettings.company_name,
        logo_url: updatedSettings.logo_url,
        domain: updatedSettings.domain ?? null,
        header_color: updatedSettings.header_color,
        primary_color: updatedSettings.primary_color,
        secondary_color: updatedSettings.secondary_color,
        accent_color: updatedSettings.accent_color,
        favicon_url: updatedSettings.favicon_url ?? null,
      });

      // Do NOT save to localStorage - could leak to wrong tenant

      return { success: true, error: null };
    } catch (error) {
      console.error('Error updating company settings:', error);
      // Revert optimistic update on error
      loadSettings();
      return { success: false, error: 'Failed to update company settings' };
    }
  }, []);

  const refreshSettings = useCallback(() => {
    // Force refresh by clearing the cache
    lastLoadTime = 0;
    loadSettings();
  }, []);

  return {
    settings,
    loading,
    error,
    refreshSettings,
    updateSettings
  };
}

// Context for providing company settings to the app
interface CompanySettingsContextType {
  settings: CompanySettings;
  loading: boolean;
  error: string | null;
  refreshSettings: () => void;
  updateSettings: (newSettings: Partial<CompanySettings>) => Promise<{ success: boolean; error: string | null }>;
}

const CompanySettingsContext = createContext<CompanySettingsContextType | undefined>(undefined);

export function CompanySettingsProvider({ children }: { children: ReactNode }) {
  const companySettings = useCompanySettings();
  
  return (
    <CompanySettingsContext.Provider value={companySettings}>
      {children}
    </CompanySettingsContext.Provider>
  );
}

export function useCompanySettingsContext() {
  const context = useContext(CompanySettingsContext);
  if (!context) {
    throw new Error('useCompanySettingsContext must be used within CompanySettingsProvider');
  }
  return context;
}
