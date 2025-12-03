# Complete Deployment Checklist

## Prerequisites

### 1. Required Tools
- [ ] AWS CLI installed (`aws --version`)
- [ ] Terraform installed (`terraform --version`)
- [ ] Node.js 20.x installed (`node --version`)
- [ ] npm installed (`npm --version`)

### 2. AWS Credentials
- [ ] AWS credentials configured
- [ ] Appropriate IAM permissions for deployment
- [ ] AWS region set (default: us-east-1)

### 3. Environment Configuration
- [ ] `infra/terraform.tfvars` configured with your values
- [ ] Frontend environment variables prepared

---

## Step 1: Refresh AWS Credentials

### Option A: AWS SSO (Recommended)
```bash
# Login via SSO
aws sso login --profile <your-profile-name>

# Verify credentials
aws sts get-caller-identity --profile <your-profile-name>

# Set as default (optional)
export AWS_PROFILE=<your-profile-name>
```

### Option B: IAM User Credentials
```bash
# Configure credentials
aws configure

# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region name (e.g., us-east-1)
# - Default output format (json)

# Verify credentials
aws sts get-caller-identity
```

### Verification
Expected output should show:
```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/your-username"
}
```

- [ ] AWS credentials refreshed
- [ ] Credentials verified with `aws sts get-caller-identity`

---

## Step 2: Deploy Core Infrastructure

### Navigate to Core Infrastructure
```bash
cd /Users/mn/csl/web_apps/user-management-app/infra/core
```

### Initialize Terraform
```bash
terraform init
```

Expected output:
```
Terraform has been successfully initialized!
```

### Review Changes
```bash
terraform plan
```

Look for these new resources:
- `aws_s3_bucket.nextjs_cache` - Next.js ISR cache bucket
- `aws_s3_bucket_lifecycle_configuration.nextjs_cache` - 30-day expiration
- `aws_iam_role_policy.lambda_nextjs_cache` - Lambda S3 permissions
- Updated outputs for cache bucket

### Apply Changes
```bash
terraform apply
```

Review the plan and type `yes` to confirm.

### Verify Core Outputs
```bash
terraform output
```

Verify these outputs exist:
- [ ] `s3_static_bucket_name`
- [ ] `s3_nextjs_cache_bucket_name` ← NEW
- [ ] `s3_nextjs_cache_bucket_arn` ← NEW
- [ ] `cognito_user_pool_id`
- [ ] `cognito_user_pool_client_id`
- [ ] `lambda_execution_role_arn`
- [ ] `idc_token_exchange_role_arn`

---

## Step 3: Deploy App Infrastructure

### Navigate to App Infrastructure
```bash
cd ../app
```

### Reconfigure Terraform Backend
```bash
terraform init -reconfigure
```

### Review Changes
```bash
terraform plan
```

Look for:
- Updated Lambda environment variables (CACHE_BUCKET_NAME, CACHE_BUCKET_REGION)
- New output: `s3_bucket_name`

### Apply Changes
```bash
terraform apply
```

Review and type `yes` to confirm.

### Verify App Outputs
```bash
terraform output
```

Verify these outputs exist:
- [ ] `s3_bucket_name` ← NEW (for deploy script)
- [ ] `lambda_server_function_name`
- [ ] `cloudfront_distribution_id`
- [ ] `frontend_url`
- [ ] `api_url`

### Verify Lambda Environment Variables
```bash
# Get the Lambda function name
LAMBDA_NAME=$(terraform output -raw lambda_server_function_name)

# Check environment variables
aws lambda get-function-configuration \
  --function-name "$LAMBDA_NAME" \
  --query 'Environment.Variables' | jq '{
    CACHE_BUCKET_NAME,
    CACHE_BUCKET_REGION,
    NEXTAUTH_URL,
    API_BASE_URL
  }'
```

