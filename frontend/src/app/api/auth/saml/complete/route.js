import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { encode } from 'next-auth/jwt';

/**
 * Complete the SAML authentication by creating the NextAuth session
 */
async function completeAuth(request) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = searchParams.get('callbackUrl') || '/';
    
    // Get the SAML user data from cookie
    const cookieStore = cookies();
    const samlUserCookie = cookieStore.get('saml-user-data');
    
    if (!samlUserCookie?.value) {
      console.error('No SAML user data cookie found');
      return NextResponse.redirect(`${baseUrl}/login?error=NoUserData`);
    }

    const userData = JSON.parse(samlUserCookie.value);
    console.log('Completing SAML auth for user:', userData.email);

    // Create JWT token for NextAuth session
    const token = await encode({
      token: {
        id: userData.id || userData.email,
        email: userData.email,
        name: userData.name || userData.email.split('@')[0],
        role: userData.role || 'user',
        sub: userData.id || userData.email,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      },
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Determine cookie settings
    const isSecure = baseUrl.startsWith('https');
    const sessionCookieName = isSecure
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token';

    // Create the redirect URL
    const redirectUrl = callbackUrl.startsWith('/') 
      ? `${baseUrl}${callbackUrl}` 
      : callbackUrl;

    // Create response with redirect
    const response = NextResponse.redirect(redirectUrl);
    
    // Set the NextAuth session cookie
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });

    // Delete the temporary SAML user data cookie
    response.cookies.delete('saml-user-data');

    console.log('SAML auth complete, redirecting to:', redirectUrl);
    
    return response;
  } catch (error) {
    console.error('SAML complete error:', error);
    return NextResponse.redirect(`${baseUrl}/login?error=SAMLCallbackError`);
  }
}

export async function GET(request) {
  return completeAuth(request);
}

export async function POST(request) {
  return completeAuth(request);
}
