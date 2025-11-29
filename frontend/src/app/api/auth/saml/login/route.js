import { NextResponse } from 'next/server';
import { createSAMLRequest, getSAMLConfig } from '@/lib/saml';

/**
 * SAML Login Initiation
 * Redirects user to AWS Identity Center for authentication
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = searchParams.get('callbackUrl') || '/';
    
    const config = getSAMLConfig();
    console.log('SAML Config:', {
      entryPoint: config.entryPoint,
      issuer: config.issuer,
      callbackUrl: config.callbackUrl,
    });
    
    if (!config.entryPoint) {
      console.error('SAML_ENTRY_POINT is not configured');
      return NextResponse.redirect(new URL('/login?error=SAMLError', request.url));
    }
    
    const samlRequest = await createSAMLRequest(callbackUrl);
    console.log('SAML Request created, RelayState:', samlRequest.relayState);
    
    // Build the redirect URL to the IdP
    const redirectUrl = new URL(config.entryPoint);
    redirectUrl.searchParams.set('SAMLRequest', samlRequest.request);
    redirectUrl.searchParams.set('RelayState', samlRequest.relayState);
    
    console.log('Redirecting to:', redirectUrl.toString().substring(0, 200) + '...');
    
    return NextResponse.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('SAML login error:', error);
    return NextResponse.redirect(new URL('/login?error=SAMLError', request.url));
  }
}
