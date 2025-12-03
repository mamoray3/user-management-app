# Quick Start: IDC OIDC Token Exchange Setup

This guide walks through setting up IDC OIDC Token Exchange from scratch, including creating the IDC SAML application and configuring all required components.

## Prerequisites

- AWS Identity Center configured with an external identity provider (e.g., Entra ID, Okta, etc.)
- Terraform installed
- AWS CLI configured with appropriate credentials

## Step-by-Step Setup

### Step 0: Create IDC SAML Application (If Not Already Done)

If you haven't already created a SAML application in AWS Identity Center for this application, follow these steps:

1. **In AWS Identity Center console**, navigate to **Applications**

2. Click **Add application**

3. Select **Add custom SAML 2.0 application**

4. **Application properties**:
   - Application name: `user-management-app` (or your preferred name)
   - Description: `User Management Application with S3 Access`
   - Click **Next**

5. **Download the metadata file** or copy the **SAML metadata URL**:
   - You'll need this for `idc_saml_metadata_url` in terraform.tfvars
   - Example: `https://portal.sso.us-east-1.amazonaws.com/saml/metadata/XXXXX`

6. **Application metadata** (you'll update this after Cognito is deployed):
   - For now, use temporary values:
     - Application ACS URL: `https://example.com/saml/acs` (will update later)
     - Application SAML audience: `urn:amazon:cognito:sp:temporary` (will update later)
   - Click **Next**

7. **Assign users/groups**:
   - Assign the users or groups who should have access to this application
   - Click **Submit**

> **Important**: You'll need to update the ACS URL and audience after deploying Cognito. The actual values will be:
> - Application ACS URL: `https://YOUR_COGNITO_DOMAIN.auth.REGION.amazoncognito.com/saml2/idpresponse`
> - Application SAML audience: `urn:amazon:cognito:sp:YOUR_USER_POOL_ID`
>
> These will be available after running `terraform apply` (Step 4).

### Step 1: Find Your IDC Configuration Values

You'll need two values from AWS Identity Center:

**A) OIDC Issuer URL**
```bash
# In AWS Identity Center console:
# 1. Go to Settings
# 2. Copy the "AWS access portal URL"
#    Example: https://d-1234567890.awsapps.com/start

# Your OIDC issuer URL is:
# https://[region].awsapps.com/start/oidc
```

Example:
```
https://us-east-1.awsapps.com/start/oidc
```

**B) Identity Center Instance ARN**
```bash
# In AWS Identity Center console:
# 1. Go to Settings
# 2. Scroll down to "Identity source"
# 3. Copy the ARN shown
#    Format: arn:aws:sso:::instance/ssoins-XXXXXXXXXX
```

Example:
```
arn:aws:sso:::instance/ssoins-1234567890abcdef
```

### Step 2: Configure IDC SAML Attribute Mapping

In AWS Identity Center console:

1. Navigate to **Applications** → Your application (created in Step 0)

2. Click **Actions** → **Edit attribute mappings**

3. Add or update these mappings:

| User attribute in application | Maps to this string value or AWS SSO attribute | Format |
|-------------------------------|-----------------------------------------------|--------|
| `Subject` | `${user:subject}` | persistent |
| `email` | `${user:email}` | unspecified |
| `firstName` | `${user:givenName}` | unspecified |
| `lastName` | `${user:familyName}` | unspecified |
| **`accessToken`** ⭐ | **`${session:access_token}`** ⭐ | unspecified |

4. Click **Save changes**

> **Critical**: The `accessToken → ${session:access_token}` mapping is what enables IDC OIDC token exchange! This captures the IDC access token and passes it to Cognito, which then makes it available to your application for AWS credential exchange.

**What each attribute does**:
- `Subject`: IDC User ID (used for S3 Access Grants DIRECTORY_USER grants)
- `email`, `firstName`, `lastName`: User profile information
- `accessToken`: IDC access token (enables AssumeRoleWithWebIdentity)

### Step 3: Update Terraform Configuration

```bash
cd infra/core

# Edit terraform.tfvars and add these lines:
# Replace the values with what you captured in Steps 0 and 1
cat >> terraform.tfvars <<'EOF'

# SAML Federation Configuration
idc_saml_metadata_url = "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/XXXXX"  # From Step 0

# IDC OIDC Token Exchange Configuration
idc_oidc_issuer_url = "https://us-east-1.awsapps.com/start/oidc"  # From Step 1A (use your region)

# Identity Center ARN for S3 Access Grants directory integration
identity_center_arn = "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"  # From Step 1B
EOF
```

