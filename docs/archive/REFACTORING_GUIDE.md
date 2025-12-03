# Two-Stage Terraform Refactoring Guide

## Overview

This guide explains how to refactor the current single-stage Terraform configuration into two stages to eliminate the circular dependency between CloudFront and Cognito.

## Problem

The current configuration has a circular dependency:
- Cognito needs CloudFront URL for callback URLs
- CloudFront needs to be created first to get its domain
- Lambda needs CloudFront URL for NEXTAUTH_URL
- This causes `null_resource` provisioners to be unreliable

## Solution: Two-Stage Architecture

### Stage 1: Core Infrastructure (`infra/core/`)
Resources that don't depend on CloudFront:
- DynamoDB table
- S3 buckets
- Cognito (with placeholder callback URLs)
- IAM Identity Center OIDC provider
- IAM roles
- S3 Access Grants

### Stage 2: App Infrastructure (`infra/app/`)
Resources that use outputs from Stage 1:
- Lambda functions
- API Gateway
- CloudFront distribution
- Update Cognito callback URLs (using CloudFront domain)

## Implementation Steps

### Step 1: Create Directory Structure

```bash
cd /Users/mn/csl/web_apps/user-management-app/infra
mkdir -p core app
```

### Step 2: Move Core Resources to `core/`

Copy these files to `core/` directory:
- `cognito.tf`
- `dynamodb.tf`
- `s3.tf`
- `s3_access_grants.tf`
- `idc_oidc.tf`

Create these new files in `core/`:

**core/provider.tf:**
```hcl
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
```

**core/iam.tf:**
Extract IAM roles from `lambda.tf` (lines 1-56) that don't depend on Lambdas themselves.

**core/variables.tf:**
Copy from parent `variables.tf`.

**core/outputs.tf:**
Export all resource IDs/ARNs that app stage will need (see the file I created above).

### Step 3: Modify Cognito in Core to Use Lifecycle Rule

In `core/cognito.tf`, modify the `aws_cognito_user_pool_client` resource:

```hcl
resource "aws_cognito_user_pool_client" "web_app" {
  # ... existing configuration ...

  callback_urls = [
    "http://localhost:3000/api/auth/callback/cognito"
    # CloudFront URL will be added by app stage
  ]

  # Allow external updates without Terraform detecting drift
  lifecycle {
    ignore_changes = [callback_urls]
  }
}
```

### Step 4: Create App Infrastructure in `app/`

**app/provider.tf:**
```hcl
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Reference core infrastructure state
data "terraform_remote_state" "core" {
  backend = "local"
  config = {
    path = "../core/terraform.tfstate"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
```

**app/variables.tf:**
Copy minimal variables needed (project_name, environment, aws_region).

**app/lambda.tf:**
Move Lambda functions here and reference core outputs:

```hcl
locals {
  nextauth_secret = data.terraform_remote_state.core.outputs.nextauth_secret
}

resource "aws_lambda_function" "server" {
  filename         = "${path.module}/../../backend/lambda_package.zip"
  function_name    = "${var.project_name}-server-${var.environment}"
  role             = data.terraform_remote_state.core.outputs.lambda_execution_role_arn

  environment {
    variables = {
      NEXTAUTH_URL                = "https://${aws_cloudfront_distribution.frontend.domain_name}"
      COGNITO_USER_POOL_ID        = data.terraform_remote_state.core.outputs.cognito_user_pool_id
      COGNITO_CLIENT_ID           = data.terraform_remote_state.core.outputs.cognito_user_pool_client_id
      COGNITO_CLIENT_SECRET       = data.terraform_remote_state.core.outputs.cognito_user_pool_client_secret
      # ... other variables from core outputs
    }
  }
}
```

**app/api_gateway.tf:**
Move API Gateway configuration here.

**app/cloudfront.tf:**
Move CloudFront configuration here (WITHOUT the null_resource for Lambda env update since Lambda already has the correct URL).

**app/cognito_update.tf:**
Create new file to update Cognito callback URLs:

```hcl
resource "null_resource" "update_cognito_callback_urls" {
  triggers = {
    cloudfront_domain = aws_cloudfront_distribution.frontend.domain_name
    always_run        = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      aws cognito-idp update-user-pool-client \
        --user-pool-id ${data.terraform_remote_state.core.outputs.cognito_user_pool_id} \
        --client-id ${data.terraform_remote_state.core.outputs.cognito_user_pool_client_id} \
        --callback-urls \
          "http://localhost:3000/api/auth/callback/cognito" \
          "https://${aws_cloudfront_distribution.frontend.domain_name}/api/auth/callback/cognito" \
        --allowed-o-auth-flows-user-pool-client \
        --allowed-o-auth-flows "code" \
        --allowed-o-auth-scopes "openid" "email" "profile" \
        --supported-identity-providers "IdentityCenter"
    EOT
  }

  depends_on = [aws_cloudfront_distribution.frontend]
}
```

### Step 5: Migration Path

Since you already have infrastructure deployed, you need to migrate carefully:

1. **Import existing state to core:**
   ```bash
   cd core
   terraform init
   # Import all existing core resources
   terraform import aws_dynamodb_table.users user-management-users-dev
   terraform import aws_s3_bucket.static_assets user-management-static-dev-7pgisc7c
   # ... import all other core resources
   ```

2. **Verify core:**
   ```bash
   terraform plan  # Should show no changes
   terraform apply
   ```

3. **Setup app stage:**
   ```bash
   cd ../app
   terraform init
   # Import app resources
   terraform import aws_lambda_function.server user-management-server-dev
   # ... import other app resources
   ```

4. **Apply app stage:**
   ```bash
   terraform apply
   ```

## Deployment Workflow

After refactoring, the deployment process will be:

```bash
# Deploy core infrastructure (rarely changes)
cd infra/core
terraform apply

# Deploy app infrastructure (references core outputs)
cd ../app
terraform apply

# Build and deploy frontend
cd ../../frontend
./scripts/build.sh
./scripts/deploy.sh
```

## Benefits

1. **No more circular dependency** - Core created first, app references it
2. **Reliable callback URL updates** - Always runs after CloudFront exists
3. **Cleaner separation** - Core infrastructure vs application layer
4. **Faster iterations** - Can update app without touching core
5. **Better state management** - Two separate state files

## Alternative: Simpler Fix

If two-stage refactoring is too complex right now, you can use a simpler fix:

In `cognito.tf`, add `lifecycle` block to ignore callback URL changes, and always run the `null_resource`:

```hcl
resource "aws_cognito_user_pool_client" "web_app" {
  callback_urls = ["http://localhost:3000/api/auth/callback/cognito"]

  lifecycle {
    ignore_changes = [callback_urls]
  }
}

resource "null_resource" "update_cognito_callback_urls" {
  triggers = {
    always_run = timestamp()  # Always update
  }

  provisioner "local-exec" {
    # Update callback URLs command
  }

  depends_on = [aws_cloudfront_distribution.frontend]
}
```

This forces the callback URL update to run on every `terraform apply`.
