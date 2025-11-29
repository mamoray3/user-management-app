/**
 * Role-Based Access Control (RBAC) Configuration
 * 
 * This module defines roles, permissions, and provides utilities for
 * role-based access control throughout the application.
 */

/**
 * Application Roles
 * Maps AWS Identity Center group IDs/names to application roles
 */
export const ROLES = {
  ADMIN: 'admin',
  DATA_OWNER: 'data_owner', 
  PROCESS_OWNER: 'process_owner',
  VIEWER: 'viewer',
  USER: 'user',
};

/**
 * Role Hierarchy (higher index = more privileges)
 * Used to determine if a role has at least the required permission level
 */
export const ROLE_HIERARCHY = [
  ROLES.USER,
  ROLES.VIEWER,
  ROLES.PROCESS_OWNER,
  ROLES.DATA_OWNER,
  ROLES.ADMIN,
];

/**
 * Permission definitions for each page/feature
 */
export const PERMISSIONS = {
  // User Management
  'users:view': [ROLES.VIEWER, ROLES.PROCESS_OWNER, ROLES.DATA_OWNER, ROLES.ADMIN],
  'users:create': [ROLES.DATA_OWNER, ROLES.ADMIN],
  'users:edit': [ROLES.DATA_OWNER, ROLES.ADMIN],
  'users:delete': [ROLES.ADMIN],
  'users:approve': [ROLES.DATA_OWNER, ROLES.ADMIN],
  
  // Dashboard
  'dashboard:view': [ROLES.USER, ROLES.VIEWER, ROLES.PROCESS_OWNER, ROLES.DATA_OWNER, ROLES.ADMIN],
  
  // Reports
  'reports:view': [ROLES.VIEWER, ROLES.PROCESS_OWNER, ROLES.DATA_OWNER, ROLES.ADMIN],
  'reports:create': [ROLES.PROCESS_OWNER, ROLES.DATA_OWNER, ROLES.ADMIN],
  'reports:export': [ROLES.DATA_OWNER, ROLES.ADMIN],
  
  // Settings
  'settings:view': [ROLES.DATA_OWNER, ROLES.ADMIN],
  'settings:edit': [ROLES.ADMIN],
  
  // Admin features
  'admin:access': [ROLES.ADMIN],
};

/**
 * Page access configuration
 * Maps page paths to required permissions
 */
export const PAGE_PERMISSIONS = {
  '/': 'dashboard:view',
  '/users': 'users:view',
  '/users/new': 'users:create',
  '/users/[id]': 'users:view',
  '/users/[id]/edit': 'users:edit',
  '/reports': 'reports:view',
  '/settings': 'settings:view',
  '/admin': 'admin:access',
};

/**
 * Role configuration from environment
 * Maps AWS Identity Center Group IDs to application roles
 * 
 * Configure in .env:
 * ROLE_MAPPING_ADMIN=group-id-1,group-id-2
 * ROLE_MAPPING_DATA_OWNER=group-id-3
 * ROLE_MAPPING_PROCESS_OWNER=group-id-4
 * ROLE_MAPPING_VIEWER=group-id-5
 */
export function getRoleMapping() {
  return {
    [ROLES.ADMIN]: parseGroupIds(process.env.ROLE_MAPPING_ADMIN || process.env.SAML_ADMIN_GROUP_ID),
    [ROLES.DATA_OWNER]: parseGroupIds(process.env.ROLE_MAPPING_DATA_OWNER),
    [ROLES.PROCESS_OWNER]: parseGroupIds(process.env.ROLE_MAPPING_PROCESS_OWNER),
    [ROLES.VIEWER]: parseGroupIds(process.env.ROLE_MAPPING_VIEWER),
  };
}

/**
 * Parse comma-separated group IDs from environment variable
 */
function parseGroupIds(envValue) {
  if (!envValue) return [];
  return envValue.split(',').map(id => id.trim()).filter(Boolean);
}

/**
 * Map a group ID or name to an application role
 * @param {string} groupValue - Group ID or name from SAML assertion
 * @returns {string} - Application role
 */
