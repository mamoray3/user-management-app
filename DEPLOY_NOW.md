# Deploy Now - Quick Start Guide

## What Was Fixed

The Next.js Lambda function was failing with `NoSuchBucket` errors because it was trying to use a non-existent S3 bucket (`Q3N9sVOqxc_kLT2dwkMCl`) for caching.

**Solution implemented:**
1. ✅ Created dedicated S3 bucket for Next.js ISR cache
2. ✅ Updated OpenNext configuration
3. ✅ Added Lambda IAM permissions for cache bucket
4. ✅ Updated Lambda environment variables
5. ✅ Fixed deployment script paths
6. ✅ Added comprehensive documentation

---

## Deploy in 5 Steps

### Step 1: Refresh AWS Credentials (2 minutes)

Your credentials have expired. Refresh them:

```bash
# If using AWS SSO
aws sso login --profile <your-profile-name>
export AWS_PROFILE=<your-profile-name>

# OR if using IAM user credentials
aws configure
# Re-enter your credentials

# Verify
aws sts get-caller-identity
```

✅ You should see your account ID and user ARN.

### Step 2: Deploy Core Infrastructure (3-5 minutes)

```bash
cd /Users/mn/csl/web_apps/user-management-app/infra/core

# Initialize (if needed)
terraform init

# Review changes
terraform plan

# Apply changes
terraform apply
# Type 'yes' when prompted
```

**What this creates:**
- S3 bucket for Next.js cache (`user-mgmt-nextjs-cache-dev-xxxxxxxx`)
- IAM policy for Lambda to access cache bucket
- Lifecycle policy to auto-delete cache after 30 days

### Step 3: Deploy App Infrastructure (2-3 minutes)

```bash
cd ../app

# Refresh remote state
terraform init -reconfigure

# Review changes
terraform plan

# Apply changes
terraform apply
# Type 'yes' when prompted
```

**What this updates:**
- Lambda environment variables (CACHE_BUCKET_NAME, CACHE_BUCKET_REGION)
- New Terraform output for deployment script

### Step 4: Build Frontend (3-5 minutes)

```bash
cd ../../frontend

# Install dependencies (if needed)
npm install

# Build Next.js
npm run build

# Build OpenNext package
npm run build:open-next
```

✅ You should see `.open-next` directory created.

### Step 5: Deploy (3-5 minutes)

```bash
# Run deployment script
./scripts/deploy.sh
```

**What this does:**
1. Uploads static assets to S3
2. Packages and updates Lambda function
3. Invalidates CloudFront cache
4. Prints your application URL

✅ Deployment successful when you see:
```
Deployment completed successfully!
Application URL: https://dxxxxxxxxx.cloudfront.net
```

---

## Verify Deployment

### 1. Check CloudWatch Logs (1 minute)

```bash
# Get Lambda function name
cd ../infra/app
LAMBDA_NAME=$(terraform output -raw lambda_server_function_name)

# Tail logs
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow --format short
```

**✅ SUCCESS:** No `NoSuchBucket` errors
**❌ FAILURE:** Still seeing bucket errors → See troubleshooting below

### 2. Test Frontend (1 minute)

```bash
# Get URL
cd ../infra/app
terraform output frontend_url
```

Open the URL in your browser:
- Login page should load
- Click "Sign In" and authenticate
- Dashboard should load without errors

---

## Total Time Required

**Initial deployment:** 15-20 minutes
**Subsequent deployments:** 5-10 minutes (only Steps 4-5)

---

## Troubleshooting

### Issue: AWS Credentials Still Expired

**Error:**
```
Error: validating provider credentials: ExpiredToken
```

**Solution:**
```bash
# Check current credentials
aws sts get-caller-identity

# If expired, login again
aws sso login --profile <your-profile>

# Verify
aws sts get-caller-identity
```

**See:** [AWS Credentials Setup Guide](./docs/AWS_CREDENTIALS_SETUP.md)

### Issue: Terraform State Locked

**Error:**
```
Error acquiring the state lock
```

