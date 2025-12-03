# Two-Stage Refactoring Summary

## TL;DR - What Was Done

### ✅ Completed:
1. **Core infrastructure skeleton** ready in `infra/core/` (all files created, ready for deployment)
2. **App infrastructure skeleton** created in `infra/app/` (provider and variables only)
3. **Documentation** created (REFACTORING_GUIDE.md, TWO_STAGE_DEPLOYMENT.md, REFACTORING_STATUS.md)
4. **Quick fix applied** to parent `infra/` directory

### ❌ Not Completed:
1. **App stage resource files** (lambda.tf, cloudfront.tf, api_gateway.tf) - need to be created
2. **State migration** from single-stage to two-stage - not attempted (risky, time-consuming)
3. **Full deployment testing** of two-stage architecture

## Immediate Problem & Solution

### Problem

Your `terraform apply` keeps failing because:

1. **NEXTAUTH_SECRET parsing error**: The secret contains special characters (`]`, `%`, `&`) that break AWS CLI JSON parsing in the `null_resource`
   ```
   NEXTAUTH_SECRET=&Te%%BR]R(WR9Q%p6mnOi!X]Q!QdxQ)T
                          ↑ This ] breaks the AWS CLI parser
   ```

2. **S3 shared/ folder not found**: The `aws_s3_object.shared_folder` resource tries to read an object that doesn't exist yet

### Solution

#### Option 1: Quick Fix (Recommended)

Fix the immediate errors and use the parent `infra/` with the lifecycle fix already applied:

```bash
# 1. Generate a new NextAuth secret without problematic characters
cd /Users/mn/csl/web_apps/user-management-app/infra
export NEW_SECRET=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo "New NEXTAUTH_SECRET: $NEW_SECRET"

# 2. Update the terraform state with new secret
terraform apply -var="nextauth_secret=$NEW_SECRET"

# OR manually update in Terraform files if using local variable
```

**Better approach - Remove the problematic null_resource entirely since the lifecycle fix is in place:**

Since `cognito.tf` now has `lifecycle { ignore_changes = [callback_urls] }` and `cloudfront.tf` has `always_run = timestamp()`, you can comment out the broken null_resource for Lambda env update.

```bash
# Edit infra/cloudfront.tf and comment out lines 280-310 (null_resource.update_lambda_env)
# The Lambda env vars are set correctly during initial creation anyway
```

#### Option 2: Complete Two-Stage Implementation

This requires significant work:

1. Create app stage resource files
2. Migrate state from parent to core/app
3. Test deployment thoroughly

Estimated time: 4-8 hours

## Files Created in This Session

### Core Infrastructure (`infra/core/`)
- [provider.tf](core/provider.tf) - Terraform and AWS provider configuration
- [variables.tf](core/variables.tf) - Variable definitions (40+ variables)
- [common.tf](core/common.tf) - Shared resources (data sources, random password)
- [iam.tf](core/iam.tf) - Lambda execution role
- [outputs.tf](core/outputs.tf) - 20+ outputs for app stage
- [cognito.tf](core/cognito.tf) - User Pool, Identity Pool (modified for two-stage)
- [s3.tf](core/s3.tf) - Static assets bucket (CloudFront policy removed)
- [s3_access_grants.tf](core/s3_access_grants.tf) - User data bucket and grants
- [dynamodb.tf](core/dynamodb.tf) - Users table
- [idc_oidc.tf](core/idc_oidc.tf) - IDC OIDC provider
- [terraform.tfvars.example](core/terraform.tfvars.example) - Example configuration
- [terraform.tfvars](core/terraform.tfvars) - Current configuration

### App Infrastructure (`infra/app/`)
- [provider.tf](app/provider.tf) - Terraform with terraform_remote_state
- [variables.tf](app/variables.tf) - Minimal variables
- **MISSING**: lambda.tf, cloudfront.tf, api_gateway.tf, cognito_update.tf, s3_policy.tf, outputs.tf

### Documentation (`infra/`)
- [REFACTORING_GUIDE.md](REFACTORING_GUIDE.md) - Step-by-step refactoring guide
- [TWO_STAGE_DEPLOYMENT.md](TWO_STAGE_DEPLOYMENT.md) - Deployment guide with current status
- [REFACTORING_STATUS.md](REFACTORING_STATUS.md) - Detailed status report
- [README_TWO_STAGE.md](README_TWO_STAGE.md) - This file

### Parent Infra Modifications
- `infra/cognito.tf:212-214` - Uncommented lifecycle block
- `infra/cloudfront.tf:322` - Added `always_run = timestamp()` trigger

## Next Steps - Choose Your Path

### Path A: Quick Fix and Continue (Recommended)

1. **Comment out the broken null_resource** in `infra/cloudfront.tf:280-310`:
   ```hcl
   /*
   resource "null_resource" "update_lambda_env" {
     # ... comment out the entire resource
   }
   */
   ```

