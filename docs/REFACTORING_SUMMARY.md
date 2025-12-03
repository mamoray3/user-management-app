# Refactoring Summary: IDC OIDC Token Exchange

## What Changed

This refactoring implements the following architecture pattern:

```
Authentication: Cognito User Pool → IDC → Entra ID ✓ (same as before)
AWS Credentials: IDC OIDC Token Exchange ✓ (NEW - preserves IDC identity)
S3 Access: GetDataAccess with IDC creds ✓ (DIRECTORY_USER grants work!)
```

## Files Modified

### Infrastructure (Terraform)

1. **NEW: [infra/idc_oidc.tf](../infra/idc_oidc.tf)**
   - Creates IAM OIDC provider for AWS Identity Center
   - Creates IAM role for token exchange
   - Grants S3 Access Grants permissions

2. **MODIFIED: [infra/cognito.tf](../infra/cognito.tf)**
   - Added custom attribute `idc_access_token` to capture IDC token
   - Updated SAML attribute mapping to include `accessToken`
   - Updated User Pool Client read/write attributes

3. **MODIFIED: [infra/variables.tf](../infra/variables.tf)**
   - Added `idc_oidc_issuer_url` variable
   - Added `idc_oidc_client_id` variable
   - Added `idc_oidc_thumbprint` variable

4. **MODIFIED: [infra/outputs.tf](../infra/outputs.tf)**
   - Added `idc_token_exchange_role_arn` output
   - Added `idc_oidc_provider_arn` output

5. **MODIFIED: [infra/terraform.tfvars.example](../infra/terraform.tfvars.example)**
   - Added IDC OIDC configuration section with examples

### Application Code

6. **MODIFIED: [frontend/src/app/api/auth/[...nextauth]/route.js](../frontend/src/app/api/auth/[...nextauth]/route.js)**
   - Captures `idc_access_token` from Cognito ID token
   - Stores IDC token in NextAuth session
   - Makes IDC token available to API routes

7. **MODIFIED: [frontend/src/app/api/s3/credentials/route.js](../frontend/src/app/api/s3/credentials/route.js)**
   - Added `getCredentialsViaIdcToken()` function for token exchange
   - Refactored GET handler to try IDC token exchange first
   - Refactored POST handler (GetDataAccess) to use IDC credentials
   - Maintains Cognito Identity Pool as fallback
   - Added detailed logging for debugging

8. **MODIFIED: [frontend/.env.example](../frontend/.env.example)**
   - Added `IDC_TOKEN_EXCHANGE_ROLE_ARN` variable
   - Reorganized to show primary vs. fallback methods
   - Added helpful comments

### Documentation

9. **NEW: [docs/IDC_OIDC_TOKEN_EXCHANGE.md](./IDC_OIDC_TOKEN_EXCHANGE.md)**
   - Comprehensive architecture documentation
   - Setup and configuration instructions
   - Troubleshooting guide
   - Flow diagrams and examples

10. **NEW: [docs/REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)**
    - This file - summary of all changes

## No Changes Required

The following components **DO NOT** require changes:

- ✓ [frontend/src/hooks/useS3Access.js](../frontend/src/hooks/useS3Access.js) - API contract unchanged
- ✓ [frontend/src/components/FileBrowser.jsx](../frontend/src/components/FileBrowser.jsx) - No changes needed
- ✓ [frontend/src/app/files/page.jsx](../frontend/src/app/files/) - No changes needed
- ✓ User-facing UI components - No changes needed

## Key Features

### 1. Dual-Mode Operation

The code supports **both** credential methods simultaneously:

- **Primary**: IDC OIDC Token Exchange (when configured)
- **Fallback**: Cognito Identity Pool (legacy)

This enables zero-downtime migration.

### 2. Automatic Fallback

If IDC token exchange fails or is not configured, the system automatically falls back to Cognito Identity Pool:

```javascript
// Try IDC OIDC Token Exchange first
if (session.idcAccessToken && IDC_TOKEN_EXCHANGE_ROLE_ARN) {
  credentials = await getCredentialsViaIdcToken(...);
}

// Fallback to Cognito Identity Pool
if (!credentials && session.idToken) {
  credentials = await getCredentialsViaCognitoIdentityPool(...);
}
```

