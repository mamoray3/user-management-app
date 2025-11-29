import { NextResponse } from 'next/server';

/**
 * SAML Metadata Endpoint
 * Provides SP metadata for AWS Identity Center configuration
 */
export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
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
