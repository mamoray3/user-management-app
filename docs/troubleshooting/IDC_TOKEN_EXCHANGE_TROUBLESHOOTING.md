# IDC OIDC Token Exchange Troubleshooting Guide

## Overview

This document provides comprehensive troubleshooting steps for debugging issues with AWS Identity Center (IDC) OIDC token exchange in the user management application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication Flow](#authentication-flow)
3. [Logging and Monitoring](#logging-and-monitoring)
4. [Common Issues and Solutions](#common-issues-and-solutions)
5. [Verification Steps](#verification-steps)
6. [AWS IAM and Configuration Checks](#aws-iam-and-configuration-checks)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Authentication: User → App → Cognito → IDC → Entra ID          │
│ Token Flow: Entra ID → IDC → Cognito → NextAuth → Session      │
│ AWS Creds: Session.idcAccessToken → STS → AWS Credentials      │
│ S3 Access: AWS Creds → S3 Access Grants → Scoped S3 Access     │
└─────────────────────────────────────────────────────────────────┘
```

### Critical Components

1. **Entra ID** (Microsoft Azure AD)
   - Primary identity provider
   - Authenticates users

2. **AWS Identity Center (IDC)**
   - SAML federation with Entra ID
   - Issues IDC access tokens
   - Provides OIDC endpoint for token exchange

3. **Cognito User Pool**
   - SAML identity provider pointing to IDC
   - Custom attributes to capture IDC tokens
   - Issues Cognito OIDC tokens to app

4. **NextAuth**
   - Handles OIDC flow with Cognito
   - Extracts IDC access token from Cognito claims
   - Stores IDC token in session

5. **STS AssumeRoleWithWebIdentity**
   - Exchanges IDC OIDC token for AWS credentials
   - Preserves IDC identity context

6. **S3 Access Grants**
   - Uses IDC-scoped credentials
   - Enables DIRECTORY_USER grants to work

## Authentication Flow

### Step-by-Step Flow with Key Data

```
1. User clicks "Sign In"
   ↓
2. NextAuth redirects to Cognito authorization endpoint
   URL: https://{COGNITO_DOMAIN}/oauth2/authorize
   Params: identity_provider=IdentityCenter, scope=openid email profile
   ↓
3. Cognito redirects to IDC SAML endpoint
   ↓
4. IDC redirects to Entra ID for authentication
   ↓
5. Entra ID authenticates user and returns to IDC
   ↓
6. IDC creates SAML assertion with attributes:
   - Subject: IDC User ID (e.g., 3448e4c8-70b1-7069-c7f1-e42f103a6ab5)
   - email: user@example.com
   - firstName, lastName: User's name
   - accessToken: IDC OIDC access token (CRITICAL!)
   - Groups: IDC group memberships
   ↓
7. IDC sends SAML response to Cognito
   ↓
8. Cognito processes SAML assertion:
   - Maps SAML attributes to Cognito user attributes
   - custom:idc_user_id ← Subject
   - custom:idc_access_token ← accessToken (CRITICAL!)
   - custom:s3_prefix ← s3Prefix
   - cognito:groups ← Groups
   ↓
9. Cognito issues authorization code to NextAuth callback
   ↓
10. NextAuth exchanges code for Cognito tokens
    POST https://{COGNITO_DOMAIN}/oauth2/token
    Response: { access_token, id_token, refresh_token }
    ↓
11. NextAuth decodes Cognito ID token
    Claims should include:
    - sub: Cognito user ID
    - email, name: User identity
    - cognito:groups: IDC groups
    - custom:idc_user_id: IDC User ID (CRITICAL!)
    - custom:idc_access_token: IDC OIDC token (CRITICAL!)
    ↓
12. NextAuth creates session with IDC token
    session.idcAccessToken = decoded['custom:idc_access_token']
    ↓
13. Frontend calls /api/s3/credentials
    ↓
14. Backend calls STS AssumeRoleWithWebIdentity
    Parameters:
    - RoleArn: IDC_TOKEN_EXCHANGE_ROLE_ARN
    - WebIdentityToken: session.idcAccessToken
    - RoleSessionName: idc-user-{idcUserId}
    ↓
15. STS validates IDC token with IDC OIDC provider
    ↓
16. STS returns AWS credentials with IDC identity context
    ↓
17. Application uses credentials for S3 Access Grants
```

## Logging and Monitoring

### Comprehensive Logging Added

The application now includes extensive logging at every critical point in the authentication and token exchange flow. All logs are output to `console.log` and `console.error`.

### Log Locations

#### 1. NextAuth Token Exchange (`frontend/src/app/api/auth/[...nextauth]/route.js`)

**Token Request**
```
========================================
NextAuth: Token Request
========================================
Timestamp: 2025-12-02T10:30:45.123Z
Token URL: https://{domain}.auth.{region}.amazoncognito.com/oauth2/token
Authorization code present: true
Authorization code length: 856
Redirect URI: https://your-app.com/api/auth/callback/cognito
Token request parameters: {...}
```

**Userinfo Request**
```
========================================
NextAuth: Userinfo Request
========================================
Timestamp: 2025-12-02T10:30:45.456Z
ID token received (length): 1248
Decoded token claims: {
  sub: "abc123...",
  email: "user@example.com",
  custom:idc_user_id: "3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
  custom:idc_access_token_present: true/false,  ← CHECK THIS!
  custom:idc_access_token_length: 0/2048,      ← CHECK THIS!
  ...
}
```

**Profile Callback**
```
========================================
NextAuth: Profile Callback
========================================
Profile received (without sensitive data): {...}
Mapping groups to roles: ["admin-group", ...]
Roles after mapping: ["admin", ...]
Primary role selected: "admin"
IDC User ID: 3448e4c8-70b1-7069-c7f1-e42f103a6ab5
SUCCESS: IDC access token is present (length): 2048  ← CHECK THIS!
```

**JWT Callback**
```
========================================
NextAuth: JWT Callback
========================================
Is initial sign in: true/false
Processing initial sign in for user: user@example.com
User data received (without sensitive data): {
  hasIdcAccessToken: true/false,              ← CHECK THIS!
  idcAccessTokenLength: 0/2048,               ← CHECK THIS!
  ...
}
SUCCESS: IDC access token captured in JWT token  ← CHECK THIS!
```

**Session Callback**
```
========================================
NextAuth: Session Callback
========================================
Token data (without sensitive data): {
  hasIdcAccessToken: true/false,              ← CHECK THIS!
  idcAccessTokenLength: 0/2048,               ← CHECK THIS!
  ...
}
SUCCESS: IDC access token is present in session  ← CHECK THIS!
```

#### 2. S3 Credentials API (`frontend/src/app/api/s3/credentials/route.js`)

**GET Request**
```
========================================
S3 Credentials API - GET Request Started
========================================
Timestamp: 2025-12-02T10:31:00.123Z
Session found for user: user@example.com
Session user details: {
  hasIdcAccessToken: true/false,              ← CHECK THIS!
  idcAccessTokenLength: 0/2048,               ← CHECK THIS!
  idcUserId: "3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
  ...
}
IDC access token present in session (length): 2048  ← CHECK THIS!
Configuration check passed
IDC_TOKEN_EXCHANGE_ROLE_ARN: arn:aws:iam::123456789012:role/...
Attempting IDC OIDC Token Exchange...
Calling AssumeRoleWithWebIdentity with: {
  roleArn: "arn:aws:iam::123456789012:role/...",
  roleSessionName: "idc-user-3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
  tokenLength: 2048,
  ...
}
SUCCESS: IDC OIDC Token Exchange completed successfully  ← CHECK THIS!
Credentials obtained: {...}
```

**Error Logging**
```
========================================
ERROR: IDC token exchange failed              ← CRITICAL ERROR!
========================================
Error name: InvalidIdentityTokenException
Error message: Couldn't retrieve verification key from your identity provider...
AWS Error metadata: {
  httpStatusCode: 400,
  requestId: "abc123...",
  ...
}
Token exchange parameters used: {...}
```

### How to Access Logs

#### Development Environment
```bash
# Terminal running Next.js dev server
cd frontend
npm run dev

# Logs appear in this terminal
# Look for the "========================================" separators
```

#### Production Environment (CloudFront + Lambda)

**Frontend Logs (CloudWatch)**
```bash
# If using Lambda@Edge or CloudFront Functions
aws logs tail /aws/lambda/your-nextjs-function --follow

# Look for NextAuth and S3 Credentials API logs
```

**Backend Logs (API Gateway + Lambda)**
```bash
# Lambda function logs
aws logs tail /aws/lambda/your-backend-function --follow

# API Gateway access logs
aws logs tail /aws/apigateway/your-api-id --follow
```

## Common Issues and Solutions

### Issue 1: IDC Access Token Missing from Cognito Token

**Symptoms:**
```
WARNING: IDC access token is missing from Cognito token
CRITICAL: User object is missing idcAccessToken
ERROR: Missing IDC access token in session
```

**Root Cause:**
The IDC access token is not being captured in the SAML assertion or not being mapped to the Cognito custom attribute.

**Solution Steps:**

1. **Verify IDC Application Attribute Mapping**
   - Navigate to: AWS IAM Identity Center Console
   - Go to: Applications → [Your Application] → Attribute mappings
   - **Required mapping:**
     ```
     User attribute in application: accessToken
     Maps to: ${session:access_token}
     Format: unspecified
     ```
   - Click **Save changes**

2. **Verify Cognito SAML Identity Provider Configuration**
   ```bash
   # Check Cognito SAML IdP attribute mapping
   aws cognito-idp describe-identity-provider \
     --user-pool-id us-east-1_XXXXXXXXX \
     --provider-name IdentityCenter \
     --query 'IdentityProvider.AttributeMapping'
   ```

   **Expected output:**
   ```json
   {
     "email": "email",
     "given_name": "firstName",
     "family_name": "lastName",
     "username": "email",
     "custom:idc_user_id": "Subject",
     "custom:s3_prefix": "s3Prefix",
     "custom:idc_access_token": "accessToken"  ← CHECK THIS!
   }
   ```

3. **Verify Cognito User Pool Client Configuration**
   ```bash
   # Check User Pool Client read attributes
   aws cognito-idp describe-user-pool-client \
     --user-pool-id us-east-1_XXXXXXXXX \
     --client-id <CLIENT_ID> \
     --query 'UserPoolClient.ReadAttributes'
   ```

   **Must include:**
   ```json
   [
     "email",
     "given_name",
     "family_name",
     "custom:idc_user_id",
     "custom:s3_prefix",
     "custom:idc_access_token"  ← CHECK THIS!
   ]
   ```

4. **Re-authenticate**
   - Sign out completely
   - Clear browser cookies
   - Sign in again
   - Check logs for "SUCCESS: IDC access token is present"

### Issue 2: AssumeRoleWithWebIdentity Fails

**Symptoms:**
```
ERROR: IDC token exchange failed
Error name: InvalidIdentityTokenException
Error message: Couldn't retrieve verification key from your identity provider
```

**Root Cause:**
The IAM OIDC provider is not configured correctly or the role trust policy doesn't allow the IDC OIDC provider.

**Solution Steps:**

1. **Verify IAM OIDC Provider Exists**
   ```bash
   # List OIDC providers
   aws iam list-open-id-connect-providers

   # Get OIDC provider details
   aws iam get-open-id-connect-provider \
     --open-id-connect-provider-arn arn:aws:iam::123456789012:oidc-provider/oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX
   ```

   **Expected output:**
   ```json
   {
     "Url": "https://oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX",
     "ClientIDList": ["https://oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX"],
     "ThumbprintList": ["..."]
   }
   ```

2. **Verify OIDC Provider URL Matches IDC**
   - Get IDC OIDC issuer URL:
     - AWS Console → IAM Identity Center → Settings → Identity source
     - Note the "Issuer URL" (e.g., `https://oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX`)
   - Compare with IAM OIDC provider URL (must match exactly)

3. **Verify IAM Role Trust Policy**
   ```bash
   # Get role trust policy
   aws iam get-role \
     --role-name your-project-env-idc-token-exchange \
     --query 'Role.AssumeRolePolicyDocument'
   ```

   **Expected trust policy:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::123456789012:oidc-provider/oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX:aud": "https://oidc.us-east-1.amazonaws.com/id/XXXXXXXXXX"
           }
         }
       }
     ]
   }
   ```

4. **Test Token Exchange Manually**
   ```bash
   # Extract IDC access token from logs (look for "IDC access token preview")
   # Copy the full token (not just the preview)

   # Test AssumeRoleWithWebIdentity
   aws sts assume-role-with-web-identity \
     --role-arn arn:aws:iam::123456789012:role/your-project-env-idc-token-exchange \
     --role-session-name test-session \
     --web-identity-token "eyJraWQ..." \
     --duration-seconds 3600
   ```

   If this fails, check the error message for specific issues.

### Issue 3: Token Exchange Works but S3 Access Grants Fails

**Symptoms:**
```
SUCCESS: IDC OIDC Token Exchange completed successfully
ERROR: Access denied to the requested S3 path
Error name: AccessDeniedException
```

**Root Cause:**
S3 Access Grants instance is not linked to Identity Center, or grants are not configured for the user.

**Solution Steps:**

1. **Verify S3 Access Grants Instance**
   ```bash
   # Get Access Grants instance
   aws s3control get-access-grants-instance \
     --account-id 123456789012
   ```

   **Expected output:**
   ```json
   {
     "AccessGrantsInstanceArn": "arn:aws:s3:us-east-1:123456789012:access-grants/default",
     "AccessGrantsInstanceId": "default",
     "IdentityCenterArn": "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"  ← CHECK THIS!
   }
   ```

2. **Verify Grants Exist for User**
   ```bash
   # List all grants
   aws s3control list-access-grants \
     --account-id 123456789012 \
     --access-grants-instance-arn arn:aws:s3:us-east-1:123456789012:access-grants/default
   ```

   Look for grants with:
   - `GranteeType: DIRECTORY_USER`
   - `GranteeIdentifier: 3448e4c8-70b1-7069-c7f1-e42f103a6ab5` (your IDC User ID)

3. **Create Test Grant**
   ```bash
   # Create a grant for testing
   aws s3control create-access-grant \
     --account-id 123456789012 \
     --access-grants-instance-arn arn:aws:s3:us-east-1:123456789012:access-grants/default \
     --access-grants-location-id <location-id> \
     --grantee Type=DIRECTORY_USER,Identifier=3448e4c8-70b1-7069-c7f1-e42f103a6ab5 \
     --permission READ \
     --access-grants-location-configuration 's3://bucket/users/3448e4c8-70b1-7069-c7f1-e42f103a6ab5/*'
   ```

### Issue 4: Token Has Expired During Testing

**Symptoms:**
```
Error name: ExpiredTokenException
Error message: The security token included in the request is expired
```

**Solution:**
- IDC access tokens typically expire after 1 hour
- Sign out and sign in again to get a fresh token
- Verify token expiration in logs:
  ```
  Decoded token claims: {
    exp: 1234567890,  ← Check if this is in the past
    iat: 1234567890,
    ...
  }
  ```

## Verification Steps

### End-to-End Test Procedure

1. **Clear Browser State**
   ```
   - Clear cookies for your application domain
   - Clear browser cache
   - Close all browser tabs
   - Open new incognito/private window
   ```

2. **Start Fresh Authentication**
   - Navigate to your application
   - Open browser DevTools Console (F12)
   - Click "Sign In"
   - Watch for logs in both browser console and server logs

3. **Check Authentication Flow Logs**

   Look for these SUCCESS messages in order:
   ```
   [NextAuth: Token Request]
   SUCCESS: Tokens received from Cognito ✓

   [NextAuth: Userinfo Request]
   SUCCESS: IDC access token is present in Cognito token ✓

   [NextAuth: Profile Callback]
   SUCCESS: IDC access token is present (length): 2048 ✓

   [NextAuth: JWT Callback]
   SUCCESS: IDC access token captured in JWT token ✓

   [NextAuth: Session Callback]
   SUCCESS: IDC access token is present in session ✓
   ```

4. **Test S3 Credentials API**

   After successful sign-in:
   ```javascript
   // In browser console
   fetch('/api/s3/credentials')
     .then(r => r.json())
     .then(console.log)
     .catch(console.error)
   ```

   Look for these SUCCESS messages:
   ```
   [S3 Credentials API]
   Session found for user: user@example.com ✓
   IDC access token present in session (length): 2048 ✓
   Configuration check passed ✓
   Attempting IDC OIDC Token Exchange... ✓
   SUCCESS: IDC OIDC Token Exchange completed successfully ✓
   ```

5. **Verify Credentials in Response**
   ```json
   {
     "credentials": {
       "accessKeyId": "ASIA...",
       "secretAccessKey": "...",
       "sessionToken": "...",
       "expiration": "2025-12-02T11:30:00.000Z"
     },
     "s3Bucket": "your-bucket",
     "userPrefix": "users/3448e4c8-70b1-7069-c7f1-e42f103a6ab5/",
     "idcUserId": "3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
     "region": "us-east-1"
   }
   ```

## AWS IAM and Configuration Checks

### Required Environment Variables

**Frontend (.env)**
```bash
# NextAuth
NEXTAUTH_URL=https://your-app.com
NEXTAUTH_SECRET=<min-32-chars>

