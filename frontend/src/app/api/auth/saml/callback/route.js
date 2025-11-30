import { NextResponse } from 'next/server';
import { validateSAMLResponse, parseSAMLAssertion } from '@/lib/saml';
import { encode } from 'next-auth/jwt';

/**
 * SAML Assertion Consumer Service (ACS)
 * Receives and processes SAML response from AWS Identity Center
 * Creates the session directly and redirects to the callback URL
 */
export async function POST(request) {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  try {
    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse');
    const relayState = formData.get('RelayState') || 'eyJjYWxsYmFja1VybCI6Ii8ifQ==';

    if (!samlResponse) {
      console.error('No SAMLResponse in callback');
      return NextResponse.redirect(`${baseUrl}/login?error=NoSAMLResponse`);
    }

    // Log the raw SAML response for debugging
    const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf8');
    console.log('=== FULL SAML RESPONSE START ===');
    console.log('SAML Response length:', decodedResponse.length);
    // Log in chunks to avoid truncation
    const chunkSize = 4000;
    for (let i = 0; i < decodedResponse.length; i += chunkSize) {
      console.log(`SAML Response chunk ${Math.floor(i/chunkSize) + 1}:`, decodedResponse.substring(i, i + chunkSize));
    }
    console.log('=== FULL SAML RESPONSE END ===');
    
    // Also extract and log just the AttributeStatement section
    const attrStatementMatch = decodedResponse.match(/<(?:saml2?:)?AttributeStatement[^>]*>([\s\S]*?)<\/(?:saml2?:)?AttributeStatement>/i);
    if (attrStatementMatch) {
      console.log('=== ATTRIBUTE STATEMENT ===');
      console.log(attrStatementMatch[0]);
      console.log('=== END ATTRIBUTE STATEMENT ===');
    } else {
      console.log('WARNING: No AttributeStatement found in SAML response!');
    }

    // Validate the SAML response
    const isValid = await validateSAMLResponse(samlResponse);
    
    if (!isValid) {
      console.error('Invalid SAML response');
      return NextResponse.redirect(`${baseUrl}/login?error=InvalidSAMLResponse`);
    }

    // Parse the assertion to get user data
    const userData = await parseSAMLAssertion(samlResponse);
    console.log('Parsed user data:', userData);

    if (!userData || !userData.email) {
      console.error('Could not extract user data from SAML assertion');
      return NextResponse.redirect(`${baseUrl}/login?error=NoUserData`);
    }

    // Parse relay state to get callback URL
    let callbackUrl = '/';
    try {
      const relayData = JSON.parse(Buffer.from(relayState, 'base64').toString());
      callbackUrl = relayData.callbackUrl || '/';
    } catch {
      callbackUrl = '/';
    }

    // Create JWT token for NextAuth session
    const token = await encode({
      token: {
        id: userData.id || userData.email,
        email: userData.email,
        name: userData.name || userData.email.split('@')[0],
        role: userData.role || 'user',
        roles: userData.roles || ['user'], // Array of all roles
        groups: userData.groups || [], // Raw groups from IdP
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

    console.log('SAML auth complete for:', userData.email);
    console.log('Redirecting to:', redirectUrl);

    // Create response with redirect (use 303 See Other to force GET request)
    const response = NextResponse.redirect(redirectUrl, { status: 303 });
    
    // Set the NextAuth session cookie
    response.cookies.set(sessionCookieName, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours
    });
    
    return response;
  } catch (error) {
    console.error('SAML callback error:', error);
    return NextResponse.redirect(`${baseUrl}/login?error=SAMLCallbackError`);
  }
}

// Also handle GET for IdP-initiated SSO
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const samlResponse = searchParams.get('SAMLResponse');
  
  if (samlResponse) {
    // Convert to POST handling
    const formData = new FormData();
    formData.set('SAMLResponse', samlResponse);
    formData.set('RelayState', searchParams.get('RelayState') || 'eyJjYWxsYmFja1VybCI6Ii8ifQ==');
    
    return POST(new Request(request.url, {
      method: 'POST',
      body: formData,
    }));
  }
  
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return NextResponse.redirect(`${baseUrl}/login`);
}
