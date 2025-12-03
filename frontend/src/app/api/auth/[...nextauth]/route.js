import NextAuth from 'next-auth';
import jwt from 'jsonwebtoken';
import { mapGroupToRole, mapGroupsToRoles, getHighestRole } from '../../../../lib/roles';

/**
 * Custom OAuth Provider for Cognito with SAML federation
 * Flow: App (OIDC) → Cognito User Pool (SAML) → IDC → Entra ID
 * 
 * Challenge: Cognito with SAML federation adds a nonce to the ID token
 * that NextAuth didn't send, causing validation to fail.
 * 
 * Solution: Make direct HTTP requests to bypass openid-client's validation.
 */

const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN;

// Helper to generate a signed JWT for the backend API
function generateApiToken(user) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set');
  }
  
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'user',
    roles: user.roles || ['user'],
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
      roles: user.roles || ['user'],
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    iss: 'nextauth',
  };
  
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

/**
 * Validate and decode the Cognito ID token
 * 
 * We skip signature verification because:
 * 1. Token comes directly from Cognito over HTTPS
 * 2. We use client_secret (confidential client)
 * 3. Authorization code is single-use
 * 
 * We DO validate: issuer, audience, and expiration
 * We SKIP: nonce (Cognito adds one during SAML federation that we can't match)
 */