**Solution:**
```bash
# Check if you have another terraform command running
# If not, force unlock:
terraform force-unlock <lock-id>
```

### Issue: Lambda Update Fails

**Error:**
```
Lambda update failed
```

**Solution:**
```bash
# Check Lambda logs
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow

# Check function status
aws lambda get-function --function-name "$LAMBDA_NAME" \
  --query 'Configuration.LastUpdateStatus'
```

### Issue: Still Seeing NoSuchBucket Errors

**After deployment, still seeing cache bucket errors in logs**

**Checklist:**
1. ✅ Verified Lambda environment variables are set
   ```bash
   aws lambda get-function-configuration --function-name "$LAMBDA_NAME" \
     --query 'Environment.Variables.CACHE_BUCKET_NAME'
   ```

2. ✅ Confirmed OpenNext config has `incrementalCache: "s3-lite"`
   ```bash
   cat frontend/open-next.config.js | grep incrementalCache
   ```

3. ✅ Rebuilt frontend after config change
   ```bash
   cd frontend
   rm -rf .next .open-next
   npm run build
   npm run build:open-next
   ```

4. ✅ Deployed new Lambda code
   ```bash
   ./scripts/deploy.sh
   ```

**See:** [Next.js Cache S3 Error Guide](./docs/troubleshooting/NEXTJS_CACHE_S3_ERROR.md)

---

## Quick Reference Commands

```bash
# Refresh AWS credentials
aws sso login --profile <profile>
aws sts get-caller-identity

# Deploy infrastructure
cd infra/core && terraform apply
cd ../app && terraform apply

# Build and deploy frontend
cd ../../frontend
npm run build && npm run build:open-next
./scripts/deploy.sh

# Check logs
LAMBDA_NAME=$(cd ../infra/app && terraform output -raw lambda_server_function_name)
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow

# Get application URL
cd ../infra/app && terraform output frontend_url
```

---

## What's Next?

After successful deployment:

1. **Monitor CloudWatch Logs**
   - No cache bucket errors
   - Normal Lambda execution
   - Reasonable response times

2. **Test Authentication**
   - Login flow works
   - User session established
   - API calls successful

3. **Review Documentation**
   - [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md) - Full deployment guide
   - [Architecture](./docs/ARCHITECTURE.md) - System design
   - [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md) - Configuration reference
   - [IDC Token Exchange](./docs/troubleshooting/IDC_TOKEN_EXCHANGE_TROUBLESHOOTING.md) - Authentication troubleshooting

4. **Set Up Monitoring**
   - CloudWatch alarms for errors
   - Cost monitoring
   - Performance metrics

---

## Files Changed

All changes are ready to commit:

```bash
# Review changes
git status
git diff

# Stage changes
git add -A

# Commit
git commit -m "Fix Next.js ISR cache S3 bucket error

- Created dedicated S3 bucket for Next.js cache
- Updated OpenNext config to use s3-lite cache handler
- Added Lambda IAM permissions for cache bucket access
- Updated Lambda environment variables with cache bucket
- Fixed deployment script paths for two-stage infra
- Added comprehensive deployment documentation

Fixes: NoSuchBucket errors in CloudWatch logs"

# Push
git push origin app_oidc_cong_saml_idc
```

---

## Support

If you encounter issues:

1. **Check documentation:**
   - [Deployment Checklist](./docs/DEPLOYMENT_CHECKLIST.md)
   - [AWS Credentials Setup](./docs/AWS_CREDENTIALS_SETUP.md)
   - [Next.js Cache S3 Error](./docs/troubleshooting/NEXTJS_CACHE_S3_ERROR.md)

2. **Review logs:**
   - CloudWatch Lambda logs
   - Terraform output
   - Browser console (F12)

3. **Verify configuration:**
   - AWS credentials valid
   - Terraform applied successfully
   - Environment variables set correctly

---

## Ready to Deploy?

Follow the 5 steps above and you'll be live in 15-20 minutes! 🚀

**Start here:**
```bash
# Step 1: Refresh credentials
aws sso login --profile <your-profile>
```
