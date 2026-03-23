import { supabase } from './supabase';
import { createLog } from './logging';
import {
  Permission,
  TimeRestriction,
  EmergencyAccess,
  AccessLog
} from '../types/rbac';

// Permission Management
export async function createPermission(permission: Partial<Permission>): Promise<Permission> {
  try {
    const { data, error } = await supabase
      .from('permissions')
      .insert([permission])
      .select()
      .single();

    if (error) throw error;

    await createLog({
      action: 'create',
      section: 'rbac',
      entity_type: 'permission',
      entity_id: data.id,
      context: `Created permission: ${permission.name}`
    });

    return data;
  } catch (error) {
    console.error('Error creating permission:', error);
    throw error;
  }
}

export async function grantEmergencyAccess(
  userId: string,
  permissions: Record<string, any>,
  reason: string,
  validUntil: string
): Promise<EmergencyAccess> {
  try {
    const { data, error } = await supabase
      .from('emergency_access')
      .insert([{
        user_id: userId,
        permissions,
        reason,
        valid_from: new Date().toISOString(),
        valid_until: validUntil
      }])
      .select()
      .single();

    if (error) throw error;

    await createLog({
      action: 'create',
      section: 'rbac',
      entity_type: 'emergency_access',
      entity_id: data.id,
      context: `Granted emergency access to user ${userId}`
    });

    return data;
  } catch (error) {
    console.error('Error granting emergency access:', error);
    throw error;
  }
}

// Access Logging
export async function getAccessLogs(filters: {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AccessLog[]> {
  try {
    let query = supabase
      .from('access_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.resource) query = query.eq('resource', filters.resource);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching access logs:', error);
    throw error;
  }
}

// Permission Checking
export async function checkPermission(permissionName: string, resource?: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_user_permission', {
      p_permission_name: permissionName,
      p_resource: resource
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}