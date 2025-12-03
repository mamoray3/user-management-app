# Two-Stage Terraform Deployment Guide

## Overview

The infrastructure has been refactored into two stages to eliminate the circular dependency between CloudFront and Cognito:

### Stage 1: Core Infrastructure (`infra/core/`)
- DynamoDB table
- S3 buckets (static assets, user data)
- Cognito User Pool and Identity Pool (with placeholder callback URLs)
- IAM Identity Center OIDC provider
- IAM roles (Lambda execution, Cognito authenticated/unauthenticated)
- S3 Access Grants

### Stage 2: App Infrastructure (`infra/app/`) - **NOT YET COMPLETE**
- Lambda functions (references core outputs)
- API Gateway
- CloudFront distribution
- S3 bucket policy for CloudFront OAC
- Cognito callback URL updates (via AWS CLI)

## Current Status

✅ **COMPLETED:**
- Core infrastructure files are ready in `infra/core/`
- Core provider, variables, outputs configured
- Resources modified to remove CloudFront dependencies:
  - `cognito.tf`: Uses lifecycle `ignore_changes` for callback URLs
  - `s3.tf`: Removed CloudFront bucket policy (will be added by app stage)
  - `s3_access_grants.tf`: Made Identity Center ARN optional

✅ **IN PROGRESS:**
- App infrastructure skeleton created in `infra/app/`
- Provider configured with terraform_remote_state to reference core
- Variables file created

❌ **NOT YET DONE:**
- Lambda, API Gateway, CloudFront resources need to be moved to `infra/app/`
- Cognito callback URL update script
- State migration from single stage to two stages

## Why This Was Needed

The old single-stage configuration had a circular dependency:

```
CloudFront needs → Lambda (with NEXTAUTH_URL)
       ↓
Lambda needs → CloudFront domain
       ↓
Cognito needs → CloudFront domain (callback URLs)
       ↓
null_resource → Sometimes doesn't trigger
```

This caused:
1. Callback URLs not updating reliably
2. Manual AWS CLI commands needed after every `terraform apply`
3. Errors with special characters in NEXTAUTH_SECRET breaking the null_resource

## Two-Stage Solution

### Stage 1: Core
```
Core Resources (no CloudFront dependencies)
  ↓
Outputs: Cognito IDs, S3 buckets, IAM roles, etc.
  ↓
terraform.tfstate in infra/core/
```

### Stage 2: App
```
Read Core Outputs (terraform_remote_state)
  ↓
Create Lambda with correct env vars (including CloudFront URL)
Create CloudFront distribution
Create API Gateway
  ↓
Update Cognito callback URLs via AWS CLI
  ↓
terraform.tfstate in infra/app/
```

## Next Steps to Complete Implementation

### Option 1: Quick Fix (Recommended for Now)

Since the app stage is not yet complete, you can use the parent `infra/` directory with the fixes already applied:

1. The parent `infra/` directory now has:
   - `cognito.tf` with `lifecycle { ignore_changes = [callback_urls] }` uncommented
   - `cloudfront.tf` with `always_run = timestamp()` trigger

2. Deploy the infrastructure:
   ```bash
   cd /Users/mn/csl/web_apps/user-management-app/infra
   terraform apply
   ```

3. Callback URLs will be updated on every apply, solving the recurring issue.

### Option 2: Complete Two-Stage Refactoring (Future)

To finish the two-stage implementation:

1. **Move app resources to `infra/app/`:**
   ```bash
   # Copy and modify these files from infra/ to infra/app/:
   - lambda.tf (reference core outputs via data.terraform_remote_state.core)
   - api_gateway.tf
   - cloudfront.tf
   - Create cognito_update.tf for callback URL updates
   ```

2. **Migrate existing state:**
   ```bash
   # Import core resources to core state
   cd infra/core
   terraform init
   terraform import [resources...]

   # Import app resources to app state
   cd ../app
   terraform init
   terraform import [resources...]
   ```

3. **Deploy workflow:**
   ```bash
   # Deploy core (rarely changes)
   cd infra/core
   terraform apply

   # Deploy app (references core)
   cd ../app
   terraform apply
   ```

## Files Modified

### Core Infrastructure:
- `infra/core/provider.tf` - Created
- `infra/core/variables.tf` - Created with all necessary variables
- `infra/core/iam.tf` - Created (Lambda execution role)
- `infra/core/common.tf` - Created (data sources, random password)
- `infra/core/outputs.tf` - Created (20+ outputs for app stage)
- `infra/core/cognito.tf` - Copied and modified (placeholder callback URLs)
- `infra/core/s3.tf` - Copied and modified (removed CloudFront policy)
- `infra/core/s3_access_grants.tf` - Copied and modified (optional IDC ARN)
- `infra/core/dynamodb.tf` - Copied
- `infra/core/idc_oidc.tf` - Copied and modified (removed duplicate outputs)
- `infra/core/terraform.tfvars.example` - Created
- `infra/core/terraform.tfvars` - Created with current values

### App Infrastructure (Skeleton):
- `infra/app/provider.tf` - Created with terraform_remote_state
- `infra/app/variables.tf` - Created

### Parent Infra (Quick Fix Applied):
- `infra/cognito.tf` - Uncommented lifecycle block
- `infra/cloudfront.tf` - Added `always_run = timestamp()` trigger

## Recommendation

**Use Option 1 (Quick Fix) for now** since it solves your immediate problem of recurring callback URL issues with minimal risk. The two-stage architecture can be completed later when you have more time for state migration and testing.

The quick fix ensures that:
- Callback URLs are updated on every `terraform apply`
- No manual AWS CLI commands needed
- Works with existing deployed infrastructure
- No risky state migration required immediately
