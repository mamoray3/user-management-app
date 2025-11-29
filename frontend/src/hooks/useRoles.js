'use client';

import { useSession } from 'next-auth/react';

/**
 * Permission to roles mapping (client-side version)
 */
const PERMISSION_ROLES = {
  'users:view': ['viewer', 'process_owner', 'data_owner', 'admin'],
  'users:create': ['data_owner', 'admin'],
  'users:edit': ['data_owner', 'admin'],
  'users:delete': ['admin'],
  'users:approve': ['data_owner', 'admin'],
  'dashboard:view': ['user', 'viewer', 'process_owner', 'data_owner', 'admin'],
  'reports:view': ['viewer', 'process_owner', 'data_owner', 'admin'],
  'reports:create': ['process_owner', 'data_owner', 'admin'],
  'reports:export': ['data_owner', 'admin'],
  'settings:view': ['data_owner', 'admin'],
  'settings:edit': ['admin'],
  'admin:access': ['admin'],
};

/**
 * Role hierarchy (higher index = more privileges)
 */
const ROLE_HIERARCHY = ['user', 'viewer', 'process_owner', 'data_owner', 'admin'];

/**
 * Hook to get current user's roles and permission utilities
 */
export function useRoles() {
  const { data: session, status } = useSession();
  
  const roles = session?.user?.roles || [session?.user?.role || 'user'];
  const primaryRole = session?.user?.role || 'user';
  const groups = session?.user?.groups || [];
  
  /**
   * Check if user has a specific permission
   */
  const hasPermission = (permission) => {
    const allowedRoles = PERMISSION_ROLES[permission] || [];
    return roles.some(role => allowedRoles.includes(role));
  };
  
  /**
   * Check if user has a specific role
   */
  const hasRole = (role) => {
    return roles.includes(role);
  };
  
  /**
   * Check if user has at least the specified role level
   */
  const hasMinimumRole = (requiredRole) => {
    const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    return roles.some(role => {
      const roleIndex = ROLE_HIERARCHY.indexOf(role);
      return roleIndex >= requiredIndex;
    });
  };
  
  /**
   * Check if user is admin
   */
  const isAdmin = () => hasRole('admin');
  
  /**
   * Check if user is data owner or higher
   */
  const isDataOwner = () => hasMinimumRole('data_owner');
  
  /**
   * Check if user is process owner or higher
   */
  const isProcessOwner = () => hasMinimumRole('process_owner');
  
  return {
    roles,
    primaryRole,
    groups,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    hasPermission,
    hasRole,
    hasMinimumRole,
    isAdmin,
    isDataOwner,
    isProcessOwner,
  };
}

/**
 * Component to conditionally render based on permission
 */
export function RequirePermission({ permission, children, fallback = null }) {
  const { hasPermission, isLoading } = useRoles();
  
  if (isLoading) return null;
  
  if (!hasPermission(permission)) {
    return fallback;
  }
  
  return children;
}

/**
 * Component to conditionally render based on role
 */
export function RequireRole({ role, children, fallback = null }) {
  const { hasRole, isLoading } = useRoles();
  
  if (isLoading) return null;
  
  if (!hasRole(role)) {
    return fallback;
  }
  
  return children;
}

/**
 * Component to conditionally render based on minimum role level
 */
export function RequireMinimumRole({ role, children, fallback = null }) {
  const { hasMinimumRole, isLoading } = useRoles();
  
  if (isLoading) return null;
  
  if (!hasMinimumRole(role)) {
    return fallback;
  }
  
  return children;
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role) {
  const displayNames = {
    admin: 'Administrator',
    data_owner: 'Data Owner',
    process_owner: 'Process Owner',
    viewer: 'Viewer',
    user: 'User',
  };
  
  return displayNames[role] || role;
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role) {
  const colors = {
    admin: 'bg-red-100 text-red-800',
    data_owner: 'bg-purple-100 text-purple-800',
    process_owner: 'bg-blue-100 text-blue-800',
    viewer: 'bg-green-100 text-green-800',
    user: 'bg-gray-100 text-gray-800',
  };
  
  return colors[role] || 'bg-gray-100 text-gray-800';
}

/**
 * Role Badge Component
 */
export function RoleBadge({ role, className = '' }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(role)} ${className}`}>
      {getRoleDisplayName(role)}
    </span>
  );
}
