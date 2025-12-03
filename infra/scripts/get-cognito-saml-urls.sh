#!/bin/bash

# Script to get Cognito SAML configuration URLs for IDC setup
# Run this in the account where Cognito is deployed

USER_POOL_ID="us-east-1_CuBrLbl6B"
REGION="us-east-1"

echo "=========================================="
echo "Cognito SAML Configuration for IDC"
echo "=========================================="
echo ""

# Get Cognito domain
DOMAIN=$(aws cognito-idp describe-user-pool \
  --user-pool-id "$USER_POOL_ID" \
  --region "$REGION" \
  --query 'UserPool.Domain' \
  --output text)

echo "1. User Pool ID:"
echo "   $USER_POOL_ID"
echo ""

echo "2. Cognito Domain:"
echo "   $DOMAIN.auth.$REGION.amazoncognito.com"
echo ""

echo "3. Application ACS URL (Assertion Consumer Service):"
echo "   Copy this to IDC Application ACS URL field"
echo "   https://$DOMAIN.auth.$REGION.amazoncognito.com/saml2/idpresponse"
echo ""

echo "4. Application SAML Audience (SP Entity ID):"
echo "   Copy this to IDC Application SAML audience field"
echo "   urn:amazon:cognito:sp:$USER_POOL_ID"
echo ""

echo "5. Sign-out URL (optional):"
echo "   https://$DOMAIN.auth.$REGION.amazoncognito.com/saml2/logout"
echo ""

echo "=========================================="
echo "IDC SAML Provider Information"
echo "=========================================="
echo ""

# Get SAML provider details
aws cognito-idp describe-identity-provider \
  --user-pool-id "$USER_POOL_ID" \
  --provider-name "IdentityCenter" \
  --region "$REGION" \
  --query 'IdentityProvider.ProviderDetails.{MetadataURL:MetadataURL,SSORedirectURI:SSORedirectBindingURI}' \
  --output table

echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Log into AWS Identity Center (in your organization account)"
echo "2. Go to Applications → Find your application"
echo "3. Verify/Update these values:"
echo "   - Application ACS URL (from #3 above)"
echo "   - Application SAML audience (from #4 above)"
echo "4. Verify Attribute Mappings include:"
echo "   - accessToken → \${session:access_token}"
echo "=========================================="
