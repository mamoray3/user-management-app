# Environment Variables Guide

## Overview

This application uses different environment variable sources depending on where it's running:

```
┌─────────────────────────────────────────────────────────────┐
│ Local Development → .env.local                             │
│ AWS Deployment → Terraform (Lambda environment variables)  │
└─────────────────────────────────────────────────────────────┘
```

## Local Development

### File: `.env.local`

For local development with `npm run dev`:

```bash
# Create .env.local (gitignored)
cp .env.example .env.local

# Edit with your actual values
```

**Environment Files Priority** (Next.js):
1. `.env.local` - Highest priority, used for local dev (gitignored)
2. `.env.development` - Development-specific
3. `.env.production` - Production-specific
4. `.env` - Base file for all environments

## AWS Deployment

### Source: Terraform Configuration

When deployed to AWS Lambda (via CloudFront), environment variables come from **Terraform**, not from `.env` files.

**File**: Configured in Terraform infrastructure (`infra/core/` or deployment scripts)

```hcl
resource "aws_lambda_function" "server" {
  # ...

  environment {
    variables = {
      # NextAuth
      NEXTAUTH_URL    = "https://your-domain.com"
      NEXTAUTH_SECRET = local.nextauth_secret

      # Cognito
      COGNITO_CLIENT_ID     = aws_cognito_user_pool_client.web_app.id
      COGNITO_CLIENT_SECRET = aws_cognito_user_pool_client.web_app.client_secret
      COGNITO_ISSUER        = "https://cognito-idp.us-east-1.amazonaws.com/..."

      # IDC OIDC Token Exchange ⭐ NEW
      IDC_TOKEN_EXCHANGE_ROLE_ARN = aws_iam_role.idc_token_exchange.arn

      # Cognito Identity Pool (Legacy Fallback)
      COGNITO_IDENTITY_POOL_ID = aws_cognito_identity_pool.main.id

      # S3 Access Grants
      S3_USER_DATA_BUCKET           = aws_s3_bucket.user_data.bucket
      S3_ACCESS_GRANTS_INSTANCE_ARN = "arn:aws:s3:..."
      AWS_ACCOUNT_ID                = "123456789012"
    }
  }
}
```

### How It Works

1. **Terraform Apply** → Creates/updates Lambda function with environment variables
2. **Lambda Runtime** → Reads `process.env.IDC_TOKEN_EXCHANGE_ROLE_ARN`
3. **Your Code** → Uses the value automatically

### Values Are Auto-Populated

Most values are **automatically populated** by Terraform from other resources:

| Variable | Source | Example |
|----------|--------|---------|
| `IDC_TOKEN_EXCHANGE_ROLE_ARN` | `aws_iam_role.idc_token_exchange.arn` | Auto-generated ARN |
| `COGNITO_USER_POOL_ID` | `aws_cognito_user_pool.main.id` | Auto-generated ID |
| `S3_USER_DATA_BUCKET` | `aws_s3_bucket.user_data.bucket` | Auto-generated name |
| `NEXTAUTH_SECRET` | `local.nextauth_secret` | From terraform.tfvars or auto-generated |

**You only need to set** in `terraform.tfvars`:
- `idc_oidc_issuer_url` - Your IDC OIDC issuer URL
- `identity_center_arn` - Your Identity Center instance ARN
- `domain_name` - Your custom domain (optional)

Everything else is derived automatically!

## Complete Environment Variable Reference

### Required for IDC OIDC Token Exchange

#### Local Development (`.env.local`)
```bash
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::123456789012:role/user-management-dev-idc-token-exchange
```

#### AWS Deployment (Terraform)
```hcl
# Automatically set from Terraform outputs:
IDC_TOKEN_EXCHANGE_ROLE_ARN = aws_iam_role.idc_token_exchange.arn
```

### Optional (Fallback)

#### Local Development (`.env.local`)
```bash
COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
```