### 3. Observability

API responses include `method` field showing which credential method was used:

```json
{
  "method": "idc-oidc",  // or "cognito-identity-pool"
  "credentials": { ... }
}
```

Server logs show:
- `✓ Using IDC OIDC Token Exchange for AWS credentials` (success)
- `⚠ Using Cognito Identity Pool (legacy) for AWS credentials` (fallback)

## Migration Path

### Step 1: Deploy Infrastructure

```bash
cd infra
terraform plan
terraform apply
```

This creates:
- IAM OIDC provider for IDC
- IAM role for token exchange
- Updated Cognito custom attributes

### Step 2: Configure IDC Application

In AWS Identity Center console, add SAML attribute mapping:

```
accessToken → ${session:access_token}
```

### Step 3: Update Environment Variables

```bash
cd frontend

# Get role ARN from Terraform
terraform output -raw idc_token_exchange_role_arn

# Add to .env
echo "IDC_TOKEN_EXCHANGE_ROLE_ARN=<arn-from-above>" >> .env
```

### Step 4: Deploy Application

```bash
npm run build
# Deploy using your standard process
```

### Step 5: Verify

1. Sign in to the application
2. Check logs for `✓ Using IDC OIDC Token Exchange`
3. Test S3 file operations
4. Verify DIRECTORY_USER grants work

### Step 6: Optional - Remove Cognito Identity Pool

Once verified working, you can optionally remove the Cognito Identity Pool fallback:

1. Remove from `.env`:
   - `COGNITO_IDENTITY_POOL_ID`
   - `COGNITO_USER_POOL_ID`

2. Optionally remove from Terraform (but keep for backward compatibility if desired)

## Rollback Plan

If issues occur, rollback is simple:

1. **Keep infrastructure** - IAM OIDC provider doesn't interfere with existing flow
2. **Remove environment variable** - Delete `IDC_TOKEN_EXCHANGE_ROLE_ARN` from `.env`
3. **System automatically falls back** to Cognito Identity Pool

## Testing Checklist

- [ ] User can sign in successfully
- [ ] `/api/s3/credentials` returns credentials
- [ ] Response shows `"method": "idc-oidc"`
- [ ] S3 file listing works
- [ ] S3 file upload works
- [ ] S3 file download works
- [ ] S3 file delete works
- [ ] S3 Access Grants DIRECTORY_USER grants work
- [ ] Logs show `✓ Using IDC OIDC Token Exchange`

## Environment Variable Reference

### Required for IDC Token Exchange

```bash
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::123456789012:role/user-management-prod-idc-token-exchange
```

### Still Required (for S3 operations)

```bash
S3_USER_DATA_BUCKET=user-management-prod-user-data-xxxxxxxx
S3_ACCESS_GRANTS_INSTANCE_ARN=arn:aws:s3:us-east-1:123456789012:access-grants/default
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1
```

### Optional (for Cognito fallback)

```bash
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
```

## Benefits

1. **DIRECTORY_USER grants work** ✓
   - S3 Access Grants can match against IDC User IDs
   - Per-user folder access controls work correctly

2. **DIRECTORY_GROUP grants work** ✓
   - S3 Access Grants can match against IDC Group IDs
   - Group-based access controls work correctly

3. **Better audit trail** ✓
   - CloudTrail shows actual IDC user, not generic Cognito identity
   - Better compliance and security posture

4. **Simplified architecture** ✓
   - Direct STS token exchange vs. multi-step Cognito flow
   - Fewer moving parts

5. **Backward compatible** ✓
   - Existing code continues to work
   - Graceful fallback to Cognito Identity Pool
   - Zero-downtime migration

## Support

For detailed documentation, see:
- [IDC_OIDC_TOKEN_EXCHANGE.md](./IDC_OIDC_TOKEN_EXCHANGE.md) - Complete architecture guide
- [Troubleshooting section](./IDC_OIDC_TOKEN_EXCHANGE.md#troubleshooting) - Common issues and solutions

For infrastructure setup:
- [terraform.tfvars.example](../infra/terraform.tfvars.example) - Configuration examples
- [.env.example](../frontend/.env.example) - Environment variable examples
