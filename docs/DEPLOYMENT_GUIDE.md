# Deployment Guide

## Overview

This application has **two separate components** that deploy independently:

1. **Backend API** (Python Lambda functions) - Deployed via Terraform
2. **Frontend** (Next.js SSR Lambda) - Deployed via deployment scripts

## Deployment Architecture

```
User → CloudFront (CDN) → Lambda (Next.js SSR) → S3 (Static Assets)
                                ↓
                         API Gateway → Lambda (Backend API)
                                ↓
                         Cognito, DynamoDB, S3 Access Grants
```

**Components:**
- **Frontend Server Lambda**: Next.js SSR (`user-management-server-{env}`)
- **Backend API Lambda**: Python API handlers (`user-management-api-{env}`)
- **Backend Authorizer Lambda**: JWT authorizer (`user-management-authorizer-{env}`)

## Quick Deployment (After Infrastructure is Set Up)

If your infrastructure is already deployed via Terraform:

### Update Frontend Only

```bash
cd frontend

# Step 1: Build the frontend
./scripts/build.sh

# Step 2: Deploy frontend to AWS
./scripts/deploy.sh
```

### Update Backend API Only

```bash
cd backend

# Step 1: Build the backend Lambda package
./build.sh

# Step 2: Deploy via Terraform
cd ../infra
terraform apply
```

### Update Both

```bash
# Build backend
cd backend
./build.sh

# Build frontend
cd ../frontend
./scripts/build.sh

# Deploy both via Terraform and frontend scripts
cd ../infra
terraform apply    # Updates backend APIs

cd ../frontend
./scripts/deploy.sh  # Updates frontend server
```

## First-Time Deployment (Complete Setup)

### Prerequisites

- ✅ AWS CLI configured with appropriate credentials
- ✅ Terraform installed
- ✅ Node.js 20+ installed
- ✅ IDC SAML configured (Step 2 from Quick Start guide)

### Step 1: Configure Terraform

```bash
cd infra

# Copy example configuration
cp terraform.tfvars.example terraform.tfvars

# Edit with your actual values
vim terraform.tfvars
```

**Minimum required values:**
```hcl
aws_region   = "us-east-1"
environment  = "dev"
project_name = "user-management"

# IDC Configuration
idc_saml_metadata_url = "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/YOUR_APP_ID"
idc_oidc_issuer_url   = "https://us-east-1.awsapps.com/start/oidc"
identity_center_arn   = "arn:aws:sso:::instance/ssoins-XXXXXXXXXX"

# Optional: Custom domain
# domain_name = "usermanagement.example.com"
# acm_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERT_ID"
```

### Step 2: Build Backend

```bash
cd ../backend

# Install Python dependencies and create Lambda package
./build.sh
```

**What this does:**
- Installs Python dependencies from `requirements.txt`
- Packages handler code
- Creates `lambda_package.zip` (~16MB)

### Step 3: Deploy Infrastructure

```bash
cd ../infra

# Initialize Terraform
terraform init

# Review what will be created
terraform plan

# Deploy infrastructure (includes backend APIs)
terraform apply

# Note the outputs (especially CloudFront URL)
terraform output frontend_url
```

**What this deploys:**
- Backend API Lambda functions (from `lambda_package.zip`)
- Backend Authorizer Lambda
- Frontend Server Lambda (placeholder initially)
- CloudFront distribution
- S3 buckets, DynamoDB table, Cognito, etc.

### Step 4: Build Frontend

```bash
cd ../frontend

# Install dependencies
npm ci

# Build with Open-Next
./scripts/build.sh
```

**What this does:**
- Installs npm dependencies
- Runs `next build`
- Packages with `open-next` for Lambda deployment
- Creates `.open-next/` directory with:
  - `assets/` - Static files for S3
  - `server-functions/default/` - Lambda function code
  - `cache/` - Next.js cache

### Step 5: Deploy Frontend

```bash
# Deploy to AWS
./scripts/deploy.sh
```

**What this does:**
1. Uploads static assets to S3
2. Uploads cache files to S3
3. Packages Lambda function
4. **Removes bundled `.env` file** (so Lambda env vars take precedence)
5. Updates **frontend server Lambda only** (does NOT touch backend APIs)
6. Invalidates CloudFront cache
7. Shows your application URL

### Step 6: Verify Deployment