export function mapGroupToRole(groupValue) {
  if (!groupValue) return ROLES.USER;
  
  const roleMapping = getRoleMapping();
  const valueLower = groupValue.toLowerCase();
  
  // Check configured group ID mappings first
  for (const [role, groupIds] of Object.entries(roleMapping)) {
    if (groupIds.includes(groupValue)) {
      console.log(`Mapped group ID ${groupValue} to role: ${role}`);
      return role;
    }
  }
  
  // Fall back to name-based matching
  if (valueLower.includes('admin')) return ROLES.ADMIN;
  if (valueLower.includes('data_owner') || valueLower.includes('dataowner')) return ROLES.DATA_OWNER;
  if (valueLower.includes('process_owner') || valueLower.includes('processowner')) return ROLES.PROCESS_OWNER;
  if (valueLower.includes('viewer') || valueLower.includes('readonly')) return ROLES.VIEWER;
  
  return ROLES.USER;
}

/**
 * Map multiple groups to roles (user can belong to multiple groups)
 * @param {string[]} groups - Array of group IDs or names
 * @returns {string[]} - Array of application roles
 */
export function mapGroupsToRoles(groups) {
  if (!groups || !Array.isArray(groups)) return [ROLES.USER];
  
  const roles = new Set();
  
  for (const group of groups) {
    const role = mapGroupToRole(group);
    roles.add(role);
  }
  
  // Always include USER role as base
  roles.add(ROLES.USER);
  
  return Array.from(roles);
}

/**
 * Get the highest role from a list of roles
 * @param {string[]} roles - Array of roles
 * @returns {string} - Highest role based on hierarchy
 */
export function getHighestRole(roles) {
  if (!roles || roles.length === 0) return ROLES.USER;
  
  let highestIndex = -1;
  let highestRole = ROLES.USER;
  
  for (const role of roles) {
    const index = ROLE_HIERARCHY.indexOf(role);
    if (index > highestIndex) {
      highestIndex = index;
      highestRole = role;
    }
  }
  
  return highestRole;
}

/**
 * Check if a role has a specific permission
 * @param {string|string[]} userRoles - User's role(s)
 * @param {string} permission - Required permission
 * @returns {boolean}
 */
export function hasPermission(userRoles, permission) {
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  const allowedRoles = PERMISSIONS[permission] || [];
  
  return roles.some(role => allowedRoles.includes(role));
}

/**
 * Check if a role can access a specific page
 * @param {string|string[]} userRoles - User's role(s)
 * @param {string} pathname - Page path
 * @returns {boolean}
 */
export function canAccessPage(userRoles, pathname) {
  // Normalize pathname (remove trailing slashes, handle dynamic routes)
  let normalizedPath = pathname.replace(/\/$/, '') || '/';
  
  // Check for exact match first
  if (PAGE_PERMISSIONS[normalizedPath]) {
    return hasPermission(userRoles, PAGE_PERMISSIONS[normalizedPath]);
  }
  
  // Check for dynamic route matches
  for (const [pattern, permission] of Object.entries(PAGE_PERMISSIONS)) {
    if (pattern.includes('[')) {
      // Convert pattern to regex
      const regexPattern = pattern
        .replace(/\[([^\]]+)\]/g, '[^/]+')
        .replace(/\//g, '\\/');
      const regex = new RegExp(`^${regexPattern}$`);
      
      if (regex.test(normalizedPath)) {
        return hasPermission(userRoles, permission);
      }
    }
  }
  
  // Default: allow access if no specific permission is defined
  return true;
}

/**
 * Check if role has at least the specified level in hierarchy
 * @param {string|string[]} userRoles - User's role(s)
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
export function hasMinimumRole(userRoles, requiredRole) {
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole);
  
  return roles.some(role => {
    const roleIndex = ROLE_HIERARCHY.indexOf(role);
    return roleIndex >= requiredIndex;
  });
}

/**
 * Get display name for a role
 * @param {string} role - Role identifier
 * @returns {string} - Human-readable role name
 */
export function getRoleDisplayName(role) {
  const displayNames = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.DATA_OWNER]: 'Data Owner',
    [ROLES.PROCESS_OWNER]: 'Process Owner',
    [ROLES.VIEWER]: 'Viewer',
    [ROLES.USER]: 'User',
  };
  
  return displayNames[role] || role;
}

/**
 * Get all permissions for a role
 * @param {string} role - Role identifier
 * @returns {string[]} - Array of permissions
 */
export function getRolePermissions(role) {
  const permissions = [];
  
  for (const [permission, allowedRoles] of Object.entries(PERMISSIONS)) {
    if (allowedRoles.includes(role)) {
      permissions.push(permission);
    }
  }
  
  return permissions;
}
