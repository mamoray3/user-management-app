# Next.js ISR Cache S3 Bucket Error - Troubleshooting Guide

## Issue Overview

When deploying a Next.js application using OpenNext on AWS Lambda, you may encounter an S3 bucket error related to caching:

```
NoSuchBucket: The specified bucket does not exist
BucketName: Q3N9sVOqxc_kLT2dwkMCl
```

The bucket name `Q3N9sVOqxc_kLT2dwkMCl` (or similar alphanumeric string) is the Next.js build ID, which OpenNext is attempting to use as an S3 bucket name for Incremental Static Regeneration (ISR) caching.

## Error Details

### Symptoms

1. **CloudWatch Logs show S3 errors:**
   ```
   ERROR: NoSuchBucket: The specified bucket does not exist
   clientName: 'S3Client',
   commandName: 'GetObjectCommand',
   input: { Key: 'Q3N9sVOqxc_kLT2dwkMCl/login.cache' },
   BucketName: 'Q3N9sVOqxc_kLT2dwkMCl'
   ```

2. **Multiple S3 operations fail:**
   - `GetObjectCommand` - Reading cached pages
   - `PutObjectCommand` - Writing cached pages
   - Both operations target a non-existent bucket

3. **Pages may still load but:**
   - Performance is degraded (no caching)
   - Lambda execution time is higher
   - CloudWatch logs are filled with errors

### Root Cause

Next.js 14+ uses ISR caching by default. When deployed with OpenNext:
- OpenNext expects an S3 bucket for storing cached pages
- Without explicit configuration, OpenNext tries to use the build ID as the bucket name
- This auto-generated bucket name doesn't exist in your AWS account
- All cache operations fail with `NoSuchBucket` error

## Solution

The fix involves three steps:
1. Configure OpenNext to use the correct cache handler
2. Create a dedicated S3 bucket for Next.js caching
3. Grant Lambda permissions to access the cache bucket

### Step 1: Update OpenNext Configuration

**File:** `frontend/open-next.config.js`

```javascript
/** @type {import('open-next/types').OpenNextConfig} */
const config = {
  default: {
    override: {
      wrapper: "aws-lambda",
      converter: "aws-lambda-url",
      // Use s3-lite cache handler instead of default
      incrementalCache: "s3-lite",
    },
  },
  // Configure image optimization
  imageOptimization: {
    arch: "x64",
  },
  // Warmer configuration for cold start mitigation
  warmer: {
    invokeFunction: "warmer-function",
  },
  // Build options
  buildCommand: "npx next build",
  appPath: ".",
  buildOutputPath: ".open-next",
  packageJsonPath: "./package.json",
};

module.exports = config;
```

### Step 2: Create S3 Cache Bucket in Terraform

**File:** `infra/core/s3.tf`

Add the following resources:

```hcl
# S3 Bucket for Next.js ISR Cache (Open-Next)
resource "aws_s3_bucket" "nextjs_cache" {
  bucket = "${var.project_name}-nextjs-cache-${var.environment}-${random_string.bucket_suffix.result}"

  tags = {
    Name = "${var.project_name}-nextjs-cache"
  }
}

resource "aws_s3_bucket_public_access_block" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle policy to auto-delete old cache entries
resource "aws_s3_bucket_lifecycle_configuration" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  rule {
    id     = "delete-old-cache"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}
```

### Step 3: Add Outputs for Cache Bucket

**File:** `infra/core/outputs.tf`

```hcl
output "s3_nextjs_cache_bucket_name" {
  description = "S3 bucket for Next.js ISR cache"
  value       = aws_s3_bucket.nextjs_cache.bucket
}

output "s3_nextjs_cache_bucket_arn" {
  description = "S3 bucket ARN for Next.js ISR cache"
  value       = aws_s3_bucket.nextjs_cache.arn
}
```

### Step 4: Grant Lambda Permissions

**File:** `infra/core/iam.tf`

Add the following IAM policy:

