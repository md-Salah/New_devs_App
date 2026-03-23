import { Permission } from './rbac';

export interface Permission {
  section: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'modify_status_only' | 'manager' | 'refund' | 'manage_orders' | '*' | 'all';
}

export type CityId = string; // dynamic, tenant-scoped

export interface User {
  id: string;
  email: string;
  name?: string;
  department?: string;
  avatar_url?: string;
  permissions: Permission[];
  cities: CityId[];
  created_at: string;
  updated_at: string;
  status: 'active' | 'inactive'; // Add status field
  isAdmin?: boolean; // Add isAdmin field
  user_metadata?: any; // Add user_metadata field
  app_metadata?: any; // Add app_metadata field
  tenant_role?: string;
  last_sign_in_at?: string; // Add last_sign_in_at field
  banned?: boolean; // Add banned field
}

export interface Section {
  id: string;
  name: string;
  description: string;
  permissions: ('create' | 'read' | 'update' | 'delete' | 'modify_status_only' | 'manager' | 'refund' | 'manage_orders')[];
}

export const AVAILABLE_SECTIONS: Section[] = [
  // Dashboard
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Main dashboard and overview',
    permissions: ['read']
  },
  
  // Properties - Main section
  {
    id: 'properties',
    name: 'Property Details',
    description: 'Property information and management',
    permissions: ['read', 'create', 'update', 'delete']
  },
  
  // Properties - Subsections
  {
    id: 'property_summary',
    name: 'Property Summary',
    description: 'Property overview and basic information',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_checkin',
    name: 'Property Check-in',
    description: 'Check-in information and procedures',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'checkin_steps',
    name: 'Check-in Steps',
    description: 'Step-by-step check-in instructions for guests',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'assigned_lockboxes',
    name: 'Assigned Lockboxes',
    description: 'Lockboxes assigned to property in check-in instructions',
    permissions: ['read', 'create', 'update', 'delete', 'modify_status_only']
  },
  {
    id: 'house_manuals',
    name: 'House Manuals',
    description: 'Property house manuals and guidebook management',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'local_guides',
    name: 'Local Guides',
    description: 'Property local guides and recommendations management',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_maintenance',
    name: 'Property Maintenance',
    description: 'Maintenance records and scheduling',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_contracts',
    name: 'Property Contracts',
    description: 'Contract management and documentation',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_utilities',
    name: 'Property Utilities',
    description: 'Utility services and management',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_amenities',
    name: 'Property Amenities',
    description: 'Property amenities and features',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_landlord_details',
    name: 'Property Landlord Details',
    description: 'Landlord information and contact details',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_layout',
    name: 'Property Layout',
    description: 'Property layout and floor plans',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_location',
    name: 'Property Location',
    description: 'Location details and neighborhood information',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_access',
    name: 'Property Access',
    description: 'Access codes and entry information',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_appliances_summary',
    name: 'Property Appliances Summary',
    description: 'Summary of property appliances',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_contract_landlord_summary',
    name: 'Property Contract/Landlord Summary',
    description: 'Contract and landlord summary information',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_appliances',
    name: 'Property Appliances',
    description: 'Detailed appliance information',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_meters_emergency',
    name: 'Property Meters & Emergency',
    description: 'Meter readings and emergency contacts',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_building_information',
    name: 'Property Building Information',
    description: 'Building details and specifications',
    permissions: ['read', 'create', 'update', 'delete']
  },
  {
    id: 'property_heating_system',
    name: 'Property Heating System',
    description: 'Heating system details and controls',
    permissions: ['read', 'create', 'update', 'delete']
  },
  
  // Distribution
  {
    id: 'reputation',
    name: 'Reputation',
    description: 'Property ratings and reviews management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'distribution_custom_views',
    name: 'Distribution Custom Views',
    description: 'Custom views for distribution analytics',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'distribution_custom_views_activity',
    name: 'Distribution Custom Views Activity',
    description: 'View activity logs for distribution custom views',
    permissions: ['read']
  },
  
  // Operations
  {
    id: 'cleaning',
    name: 'Cleaning',
    description: 'Cleaning reports and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    description: 'Property maintenance and repairs',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'lockbox',
    name: 'Lockbox',
    description: 'Property lockbox management',
    permissions: ['create', 'read', 'update', 'delete', 'modify_status_only']
  },
  {
    id: 'internal_keys',
    name: 'Internal Keys',
    description: 'Internal property key management',
    permissions: ['create', 'read', 'update', 'delete', 'modify_status_only']
  },
  {
    id: 'keynest',
    name: 'KeyNest',
    description: 'KeyNest integration management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'run_schedule',
    name: 'Run Schedule',
    description: 'Operations scheduling and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'operations_custom_views',
    name: 'Operations Custom Views',
    description: 'Custom views for operations management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'operations_custom_views_activity',
    name: 'Operations Custom Views Activity',
    description: 'View activity logs for operations custom views',
    permissions: ['read']
  },
  
  // Customer Service
  {
    id: 'reservations',
    name: 'Reservations',
    description: 'General reservations access and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'all_reservations',
    name: 'All Reservations',
    description: 'View and manage all reservations',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'reservation_tool',
    name: 'Reservation Tool',
    description: 'Advanced reservation management tools',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'financial_custom_fields',
    name: 'Financial Custom Fields',
    description: 'Manage custom fields in Financial Overview',
    permissions: ['create']
  },
  {
    id: 'maintenance_approvals',
    name: 'Maintenance Approvals',
    description: 'Review and manage maintenance block requests',
    permissions: ['read']
  },
  {
    id: 'ai_agent',
    name: 'AI Agent',
    description: 'AI-powered customer service assistant',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'cs_custom_views',
    name: 'Customer Service Custom Views',
    description: 'Custom views for customer service',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'cs_custom_views_activity',
    name: 'Customer Service Custom Views Activity',
    description: 'View activity logs for customer service custom views',
    permissions: ['read']
  },
  
  // Finance
  {
    id: 'financial_report',
    name: 'Financial Report',
    description: 'Financial reports and analytics',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'reconciliation',
    name: 'Reconciliation',
    description: 'Financial reconciliation and payment tracking',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'finance_custom_views',
    name: 'Finance Custom Views',
    description: 'Custom views for financial management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'finance_custom_views_activity',
    name: 'Finance Custom Views Activity',
    description: 'View activity logs for finance custom views',
    permissions: ['read']
  },
  
  // Website
  {
    id: 'blog_posts',
    name: 'Blog Posts',
    description: 'Blog content management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'landlords_submissions',
    name: 'Landlords Submissions',
    description: 'Landlord application and submission management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'website_reservations',
    name: 'Website Reservations',
    description: 'Direct website booking management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  
  // Pre-Check-In Portal
  {
    id: 'pre_checkin_portal',
    name: 'Pre-Check-In Portal',
    description: 'Guest pre-checkin management',
    permissions: ['create', 'read', 'update', 'delete']
  },

  // Settings
  {
    id: 'smart_view_configuration',
    name: 'Smart View Configuration',
    description: 'Smart view setup and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'custom_fields_configuration',
    name: 'Custom Fields Configuration',
    description: 'Custom field definitions and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'discounts_configuration',
    name: 'Discounts Configuration',
    description: 'Discount rules and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'coupons_configuration',
    name: 'Coupons Configuration',
    description: 'Coupon management and configuration',
    permissions: ['create', 'read', 'update', 'delete']
  },
  
  // System sections (for internal use)
  {
    id: 'users',
    name: 'Users',
    description: 'User management and permissions',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'activity',
    name: 'Activity Logs',
    description: 'System activity monitoring and logs',
    permissions: ['read']
  },
  {
    id: 'announcements',
    name: 'Announcements',
    description: 'Manage system-wide announcements and notifications',
    permissions: ['create', 'read', 'update', 'delete', 'manager']
  },
  {
    id: 'manage_approvals',
    name: 'Manage Approvals',
    description: 'Approval workflows and management',
    permissions: ['create', 'read', 'update', 'delete']
  },
  {
    id: 'guest_portal',
    name: 'Guest Portal',
    description: 'Guest portal and check-in management',
    permissions: ['create', 'read', 'update', 'delete', 'refund', 'manage_orders']
  },
  {
    id: 'process_management',
    name: 'Process Management',
    description: 'Manage department settings and visibility',
    permissions: ['read', 'create']
  }
];