Expected output should include:
```json
{
  "CACHE_BUCKET_NAME": "user-mgmt-nextjs-cache-dev-xxxxxxxx",
  "CACHE_BUCKET_REGION": "us-east-1",
  "NEXTAUTH_URL": "https://dxxxxxxxxx.cloudfront.net",
  "API_BASE_URL": "https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com"
}
```

- [ ] Core infrastructure deployed successfully
- [ ] App infrastructure deployed successfully
- [ ] Lambda environment variables include cache bucket configuration

---

## Step 4: Build Frontend Application

### Navigate to Frontend
```bash
cd ../../frontend
```

### Install Dependencies (if needed)
```bash
npm install
```

### Build Next.js Application
```bash
npm run build
```

Expected output:
```
✓ Compiled successfully
✓ Collecting page data
✓ Generating static pages (X/X)
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
┌ ○ /                                   XXX B          XXX kB
├ ○ /api/auth/[...nextauth]             0 B                0 B
├ ○ /login                              XXX B          XXX kB
└ ○ /users                              XXX B          XXX kB

○  (Static)  automatically rendered as static HTML
```

### Build OpenNext Package
```bash
npm run build:open-next
```

Expected output:
```
OpenNext — v3.x.x

Building...
✓ Server function built
✓ Image optimization function built
✓ Assets copied
✓ Build complete!

Output: .open-next/
```

### Verify Build Output
```bash
ls -la .open-next/
```

Expected directories:
```
drwxr-xr-x  assets/
drwxr-xr-x  cache/
drwxr-xr-x  server-functions/
-rw-r--r--  open-next.output.json
```

- [ ] Frontend dependencies installed
- [ ] Next.js build completed successfully
- [ ] OpenNext build completed successfully
- [ ] `.open-next` directory exists with required files

---

## Step 5: Deploy Application

### Run Deployment Script
```bash
./scripts/deploy.sh
```

### Expected Output
```
Getting Terraform outputs...
Uploading static assets to S3...
upload: .open-next/assets/_next/static/... to s3://...
Uploading cache assets to S3...
Packaging Lambda function...
Removing bundled .env file (Lambda env vars will be used instead)...
  adding: index.mjs (deflated XX%)
  adding: node_modules/... (deflated XX%)
Updating Lambda function...
Waiting for Lambda update to complete...
Lambda update completed.
Invalidating CloudFront cache...
CloudFront invalidation started.
Deployment completed successfully!
Application URL: https://dxxxxxxxxx.cloudfront.net
```

### Verify Each Step

#### S3 Static Assets
```bash
# Get bucket name from Terraform
S3_BUCKET=$(cd ../infra/app && terraform output -raw s3_bucket_name)

# List uploaded assets
aws s3 ls "s3://${S3_BUCKET}/_next/static/" | head -10
```

#### Lambda Function Updated
```bash
# Get Lambda name
LAMBDA_NAME=$(cd ../infra/app && terraform output -raw lambda_server_function_name)

# Check last modified time (should be recent)
aws lambda get-function --function-name "$LAMBDA_NAME" \
  --query 'Configuration.[LastModified,CodeSize,Version]' \
  --output table
```

#### CloudFront Invalidation
```bash
# Get CloudFront distribution ID
CF_ID=$(cd ../infra/app && terraform output -raw cloudfront_distribution_id)

# List recent invalidations
aws cloudfront list-invalidations --distribution-id "$CF_ID" \
  --query 'InvalidationList.Items[0]' \
  --output table
```

- [ ] Static assets uploaded to S3
- [ ] Lambda function code updated
- [ ] CloudFront cache invalidated
- [ ] Deployment script completed successfully

---

## Step 6: Verify Deployment

### Test Frontend Access
```bash
# Get frontend URL
FRONTEND_URL=$(cd ../infra/app && terraform output -raw frontend_url)

# Test with curl
curl -I "$FRONTEND_URL"
```

Expected response:
```
HTTP/2 200
content-type: text/html
x-cache: Miss from cloudfront
...
```

