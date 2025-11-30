import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import jwt from 'jsonwebtoken';

/**
 * Custom SAML Provider for AWS Identity Center
 * Uses a credentials-based approach where SAML assertion is processed
 */

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
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    },
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    iss: 'nextauth',
  };
  
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

export const authOptions = {
  providers: [
    CredentialsProvider({
      id: 'saml',
      name: 'SSO',
      credentials: {},
      async authorize(credentials) {
        // This is called after SAML callback processes the assertion
        // The user data is passed from the SAML callback handler
        if (credentials?.samlUser) {
          try {
            const user = JSON.parse(credentials.samlUser);
            return {
              id: user.userId || user.userguid || user.id || user.nameId,
              email: user.email || user.nameId,
              name: user.name || user.firstName + ' ' + user.lastName || user.email,
              role: user.role || 'user',
              roles: user.roles || ['user'],
              groups: user.groups || [],
              userId: user.userId || user.userguid || user.id || user.nameId,
              userguid: user.userguid || user.userId || null,
            };
          } catch (error) {
            console.error('Error parsing SAML user:', error);
            return null;
          }
        }
        return null;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // Initial sign in - add user data to token
      if (user) {
        token.id = user.id;
        token.userId = user.userId;
        token.userguid = user.userguid;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role || 'user';
        token.roles = user.roles || ['user'];
        token.groups = user.groups || [];
      }
      return token;
    },

    async session({ session, token }) {
      // Add user data to session
      session.user = {
        id: token.id,
        userId: token.userId,
        userguid: token.userguid,
        email: token.email,
        name: token.name,
        role: token.role,
        roles: token.roles || [token.role || 'user'],
        groups: token.groups || [],
      };
      // Generate a proper JWT for the backend API
      session.accessToken = generateApiToken({
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
      });
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