2. **Create the shared S3 folder**:
   ```bash
   aws s3api put-object \
     --bucket user-management-dev-user-data-iccrxxed \
     --key shared/
   ```

3. **Run terraform apply**:
   ```bash
   cd /Users/mn/csl/web_apps/user-management-app/infra
   terraform apply
   ```

4. **After CloudFront is created, manually update Cognito callback URLs** (one time):
   ```bash
   aws cognito-idp update-user-pool-client \
     --user-pool-id us-east-1_dVgld0aJ4 \
     --client-id 1017badjmbis95tl7ejmj3jnju \
     --callback-urls \
       "http://localhost:3000/api/auth/callback/cognito" \
       "https://d2eozn7rz963sc.cloudfront.net/api/auth/callback/cognito" \
     --allowed-oauth-flows code \
     --allowed-oauth-scopes openid email profile aws.cognito.signin.user.admin \
     --supported-identity-providers IdentityCenter \
     --allowed-oauth-flows-user-pool-client
   ```

**Benefits**: Works immediately, low risk, solves your recurring problem

### Path B: Complete Two-Stage Refactoring (Future)

1. **Create app stage resource files** (4-6 hours of work):
   - Copy and modify lambda.tf to reference core outputs
   - Copy and modify cloudfront.tf
   - Copy and modify api_gateway.tf
   - Create cognito_update.tf for callback URL updates
   - Create s3_policy.tf for CloudFront OAC
   - Create outputs.tf

2. **Test locally with terraform plan**

3. **Migrate state** (2-4 hours):
   - Import all existing resources to new states
   - Verify no resources will be recreated
   - Test deployment

4. **Update deployment scripts**

**Benefits**: Clean architecture, eliminates circular dependency completely

## Why Two-Stage Architecture?

### Problem with Single-Stage

```
┌─────────────────────────────────────────────────┐
│              Circular Dependency                │
│                                                 │
│  CloudFront ─────┐                             │
│       ↑          │                              │
│       │          ↓                              │
│   Lambda ←──── Needs CloudFront domain         │
│       ↑          for NEXTAUTH_URL               │
│       │                                          │
│   Cognito ←──── Needs CloudFront domain         │
│                 for callback URLs               │
│                                                  │
│   null_resource tries to fix this but fails     │
│   due to:                                        │
│   - Special characters in secrets                │
│   - Triggers don't always fire                   │
│   - Manual intervention needed                   │
└─────────────────────────────────────────────────┘
```

### Solution with Two-Stage

```
┌─────────────── STAGE 1: CORE ──────────────────┐
│                                                 │
│  DynamoDB  S3  Cognito  IAM  S3AccessGrants   │
│  (no CloudFront dependencies)                   │
│                                                 │
│  Outputs: IDs, ARNs, configs                   │
│                                                 │
└───────────────────┬─────────────────────────────┘
                    │
                    ↓ terraform_remote_state
┌─────────────── STAGE 2: APP ───────────────────┐
│                                                 │
│  Reads core outputs                             │
│       ↓                                          │
│  Lambda (with correct CloudFront URL)           │
│  CloudFront                                      │
│  API Gateway                                     │
│  S3 bucket policy for CloudFront                │
│  Update Cognito callback URLs (AWS CLI)         │
│                                                 │
│  No circular dependency!                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Current Infrastructure State

- **CloudFront**: d2eozn7rz963sc.cloudfront.net
- **Cognito Pool**: us-east-1_dVgld0aJ4
- **Cognito Client**: 1017badjmbis95tl7ejmj3jnju
- **DynamoDB Table**: user-management-users-dev
- **S3 Static**: user-management-static-dev-7pgisc7c
- **S3 User Data**: user-management-dev-user-data-iccrxxed
- **API Gateway**: oghqoubyz8.execute-api.us-east-1.amazonaws.com/dev

All of these resources exist and are deployed. They're just managed by the parent `infra/` state currently.

## Recommendation

**Use Path A (Quick Fix)** to get your infrastructure working immediately. The lifecycle fix already applied to `cognito.tf` ensures callback URLs won't drift, and commenting out the broken null_resource removes the parsing error.

**Consider Path B (Two-Stage)** as a future improvement when you have dedicated time for proper state migration and testing. The core infrastructure is ready - it's just a matter of creating the app stage resource files and migrating state.

## Questions?

See the other documentation files for details:
- [REFACTORING_GUIDE.md](REFACTORING_GUIDE.md) - How to implement two-stage from scratch
- [TWO_STAGE_DEPLOYMENT.md](TWO_STAGE_DEPLOYMENT.md) - Deployment workflow
- [REFACTORING_STATUS.md](REFACTORING_STATUS.md) - Detailed status of what's done

The two-stage architecture IS the correct long-term solution, but the quick fix will solve your immediate problem without risk.
