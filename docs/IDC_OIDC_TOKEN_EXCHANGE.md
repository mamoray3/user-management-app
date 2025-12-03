# IDC OIDC Token Exchange Architecture

## Overview

This application uses **AWS Identity Center (IDC) OIDC Token Exchange** to obtain AWS credentials that preserve the user's IDC identity through to S3 Access Grants. This enables **DIRECTORY_USER** grants to work correctly.

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│ Authentication: Cognito User Pool → IDC → Entra ID ✓           │
│ AWS Credentials: IDC OIDC Token Exchange ✓                     │
│ S3 Access: GetDataAccess with IDC creds ✓                      │
└─────────────────────────────────────────────────────────────────┘
```

### Flow Details

1. **Authentication** (Same as before)
   - User signs in via Cognito User Pool
   - Cognito federates to IDC via SAML
   - IDC authenticates against Entra ID
   - User receives Cognito OIDC tokens + IDC access token (via SAML attribute mapping)

2. **AWS Credentials** (NEW: IDC OIDC Token Exchange)
   - Frontend calls `/api/s3/credentials`
   - Backend extracts IDC access token from session
   - Backend calls STS `AssumeRoleWithWebIdentity` with IDC token
   - Receives temporary AWS credentials **with IDC identity preserved**

3. **S3 Access** (Enhanced)
   - Uses AWS credentials from step 2
   - Calls S3 Access Grants `GetDataAccess`
   - S3 Access Grants recognizes IDC identity
   - **DIRECTORY_USER grants work!** ✓

## Key Components

### Infrastructure (Terraform)

#### 1. IDC OIDC Provider ([infra/idc_oidc.tf](../infra/idc_oidc.tf))

```hcl
# Creates IAM OIDC provider for IDC
resource "aws_iam_openid_connect_provider" "idc" {
  url = var.idc_oidc_issuer_url
  client_id_list = [var.idc_oidc_client_id]
}

# IAM role that can be assumed with IDC OIDC tokens
resource "aws_iam_role" "idc_token_exchange" {
  assume_role_policy = {
    Principal = { Federated = aws_iam_openid_connect_provider.idc.arn }
    Action = "sts:AssumeRoleWithWebIdentity"
  }
}
```

#### 2. Cognito Custom Attributes ([infra/cognito.tf](../infra/cognito.tf))

```hcl
# Custom attribute to capture IDC access token
schema {
  name = "idc_access_token"
  attribute_data_type = "String"
  max_length = 2048
}

# SAML attribute mapping
attribute_mapping = {
  "custom:idc_access_token" = "accessToken"
  "custom:idc_user_id" = "Subject"
}
```

### Application Code

#### 1. NextAuth Session ([frontend/src/app/api/auth/[...nextauth]/route.js](../frontend/src/app/api/auth/[...nextauth]/route.js))

Captures and stores the IDC access token in the session:

```javascript
async jwt({ token, user, account }) {
  if (user) {
    token.idcAccessToken = user.idcAccessToken; // IDC token
    token.idcUserId = user.idcUserId;
  }
}

async session({ session, token }) {
  session.idcAccessToken = token.idcAccessToken; // Available to API routes
}
```

#### 2. S3 Credentials API ([frontend/src/app/api/s3/credentials/route.js](../frontend/src/app/api/s3/credentials/route.js))

Implements IDC OIDC token exchange with Cognito fallback:

```javascript
// Primary method: IDC OIDC Token Exchange
async function getCredentialsViaIdcToken(idcAccessToken, idcUserId) {
  const stsClient = new STSClient({ region: REGION });

  const response = await stsClient.send(new AssumeRoleWithWebIdentityCommand({
    RoleArn: IDC_TOKEN_EXCHANGE_ROLE_ARN,
    RoleSessionName: `idc-user-${idcUserId}`,
    WebIdentityToken: idcAccessToken,
    DurationSeconds: 3600,
  }));

  return response.Credentials;
}

// Fallback: Cognito Identity Pool (legacy)
async function getCredentialsViaCognitoIdentityPool(idToken) {
  // ... Cognito Identity Pool flow
}
```

## Configuration

### Required Environment Variables

#### Frontend ([frontend/.env](../frontend/.env))

```bash
# Primary method - IDC OIDC Token Exchange
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::123456789012:role/your-project-env-idc-token-exchange

# Optional: Cognito Identity Pool (fallback)
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX

# S3 Access Grants
S3_USER_DATA_BUCKET=your-user-data-bucket-name
S3_ACCESS_GRANTS_INSTANCE_ARN=arn:aws:s3:us-east-1:123456789012:access-grants/default
AWS_ACCOUNT_ID=123456789012
AWS_REGION=us-east-1
```

#### Terraform ([infra/terraform.tfvars](../infra/terraform.tfvars))

```hcl
# IDC OIDC configuration
idc_oidc_issuer_url = "https://us-east-1.awsapps.com/start/oidc"
idc_oidc_client_id  = ""  # Optional, defaults to issuer URL
idc_oidc_thumbprint = ""  # Optional, for AWS-managed certs

# Identity Center ARN for S3 Access Grants
identity_center_arn = "arn:aws:sso:::instance/ssoins-xxxxxxxxxx"
```

## Setup Instructions

### 1. Configure IDC Application

In AWS Identity Center console:

1. Go to **Applications** → Select your application
2. Click **Edit attribute mappings**
3. Add these attribute mappings:

   | User attribute in application | Maps to this string value or AWS SSO attribute | Format |
   |-------------------------------|-----------------------------------------------|--------|
   | `Subject` | `${user:subject}` | persistent |
   | `email` | `${user:email}` | unspecified |
   | `firstName` | `${user:givenName}` | unspecified |
   | `lastName` | `${user:familyName}` | unspecified |
   | `accessToken` | `${session:access_token}` | unspecified |

4. Save changes

### 2. Update Terraform Configuration

```bash
cd infra