```bash
# Get your application URL
cd ../infra
terraform output frontend_url

# Open in browser or test with curl
curl -I https://your-cloudfront-url.cloudfront.net
```

## Environment Variables in AWS

**Important**: Environment variables are **automatically managed by Terraform** for AWS deployments!

When you run `terraform apply`, it sets all environment variables in the Lambda function, including:
- `IDC_TOKEN_EXCHANGE_ROLE_ARN` ✅ (automatically set to the created role ARN)
- `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET` ✅
- `S3_USER_DATA_BUCKET`, `AWS_ACCOUNT_ID` ✅
- All other required variables ✅

See [cloudfront.tf:89-114](../infra/cloudfront.tf#L89-L114) for the complete list.

**You do NOT need to manually set environment variables in AWS!**

## Deployment Scripts Reference

### build.sh

**Location**: `frontend/scripts/build.sh`

**What it does:**
```bash
npm ci                    # Install dependencies
npx open-next build      # Build for AWS Lambda
```

**Output**: `.open-next/` directory

### deploy.sh

**Location**: `frontend/scripts/deploy.sh`

**What it does:**
```bash
# Get Terraform outputs
S3_BUCKET=$(terraform output -raw s3_bucket_name)
LAMBDA_FUNCTION=$(terraform output -raw lambda_function_name)
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id)

# Upload static assets
aws s3 sync .open-next/assets "s3://${S3_BUCKET}/" --delete

# Package Lambda function (removes .env to prevent override)
cd .open-next/server-functions/default
rm -f .env  # Critical: Let Lambda env vars take precedence
zip -r lambda-server.zip .

# Update Lambda
aws lambda update-function-code \
    --function-name "${LAMBDA_FUNCTION}" \
    --zip-file fileb://lambda-server.zip

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
    --distribution-id "${CLOUDFRONT_ID}" \
    --paths "/*"
```

## Common Deployment Workflows

### Deploy Frontend Code Changes

After making code changes to the frontend:

```bash
cd frontend
./scripts/build.sh    # Rebuild frontend
./scripts/deploy.sh   # Deploy frontend only
```

### Deploy Backend API Changes

After making code changes to the backend:

```bash
cd backend
./build.sh           # Rebuild backend package

cd ../infra
terraform apply      # Redeploy backend APIs
```

### Deploy Both Frontend + Backend

After making changes to both:

```bash
# Build backend
cd backend
./build.sh

# Build frontend
cd ../frontend
./scripts/build.sh

# Deploy backend via Terraform
cd ../infra
terraform apply

# Deploy frontend via scripts
cd ../frontend
./scripts/deploy.sh
```

### Update Infrastructure + Code

After making Terraform or infrastructure changes:

```bash
cd backend
./build.sh           # Rebuild if backend code changed

cd ../infra
terraform plan
terraform apply      # Updates infrastructure & backend APIs

cd ../frontend
./scripts/build.sh   # Rebuild if frontend code changed
./scripts/deploy.sh  # Deploy frontend
```

### Update Only Environment Variables

If you only changed Terraform variables (like `idc_oidc_issuer_url`):

```bash
cd infra
terraform apply       # Lambda env vars updated automatically

# No frontend rebuild/deploy needed!
# Lambda already has the new env vars
```

### Check Deployment Status

```bash
# Check Lambda function
aws lambda get-function \
    --function-name user-management-server-dev \
    --query 'Configuration.[LastUpdateStatus,State]' \
    --output text

# Check CloudFront distribution
aws cloudfront get-distribution \
    --id YOUR_DISTRIBUTION_ID \
    --query 'Distribution.Status' \
    --output text

# View Lambda logs
aws logs tail /aws/lambda/user-management-server-dev --follow
```

## Troubleshooting

### Issue: "Error: Could not get Terraform outputs"

**Cause**: Infrastructure not deployed yet

**Solution**:
```bash
cd infra
terraform init
terraform apply
```

### Issue: ".open-next directory not found"

**Cause**: Haven't run build script

**Solution**:
```bash
cd frontend
./scripts/build.sh
```

### Issue: Environment variables not updated in Lambda

**Symptom**: Changes to Terraform variables don't appear in Lambda

**Solution**:
```bash
cd infra
terraform apply  # This updates Lambda env vars

# Verify:
aws lambda get-function-configuration \
    --function-name user-management-server-dev \
    --query 'Environment.Variables'
```

### Issue: Application shows old version after deployment

**Cause**: CloudFront cache not invalidated

**Solution**:
```bash
# Manually invalidate
CLOUDFRONT_ID=$(cd infra && terraform output -raw cloudfront_distribution_id)
aws cloudfront create-invalidation \
    --distribution-id "$CLOUDFRONT_ID" \
    --paths "/*"
```

Or wait 5-10 minutes for cache to expire naturally.

### Issue: "Module not found" errors in Lambda

**Cause**: Dependencies not included in build

**Solution**:
```bash
cd frontend
npm ci                  # Clean install
./scripts/build.sh      # Rebuild with all deps
./scripts/deploy.sh     # Deploy new package
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Build Frontend
        run: |
          cd frontend
          ./scripts/build.sh

      - name: Deploy Frontend
        run: |
          cd frontend
          ./scripts/deploy.sh
```

## Post-Deployment Verification

### 1. Check Application URL

```bash
cd infra
terraform output frontend_url
```

### 2. Test Authentication

1. Open the URL in browser
2. Click "Sign In"
3. Should redirect to Cognito hosted UI
4. Should redirect to IDC
5. Should redirect to Entra ID
6. After login, should return to application

### 3. Verify IDC Token Exchange

1. Sign in
2. Navigate to Files page
3. Open Browser DevTools → Network tab
4. Look for `/api/s3/credentials` request
5. Check response: `"method": "idc-oidc"` ✅

### 4. Check Server Logs

```bash
aws logs tail /aws/lambda/user-management-server-dev --follow
```

Look for:
```
✓ Using IDC OIDC Token Exchange for AWS credentials
```

## Production Deployment

For production deployment:

1. **Create separate environment**:
   ```bash
   cd infra
   cp terraform.tfvars terraform.tfvars.prod

   # Edit terraform.tfvars.prod
   environment = "prod"
   domain_name = "usermanagement.example.com"
   ```

2. **Deploy infrastructure**:
   ```bash
   terraform workspace new prod
   terraform apply -var-file=terraform.tfvars.prod
   ```

3. **Build and deploy frontend**:
   ```bash
   cd ../frontend
   ./scripts/build.sh
   ./scripts/deploy.sh
   ```

## Monitoring

### CloudWatch Logs

```bash
# Tail Lambda logs
aws logs tail /aws/lambda/user-management-server-dev --follow

# Filter for errors
aws logs tail /aws/lambda/user-management-server-dev --filter-pattern "ERROR"

# Filter for IDC token exchange
aws logs tail /aws/lambda/user-management-server-dev --filter-pattern "IDC OIDC"
```

### Lambda Metrics

```bash
# Check invocations
aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Invocations \
    --dimensions Name=FunctionName,Value=user-management-server-dev \
    --statistics Sum \
    --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
    --period 300
```

## Rollback

If you need to roll back a deployment:

```bash
# Option 1: Revert code and redeploy
git revert HEAD
cd frontend
./scripts/build.sh
./scripts/deploy.sh

# Option 2: Deploy a previous version
git checkout <previous-commit>
cd frontend
./scripts/build.sh
./scripts/deploy.sh
```

## Summary

### First-Time Complete Deployment

```bash
# 1. Build backend
cd backend
./build.sh

# 2. Deploy infrastructure (includes backend APIs)
cd ../infra
terraform init
terraform apply

# 3. Build frontend
cd ../frontend
./scripts/build.sh

# 4. Deploy frontend
./scripts/deploy.sh

# Done! ✅
```

### Quick Updates

**Frontend only:**
```bash
cd frontend
./scripts/build.sh && ./scripts/deploy.sh
```

**Backend only:**
```bash
cd backend
./build.sh
cd ../infra
terraform apply
```

**Both:**
```bash
cd backend && ./build.sh
cd ../frontend && ./scripts/build.sh
cd ../infra && terraform apply
cd ../frontend && ./scripts/deploy.sh
```

### Key Points

- ✅ **Backend APIs** deploy via Terraform (from `lambda_package.zip`)
- ✅ **Frontend server** deploys via deployment scripts (from `.open-next/`)
- ✅ **Environment variables** managed by Terraform - no manual AWS configuration
- ✅ Scripts automatically use Terraform outputs (bucket names, function names, etc.)
