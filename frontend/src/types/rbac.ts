export type PermissionLevel = 'module' | 'feature' | 'record' | 'field' | 'action';
export type AccessType = 'view' | 'create' | 'edit' | 'delete' | 'approve';

export interface Permission {
  id: string;
  name: string;
  description?: string;
  level: PermissionLevel;
  access_type: AccessType;
  resource: string;
  conditions: Record<string, any>;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface TimeRestriction {
  id: string;
  permission_id?: string;
  user_id?: string;
  day_of_week: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface EmergencyAccess {
  id: string;
  user_id: string;
  granted_by?: string;
  reason: string;
  permissions: Record<string, any>;
  valid_from: string;
  valid_until: string;
  revoked_at?: string;
  revoked_by?: string;
  revocation_reason?: string;
  created_at: string;
}

export interface AccessLog {
  id: string;
  user_id?: string;
  permission_id?: string;
  action: string;
  resource: string;
  success: boolean;
  error_message?: string;
  metadata: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}