### Open in Browser
```bash
# Get URL
cd ../infra/app
terraform output frontend_url

# Copy the URL and open in browser
```

- [ ] Frontend URL accessible
- [ ] Login page loads correctly
- [ ] No console errors in browser DevTools

### Check CloudWatch Logs for Cache Errors

```bash
# Get Lambda function name
LAMBDA_NAME=$(cd ../infra/app && terraform output -raw lambda_server_function_name)

# Tail logs
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow --format short
```

**What to Look For:**

✅ **GOOD - No cache errors:**
```
INIT_START Runtime Version: nodejs:20.v91
START RequestId: xxx
END RequestId: xxx
REPORT RequestId: xxx Duration: 250ms Memory: 512MB
```

❌ **BAD - Still seeing cache errors:**
```
ERROR NoSuchBucket: The specified bucket does not exist
BucketName: Q3N9sVOqxc_kLT2dwkMCl
```

If you still see cache errors:
1. Verify Lambda environment variables are set
2. Check that you deployed the new OpenNext build
3. Review the [Next.js Cache S3 Error Guide](./troubleshooting/NEXTJS_CACHE_S3_ERROR.md)

- [ ] No `NoSuchBucket` errors in CloudWatch logs
- [ ] Lambda executes successfully
- [ ] Response times are reasonable

### Test Authentication Flow

1. **Navigate to frontend URL**
2. **Click "Sign In"**
3. **Authenticate via Cognito → IDC → Entra ID**
4. **Verify successful login**
5. **Check browser console for errors**

- [ ] Authentication flow completes successfully
- [ ] User session established
- [ ] Dashboard/users page loads

### Test S3 Credentials API (if using IDC token exchange)

