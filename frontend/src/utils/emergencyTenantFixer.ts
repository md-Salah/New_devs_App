/**
 * 
 * corrupted branding data, and persistent cache issues.
 */

// Known tenant mappings for validation
const KNOWN_TENANTS = {
  'homely': '5a382f72-aec3-40f1-9063-89476ae00669',
  'flex': 'a860bda4-b44f-471c-9464-8456bbeb7d38'
} as const;

const WRONG_TENANT_INDICATORS = {
  'automation@theflex.global': 'a860bda4-b44f-471c-9464-8456bbeb7d38', // Should NOT appear for other users
  'The Flex': 'a860bda4-b44f-471c-9464-8456bbeb7d38', // Company name that shouldn't appear for Homely users
};

export interface TenantFixResult {
  success: boolean;
  actions: string[];
  errors: string[];
  clearedKeys: number;
  foundConflicts: number;
}

/**
 */
export const emergencyTenantFix = async (expectedTenant?: string): Promise<TenantFixResult> => {
  const result: TenantFixResult = {
    success: false,
    actions: [],
    errors: [],
    clearedKeys: 0,
    foundConflicts: 0
  };

  try {
    result.actions.push('🔍 Starting emergency tenant conflict detection...');

    // Phase 1: Detect tenant conflicts in localStorage
    const conflicts = detectTenantConflicts();
    result.foundConflicts = conflicts.length;
    
    if (conflicts.length > 0) {
      result.actions.push(`🚨 Found ${conflicts.length} tenant conflicts:`);
      conflicts.forEach(conflict => {
        result.actions.push(`  - ${conflict.type}: ${conflict.description}`);
      });
    } else {
      result.actions.push('✅ No obvious tenant conflicts detected in localStorage');
    }

    // Phase 2: Clear corrupted bootstrap data
    const bootstrapCleared = clearCorruptedBootstrapData();
    result.clearedKeys += bootstrapCleared;
    if (bootstrapCleared > 0) {
      result.actions.push(`🧹 Cleared ${bootstrapCleared} corrupted bootstrap entries`);
    }

    // Phase 3: Clear tenant-specific caches
    const cacheCleared = clearTenantSpecificCaches(expectedTenant);
    result.clearedKeys += cacheCleared;
    if (cacheCleared > 0) {
      result.actions.push(`🗑️ Cleared ${cacheCleared} tenant-specific cache entries`);
    }

    // Phase 4: Clear company branding data
    const brandingCleared = clearCompanyBrandingData();
    result.clearedKeys += brandingCleared;
    if (brandingCleared > 0) {
      result.actions.push(`🎨 Cleared ${brandingCleared} company branding cache entries`);
    }

    // Phase 5: Clear authentication conflicts
    const authCleared = clearAuthenticationConflicts();
    result.clearedKeys += authCleared;
    if (authCleared > 0) {
      result.actions.push(`🔐 Cleared ${authCleared} authentication conflict entries`);
    }

    // Phase 6: Validate current session consistency
    const sessionValidation = validateCurrentSession();
    result.actions.push(sessionValidation.message);
    if (sessionValidation.hasIssues) {
      result.actions.push('⚠️ Session validation found issues - recommend full logout/login');
    }

    result.success = true;
    result.actions.push(`✅ Emergency fix completed: ${result.clearedKeys} entries cleared`);

  } catch (error) {
    result.errors.push(`Emergency fix failed: ${error}`);
    console.error('Emergency tenant fix error:', error);
  }

  return result;
};

/**
 * Detect tenant conflicts in localStorage
 */
