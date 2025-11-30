import { deflateRaw } from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';
import { mapGroupToRole, mapGroupsToRoles, getHighestRole, ROLES } from './roles';

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
    
    console.log('=== SAML PARSING DEBUG START ===');
    console.log('SAML Response length:', decodedResponse.length);
    
    // Log all Attribute elements found for debugging
    const allAttributesDebug = decodedResponse.match(/<(?:saml2?:)?Attribute[^>]*>/gi) || [];
    console.log('All Attribute tags found:', allAttributesDebug.length);
    allAttributesDebug.forEach((attr, i) => {
      console.log(`  Attribute ${i + 1}: ${attr}`);
    });
    
    // Extract user data using regex (simple parsing)
    const userData = {
      groups: [], // Store all groups
      roles: [],  // Store mapped roles
      userId: null, // User ID from Identity Center
      userguid: null, // User GUID from Identity Center
    };
    
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
    
    // Extract ALL attribute values (including multiple values for same attribute)
    // This handles cases where user belongs to multiple groups
    const attributePattern = /<(?:saml2?:)?Attribute[^>]*Name="([^"]+)"[^>]*>([\s\S]*?)<\/(?:saml2?:)?Attribute>/gi;
    const valuePattern = /<(?:saml2?:)?AttributeValue[^>]*>([^<]*)<\/(?:saml2?:)?AttributeValue>/gi;
    
    let attrMatch;
    let attributeCount = 0;
    while ((attrMatch = attributePattern.exec(decodedResponse)) !== null) {
      attributeCount++;
      const attrName = attrMatch[1];
      const attrContent = attrMatch[2];
      const attrNameLower = attrName.toLowerCase();
      
      console.log(`Processing attribute ${attributeCount}: "${attrName}" (lowercase: "${attrNameLower}")`);
      console.log(`  Attribute content preview: ${attrContent.substring(0, 200)}...`);
      
      // Extract all values for this attribute
      const values = [];
      let valueMatch;
      const valueRegex = /<(?:saml2?:)?AttributeValue[^>]*>([^<]*)<\/(?:saml2?:)?AttributeValue>/gi;
      while ((valueMatch = valueRegex.exec(attrContent)) !== null) {
        const value = valueMatch[1].trim();
        if (value) {
          values.push(value);
          console.log(`  Found value: "${value}"`);
        }
      }
      
      console.log(`  Total values for "${attrName}": ${values.length} -> [${values.join(', ')}]`);
      
      // Check if this looks like a role/group attribute
      const isRoleAttr = attrNameLower === 'role' || attrNameLower.includes('role');
      const isGroupAttr = attrNameLower.includes('group');
      console.log(`  Is role attr: ${isRoleAttr}, Is group attr: ${isGroupAttr}`);
      
      // Map attributes to user data
      if (attrNameLower === 'email' || 
          attrNameLower.includes('emailaddress') || 
          attrNameLower.endsWith('/emailaddress') ||
          attrNameLower.includes('mail')) {
        userData.email = values[0];
        console.log(`  -> Mapped to email: ${values[0]}`);
      }
      else if (attrNameLower === 'firstname' || 
               attrNameLower === 'givenname' ||
               attrNameLower.endsWith('/givenname') ||
               attrNameLower.includes('given_name')) {
        userData.firstName = values[0];
        console.log(`  -> Mapped to firstName: ${values[0]}`);
      }
      else if (attrNameLower === 'lastname' || 
               attrNameLower === 'surname' ||
               attrNameLower === 'familyname' ||
               attrNameLower.endsWith('/surname') ||
               attrNameLower.includes('family_name')) {
        userData.lastName = values[0];
        console.log(`  -> Mapped to lastName: ${values[0]}`);
      }
      else if ((attrNameLower === 'name' || attrNameLower.endsWith('/name')) && 
               !attrNameLower.includes('format') &&
               !attrNameLower.includes('first') &&
               !attrNameLower.includes('last') &&
               !attrNameLower.includes('given') &&
               !attrNameLower.includes('family')) {
        userData.name = values[0];
        console.log(`  -> Mapped to name: ${values[0]}`);
      }
      // User ID mapping - covers various naming conventions from AWS Identity Center
      else if (attrNameLower === 'userid' || 
               attrNameLower === 'user_id' ||
               attrNameLower === 'userguid' ||
               attrNameLower === 'user_guid' ||
               attrNameLower === 'ad_guid' ||
               attrNameLower === 'adguid' ||
               attrNameLower.endsWith('/userid') ||
               attrNameLower.endsWith('/userguid') ||
               attrNameLower.endsWith('/ad_guid') ||
               attrNameLower.includes('subject') ||
               attrNameLower === 'sub') {
        userData.userId = values[0];
        userData.userguid = values[0];
        console.log(`  -> Mapped to userId/userguid: ${values[0]}`);
      }
      // Role/group mapping - collect ALL groups
      else if (attrNameLower === 'role' || attrNameLower.includes('role') || attrNameLower.includes('groups') || attrNameLower.includes('group')) {
        // Add all group values
        userData.groups.push(...values);
        console.log(`  -> Added to groups: [${values.join(', ')}]`);
      }
      else {
        console.log(`  -> Not mapped (unrecognized attribute)`);
      }
    }
    
    console.log(`Total attributes processed: ${attributeCount}`);
    console.log(`Groups collected: [${userData.groups.join(', ')}]`);
    
    // Map groups to application roles
    if (userData.groups.length > 0) {
      userData.roles = mapGroupsToRoles(userData.groups);
      userData.role = getHighestRole(userData.roles);
      console.log('Mapped roles:', userData.roles);
      console.log('Primary role (highest):', userData.role);
    } else {
      console.log('WARNING: No groups found! Defaulting to USER role');
      userData.roles = [ROLES.USER];
      userData.role = ROLES.USER;
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
    
    // Set ID from userId if available, otherwise from email
    if (userData.userId) {
      userData.id = userData.userId;
      console.log('Using userId as id:', userData.id);
    } else if (!userData.id && userData.email) {
      userData.id = userData.email;
      console.log('Using email as id:', userData.id);
    }
    
    console.log('=== SAML PARSING DEBUG END ===');
    console.log('Final parsed userData:', JSON.stringify(userData, null, 2));
    
    return userData;
  } catch (error) {
    console.error('Error parsing SAML assertion:', error);
    return null;
  }
}