function validateAndDecodeIdToken(idToken) {
  try {
    const decoded = jwt.decode(idToken);
    
    if (!decoded) {
      throw new Error('Failed to decode ID token');
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    // Validate expiration
    if (decoded.exp && decoded.exp < now) {
      throw new Error('ID token has expired');
    }
    
    // Validate issuer
    const expectedIssuer = process.env.COGNITO_ISSUER;
    if (expectedIssuer && decoded.iss !== expectedIssuer) {
      throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${decoded.iss}`);
    }
    
    // Validate audience (client_id)
    const expectedAudience = process.env.COGNITO_CLIENT_ID;
    if (expectedAudience && decoded.aud !== expectedAudience) {
      throw new Error(`Invalid audience: expected ${expectedAudience}, got ${decoded.aud}`);
    }
    
    // Validate token_use (should be 'id' for ID tokens)
    if (decoded.token_use && decoded.token_use !== 'id') {
      throw new Error(`Invalid token_use: expected 'id', got ${decoded.token_use}`);
    }
    
    // Note: We intentionally skip nonce validation because Cognito with SAML
    // federation adds a nonce that NextAuth didn't send in the original request
    
    return decoded;
  } catch (e) {
    console.error('ID token validation failed:', e.message);
    throw e;
  }
}

export const authOptions = {
  providers: [
    {
      id: 'cognito',
      name: 'Cognito',
      type: 'oauth',
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
      checks: ['state'],
      authorization: {
        url: `https://${COGNITO_DOMAIN}/oauth2/authorize`,
        params: {
          scope: 'openid email profile',
          response_type: 'code',
          identity_provider: 'IdentityCenter',
        },
      },
      token: {
        url: `https://${COGNITO_DOMAIN}/oauth2/token`,
        // Custom token handler that makes direct HTTP request
        async request({ params, provider }) {
          console.log('========================================');
          console.log('NextAuth: Token Request');
          console.log('========================================');
          console.log('Timestamp:', new Date().toISOString());

          const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
          console.log('Token URL:', tokenUrl);
          console.log('Authorization code present:', !!params.code);
          console.log('Authorization code length:', params.code?.length || 0);
          console.log('Redirect URI:', provider.callbackUrl);

          const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: provider.callbackUrl,
            client_id: provider.clientId,
            client_secret: provider.clientSecret,
          });

          console.log('Token request parameters:', {
            grant_type: 'authorization_code',
            redirect_uri: provider.callbackUrl,
            client_id: provider.clientId,
            has_client_secret: !!provider.clientSecret,
            has_code: !!params.code,
          });

          console.log('Sending token request to Cognito...');
          const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          });

          console.log('Token response status:', response.status);
          console.log('Token response status text:', response.statusText);

          if (!response.ok) {
            const error = await response.text();
            console.error('ERROR: Token request failed');
            console.error('Status:', response.status);
            console.error('Error details:', error);
            throw new Error(`Token request failed: ${error}`);
          }

          const tokens = await response.json();

          console.log('SUCCESS: Tokens received from Cognito');
          console.log('Tokens received:', {
            has_access_token: !!tokens.access_token,
            access_token_length: tokens.access_token?.length || 0,
            has_id_token: !!tokens.id_token,
            id_token_length: tokens.id_token?.length || 0,
            has_refresh_token: !!tokens.refresh_token,
            token_type: tokens.token_type,
            expires_in: tokens.expires_in,
          });
          console.log('========================================');

          return { tokens };
        },
      },
      userinfo: {
        // Custom userinfo that validates and decodes the ID token
        async request({ tokens }) {
          console.log('========================================');
          console.log('NextAuth: Userinfo Request');
          console.log('========================================');
          console.log('Timestamp:', new Date().toISOString());

          const idToken = tokens.id_token;
          if (!idToken) {
            console.error('ERROR: No ID token received from Cognito');
            throw new Error('No ID token received from Cognito');
          }

          console.log('ID token received (length):', idToken.length);
          console.log('ID token preview (first 50 chars):', idToken.substring(0, 50) + '...');

          // Validate and decode the ID token
          const decoded = validateAndDecodeIdToken(idToken);

          console.log('ID token decoded successfully');
          console.log('Decoded token claims:', {
            sub: decoded.sub,
            email: decoded.email,
            name: decoded.name,
            'cognito:username': decoded['cognito:username'],
            'cognito:groups': decoded['cognito:groups'],
            'custom:s3_prefix': decoded['custom:s3_prefix'],
            'custom:idc_user_id': decoded['custom:idc_user_id'],
            'custom:idc_access_token_present': !!decoded['custom:idc_access_token'],
            'custom:idc_access_token_length': decoded['custom:idc_access_token']?.length || 0,
            iss: decoded.iss,
            aud: decoded.aud,
            exp: decoded.exp,
            iat: decoded.iat,
          });

          // Extract groups from Cognito token (populated from IDC SAML assertion)
          const groups = decoded['cognito:groups'] || [];

          console.log('Groups extracted from token:', groups);
          console.log('IDC custom attributes:', {
            's3_prefix': decoded['custom:s3_prefix'],
            'idc_user_id': decoded['custom:idc_user_id'],
            'idc_access_token_present': !!decoded['custom:idc_access_token'],
          });

          if (!decoded['custom:idc_access_token']) {
            console.warn('WARNING: IDC access token is missing from Cognito token');
            console.warn('This will prevent IDC OIDC token exchange from working');
            console.warn('Check: 1) IDC app attribute mapping for accessToken');
            console.warn('       2) Cognito SAML attribute mapping for custom:idc_access_token');
          } else {
            console.log('SUCCESS: IDC access token is present in Cognito token');
          }

          const userInfo = {
            sub: decoded.sub,
            email: decoded.email,
            name: decoded.name || decoded['cognito:username'],
            username: decoded['cognito:username'],
            groups: groups,
            'custom:s3_prefix': decoded['custom:s3_prefix'],
            'custom:idc_user_id': decoded['custom:idc_user_id'],
            'custom:idc_access_token': decoded['custom:idc_access_token'],
          };

          console.log('Userinfo object prepared (without sensitive data):', {
            sub: userInfo.sub,
            email: userInfo.email,
            name: userInfo.name,
            username: userInfo.username,
            groups: userInfo.groups,
            's3_prefix': userInfo['custom:s3_prefix'],
            'idc_user_id': userInfo['custom:idc_user_id'],
            'has_idc_access_token': !!userInfo['custom:idc_access_token'],
          });
          console.log('========================================');

          return userInfo;
        },
      },
      profile(profile) {
        console.log('========================================');
        console.log('NextAuth: Profile Callback');
        console.log('========================================');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Profile received (without sensitive data):', {
          sub: profile.sub,
          email: profile.email,
          name: profile.name,
          username: profile.username,
          groups: profile.groups,
          's3_prefix': profile['custom:s3_prefix'],
          'idc_user_id': profile['custom:idc_user_id'],
          'has_idc_access_token': !!profile['custom:idc_access_token'],
          'idc_access_token_length': profile['custom:idc_access_token']?.length || 0,
        });

        // Map IDC groups to application roles
        const groups = profile.groups || [];
        console.log('Mapping groups to roles:', groups);

        const roles = mapGroupsToRoles(groups);
        console.log('Roles after mapping:', roles);

        const primaryRole = getHighestRole(roles);
        console.log('Primary role selected:', primaryRole);

        // IDC User ID is used for S3 Access Grants prefix
        // e.g., 3448e4c8-70b1-7069-c7f1-e42f103a6ab5
        const idcUserId = profile['custom:idc_user_id'] || profile.sub;
        console.log('IDC User ID:', idcUserId);

        // IDC access token for OIDC token exchange
        const idcAccessToken = profile['custom:idc_access_token'];

        if (!idcAccessToken) {
          console.error('CRITICAL: IDC access token is missing from profile');
          console.error('IDC OIDC token exchange will NOT work without this token');
          console.error('Troubleshooting steps:');
          console.error('1. Check IDC application attribute mapping: accessToken → ${session:access_token}');
          console.error('2. Check Cognito SAML IdP attribute mapping: custom:idc_access_token ← accessToken');
          console.error('3. Verify Cognito User Pool Client read attributes includes custom:idc_access_token');
        } else {
          console.log('SUCCESS: IDC access token is present (length):', idcAccessToken.length);
          console.log('IDC access token preview (first 50 chars):', idcAccessToken.substring(0, 50) + '...');
        }

        const userProfile = {
          id: profile.sub,
          email: profile.email,
          name: profile.name || profile.username || profile.email?.split('@')[0],
          image: profile.picture,
          role: primaryRole,
          roles: roles,
          groups: groups,
          // Use IDC User ID as S3 prefix for Access Grants
          s3Prefix: idcUserId,
          idcUserId: idcUserId,
          idcAccessToken: idcAccessToken,
        };

        console.log('User profile prepared (without sensitive data):', {
          id: userProfile.id,
          email: userProfile.email,
          name: userProfile.name,
          role: userProfile.role,
          roles: userProfile.roles,
          groups: userProfile.groups,
          s3Prefix: userProfile.s3Prefix,
          idcUserId: userProfile.idcUserId,
          hasIdcAccessToken: !!userProfile.idcAccessToken,
        });
        console.log('========================================');

        return userProfile;
      },
    },
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      console.log('========================================');
      console.log('NextAuth: JWT Callback');
      console.log('========================================');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Is initial sign in:', !!user);
      console.log('Has account data:', !!account);

      // Initial sign in
      if (user) {
        console.log('Processing initial sign in for user:', user.email);
        console.log('User data received (without sensitive data):', {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: user.roles,
          groups: user.groups,
          s3Prefix: user.s3Prefix,
          idcUserId: user.idcUserId,
          hasIdcAccessToken: !!user.idcAccessToken,
          idcAccessTokenLength: user.idcAccessToken?.length || 0,
        });

        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.roles = user.roles;
        token.groups = user.groups;
        token.s3Prefix = user.s3Prefix;
        token.idcUserId = user.idcUserId;
        token.idcAccessToken = user.idcAccessToken;

        if (!user.idcAccessToken) {
          console.error('CRITICAL: User object is missing idcAccessToken');
          console.error('This token will not be available in the session');
        } else {
          console.log('SUCCESS: IDC access token captured in JWT token');
        }
      }

      // Store Cognito tokens for AWS credentials (legacy)
      if (account) {
        console.log('Account data present, storing Cognito tokens');
        console.log('Account provider:', account.provider);
        console.log('Account type:', account.type);
        console.log('Has access_token:', !!account.access_token);
        console.log('Has id_token:', !!account.id_token);
        console.log('Has refresh_token:', !!account.refresh_token);
        console.log('Expires at:', account.expires_at);

        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }

      console.log('JWT token prepared (without sensitive data):', {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        roles: token.roles,
        groups: token.groups,
        s3Prefix: token.s3Prefix,
        idcUserId: token.idcUserId,
        hasIdcAccessToken: !!token.idcAccessToken,
        idcAccessTokenLength: token.idcAccessToken?.length || 0,
        hasAccessToken: !!token.accessToken,
        hasIdToken: !!token.idToken,
        hasRefreshToken: !!token.refreshToken,
        expiresAt: token.expiresAt,
      });
      console.log('========================================');

      return token;
    },

    async session({ session, token }) {
      console.log('========================================');
      console.log('NextAuth: Session Callback');
      console.log('========================================');
      console.log('Timestamp:', new Date().toISOString());
      console.log('Token data (without sensitive data):', {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        roles: token.roles,
        groups: token.groups,
        s3Prefix: token.s3Prefix,
        idcUserId: token.idcUserId,
        hasIdcAccessToken: !!token.idcAccessToken,
        idcAccessTokenLength: token.idcAccessToken?.length || 0,
      });

      // Add user data to session
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role || 'user',
        roles: token.roles || ['user'],
        groups: token.groups || [],
        s3Prefix: token.s3Prefix,
        idcUserId: token.idcUserId,
      };

      // Include IDC access token for OIDC token exchange (primary method)
      session.idcAccessToken = token.idcAccessToken;

      if (!session.idcAccessToken) {
        console.error('CRITICAL: IDC access token is missing from session');
        console.error('Token has idcAccessToken:', !!token.idcAccessToken);
        console.error('This will cause S3 credentials API to fail');
      } else {
        console.log('SUCCESS: IDC access token is present in session');
      }

      // Include Cognito ID token for AWS credentials (legacy/fallback)
      session.idToken = token.idToken;
      session.accessToken = token.accessToken;

      console.log('Generating API token for backend');
      // Generate API token for backend
      session.apiToken = generateApiToken({
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role || 'user',
        roles: token.roles || ['user'],
      });
      console.log('API token generated successfully');

      console.log('Session prepared (without sensitive data):', {
        user: session.user,
        hasIdcAccessToken: !!session.idcAccessToken,
        idcAccessTokenLength: session.idcAccessToken?.length || 0,
        hasIdToken: !!session.idToken,
        hasAccessToken: !!session.accessToken,
        hasApiToken: !!session.apiToken,
      });
      console.log('========================================');

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET,

  debug: process.env.NODE_ENV === 'development',
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