# Cognito
COGNITO_CLIENT_ID=<client-id>
COGNITO_CLIENT_SECRET=<client-secret>
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX
COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com

# IDC Token Exchange (CRITICAL!)
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::123456789012:role/your-project-env-idc-token-exchange

# S3 Access Grants
S3_USER_DATA_BUCKET=your-bucket
S3_ACCESS_GRANTS_INSTANCE_ARN=arn:aws:s3:us-east-1:123456789012:access-grants/default
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1
```

### Terraform Configuration Check

**Verify IDC OIDC Infrastructure**
```bash
cd infra
terraform plan

# Look for these resources:
# - aws_iam_openid_connect_provider.idc
# - aws_iam_role.idc_token_exchange
# - aws_iam_role_policy.idc_token_exchange_policy
```

**Get Terraform Outputs**
```bash
terraform output -json | jq '
  {
    idc_token_exchange_role_arn,
    cognito_user_pool_id,
    cognito_client_id,
    cognito_domain,
    s3_user_data_bucket
  }
'
```

## Getting Additional Help

### Enable Debug Mode

**NextAuth Debug**
```javascript
// In frontend/src/app/api/auth/[...nextauth]/route.js
export const authOptions = {
  // ... existing config
  debug: true,  // Enable debug logs
};
```

**AWS SDK Debug**
```javascript
// In frontend/src/app/api/s3/credentials/route.js
import { STSClient } from '@aws-sdk/client-sts';