> **Note**: All three values are required:
> - `idc_saml_metadata_url`: Enables Cognito to trust IDC as an identity provider
> - `idc_oidc_issuer_url`: Enables AWS credentials via IDC token exchange
> - `identity_center_arn`: Enables S3 Access Grants to recognize IDC users/groups

### Step 4: Deploy Infrastructure

```bash
# Review changes
terraform plan

# Apply changes (creates Cognito, OIDC provider, and IAM role)
terraform apply

# Capture important outputs
terraform output cognito_user_pool_id
terraform output cognito_domain
terraform output idc_token_exchange_role_arn
```

Expected outputs:
```
cognito_user_pool_id = "us-east-1_XXXXXXXXX"
cognito_domain = "user-management-dev-abc12345.auth.us-east-1.amazoncognito.com"
idc_token_exchange_role_arn = "arn:aws:iam::123456789012:role/user-management-prod-idc-token-exchange"
```

### Step 4a: Update IDC SAML Application with Cognito Details

Now that Cognito is deployed, update your IDC SAML application with the correct values:

1. **In AWS Identity Center console**, navigate to **Applications** → Your application

2. Click **Actions** → **Edit configuration**

3. Update **Application metadata**:
   ```
   Application ACS URL:
   https://YOUR_COGNITO_DOMAIN.auth.REGION.amazoncognito.com/saml2/idpresponse

   Example:
   https://user-management-dev-abc12345.auth.us-east-1.amazoncognito.com/saml2/idpresponse

   Application SAML audience:
   urn:amazon:cognito:sp:YOUR_USER_POOL_ID

   Example:
   urn:amazon:cognito:sp:us-east-1_XXXXXXXXX
   ```

4. Click **Save changes**

> **Tip**: You can construct these values from Terraform outputs:
> ```bash
> # Get Cognito domain from terraform output
> COGNITO_DOMAIN=$(cd infra/core && terraform output -raw cognito_domain)
> USER_POOL_ID=$(cd infra/core && terraform output -raw cognito_user_pool_id)
>
> echo "ACS URL: https://${COGNITO_DOMAIN}/saml2/idpresponse"
> echo "SAML Audience: urn:amazon:cognito:sp:${USER_POOL_ID}"
> ```

### Step 5: Update Frontend Environment Variables (Local Development Only)

```bash
cd ../frontend

# For LOCAL DEVELOPMENT: Add the role ARN to .env.local
echo "IDC_TOKEN_EXCHANGE_ROLE_ARN=$(cd ../infra && terraform output -raw idc_token_exchange_role_arn)" >> .env.local

# Verify it's there
grep IDC_TOKEN_EXCHANGE_ROLE_ARN .env.local
```

