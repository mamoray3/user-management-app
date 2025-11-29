import { NextResponse } from 'next/server';

// Force dynamic rendering to ensure environment variables are read at runtime
export const dynamic = 'force-dynamic';

// Helper to get baseUrl at runtime only (not at build time)
function getBaseUrl() {
  const url = process.env.NEXTAUTH_URL;
  if (!url) {
    throw new Error('NEXTAUTH_URL environment variable is not set');
  }
  return url;
}

/**
 * SAML Metadata Endpoint
 * Provides SP metadata for AWS Identity Center configuration
 */
export async function GET() {
  const baseUrl = getBaseUrl();
  const entityId = `${baseUrl}/api/auth/saml/metadata`;
  const acsUrl = `${baseUrl}/api/auth/saml/callback`;

  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0" isDefault="true"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  return new NextResponse(metadata, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
}
