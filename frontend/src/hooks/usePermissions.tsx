import {
  useState,
  useEffect,
  useContext,
  createContext,
  useCallback,
} from "react";
import { supabase } from "../lib/supabase";
import { SecureAPI } from "../lib/secureApi";
import { useAuth } from "../contexts/AuthContext.new";
import { useAppContext } from "../contexts/AppContext";
import { Permission } from "../types/auth";

interface PermissionsContextType {
  permissions: Permission[];
  hasPermission: (section: string, action: string) => boolean;
  hasAnyPermission: (section: string, actions: string[]) => boolean;
  loading: boolean;
  refreshPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: [],
  hasPermission: () => false,
  hasAnyPermission: () => false,
  loading: true,
  refreshPermissions: async () => {},
});

// Define admin emails in one place for consistency
const ADMIN_EMAILS = [
  "sid@theflexliving.com",
  "raouf@theflexliving.com",
  "michael@theflexliving.com",
];

function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email);
}

// Define the parent permission section and its children
const PARENT_PROPERTY_MAINTENANCE_SECTION = "property_maintenance";
const CHILD_PROPERTY_MAINTENANCE_SECTIONS = [
  "property_appliances",
  "property_building_information",
  "property_heating_system",
  "property_meters_emergency",
];

export const PermissionsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, tenantId, status: authStatus } = useAuth();
  const {
    permissions: appPermissions,
    isLoading: appLoading,
    refreshData,
  } = useAppContext();

  // One-time cached bootstrap to avoid empty flashes on refresh
  const getInitialCachedPerms = () => {
    try {
      const lastRaw = localStorage.getItem("auth_cache_last_tenant");
      const last = lastRaw ? JSON.parse(lastRaw) : null;
      const lastTid = last?.tenantId || tenantId || null;
      if (!lastTid) return null;
      const raw = localStorage.getItem(`auth_cache_permissions_${lastTid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.data) ? (parsed.data as Permission[]) : null;
    } catch {
      return null;
    }
  };

  const initialCachedPerms = getInitialCachedPerms();

  // Cast appPermissions to our Permission type since AppContext uses a looser type
  const [permissions, setPermissions] = useState<Permission[]>(
    initialCachedPerms || []
  );
  const [loading, setLoading] = useState(appLoading || !initialCachedPerms);
  const [lastTenantId, setLastTenantId] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(null);
  const [lastNonEmptyPermissions, setLastNonEmptyPermissions] = useState<
    Permission[] | null
  >(null);
  const [silentRefreshed, setSilentRefreshed] = useState(false);

  function loadCachedPermissions(tid: string | null): Permission[] | null {
    try {
      if (!tid) return null;
      const raw = localStorage.getItem(`auth_cache_permissions_${tid}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.data) && parsed.data.length > 0)
        return parsed.data as Permission[];
      return null;
    } catch {
      return null;
    }
  }

  // Sync permissions from AppContext
  useEffect(() => {
    let mounted = true;

    // IMPORTANT: Keep loading true if appContext is still loading
    if (appLoading) {
      console.log(
        "[PermissionsProvider] AppContext still loading, keeping loading state true"
      );
      if (mounted) {
        setLoading(true);
      }
      return;
    }

    if (mounted) {
      // Use permissions from AppContext which already includes everything
      if (appPermissions && appPermissions.length > 0) {
        console.log(
          `[PermissionsProvider] ✅ FRESH permissions from AppContext: ${appPermissions.length} permissions`
        );
        const smartViewPerms = appPermissions.filter((p) =>
          p.section.startsWith("smart_view_")
        );
        if (smartViewPerms.length > 0) {
          console.log(
            `[PermissionsProvider] Found ${smartViewPerms.length} smart view permissions`
          );
        }
        setPermissions(appPermissions as Permission[]);
        setLastNonEmptyPermissions(appPermissions as Permission[]);
        setLastTenantId(tenantId || null);
        setLastUserId(user?.id || null);
        setLoading(false);
        
        console.log('[PermissionsProvider] ✅ Fresh permissions applied successfully');
      }
      // Only use fallback if AppContext is not loading and we've explicitly failed to get fresh permissions
      // This prevents interference with fresh permission loading on page refresh
      else if (
        authStatus === "authenticated" &&
        !appLoading &&
        lastNonEmptyPermissions &&
        lastTenantId === (tenantId || null) &&
        lastUserId === (user?.id || null) &&
        (!appPermissions || appPermissions.length === 0) // Only if AppContext truly has no permissions
      ) {
        console.log(
          "[PermissionsProvider] Using last known permissions as final fallback (AppContext has no data)"
        );
        setPermissions(lastNonEmptyPermissions);
        setLoading(false);
      }
      // Try to hydrate from cached permissions if available for this tenant
      else if (authStatus !== "unauthenticated" && tenantId && user?.id) {
        const cachedPerms = (() => {
          try {
            const raw = localStorage.getItem(
              `auth_cache_permissions_${user?.id || 'anon'}_${tenantId}`
            );
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed?.data)
              ? (parsed.data as Permission[])
              : null;
          } catch {
            return null;
          }
        })();
        if (cachedPerms && cachedPerms.length > 0) {
          console.log(
            `[PermissionsProvider] Hydrated ${cachedPerms.length} permissions from cache for user ${user.id} tenant ${tenantId}`
          );
          setPermissions(cachedPerms);
          setLoading(false);
        } else if (!silentRefreshed) {
          // Silent refresh via AppContext/Auth to fetch fresh permissions
          console.log(
            "[PermissionsProvider] No permissions available; performing silent refresh"
          );
          setSilentRefreshed(true);
          fetchPermissions(true).catch(() => {});
          // As a fallback, query /auth/me directly to hydrate permissions cache
          (async () => {
            try {
              const me = await SecureAPI.getAuthMe();
              const perms = Array.isArray(me?.permissions)
                ? (me.permissions as Permission[])
                : [];
              const tid = me?.tenant_id || tenantId || null;
              if (perms.length > 0 && tid) {
                console.log(
                  `[PermissionsProvider] Hydrated ${perms.length} permissions via /auth/me for user ${user?.id} tenant ${tid}`
                );
                setPermissions(perms);
                setLastNonEmptyPermissions(perms);
                setLastTenantId(tid);
                setLastUserId(user?.id || null);
                // Persist to cache for next refresh
                try {
                  if (user?.id) {
                    localStorage.setItem(
                      `auth_cache_permissions_${user?.id || 'anon'}_${tid}`,
                      JSON.stringify({ ts: Date.now(), data: perms })
                    );
                  }
                } catch {}
              }
            } catch (e) {
              console.warn("[PermissionsProvider] /auth/me fallback failed", e);
            }
          })();
        }
      } else if (
        user &&
        (isAdminEmail(user.email || "") ||
          (user as any)?.app_metadata?.role === "admin")
      ) {
        // Admin fallback
        console.log(
          "[PermissionsProvider] Admin user detected, using wildcard permissions"
        );
        setPermissions([{ section: "*", action: "*" }]);
        setLoading(false);
      } else if (user) {
        // User is logged in but has no permissions (this is valid)
        console.log("[PermissionsProvider] User has no permissions");
        setPermissions([]);
        setLoading(false);
      } else {
        // No user - set loading to false since auth check is complete
        // This allows RouteGuard to properly handle the no-user case
        console.log(
          "[PermissionsProvider] No user detected, auth check complete"
        );
        setPermissions([]);
        setLoading(false);
      }
    }

    return () => {
      mounted = false;
    };
  }, [
    appPermissions,
    appLoading,
    user,
    tenantId,
    authStatus,
    lastNonEmptyPermissions,
    lastTenantId,
  ]);

  const fetchPermissions = useCallback(
    async (forceRefresh: boolean = false) => {
      // Instead of fetching separately, refresh the AppContext data
      console.log(
        "[PermissionsProvider] Refreshing permissions via AppContext"
      );
      if (refreshData) {
        await refreshData(forceRefresh);
      }
    },
    [refreshData]
  );

  // Normalize section aliases to match backend naming
  function normalizeSection(input: string): string {
    const s = (input || "").toLowerCase();
    const map: Record<string, string> = {
      // Common synonyms
      reservations: "all_reservations",
      property_details: "properties",
      property: "properties",
      props: "properties",
    };
    return map[s] || s;
  }

  const hasPermission = useCallback(
    (rawSection: string, action: string): boolean => {
      const section = normalizeSection(rawSection);
      
      console.log(`[hasPermission] 🔍 Checking permission: ${section}:${action}`, {
        rawSection,
        normalizedSection: section,
        action,
        loading,
        userEmail: user?.email,
        permissionsCount: permissions.length,
        firstFewPermissions: permissions.slice(0, 5).map(p => `${p.section}:${p.action}`)
      });
      
      // Debug logging for lockbox and keys permissions
      if (section === "lockbox" || section === "keys") {
        console.log(`[hasPermission] Checking ${section}:${action}`, {
          loading,
          user: user?.email,
          isAdmin: user && isAdminEmail(user.email || ""),
          permissionsCount: permissions.length,
          relevantPermissions: permissions.filter(
            (p) =>
              p.section === "lockbox" ||
              p.section === "internal_keys" ||
              p.section === "keynest"
          ),
          allPermissions: permissions.slice(0, 10), // Log first 10 for debugging
        });
      }

      // If still loading, return false
      if (loading) {
        console.log(`[hasPermission] ❌ Still loading, returning false for ${section}:${action}`);
        return false;
      }

      const userRole =
        (user as any)?.app_metadata?.role || (user as any)?.user_metadata?.role;
      const adminByRole = userRole === "admin";
      const adminByEmail = isAdminEmail(user?.email || "");
      
      console.log(`[hasPermission] Admin checks:`, {
        userRole,
        adminByRole,
        adminByEmail,
        userEmail: user?.email
      });
      
      if (adminByRole || adminByEmail) {
        console.log(`[hasPermission] ✅ Admin access granted for ${section}:${action}`);
        return true;
      }

      // Check if user is admin (has wildcard permission)
      const hasWildcardPermission = permissions.some((p) => p.section === "*" && p.action === "*");
      console.log(`[hasPermission] Wildcard permission check: ${hasWildcardPermission}`);
      
      if (hasWildcardPermission) {
        console.log(`[hasPermission] ✅ Wildcard permission granted for ${section}:${action}`);
        return true;
      }

      // Special handling for admin emails - they should have access to key management sections
      const isAdmin = user && isAdminEmail(user.email || "");
      if (
        isAdmin &&
        ["lockbox", "internal_keys", "keynest", "keys"].includes(section)
      ) {
        return true;
      }

      // Special handling for keys section - check if user has ANY key-related permission
      if (section === "keys" && action === "read") {
        const hasAnyKeyPermission = permissions.some(
          (p) =>
            (p.section === "internal_keys" ||
              p.section === "keynest" ||
              p.section === "lockbox") &&
            p.action === "read"
        );
        if (hasAnyKeyPermission) {
          console.log(
            `[hasPermission] User has at least one key permission, granting access to keys section`
          );
          return true;
        }
      }

      // Special handling for smart view permissions
      if (section.startsWith("smart_view_")) {
        // Debug logging for smart view permissions
        const smartViewPerms = permissions.filter((p) =>
          p.section.startsWith("smart_view_")
        );
        console.log(`[hasPermission] Smart View Check:`, {
          requestedSection: section,
          requestedAction: action,
          userSmartViewPerms: smartViewPerms.map((p) => ({
            section: p.section,
            action: p.action,
          })),
          allPermissions: permissions,
        });

        // Check if user has this specific smart view permission
        // The backend adds these permissions dynamically based on tenant smart views
        const hasSmartViewPermission = permissions.some((p) => {
          // Check exact section match
          if (p.section !== section) return false;

          // Check if action is allowed (read access allows viewing)
          const actionAllowed =
            p.action === action ||
            p.action === "*" ||
            p.action === "all" ||
            // Allow read for any permission level
            (action === "read" &&
              ["read", "update", "create", "delete", "*", "all"].includes(
                p.action
              ));

          if (actionAllowed) {
            console.log(
              `[hasPermission] ✅ Found matching smart view permission: ${p.section} with action ${p.action}`
            );
          }

          return actionAllowed;
        });

        if (hasSmartViewPermission) {
          return true;
        }

        console.log(
          `[hasPermission] ❌ No matching smart view permission found for ${section}:${action}`
        );
      }

      // Check for exact permission (after normalization)
      console.log(`[hasPermission] Looking for exact permission match: ${section}:${action}`);
      
      const matchingPermissions = permissions.filter(p => {
        const normalizedPSection = normalizeSection(p.section);
        const sectionMatch = normalizedPSection === section;
        const actionMatch = p.action === action || (action === "read" && p.action === "view");
        
        if (sectionMatch || actionMatch) {
          console.log(`[hasPermission] Permission candidate: ${p.section}:${p.action} (normalized: ${normalizedPSection}) - section match: ${sectionMatch}, action match: ${actionMatch}`);
        }
        
        return sectionMatch && actionMatch;
      });
      
      console.log(`[hasPermission] Found ${matchingPermissions.length} exact permission matches:`, matchingPermissions.map(p => `${p.section}:${p.action}`));
      
      const hasExactPermission = matchingPermissions.length > 0;

      if (hasExactPermission) {
        console.log(`[hasPermission] ✅ Exact permission found for ${section}:${action}`);
        return true;
      }

      // If the section is a child of property_maintenance, check if user has the parent permission
      if (CHILD_PROPERTY_MAINTENANCE_SECTIONS.includes(section)) {
        console.log(`[hasPermission] Checking parent permission for child section: ${section}`);
        const hasParentPermission = permissions.some(
          (p) =>
            p.section === PARENT_PROPERTY_MAINTENANCE_SECTION &&
            p.action === action
        );

        console.log(`[hasPermission] Parent permission check result: ${hasParentPermission}`);

        if (hasParentPermission) {
          console.log(`[hasPermission] ✅ Parent permission granted for ${section}:${action}`);
          return true;
        }
      }

      console.log(`[hasPermission] ❌ No permission found for ${section}:${action}`);
      return false;
    },
    [permissions, loading, user]
  );

  const hasAnyPermission = useCallback(
    (section: string, actions: string[]): boolean => {
      // If still loading, return false
      if (loading) {
        return false;
      }

      // Check if user is admin (has wildcard permission)
      if (permissions.some((p) => p.section === "*" && p.action === "*")) {
        return true;
      }

      // Check if user has any of the specified actions for the section
      return actions.some((action) => hasPermission(section, action));
    },
    [permissions, loading, hasPermission]
  );

  const refreshPermissions = useCallback(async () => {
    // Force refresh from backend, clearing any cache
    await fetchPermissions(true);
  }, [fetchPermissions]);

  return (
    <PermissionsContext.Provider
      value={{
        permissions,
        hasPermission,
        hasAnyPermission,
        loading,
        refreshPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => useContext(PermissionsContext);

// Silently refresh and reconcile permissions cache per user+tenant after authentication
// Ensures user-specific cache stays accurate without requiring manual refresh
export function usePermissionsSilentReconciler() {
  const { user, tenantId, status: authStatus } = useAuth();
  const { permissions, loading, refreshPermissions } = usePermissions();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (authStatus !== "authenticated" || !user?.id || !tenantId) return;
      if (loading) return; // wait for initial hydration
      try {
        const fresh = await SecureAPI.getAuthMe(true);
        const freshPerms = Array.isArray(fresh?.permissions)
          ? fresh.permissions
          : [];
        // Compare with cached
        const cacheKey = `auth_cache_permissions_${user?.id || 'anon'}_${tenantId}`;
        let cachedPerms: any[] = [];
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed?.data)) cachedPerms = parsed.data;
          }
        } catch {}
        const eq = (a: any[], b: any[]) =>
          JSON.stringify(a) === JSON.stringify(b);
        if (!eq(freshPerms, cachedPerms)) {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({ ts: Date.now(), data: freshPerms })
          );
          // Trigger PermissionsProvider to pick up updated cache
          await refreshPermissions();
        }
      } catch (e) {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authStatus, user?.id, tenantId, loading, permissions]);
}
