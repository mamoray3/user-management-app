#!/bin/bash

# Script to force Cognito to refresh SAML metadata from IDC
# This is useful after changing the ACS URL in IDC

USER_POOL_ID="us-east-1_CuBrLbl6B"
PROVIDER_NAME="IdentityCenter"
METADATA_URL="https://portal.sso.us-east-1.amazonaws.com/saml/metadata/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3"
REGION="us-east-1"

echo "=========================================="
echo "Force Cognito SAML Metadata Refresh"
echo "=========================================="
echo ""
echo "This will force Cognito to re-fetch SAML metadata from IDC."
echo "Use this after changing the ACS URL in IDC."
echo ""

echo "User Pool ID: $USER_POOL_ID"
echo "Provider Name: $PROVIDER_NAME"
echo "Metadata URL: $METADATA_URL"
echo ""

echo "Updating identity provider to force metadata refresh..."
aws cognito-idp update-identity-provider \
  --user-pool-id "$USER_POOL_ID" \
  --provider-name "$PROVIDER_NAME" \
  --region "$REGION" \
  --provider-details MetadataURL="$METADATA_URL" \
  2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Successfully refreshed SAML metadata!"
  echo ""
  echo "Next steps:"
  echo "1. Use an incognito/private browser window"
  echo "2. Go to http://localhost:3000"
  echo "3. Click 'Sign in'"
  echo "4. Check your terminal for SAML response logs"
else
  echo ""
  echo "❌ Failed to refresh metadata"
  echo "Check your AWS credentials and try again"
fi

echo ""
echo "=========================================="
