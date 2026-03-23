import { supabase, adminClient } from './supabase';
import { Permission } from '../types/auth';

/**
 * Utility functions for user permissions management
 */

export interface UserPermissionsCheck {
  userId: string;
  hasValidPermissions: boolean;
  permissionsCount: number;
  citiesCount: number;
  errors: string[];
  warnings: string[];
}

/**
 * Comprehensive check of user permissions and database integrity
 */
export async function checkUserPermissions(userId: string): Promise<UserPermissionsCheck> {
  const result: UserPermissionsCheck = {
    userId,
    hasValidPermissions: false,
    permissionsCount: 0,
    citiesCount: 0,
    errors: [],
    warnings: []
  };

  try {
    // Note: We cannot use auth.admin.getUserById from frontend
    // This would require service role key which should never be exposed to frontend
    // Instead, we'll check permissions and cities directly from allowed tables

    // Check user_permissions table
    const { data: permissions, error: permissionsError } = await supabase
      .from('user_permissions')
      .select('section, action')
      .eq('user_id', userId);

    if (permissionsError) {
      result.errors.push(`Error fetching permissions: ${permissionsError.message}`);
    } else {
      result.permissionsCount = permissions?.length || 0;
      
      // Validate permission structure
      if (permissions) {
        permissions.forEach((perm, index) => {
          if (!perm.section || !perm.action) {
            result.warnings.push(`Invalid permission at index ${index}: missing section or action`);
          }
        });
      }
    }

    // Check users_city table
    const { data: cities, error: citiesError } = await supabase
      .from('users_city')
      .select('city_name')
      .eq('user_id', userId);

    if (citiesError) {
      result.errors.push(`Error fetching cities: ${citiesError.message}`);
    } else {
      result.citiesCount = cities?.length || 0;
      
      // Validate city names
      const validCities = ['london', 'paris', 'algiers', 'lisbon'];
      if (cities) {
        cities.forEach((city, index) => {
          if (!validCities.includes(city.city_name)) {
            result.warnings.push(`Invalid city at index ${index}: ${city.city_name}`);
          }
        });
      }
    }

    // Check current user's session to determine admin status
    const { data: { session } } = await supabase.auth.getSession();
    const isAdmin = permissions?.some(p => p.section === '*' && p.action === '*') || false;
    
    if (isAdmin && result.citiesCount === 0) {
      result.warnings.push('Admin user should have access to all cities');
    }

    // Determine if permissions are valid
    result.hasValidPermissions = result.errors.length === 0 && (result.permissionsCount > 0 || isAdmin);

    return result;
  } catch (error: any) {
    result.errors.push(`Unexpected error: ${error.message}`);
    return result;
  }
}

/**
 * Batch check multiple users' permissions
 */
export async function batchCheckUserPermissions(userIds: string[]): Promise<UserPermissionsCheck[]> {
  const results = await Promise.all(
    userIds.map(userId => checkUserPermissions(userId))
  );
  
  return results;
}

/**
 * Repair user permissions by ensuring proper database entries
 */
export async function repairUserPermissions(userId: string, permissions: Permission[], cities: string[]): Promise<boolean> {
  try {
    // Start a transaction-like operation
    
    // 1. Clear existing permissions
    const { error: deletePermError } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId);

    if (deletePermError) {
      console.error('Error deleting existing permissions:', deletePermError);
      throw deletePermError;
    }

    // 2. Clear existing cities
    const { error: deleteCitiesError } = await supabase
      .from('users_city')
      .delete()
      .eq('user_id', userId);

    if (deleteCitiesError) {
      console.error('Error deleting existing cities:', deleteCitiesError);
      throw deleteCitiesError;
    }

    // 3. Insert new permissions
    if (permissions.length > 0) {
      const { error: insertPermError } = await supabase
        .from('user_permissions')
        .insert(
          permissions.map(p => ({
            user_id: userId,
            section: p.section,
            action: p.action
          }))
        );

      if (insertPermError) {
        console.error('Error inserting new permissions:', insertPermError);
        throw insertPermError;
      }
    }

    // 4. Insert new cities
    if (cities.length > 0) {
      const { error: insertCitiesError } = await supabase
        .from('users_city')
        .insert(
          cities.map(city => ({
            user_id: userId,
            city_name: city
          }))
        );

      if (insertCitiesError) {
        console.error('Error inserting new cities:', insertCitiesError);
        throw insertCitiesError;
      }
    }

    console.log(`Successfully repaired permissions for user ${userId}`);
    return true;
  } catch (error: any) {
    console.error('Error repairing user permissions:', error);
    return false;
  }
}

/**
 * Get detailed permissions report for debugging
 */
export async function getPermissionsReport(): Promise<{
  totalUsers: number;
  usersWithPermissions: number;
  usersWithCities: number;
  orphanedPermissions: number;
  orphanedCities: number;
  errors: string[];
}> {
  const report = {
    totalUsers: 0,
    usersWithPermissions: 0,
    usersWithCities: 0,
    orphanedPermissions: 0,
    orphanedCities: 0,
    errors: []
  };

  try {
    // Note: We cannot use auth.admin.listUsers from frontend
    // This would require service role key which should never be exposed to frontend
    // Instead, we need to call the backend API to get this information
    report.errors.push('Cannot generate full report from frontend - requires backend API');
    return report;

    report.totalUsers = authUsers?.users?.length || 0;
    const userIds = authUsers?.users?.map(u => u.id) || [];

    // Check permissions table
    const { data: allPermissions, error: permError } = await supabase
      .from('user_permissions')
      .select('user_id')
      .in('user_id', userIds);

    if (permError) {
      report.errors.push(`Error fetching permissions: ${permError.message}`);
    } else {
      const usersWithPerms = new Set(allPermissions?.map(p => p.user_id) || []);
      report.usersWithPermissions = usersWithPerms.size;
    }

    // Check cities table
    const { data: allCities, error: citiesError } = await supabase
      .from('users_city')
      .select('user_id')
      .in('user_id', userIds);

    if (citiesError) {
      report.errors.push(`Error fetching cities: ${citiesError.message}`);
    } else {
      const usersWithCities = new Set(allCities?.map(c => c.user_id) || []);
      report.usersWithCities = usersWithCities.size;
    }

    // Check for orphaned records
    const { data: orphanedPerms, error: orphanedPermError } = await supabase
      .from('user_permissions')
      .select('user_id')
      .not('user_id', 'in', `(${userIds.map(id => `'${id}'`).join(',')})`);

    if (!orphanedPermError) {
      report.orphanedPermissions = orphanedPerms?.length || 0;
    }

    const { data: orphanedCitiesData, error: orphanedCitiesError } = await supabase
      .from('users_city')
      .select('user_id')
      .not('user_id', 'in', `(${userIds.map(id => `'${id}'`).join(',')})`);

    if (!orphanedCitiesError) {
      report.orphanedCities = orphanedCitiesData?.length || 0;
    }

    return report;
  } catch (error: any) {
    report.errors.push(`Unexpected error: ${error.message}`);
    return report;
  }
}
