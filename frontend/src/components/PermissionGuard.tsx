import React from 'react';
import { usePermissions } from '../hooks/usePermissions';

interface PermissionGuardProps {
  section: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function PermissionGuard({ section, action, children, fallback = null }: PermissionGuardProps) {
  const { hasPermission } = usePermissions();

  if (!hasPermission(section, action)) {
    return fallback;
  }

  return <>{children}</>;
}