# Update terraform.tfvars with IDC OIDC settings
cat >> terraform.tfvars <<EOF
idc_oidc_issuer_url = "https://YOUR_REGION.awsapps.com/start/oidc"
identity_center_arn = "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"
EOF

# Apply infrastructure changes
terraform plan
terraform apply
```

### 3. Update Frontend Environment Variables

```bash
cd frontend

# Get the role ARN from Terraform output
terraform output -raw idc_token_exchange_role_arn

# Add to .env
echo "IDC_TOKEN_EXCHANGE_ROLE_ARN=<output-from-above>" >> .env
```

### 4. Deploy Application

```bash
npm run build
# Deploy via your deployment method
```

## How It Works

### Credential Flow Comparison

#### OLD: Cognito Identity Pool
```
User Token → Cognito Identity Pool → Generic AWS Credentials
                                    ↓
                         S3 Access Grants sees: IAM role ARN
                         DIRECTORY_USER grants: ❌ Don't work
```

#### NEW: IDC OIDC Token Exchange
```
IDC Token → STS AssumeRoleWithWebIdentity → AWS Credentials with IDC Context
                                           ↓
                            S3 Access Grants sees: IDC User ID
                            DIRECTORY_USER grants: ✓ Work!
```

### S3 Access Grants Integration

With IDC credentials, S3 Access Grants can now match against:

1. **DIRECTORY_USER** grants
   ```hcl
   grantee {
     grantee_type       = "DIRECTORY_USER"
     grantee_identifier = "3448e4c8-70b1-7069-c7f1-e42f103a6ab5"  # IDC User ID
   }
   ```

2. **DIRECTORY_GROUP** grants
   ```hcl
   grantee {
     grantee_type       = "DIRECTORY_GROUP"
     grantee_identifier = "admin-group-id"  # IDC Group ID
   }
   ```

3. **IAM** grants (still work as fallback)
   ```hcl
   grantee {
     grantee_type       = "IAM"
     grantee_identifier = aws_iam_role.idc_token_exchange.arn
   }
   ```

## Verification

### Test the Flow

1. **Sign in** to the application
2. **Check browser console** or network tab for API calls to `/api/s3/credentials`
3. **Verify response** contains:
   ```json
   {
     "method": "idc-oidc",  // ✓ Using IDC token exchange
     "credentials": { ... },
     "idcUserId": "3448e4c8-70b1-7069-c7f1-e42f103a6ab5"
   }
   ```

4. **Check server logs** for:
   ```
   ✓ Using IDC OIDC Token Exchange for AWS credentials
   ```

### Fallback Behavior

If IDC token is not available, the system automatically falls back to Cognito Identity Pool:

```
⚠ Using Cognito Identity Pool (legacy) for AWS credentials
```

Response will show:
```json
{
  "method": "cognito-identity-pool",
  "credentials": { ... },
  "identityId": "us-east-1:..."
}
```

## Troubleshooting

### IDC Token Not Captured

**Symptom**: Logs show "Using Cognito Identity Pool (legacy)"

**Solution**:
1. Verify IDC application attribute mapping includes `accessToken → ${session:access_token}`
2. Check Cognito custom attribute `idc_access_token` is mapped to SAML attribute `accessToken`
3. Verify Cognito User Pool Client has `custom:idc_access_token` in read attributes

### AssumeRoleWithWebIdentity Fails

**Symptom**: Error "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Solution**:
1. Verify `IDC_TOKEN_EXCHANGE_ROLE_ARN` environment variable is set correctly
2. Check IAM role trust policy allows the IDC OIDC provider
3. Verify IDC OIDC provider is created in IAM

### S3 Access Grants Still Don't Work

**Symptom**: Access denied even with DIRECTORY_USER grant

**Solution**:
1. Verify S3 Access Grants instance is linked to Identity Center (`identity_center_arn`)
2. Check grant's `grantee_identifier` matches the user's IDC User ID exactly
3. Verify grant's `s3_sub_prefix` includes the path being accessed
4. Check logs confirm method is `idc-oidc` not `cognito-identity-pool`

## Migration Notes

### From Cognito Identity Pool to IDC OIDC

The refactored code supports **both methods simultaneously** for zero-downtime migration:

1. **Phase 1**: Deploy with both methods enabled
   - IDC token exchange attempts first
   - Falls back to Cognito Identity Pool if needed

2. **Phase 2**: Monitor logs to ensure IDC method is working
   - Look for "✓ Using IDC OIDC Token Exchange"

3. **Phase 3**: Remove Cognito Identity Pool (optional)
   - Remove `COGNITO_IDENTITY_POOL_ID` and `COGNITO_USER_POOL_ID` env vars
   - System will only use IDC token exchange

### Backward Compatibility

- Existing S3 Access Grants with IAM grantee type continue to work
- Frontend `useS3Access` hook requires no changes
- API endpoints remain the same

## Benefits of This Architecture

1. **✓ DIRECTORY_USER grants work** - IDC identity preserved
2. **✓ DIRECTORY_GROUP grants work** - Group membership from IDC
3. **✓ Simplified credential flow** - Direct token exchange vs. multi-step Cognito flow
4. **✓ Better security** - Credentials tied to actual IDC identity
5. **✓ Audit trail** - CloudTrail shows actual IDC user, not generic Cognito identity
6. **✓ Graceful fallback** - Cognito Identity Pool still available if needed

## References

- [AWS STS AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)
- [S3 Access Grants Directory Integration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-grants-instance.html)
- [AWS Identity Center OIDC](https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/Welcome.html)