```hcl
# S3 access policy for Lambda - Next.js cache bucket
resource "aws_iam_role_policy" "lambda_nextjs_cache" {
  name = "${var.project_name}-lambda-nextjs-cache-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.nextjs_cache.arn,
          "${aws_s3_bucket.nextjs_cache.arn}/*"
        ]
      }
    ]
  })
}
```

### Step 5: Update Lambda Environment Variables

**File:** `infra/app/lambda.tf`

Add these environment variables to the server Lambda function:

```hcl
resource "aws_lambda_function" "server" {
  # ... existing configuration ...

  environment {
    variables = {
      # ... existing variables ...

      # Next.js ISR Cache
      CACHE_BUCKET_NAME   = data.terraform_remote_state.core.outputs.s3_nextjs_cache_bucket_name
      CACHE_BUCKET_REGION = data.terraform_remote_state.core.outputs.aws_region
    }
  }
}
```

## Deployment Steps

After making the above changes:

### 1. Apply Terraform Changes

```bash
# Navigate to core infrastructure
cd infra/core

# Initialize and apply
terraform init
terraform plan
terraform apply

# Note the cache bucket name from outputs
terraform output s3_nextjs_cache_bucket_name
```

### 2. Update App Infrastructure

```bash
# Navigate to app infrastructure
cd ../app

# Refresh remote state
terraform init -reconfigure
terraform plan
terraform apply
```

### 3. Rebuild and Deploy Frontend

```bash
# Navigate to frontend
cd ../../frontend

# Build with OpenNext
npm run build
npm run build:open-next

# Deploy the new build
./scripts/deploy.sh
```

### 4. Verify the Fix

Check CloudWatch Logs for the Lambda server function:

```bash
aws logs tail /aws/lambda/your-project-server-environment --follow
```

You should see:
- No more `NoSuchBucket` errors
- Successful cache operations (if any pages use ISR)
- Improved performance for cached pages

## Verification

### Check S3 Bucket Exists

```bash
# List cache buckets
aws s3 ls | grep nextjs-cache

# Check bucket contents (after some requests)
aws s3 ls s3://your-project-nextjs-cache-dev-xxxx/
```

### Check Lambda Environment Variables

```bash
aws lambda get-function-configuration \
  --function-name your-project-server-dev \
  --query 'Environment.Variables' | jq '{CACHE_BUCKET_NAME, CACHE_BUCKET_REGION}'
```

Expected output:
```json
{
  "CACHE_BUCKET_NAME": "your-project-nextjs-cache-dev-xxxx",
  "CACHE_BUCKET_REGION": "us-east-1"
}
```

### Check IAM Permissions

```bash
# Get Lambda execution role name
ROLE_NAME=$(aws lambda get-function-configuration \
  --function-name your-project-server-dev \
  --query 'Role' --output text | cut -d'/' -f2)

# Check S3 permissions
aws iam list-role-policies --role-name $ROLE_NAME
aws iam get-role-policy \
  --role-name $ROLE_NAME \
  --policy-name your-project-lambda-nextjs-cache-dev
```

## Understanding ISR Caching

### What is ISR?

Incremental Static Regeneration (ISR) allows you to:
- Generate static pages at build time
- Regenerate pages in the background as requests come in
- Set revalidation intervals for cached pages

### Cache Bucket Structure

The cache bucket stores:
```
your-project-nextjs-cache-dev-xxxx/
├── _next/
│   └── data/
│       └── BUILD_ID/
│           ├── page1.json
│           ├── page2.json
│           └── ...
├── BUILD_ID/
│   ├── page.cache
│   └── ...
└── ...
```

### Cache Lifecycle

1. **First Request:**
   - Lambda generates page
   - Stores result in S3
   - Returns page to client

2. **Subsequent Requests (within revalidation period):**
   - Lambda checks S3 for cached version
   - Returns cached page (fast)
   - No regeneration needed

3. **After Revalidation Period:**
   - Lambda serves stale cache
   - Triggers background regeneration
   - Updates S3 with fresh version
   - Next request gets updated page

### Cost Optimization

The lifecycle policy (`expiration: 30 days`) automatically deletes old cache entries to:
- Reduce S3 storage costs
- Remove outdated build artifacts
- Keep bucket size manageable