function detectTenantConflicts(): Array<{type: string, description: string, severity: 'high' | 'medium' | 'low'}> {
  const conflicts = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      // Check for wrong tenant IDs in keys or values
      Object.entries(WRONG_TENANT_INDICATORS).forEach(([indicator, tenantId]) => {
        if (key.includes(indicator) || value.includes(indicator)) {
          conflicts.push({
            type: 'tenant_indicator',
            description: `Found "${indicator}" in ${key}`,
            severity: 'high' as const
          });
        }
        
        if (value.includes(tenantId)) {
          conflicts.push({
            type: 'wrong_tenant_id',
            description: `Found wrong tenant ID ${tenantId} in ${key}`,
            severity: 'high' as const
          });
        }
      });

      // Check for mixed tenant data in bootstrap
      if (key.startsWith('app_bootstrap_data_')) {
        try {
          const parsed = JSON.parse(value);
          const tenantId = parsed?.data?.metadata?.tenant_id;
          const companyName = parsed?.data?.company_settings?.company_name || parsed?.data?.company_name;
          
          if (tenantId && companyName) {
            // Check for mismatched tenant/company combinations
            if (tenantId === KNOWN_TENANTS.homely && companyName === 'The Flex') {
              conflicts.push({
                type: 'branding_mismatch',
                description: `Homely tenant showing Flex branding in ${key}`,
                severity: 'high' as const
              });
            }
            if (tenantId === KNOWN_TENANTS.flex && companyName === 'Homely') {
              conflicts.push({
                type: 'branding_mismatch',
                description: `Flex tenant showing Homely branding in ${key}`,
                severity: 'high' as const
              });
            }
          }
        } catch (e) {
          conflicts.push({
            type: 'corrupt_bootstrap',
            description: `Corrupted bootstrap data in ${key}`,
            severity: 'medium' as const
          });
        }
      }
    }
  } catch (error) {
    console.error('Error detecting tenant conflicts:', error);
  }

  return conflicts;
}

/**
 * Clear corrupted bootstrap data
 */
function clearCorruptedBootstrapData(): number {
  let cleared = 0;

  try {
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith('app_bootstrap_data_')) {
        try {
          const value = localStorage.getItem(key);
          if (!value) {
            keysToRemove.push(key);
            continue;
          }

          const parsed = JSON.parse(value);
          const timestamp = parsed?.timestamp;
          const data = parsed?.data;

          // Remove if too old (> 24 hours)
          if (timestamp && (Date.now() - timestamp) > 24 * 60 * 60 * 1000) {
            keysToRemove.push(key);
            continue;
          }

          if (!data || !data.metadata) {
            keysToRemove.push(key);
            continue;
          }

          // Remove if contains wrong tenant indicators
          const valueStr = JSON.stringify(data);
          if (valueStr.includes('automation@theflex.global') || 
              (valueStr.includes('The Flex') && valueStr.includes(KNOWN_TENANTS.homely))) {
            keysToRemove.push(key);
          }

        } catch (e) {
          // Invalid JSON - remove it
          keysToRemove.push(key);
        }
      }
    }

    // Remove all identified keys
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        cleared++;
      } catch (e) {
        console.warn(`Failed to remove bootstrap key ${key}:`, e);
      }
    });

  } catch (error) {
    console.error('Error clearing corrupted bootstrap data:', error);
  }

  return cleared;
}

/**
 * Clear tenant-specific caches
 */
function clearTenantSpecificCaches(expectedTenant?: string): number {
  let cleared = 0;

  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Clear any keys containing wrong tenant IDs
      Object.values(KNOWN_TENANTS).forEach(tenantId => {
        if (key.includes(tenantId) && expectedTenant && tenantId !== expectedTenant) {
          keysToRemove.push(key);
        }
      });

      // Clear specific cache types that might contain tenant data
      const cacheTypes = [
        'cities_cache_',
        'properties_cache_',
        'reservations_cache_',
        'user_cache_',
        'auth_cache_'
      ];

      cacheTypes.forEach(cacheType => {
        if (key.startsWith(cacheType)) {
          keysToRemove.push(key);
        }
      });
    }

    // Remove duplicates and clear
    [...new Set(keysToRemove)].forEach(key => {
      try {
        localStorage.removeItem(key);
        cleared++;
      } catch (e) {
        console.warn(`Failed to remove cache key ${key}:`, e);
      }
    });

  } catch (error) {
    console.error('Error clearing tenant-specific caches:', error);
  }

  return cleared;
}