> **Important**:
> - **Local Development**: Add to `.env.local` (as shown above)
> - **AWS Deployment**: Already configured! The Lambda function gets this automatically from Terraform (see [cloudfront.tf:102](../infra/cloudfront.tf#L102))
>
> You do **NOT** need to manually set environment variables in AWS - Terraform handles it automatically!
>
> See [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for complete details.

### Step 6: Deploy and Test

```bash
# Build the application
npm run build

# Deploy using your deployment method
# (e.g., deploy to AWS, Docker, etc.)

# After deployment, test by:
# 1. Sign in to the application
# 2. Open browser console
# 3. Navigate to Files page
# 4. Check Network tab for /api/s3/credentials request
# 5. Verify response contains: "method": "idc-oidc"
```

## Verification

### Check Server Logs

After signing in, you should see:

```
✓ Using IDC OIDC Token Exchange for AWS credentials
```

If you see this instead:
```
⚠ Using Cognito Identity Pool (legacy) for AWS credentials
```

Then something is misconfigured. See [Troubleshooting](#troubleshooting).

### Check API Response

The `/api/s3/credentials` endpoint should return:

```json
{
  "method": "idc-oidc",
  "credentials": {
    "accessKeyId": "ASIA...",
    "secretAccessKey": "...",
    "sessionToken": "...",
    "expiration": "2024-..."
  },
  "idcUserId": "3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
  "s3Bucket": "...",
  "userPrefix": "users/3448e4c8-70b1-7069-c7f1-e42f103a6ab5/",
  "region": "us-east-1"
}
```

Key indicators:
- ✅ `"method": "idc-oidc"` - Using new token exchange
- ✅ `idcUserId` present - IDC identity preserved

## Troubleshooting

### Issue: Still Using Cognito Identity Pool

**Symptom**: API returns `"method": "cognito-identity-pool"`

**Check**:
1. Is `IDC_TOKEN_EXCHANGE_ROLE_ARN` set in your environment file?
   ```bash
   # Check in .env.local (for local development)
   grep IDC_TOKEN_EXCHANGE_ROLE_ARN .env.local

   # Or check runtime environment
   grep IDC_TOKEN_EXCHANGE_ROLE_ARN .env
   ```

2. Did you restart the application after updating the environment file?

3. Check browser console for errors

4. Check server logs for error messages

### Issue: "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Symptom**: Error when calling STS

**Solution**:
1. Verify the OIDC provider was created:
   ```bash
   aws iam list-open-id-connect-providers
   ```

2. Verify the role trust policy:
   ```bash
   terraform output idc_token_exchange_role_arn
   aws iam get-role --role-name user-management-prod-idc-token-exchange
   ```

3. Check the role's assume role policy includes the OIDC provider

### Issue: IDC Access Token Not in Session

**Symptom**: `session.idcAccessToken` is undefined

**Solution**:
1. Verify IDC attribute mapping includes `accessToken → ${session:access_token}`

2. Check Cognito custom attribute exists:
   ```bash
   aws cognito-idp describe-user-pool --user-pool-id us-east-1_XXXXXXXXX | grep idc_access_token
   ```

3. Check Cognito SAML provider attribute mapping:
   ```bash
   aws cognito-idp describe-identity-provider \
     --user-pool-id us-east-1_XXXXXXXXX \
     --provider-name IdentityCenter
   ```

4. Sign out and sign in again to get new tokens

### Issue: S3 Access Grants Still Don't Work

**Symptom**: Access denied even with DIRECTORY_USER grant

**Check**:
1. Is the method `idc-oidc`? (If not, fix above issues first)

2. Does the grant's `grantee_identifier` exactly match the `idcUserId`?

3. Is the S3 Access Grants instance linked to Identity Center?
   ```bash
   aws s3control get-access-grants-instance \
     --account-id 123456789012 \
     --region us-east-1
   ```

4. Check the grant:
   ```bash
   aws s3control list-access-grants \
     --account-id 123456789012 \
     --region us-east-1
   ```

## Environment Variables Quick Reference

### Minimum Required (.env)

```bash
# Authentication
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-32-char-secret
COGNITO_CLIENT_ID=your-client-id
COGNITO_CLIENT_SECRET=your-client-secret
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXX
COGNITO_DOMAIN=your-app.auth.us-east-1.amazoncognito.com

# IDC OIDC Token Exchange ⭐
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::123456789012:role/user-management-prod-idc-token-exchange

# S3 Access
S3_USER_DATA_BUCKET=your-bucket-name
S3_ACCESS_GRANTS_INSTANCE_ARN=arn:aws:s3:us-east-1:123456789012:access-grants/default
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1
```

### Optional (Fallback)

```bash
# Cognito Identity Pool (optional fallback)
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
```

## Terraform Variables Quick Reference

### Minimum Required (terraform.tfvars)

```hcl
aws_region   = "us-east-1"
environment  = "prod"
project_name = "user-management"

# SAML federation
idc_saml_metadata_url = "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/YOUR_APP_ID"

# IDC OIDC Token Exchange ⭐
idc_oidc_issuer_url = "https://us-east-1.awsapps.com/start/oidc"

# S3 Access Grants
identity_center_arn = "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"
```

## Next Steps

1. **Test S3 operations**: Upload, download, list, delete files
2. **Verify audit trail**: Check CloudTrail for user identity
3. **Create DIRECTORY_USER grants**: Test per-user access controls
4. **Create DIRECTORY_GROUP grants**: Test group-based access controls
5. **Remove Cognito Identity Pool** (optional): Once verified working

## Support Resources

- **Full Documentation**: [IDC_OIDC_TOKEN_EXCHANGE.md](./IDC_OIDC_TOKEN_EXCHANGE.md)
- **Refactoring Summary**: [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)
- **Example Configs**:
  - [terraform.tfvars.example](../infra/terraform.tfvars.example)
  - [.env.example](../frontend/.env.example)

## FAQ

**Q: Do I need to keep Cognito Identity Pool?**
A: No, but it provides automatic fallback if IDC token exchange fails. Safe to remove once verified working.

**Q: Will this break existing deployments?**
A: No, the code has automatic fallback to Cognito Identity Pool if IDC token exchange is not configured.

**Q: Do I need to update the frontend code?**
A: No, the `useS3Access` hook and UI components don't need any changes.

**Q: How do I roll back if there are issues?**
A: Simply remove `IDC_TOKEN_EXCHANGE_ROLE_ARN` from your environment file (`.env.local` for local dev, or `.env` for production). The system will automatically fall back to Cognito Identity Pool.

**Q: What's the performance impact?**
A: Negligible. The STS token exchange is a single API call with similar latency to Cognito Identity Pool.
