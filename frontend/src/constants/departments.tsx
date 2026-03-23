import { Users, Building, Calculator, MapPin } from 'lucide-react';

// Static departments as a fallback for components that need it
export const DEPARTMENTS = [
  { value: 'customer_service', label: 'Customer Service', icon: <Users className="h-5 w-5" /> },
  { value: 'finance', label: 'Finance', icon: <Calculator className="h-5 w-5" /> },
  { value: 'city_manager', label: 'City Manager', icon: <MapPin className="h-5 w-5" /> },
  { value: 'operations', label: 'Operations', icon: <Building className="h-5 w-5" /> },
];


// Fallback departments for backward compatibility
// export const DEPARTMENTS = [
//   {
//     value: 'customer_service',
//     label: 'Customer Service',
//     icon: <Users className="h-5 w-5" />,
//     description: 'Customer support and service management'
//   },
//   {
//     value: 'finance',
//     label: 'Finance',
//     icon: <Calculator className="h-5 w-5" />,
//     description: 'Financial operations and management'
//   },
//   {
//     value: 'city_manager',
//     label: 'City Manager',
//     icon: <MapPin className="h-5 w-5" />,
//     description: 'City operations and management'
//   },
//   {
//     value: 'operations',
//     label: 'Operations',
//     icon: <Building className="h-5 w-5" />,
//     description: 'General operations and management'
//   }
// ];