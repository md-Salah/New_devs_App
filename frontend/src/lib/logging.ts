import { supabase } from './supabase';
import { SecureAPI } from './secureApi';
import { ActivityLog, LogFilters } from '../types/logging';

export async function createLog(log: Partial<ActivityLog>): Promise<ActivityLog | null> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Authentication error:', authError);
      return null;
    }

    if (!user) {
      console.error('No authenticated user found');
      return null;
    }

    // Ensure required fields are present
    if (!log.section || !log.action || !log.entity_type) {
      console.error('Missing required fields for log:', { section: log.section, action: log.action, entity_type: log.entity_type });
      throw new Error('Missing required fields for log entry');
    }

    // Ensure entity_id is a string
    const entityId = typeof log.entity_id === 'string' ? log.entity_id : String(log.entity_id);

    // Get property and city via SecureAPI (for property-related logs)
    let propertyName, cityName;
    if (log.entity_type === 'property' && entityId) {
      try {
        const prop = await SecureAPI.getPropertyById(entityId);
        propertyName = prop?.property?.internal_listing_name || prop?.internal_listing_name;
        cityName = prop?.property?.city || prop?.city;
      } catch { }
    }

    // Get user's city access via /auth/me
    let userCities: any[] = [];
    try {
      const me = await SecureAPI.getAuthMe();
      userCities = me?.cities || [];
    } catch { }

    // Prepare log data
    const logData = {
      ...log,
      user_id: user.id,
      entity_id: entityId,
      metadata: {
        ...log.metadata,
        browser: navigator.userAgent,
        timestamp: new Date().toISOString(),
        property_name: propertyName,
        city: cityName,
        user_cities: userCities?.map(c => c.city_name) || []
      }
    };

    // Insert log
    try {
      const created = await SecureAPI.createLog(logData);
      return created || null;
    } catch (e) {
      console.error('Error creating log via API:', e);
      return null;
    }
  } catch (error) {
    console.error('Unexpected error creating activity log:', error);
    return null;
  }
}

export async function fetchLogs(filters: LogFilters = {}, page = 1, pageSize = 10) {
  try {
    // Fetch via SecureAPI
    const { data, count } = await SecureAPI.getLogs({
      searchTerm: filters.searchTerm,
      user_id: filters.user_id,
      section: filters.section,
      entity_type: filters.entity_type,
      action: filters.action,
      user_type: filters.user_type as any,
      sortAscending: !!filters.sortAscending,
      page,
      page_size: pageSize
    });

    // Process the data to include user names
    const processedData = (data || []) as any[];
    const userIds = Array.from(new Set(processedData.map(l => l.user_id).filter(Boolean)));
    const brief = userIds.length ? await SecureAPI.getUsersBrief(userIds) : [];
    const userMap = new Map<string, { name?: string; email?: string }>();
    brief.forEach(u => userMap.set(u.id, { name: u.name, email: u.email }));
    const withNames = processedData.map(log => ({
      ...log,
      user_name: (() => {
        // Prioritize stored creator name from log entry (new approach)
        if (log.created_by_name) {
          return log.created_by_name;
        }

        // Fallback to user resolution (legacy approach)
        const u = userMap.get(log.user_id);
        if (!u) return 'System';
        return u.name || (u.email ? u.email.split('@')[0] : 'System');
      })()
    }));

    // Get property information for logs related to properties
    const propertyIds = [...new Set(
      withNames
        .filter(log => log.entity_type === 'property' && log.entity_id)
        .map(log => log.entity_id)
    )];

    if (propertyIds.length > 0) {
      const props = await Promise.all(propertyIds.map(async (pid) => {
        try { const p = await SecureAPI.getPropertyById(pid); return { id: pid, name: p?.property?.internal_listing_name || p?.internal_listing_name }; } catch { return { id: pid, name: undefined }; }
      }));
      const propertyMap = Object.fromEntries(props.filter(p => p.name).map(p => [p.id, p.name!]));
      withNames.forEach(log => {
        if (log.entity_type === 'property' && log.entity_id && propertyMap[log.entity_id]) {
          log.property_name = propertyMap[log.entity_id];
        }
      });
    }

    return { data: withNames, count: count || 0 };
  } catch (error) {
    console.error('Unexpected error fetching logs:', error);
    return { data: [], count: 0 };
  }
}

export async function exportLogs(filters: LogFilters = {}) {
  try {
    const { data } = await SecureAPI.exportLogs({
      searchTerm: filters.searchTerm,
      user_id: filters.user_id,
      section: filters.section,
      entity_type: filters.entity_type,
      action: filters.action,
      user_type: filters.user_type as any,
      sortAscending: !!filters.sortAscending
    });

    // Process the data to include user names
    const processedData = (data || []) as any[];
    const userIds = Array.from(new Set(processedData.map(l => l.user_id).filter(Boolean)));
    const brief = userIds.length ? await SecureAPI.getUsersBrief(userIds) : [];
    const userMap = new Map<string, { name?: string; email?: string }>();
    brief.forEach(u => userMap.set(u.id, { name: u.name, email: u.email }));
    const withNames = processedData.map(log => ({
      ...log,
      user_name: (() => {
        // Prioritize stored creator name from log entry (new approach)
        if (log.created_by_name) {
          return log.created_by_name;
        }

        // Fallback to user resolution (legacy approach)
        const u = userMap.get(log.user_id);
        if (!u) return 'System';
        return u.name || (u.email ? u.email.split('@')[0] : 'System');
      })()
    }));

    // Get property information for logs related to properties
    const propertyIds = [...new Set(
      withNames
        .filter(log => log.entity_type === 'property' && log.entity_id)
        .map(log => log.entity_id)
    )];

    if (propertyIds.length > 0) {
      const props = await Promise.all(propertyIds.map(async (pid) => {
        try { const p = await SecureAPI.getPropertyById(pid); return { id: pid, name: p?.property?.internal_listing_name || p?.internal_listing_name }; } catch { return { id: pid, name: undefined }; }
      }));
      const propertyMap = Object.fromEntries(props.filter(p => p.name).map(p => [p.id, p.name!]));
      withNames.forEach(log => {
        if (log.entity_type === 'property' && log.entity_id && propertyMap[log.entity_id]) {
          log.property_name = propertyMap[log.entity_id];
        }
      });
    }

    return withNames;
  } catch (error) {
    console.error('Unexpected error exporting logs:', error);
    return [];
  }
}
