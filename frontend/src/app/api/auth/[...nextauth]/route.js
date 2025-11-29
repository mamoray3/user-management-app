import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * Custom SAML Provider for AWS Identity Center
 * Uses a credentials-based approach where SAML assertion is processed
 */

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
              id: user.id || user.nameId,
              email: user.email || user.nameId,
              name: user.name || user.firstName + ' ' + user.lastName || user.email,
              role: user.role || 'user',
              roles: user.roles || ['user'],
              groups: user.groups || [],
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
        email: token.email,
        name: token.name,
        role: token.role,
        roles: token.roles || [token.role || 'user'],
        groups: token.groups || [],
      };
      session.accessToken = token.sub;
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