```bash
# In browser console after login
fetch('/api/s3/credentials')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Expected response:
```json
{
  "credentials": {
    "accessKeyId": "ASIA...",
    "secretAccessKey": "...",
    "sessionToken": "...",
    "expiration": "2025-12-02T19:30:00.000Z"
  },
  "s3Bucket": "user-mgmt-user-data-dev-xxxx",
  "userPrefix": "users/3448e4c8-70b1-7069-c7f1-e42f103a6ab5/",
  "idcUserId": "3448e4c8-70b1-7069-c7f1-e42f103a6ab5",
  "region": "us-east-1"
}
```

- [ ] S3 credentials API returns valid credentials
- [ ] IDC token exchange successful (if applicable)

---

## Step 7: Monitor and Validate

### CloudWatch Metrics

Monitor these metrics for 15-30 minutes after deployment:

```bash
# Lambda errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value="$LAMBDA_NAME" \
  --start-time $(date -u -v-30M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Lambda duration
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value="$LAMBDA_NAME" \
  --start-time $(date -u -v-30M +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

### S3 Cache Bucket Usage

```bash
# Check if cache bucket is being used
S3_CACHE_BUCKET=$(cd ../infra/core && terraform output -raw s3_nextjs_cache_bucket_name)

aws s3 ls "s3://${S3_CACHE_BUCKET}/" --recursive
```

If ISR is working, you should see cache files appearing.

### Cost Monitoring

Monitor AWS costs:
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -v-1d +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

- [ ] No errors in CloudWatch metrics
- [ ] Lambda execution times acceptable
- [ ] Cache bucket being populated (if ISR pages exist)
- [ ] AWS costs within expected range

---

## Troubleshooting

### Issue: Deployment Script Fails

**Error:** `Could not get Terraform outputs`

**Solution:**
1. Ensure you're in the correct directory
2. Verify infrastructure is deployed: `cd ../infra/app && terraform output`
3. Check AWS credentials are valid: `aws sts get-caller-identity`

### Issue: Lambda Update Fails

**Error:** `Lambda update failed`

**Solution:**
1. Check Lambda logs: `aws logs tail /aws/lambda/$LAMBDA_NAME --follow`
2. Verify package size < 50MB (unzipped)
3. Check IAM permissions for Lambda update

### Issue: CloudFront Returns Errors

**Error:** 502 Bad Gateway or 500 Internal Server Error

**Solution:**
1. Check Lambda function logs
2. Verify Lambda function URL is accessible
3. Check CloudFront origin configuration
4. Wait for CloudFront invalidation to complete (5-15 minutes)

### Issue: Still Seeing Cache Bucket Errors

**Error:** `NoSuchBucket: Q3N9sVOqxc_kLT2dwkMCl`

**Solution:**
Review detailed troubleshooting guide:
```bash
cat docs/troubleshooting/NEXTJS_CACHE_S3_ERROR.md
```

Key checks:
1. Lambda environment variables set: `CACHE_BUCKET_NAME`, `CACHE_BUCKET_REGION`
2. OpenNext config has `incrementalCache: "s3-lite"`
3. Frontend rebuilt with new configuration
4. Lambda deployed with new code

---

## Post-Deployment Checklist

- [ ] All infrastructure deployed successfully
- [ ] Frontend application accessible via CloudFront URL
- [ ] Authentication flow working
- [ ] No errors in CloudWatch logs
- [ ] Cache bucket errors resolved
- [ ] S3 credentials API working (if applicable)
- [ ] CloudWatch metrics normal
- [ ] Documentation updated (if needed)
- [ ] Team notified of deployment

---

## Rollback Procedure

If deployment fails and you need to rollback:

### 1. Revert Lambda to Previous Version
```bash
# List previous versions
aws lambda list-versions-by-function --function-name "$LAMBDA_NAME"

# Update alias to previous version
aws lambda update-alias \
  --function-name "$LAMBDA_NAME" \
  --name PROD \
  --function-version <previous-version>
```

### 2. Revert S3 Static Assets
```bash
# S3 versioning should be enabled
# List object versions
aws s3api list-object-versions \
  --bucket "$S3_BUCKET" \
  --prefix "_next/"

# Restore previous version if needed
```

### 3. Revert Infrastructure Changes
```bash
# Core infrastructure
cd infra/core
git checkout HEAD^ -- s3.tf iam.tf outputs.tf
terraform apply

# App infrastructure
cd ../app
git checkout HEAD^ -- lambda.tf outputs.tf
terraform apply
```

---

## Maintenance Tasks

### Regular Monitoring

Set up CloudWatch alarms for:
- Lambda errors > 0
- Lambda duration > 5000ms
- 5XX errors from CloudFront

### Weekly Tasks

- [ ] Review CloudWatch logs for errors
- [ ] Check S3 cache bucket size
- [ ] Review AWS costs

### Monthly Tasks

- [ ] Review and update dependencies
- [ ] Security audit of IAM permissions
- [ ] Review cache lifecycle policies
- [ ] Update documentation as needed

---

## Additional Resources

- [Architecture Documentation](./docs/ARCHITECTURE.md)
- [Environment Variables Guide](./docs/ENVIRONMENT_VARIABLES.md)
- [IDC OIDC Token Exchange Troubleshooting](./docs/troubleshooting/IDC_TOKEN_EXCHANGE_TROUBLESHOOTING.md)
- [Next.js Cache S3 Error Guide](./docs/troubleshooting/NEXTJS_CACHE_S3_ERROR.md)
- [Quick Start Guide](./docs/QUICK_START_IDC_OIDC.md)

---

## Summary

This checklist guides you through:
1. ✅ Refreshing AWS credentials
2. ✅ Deploying core infrastructure (S3 cache bucket)
3. ✅ Deploying app infrastructure (Lambda env vars)
4. ✅ Building frontend with OpenNext
5. ✅ Deploying application
6. ✅ Verifying deployment
7. ✅ Monitoring and validation

**Estimated Time:** 20-30 minutes for full deployment

**Next Deployment:** Once infrastructure is stable, you only need to repeat Steps 4-6 for code changes.