/**
 * Clear company branding data that might be wrong
 */
function clearCompanyBrandingData(): number {
  let cleared = 0;

  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Clear branding-related keys
      const brandingKeywords = [
        'company_settings',
        'branding',
        'logo',
        'theme',
        'colors'
      ];

      if (brandingKeywords.some(keyword => key.toLowerCase().includes(keyword))) {
        keysToRemove.push(key);
      }

      // Check values for wrong branding
      try {
        const value = localStorage.getItem(key);
        if (value && (
          value.includes('The Flex') ||
          value.includes('#284E4C') ||  // Flex green color
          value.includes('automation@theflex.global')
        )) {
          keysToRemove.push(key);
        }
      } catch (e) {
        // Ignore non-JSON values
      }
    }

    // Remove identified keys
    [...new Set(keysToRemove)].forEach(key => {
      try {
        localStorage.removeItem(key);
        cleared++;
      } catch (e) {
        console.warn(`Failed to remove branding key ${key}:`, e);
      }
    });

  } catch (error) {
    console.error('Error clearing company branding data:', error);
  }

  return cleared;
}

/**
 * Clear authentication conflicts
 */
function clearAuthenticationConflicts(): number {
  let cleared = 0;

  try {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      // Clear auth-related keys that might have conflicts
      if (key.includes('supabase') || 
          key.includes('auth') || 
          key.includes('session') ||
          key.includes('token')) {
        
        try {
          const value = localStorage.getItem(key);
          if (value && value.includes('automation@theflex.global')) {
            keysToRemove.push(key);
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
        cleared++;
      } catch (e) {
        console.warn(`Failed to remove auth key ${key}:`, e);
      }
    });

  } catch (error) {
    console.error('Error clearing authentication conflicts:', error);
  }

  return cleared;
}

/**
 * Validate current session consistency
 */
function validateCurrentSession(): {message: string, hasIssues: boolean} {
  try {
    // Check for obvious session inconsistencies
    const authKeys = [];
    const tenantIds = new Set<string>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.includes('auth') || key.includes('supabase')) {
        authKeys.push(key);
        
        try {
          const value = localStorage.getItem(key);
          if (value) {
            // Extract tenant IDs from auth data
            Object.values(KNOWN_TENANTS).forEach(tenantId => {
              if (value.includes(tenantId)) {
                tenantIds.add(tenantId);
              }
            });
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    if (tenantIds.size > 1) {
      return {
        message: `🚨 Session inconsistency: Found ${tenantIds.size} different tenant IDs in auth data`,
        hasIssues: true
      };
    }

    if (authKeys.length === 0) {
      return {
        message: '⚠️ No auth keys found - user may need to login',
        hasIssues: true
      };
    }

    return {
      message: `✅ Session validation passed: ${authKeys.length} auth keys, 1 tenant context`,
      hasIssues: false
    };

  } catch (error) {
    return {
      message: `❌ Session validation failed: ${error}`,
      hasIssues: true
    };
  }
}

/**
 */
export const getManualFixInstructions = (result: TenantFixResult): string[] => {
  const instructions = [];

  if (result.foundConflicts > 0) {
    instructions.push('1. Close all browser tabs for this application');
    instructions.push('2. Open a new incognito/private browsing window');
    instructions.push('3. Navigate to the login page');
    instructions.push('4. Login with the correct account only');
    instructions.push('5. Do not login with multiple accounts simultaneously');
  }

  if (result.errors.length > 0) {
    instructions.push('6. If issues persist, contact support with error details');
  }

  return instructions;
};

/**
 */
if (typeof window !== 'undefined') {
  (window as any).emergencyTenantFix = emergencyTenantFix;
  (window as any).getManualFixInstructions = getManualFixInstructions;
}