You can adjust the expiration period based on your needs:

```hcl
# Shorter expiration (7 days) - lower cost, more regeneration
expiration {
  days = 7
}

# Longer expiration (90 days) - higher cost, less regeneration
expiration {
  days = 90
}
```

## Troubleshooting

### Issue: Still seeing NoSuchBucket errors after deployment

**Solution:**
1. Verify environment variables are set:
   ```bash
   aws lambda get-function-configuration --function-name your-project-server-dev --query 'Environment.Variables'
   ```

2. Check if old Lambda deployment is cached:
   ```bash
   # Force Lambda to use new code
   aws lambda update-function-code \
     --function-name your-project-server-dev \
     --zip-file fileb://path/to/new/deployment.zip
   ```

3. Rebuild frontend completely:
   ```bash
   rm -rf .next .open-next
   npm run build
   npm run build:open-next
   ```

### Issue: Access Denied errors

**Error:**
```
AccessDenied: Access Denied
clientName: 'S3Client',
commandName: 'PutObjectCommand'
```

**Solution:**
1. Verify IAM policy is attached:
   ```bash
   aws iam list-role-policies --role-name your-lambda-execution-role
   ```

2. Check policy permissions:
   ```bash
   aws iam get-role-policy \
     --role-name your-lambda-execution-role \
     --policy-name your-project-lambda-nextjs-cache-dev
   ```

3. Ensure bucket ARN matches in policy and outputs

### Issue: Cache not working (pages always regenerate)

**Possible causes:**
1. `revalidate` not set in page components
2. Cache bucket environment variables not set
3. OpenNext cache handler not configured

**Solution:**
1. Add revalidation to pages that should cache:
   ```javascript
   // In your page component
   export const revalidate = 60; // Revalidate every 60 seconds
   ```

2. Verify OpenNext config uses `incrementalCache: "s3-lite"`

3. Check CloudWatch logs for cache operations

## Best Practices

### 1. Monitor Cache Usage

Set up CloudWatch metrics for:
- S3 bucket size
- Number of objects
- Request counts (GetObject, PutObject)

### 2. Tag Resources

Ensure all cache-related resources are properly tagged:
```hcl
tags = {
  Name        = "${var.project_name}-nextjs-cache"
  Environment = var.environment
  Purpose     = "nextjs-isr-cache"
  ManagedBy   = "terraform"
}
```

### 3. Backup Considerations

Cache data is ephemeral and can be regenerated:
- No backup needed for cache bucket
- Versioning disabled to save costs
- Lifecycle policies automatically clean up old data

### 4. Security

The cache bucket is properly secured:
- All public access blocked
- Encryption at rest (AES256)
- Access only via Lambda execution role
- No public bucket policies

## Additional Resources

- [Next.js ISR Documentation](https://nextjs.org/docs/pages/building-your-application/data-fetching/incremental-static-regeneration)
- [OpenNext Documentation](https://open-next.js.org/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [S3 Lifecycle Policies](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)

## Summary Checklist

After implementing the fix:

- [ ] OpenNext config updated with `incrementalCache: "s3-lite"`
- [ ] S3 cache bucket created via Terraform
- [ ] Lifecycle policy configured (30 day expiration)
- [ ] Bucket outputs added to Terraform
- [ ] IAM policy grants Lambda S3 permissions
- [ ] Lambda environment variables set (CACHE_BUCKET_NAME, CACHE_BUCKET_REGION)
- [ ] Terraform applied successfully
- [ ] Frontend rebuilt with OpenNext
- [ ] Deployment completed
- [ ] CloudWatch logs show no more NoSuchBucket errors
- [ ] Cache operations working (if ISR pages exist)
- [ ] S3 bucket contains cache objects after requests

## Next Steps

1. Monitor cache hit rates in CloudWatch
2. Adjust revalidation periods based on content update frequency
3. Consider adding CloudWatch alarms for cache errors
4. Document which pages use ISR in your application
5. Review S3 costs monthly and adjust lifecycle policy if needed
