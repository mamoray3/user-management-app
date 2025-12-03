import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Paths that don't require authentication
const publicPaths = ['/login', '/api/auth', '/api/health', '/api/test-saml'];

// Page permission requirements
const PAGE_PERMISSIONS = {
  '/users/new': ['users:create'],
  '/users/[id]/edit': ['users:edit'],
  '/admin': ['admin:access'],
  '/settings': ['settings:view'],
};

// Permission to roles mapping
const PERMISSION_ROLES = {
  'users:view': ['viewer', 'process_owner', 'data_owner', 'admin'],
  'users:create': ['data_owner', 'admin'],
  'users:edit': ['data_owner', 'admin'],
  'users:delete': ['admin'],
  'users:approve': ['data_owner', 'admin'],
  'dashboard:view': ['user', 'viewer', 'process_owner', 'data_owner', 'admin'],
  'reports:view': ['viewer', 'process_owner', 'data_owner', 'admin'],
  'reports:create': ['process_owner', 'data_owner', 'admin'],
  'settings:view': ['data_owner', 'admin'],
  'settings:edit': ['admin'],
  'admin:access': ['admin'],
};

function hasPermission(userRoles, permission) {
  const allowedRoles = PERMISSION_ROLES[permission] || [];
  const roles = Array.isArray(userRoles) ? userRoles : [userRoles];
  return roles.some(role => allowedRoles.includes(role));
}

function checkPageAccess(pathname, userRoles) {
  // Check for exact match first
  for (const [pattern, permissions] of Object.entries(PAGE_PERMISSIONS)) {
    // Convert pattern to regex for dynamic routes
    const regexPattern = pattern
      .replace(/\[([^\]]+)\]/g, '[^/]+')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${regexPattern}$`);
    
    if (regex.test(pathname)) {
      // Check if user has any of the required permissions
      return permissions.some(perm => hasPermission(userRoles, perm));
    }
  }
  
  // Default: allow access if no specific permission is defined
  return true;
}

// Helper to get the correct host for redirects
function getRedirectUrl(request, path) {
  // Check for x-forwarded-host header (set by CloudFront)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  
  if (forwardedHost) {
    return new URL(path, `${proto}://${forwardedHost}`);
  }
  
  // Fallback to request URL
  return new URL(path, request.url);
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Check if path is public
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));
  
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check for authentication token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Redirect to login if not authenticated
  if (!token) {
    const loginUrl = getRedirectUrl(request, '/login');
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Get user roles from token
  const userRoles = token.roles || [token.role || 'user'];
  
  // Check page access permissions
  if (!checkPageAccess(pathname, userRoles)) {
    // Redirect to unauthorized page or home
    console.log(`Access denied to ${pathname} for roles:`, userRoles);
    return NextResponse.redirect(getRedirectUrl(request, '/?error=unauthorized'));
  }

  // Add user info to headers for API routes
  if (pathname.startsWith('/api/')) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', token.id || '');
    requestHeaders.set('x-user-email', token.email || '');
    requestHeaders.set('x-user-role', token.role || 'user');
    requestHeaders.set('x-user-roles', JSON.stringify(userRoles));

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