#### AWS Deployment (Terraform)
```hcl
# Automatically set from resources
COGNITO_IDENTITY_POOL_ID = aws_cognito_identity_pool.main.id
COGNITO_USER_POOL_ID     = aws_cognito_user_pool.main.id
```

## Deployment Workflow

### Step 1: Update Terraform Configuration

```bash
cd infra/core

# Edit terraform.tfvars
vim terraform.tfvars

# Add:
# idc_oidc_issuer_url = "https://us-east-1.awsapps.com/start/oidc"
# identity_center_arn = "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"
# idc_saml_metadata_url = "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/XXXXX"
```

### Step 2: Apply Infrastructure

```bash
terraform plan
terraform apply
```

**What happens:**
1. Creates IAM OIDC provider for IDC
2. Creates IAM role for token exchange
3. Updates Lambda function with `IDC_TOKEN_EXCHANGE_ROLE_ARN` environment variable
4. All other variables are automatically populated

### Step 3: Deploy Application Code

```bash
cd ../frontend
npm run build

# Deploy to Lambda (method depends on your CI/CD setup)
```

The deployed Lambda function **automatically has** all environment variables set by Terraform.

## Verifying Environment Variables

### In AWS Console

1. Go to **Lambda** → Your function (e.g., `user-management-dev-server`)
2. Click **Configuration** → **Environment variables**
3. Verify `IDC_TOKEN_EXCHANGE_ROLE_ARN` is present

### Via AWS CLI

```bash
aws lambda get-function-configuration \
  --function-name user-management-dev-server \
  --query 'Environment.Variables' \
  --output json
```

Should show:
```json
{
  "IDC_TOKEN_EXCHANGE_ROLE_ARN": "arn:aws:iam::123456789012:role/user-management-dev-idc-token-exchange",
  "COGNITO_USER_POOL_ID": "us-east-1_XXXXXXXXX",
  "S3_USER_DATA_BUCKET": "user-management-dev-user-data-abc12345",
  ...
}
```

## Troubleshooting

### Issue: Variable not set in Lambda

**Symptom**: API returns `"method": "cognito-identity-pool"` even after Terraform apply

**Solution**:
1. Check if Terraform actually updated the Lambda:
   ```bash
   terraform plan  # Should show no changes if already applied
   ```

2. Verify Lambda environment variables in AWS Console

3. If variable is missing, re-apply Terraform:
   ```bash
   terraform apply -auto-approve
   ```

### Issue: Different values locally vs. AWS

**Local uses**: `.env.local`
**AWS uses**: Terraform-managed Lambda environment variables

These are **intentionally separate** to allow:
- Testing locally with dev resources
- Deploying to AWS with production resources

### Issue: Need to update a variable after deployment

**For Terraform-managed variables**:
1. Update `infra/core/terraform.tfvars`
2. Run `terraform apply` in `infra/core/`
3. Lambda is automatically updated

**For manual override** (not recommended):
```bash
aws lambda update-function-configuration \
  --function-name user-management-dev-server \
  --environment "Variables={IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::...,...}"
```

Note: Manual changes will be overwritten on next `terraform apply`!

## Best Practices

1. **Never commit `.env.local`** - Contains secrets, should be gitignored
2. **Use Terraform for AWS** - All production variables managed by Terraform
3. **Keep `.env.example` updated** - Documents all required variables
4. **Separate dev/prod** - Use different `terraform.tfvars` per environment
5. **Verify after deploy** - Check Lambda environment variables in AWS Console

## Summary

| Environment | Variable Source | How to Update |
|-------------|----------------|---------------|
| **Local Dev** | `.env.local` | Edit file, restart `npm run dev` |
| **AWS Lambda** | Terraform (`infra/core/`) | Update `infra/core/terraform.tfvars`, run `terraform apply` |

The `IDC_TOKEN_EXCHANGE_ROLE_ARN` is now **automatically managed** by Terraform in AWS deployments - you don't need to manually set it anywhere except in `.env.local` for local development!