const stsClient = new STSClient({
  region: REGION,
  logger: console,  // Enable AWS SDK logging
});
```

### Collect Diagnostic Information

When reporting issues, collect:

1. **Logs from authentication flow**
   - All logs from NextAuth callbacks
   - Cognito token claims
   - IDC token presence/length

2. **Logs from S3 credentials API**
   - Token exchange attempt logs
   - Error messages with full stack traces
   - AWS error metadata

3. **AWS Configuration**
   ```bash
   # IAM OIDC Provider
   aws iam get-open-id-connect-provider \
     --open-id-connect-provider-arn <arn>

   # IAM Role Trust Policy
   aws iam get-role \
     --role-name your-idc-token-exchange-role

   # Cognito SAML IdP Config
   aws cognito-idp describe-identity-provider \
     --user-pool-id <pool-id> \
     --provider-name IdentityCenter

   # S3 Access Grants Instance
   aws s3control get-access-grants-instance \
     --account-id <account-id>
   ```

4. **IDC Configuration**
   - Screenshot of attribute mappings
   - Application type (Customer Managed vs AWS Managed)
   - OIDC issuer URL

## Summary Checklist

Use this checklist to verify your setup:

- [ ] IDC application has `accessToken → ${session:access_token}` attribute mapping
- [ ] Cognito SAML IdP has `custom:idc_access_token ← accessToken` attribute mapping
- [ ] Cognito User Pool Client read attributes includes `custom:idc_access_token`
- [ ] IAM OIDC provider exists with correct IDC issuer URL
- [ ] IAM role trust policy allows the OIDC provider
- [ ] `IDC_TOKEN_EXCHANGE_ROLE_ARN` environment variable is set
- [ ] S3 Access Grants instance is linked to Identity Center
- [ ] Grants exist for the test user with `DIRECTORY_USER` type
- [ ] Authentication flow logs show "SUCCESS: IDC access token is present"
- [ ] S3 credentials API logs show "SUCCESS: IDC OIDC Token Exchange completed"

## Next Steps

After troubleshooting:

1. Document your specific issue and resolution
2. Update this guide with new findings
3. Consider automating health checks
4. Set up monitoring alerts for token exchange failures
