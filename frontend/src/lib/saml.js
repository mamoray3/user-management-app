import { deflateRaw } from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';

const deflateRawAsync = promisify(deflateRaw);

/**
 * SAML Configuration
 */
export function getSAMLConfig() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  return {
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: `${baseUrl}/api/auth/saml/metadata`,
    callbackUrl: `${baseUrl}/api/auth/saml/callback`,
    idpIssuer: process.env.SAML_ISSUER,
    idpCert: process.env.SAML_CERT,
  };
}

/**
 * Create SAML AuthnRequest
 */
export async function createSAMLRequest(callbackUrl = '/') {
  const config = getSAMLConfig();
  const id = '_' + crypto.randomBytes(16).toString('hex');
  const issueInstant = new Date().toISOString();
  
  const request = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest 
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${id}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${config.entryPoint}"
  AssertionConsumerServiceURL="${config.callbackUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`;

  // Deflate and Base64 encode the request
  const deflated = await deflateRawAsync(Buffer.from(request, 'utf8'));
  const base64Request = deflated.toString('base64');
  
  // Create relay state with callback URL
  const relayState = Buffer.from(JSON.stringify({ callbackUrl })).toString('base64');
  
  return {
    request: base64Request, // Don't URL encode here - URLSearchParams will handle it
    relayState,
  };
}

/**
 * Validate SAML Response signature
 */
export async function validateSAMLResponse(samlResponse) {
  try {
    const config = getSAMLConfig();
    
    // Decode the SAML response
    const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf8');
    
    // Basic validation - check that the response contains expected elements
    if (!decodedResponse.includes('saml') || !decodedResponse.includes('Response')) {
      console.error('Invalid SAML response format');
      return false;
    }
    
    // Check issuer matches
    if (!decodedResponse.includes(config.idpIssuer)) {
      console.error('SAML response issuer mismatch');
      return false;
    }
    
    // Check for successful status
    if (!decodedResponse.includes('Success') && !decodedResponse.includes('urn:oasis:names:tc:SAML:2.0:status:Success')) {
      console.error('SAML response status is not Success');
      return false;
    }
    
    // In production, you should verify the XML signature using the IdP certificate
    // For now, we do basic validation
    // TODO: Implement full signature verification with the IdP certificate
    
    return true;
  } catch (error) {
    console.error('Error validating SAML response:', error);
    return false;
  }
}

/**
 * Parse SAML Assertion to extract user data
 */
export async function parseSAMLAssertion(samlResponse) {
  try {
    // Decode the SAML response
    const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf8');
    
    console.log('Parsing SAML assertion...');
    
    // Extract user data using regex (simple parsing)
    const userData = {};
    
    // Extract NameID (email) - AWS Identity Center uses saml2: prefix
    const nameIdPatterns = [
      /<saml2?:NameID[^>]*>([^<]+)<\/saml2?:NameID>/i,
      /<NameID[^>]*>([^<]+)<\/NameID>/i,
    ];
    
    for (const pattern of nameIdPatterns) {
      const match = decodedResponse.match(pattern);
      if (match) {
        userData.email = match[1].trim();
        userData.id = userData.email;
        console.log('Found NameID:', userData.email);
        break;
      }
    }
    
    // Extract attributes - AWS Identity Center uses saml2: prefix and various attribute name formats
    // Handle both saml: and saml2: prefixes
    const attributePatterns = [
      // Pattern for saml2:Attribute with saml2:AttributeValue
      /<(?:saml2?:)?Attribute[^>]*Name="([^"]+)"[^>]*>[\s\S]*?<(?:saml2?:)?AttributeValue[^>]*>([^<]*)<\/(?:saml2?:)?AttributeValue>/gi,
      // Pattern with namespace prefix variations
      /<Attribute[^>]*Name="([^"]+)"[^>]*>[\s\S]*?<AttributeValue[^>]*>([^<]*)<\/AttributeValue>/gi,
    ];
    
    for (const attributePattern of attributePatterns) {
      let match;
      while ((match = attributePattern.exec(decodedResponse)) !== null) {
        const attrName = match[1];
        const attrValue = match[2].trim();
        
        console.log(`Found attribute: ${attrName} = ${attrValue}`);
        
        // Map AWS Identity Center attribute names (case-insensitive comparison)
        const attrNameLower = attrName.toLowerCase();
        
        // Email mapping
        if (attrNameLower === 'email' || 
            attrNameLower.includes('emailaddress') || 
            attrNameLower.endsWith('/emailaddress') ||
            attrNameLower.includes('mail')) {
          userData.email = attrValue;
        }
        // First name mapping  
        else if (attrNameLower === 'firstname' || 
                 attrNameLower === 'givenname' ||
                 attrNameLower.endsWith('/givenname') ||
                 attrNameLower.includes('given_name')) {
          userData.firstName = attrValue;
        }
        // Last name mapping
        else if (attrNameLower === 'lastname' || 
                 attrNameLower === 'surname' ||
                 attrNameLower === 'familyname' ||
                 attrNameLower.endsWith('/surname') ||
                 attrNameLower.includes('family_name')) {
          userData.lastName = attrValue;
        }
        // Full name mapping
        else if ((attrNameLower === 'name' || attrNameLower.endsWith('/name')) && 
                 !attrNameLower.includes('format') &&
                 !attrNameLower.includes('first') &&
                 !attrNameLower.includes('last') &&
                 !attrNameLower.includes('given') &&
                 !attrNameLower.includes('family')) {
          userData.name = attrValue;
        }
        // Role/group mapping
        else if (attrNameLower.includes('role') || attrNameLower.includes('groups')) {
          // Check for admin role - can be name or group ID
          const adminGroupIds = (process.env.SAML_ADMIN_GROUP_ID || '').split(',').map(id => id.trim());
          
          const valueLower = attrValue.toLowerCase();
          
          // Check if value matches admin keywords or configured group IDs
          if (valueLower.includes('admin') || 
              valueLower.includes('data_owner') || 
              valueLower.includes('dataowner') ||
              adminGroupIds.includes(attrValue)) {
            userData.role = 'admin';
          } else {
            userData.role = 'user';
          }
          
          // Store the raw group value for debugging
          userData.rawGroup = attrValue;
          console.log(`Role mapping: ${attrValue} -> ${userData.role}`);
        }
      }
    }
    
    // Also try to extract Subject from the response (some IdPs use this)
    if (!userData.email) {
      const subjectMatch = decodedResponse.match(/<(?:saml2?:)?Subject>[\s\S]*?<(?:saml2?:)?NameID[^>]*>([^<]+)<\/(?:saml2?:)?NameID>/i);
      if (subjectMatch) {
        userData.email = subjectMatch[1].trim();
        userData.id = userData.email;
        console.log('Found Subject NameID:', userData.email);
      }
    }
    
    // Construct full name if not present
    if (!userData.name && (userData.firstName || userData.lastName)) {
      userData.name = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
    }
    
    // Default name to email prefix if not present
    if (!userData.name && userData.email) {
      userData.name = userData.email.split('@')[0];
    }
    
    // Default role to user
    if (!userData.role) {
      userData.role = 'user';
    }
    
    // Set ID from email if not set
    if (!userData.id && userData.email) {
      userData.id = userData.email;
    }
    
    console.log('Final parsed userData:', userData);
    
    return userData;
  } catch (error) {
    console.error('Error parsing SAML assertion:', error);
    return null;
  }
}
