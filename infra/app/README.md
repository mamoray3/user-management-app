# App Infrastructure Stage

This directory contains the app-level infrastructure that depends on the core infrastructure.

## Overview

The app stage creates:
- **Lambda Functions**: API, Authorizer, and Server (Next.js SSR)
- **API Gateway**: HTTP API with routes and authorizer
- **CloudFront**: CDN distribution for the frontend
- **S3 Bucket Policy**: Allows CloudFront OAC to access static assets
- **Cognito Update**: Updates callback URLs with CloudFront domain

## Files

1. **provider.tf** - Terraform and AWS provider configuration with remote state reference to core
2. **variables.tf** - Minimal variables (project_name, environment, aws_region)
3. **lambda.tf** - All three Lambda functions referencing core outputs
4. **api_gateway.tf** - API Gateway HTTP API with routes and integrations
5. **cloudfront.tf** - CloudFront distribution with cache policies and origins
6. **s3_policy.tf** - S3 bucket policy for CloudFront OAC access
7. **cognito_update.tf** - Updates Cognito callback URLs via AWS CLI
8. **outputs.tf** - CloudFront domain, API Gateway URL, Lambda ARNs

## Prerequisites

Before deploying the app stage:

1. **Core infrastructure must be deployed first**:
   ```bash
   cd ../core
   terraform init
   terraform apply
   ```

2. **Backend Lambda package must exist**:
   ```bash
   cd ../../backend
   ./build.sh
   # Creates lambda_package.zip
   ```

3. **AWS credentials must be configured** with appropriate permissions

## Deployment

### First-time deployment:

```bash
cd /Users/mn/csl/web_apps/user-management-app/infra/app
terraform init
terraform apply
```

### Subsequent deployments:

```bash
terraform apply
```

## Architecture

### Dependency Flow

```
Core Infrastructure (infra/core/)
  ↓ (outputs via terraform_remote_state)
App Infrastructure (infra/app/)
  ↓
Frontend Deployment
```

### Key Design Decisions

1. **No Circular Dependencies**: CloudFront and Lambda are created in the same stage, so NEXTAUTH_URL can be set correctly during Lambda creation.

2. **Cognito Callback URLs**:
   - Core stage creates Cognito with localhost-only callbacks
   - Core uses `lifecycle { ignore_changes = [callback_urls] }` to allow external updates
   - App stage updates callback URLs via AWS CLI to add CloudFront domain

3. **S3 Bucket Policy**:
   - Core creates S3 bucket without CloudFront policy
   - App stage adds bucket policy allowing CloudFront OAC access
   - CloudFront depends on bucket policy to ensure proper ordering

4. **Lambda Environment Variables**:
   - All environment variables set correctly during Lambda creation
   - No need for post-creation updates (eliminates special character issues)

## Outputs

After deployment, you'll see:

```
frontend_url           = "https://d1234567890.cloudfront.net"
api_url                = "https://abc123.execute-api.us-east-1.amazonaws.com/dev"
cloudfront_domain_name = "d1234567890.cloudfront.net"
```

## Frontend Deployment

After infrastructure is deployed:

```bash
cd ../../frontend

# Update .env with outputs
cat > .env.local <<EOF
NEXT_PUBLIC_API_URL=<api_url from outputs>
NEXTAUTH_URL=<frontend_url from outputs>
# ... other env vars from core outputs
EOF

# Build and deploy
npm run build
./scripts/deploy.sh
```

## Troubleshooting

### Issue: "No outputs found" error

**Solution**: Ensure core infrastructure is deployed first:
```bash
cd ../core && terraform apply
```

### Issue: Lambda package not found

**Solution**: Build the backend Lambda package:
```bash
cd ../../backend && ./build.sh
```

### Issue: Cognito callback URL update fails

**Solution**: Check AWS CLI credentials and ensure jq is installed:
```bash
which jq || brew install jq  # macOS
which jq || sudo apt-get install jq  # Ubuntu
```

## State Management

- **App state**: Stored in S3 backend at `tf-state-540150371887/user-management/dev/app/terraform.tfstate`
- **Core state**: Referenced via local path `../core/terraform.tfstate`

## Clean Up

To destroy app infrastructure (keeps core intact):

```bash
terraform destroy
```

To destroy everything:

```bash
# Destroy app first
cd /Users/mn/csl/web_apps/user-management-app/infra/app
terraform destroy

# Then destroy core
cd ../core
terraform destroy
```
