#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
INFRA_DIR="$(dirname "$FRONTEND_DIR")/infra"

# Check for required tools
command -v aws >/dev/null 2>&1 || { echo -e "${RED}AWS CLI is required but not installed.${NC}" >&2; exit 1; }
command -v terraform >/dev/null 2>&1 || { echo -e "${RED}Terraform is required but not installed.${NC}" >&2; exit 1; }

# Get Terraform outputs
cd "$INFRA_DIR"

echo -e "${YELLOW}Getting Terraform outputs...${NC}"
S3_BUCKET=$(terraform output -raw s3_bucket_name 2>/dev/null || echo "")
LAMBDA_FUNCTION=$(terraform output -raw lambda_function_name 2>/dev/null || echo "")
CLOUDFRONT_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

if [ -z "$S3_BUCKET" ] || [ -z "$LAMBDA_FUNCTION" ]; then
    echo -e "${RED}Error: Could not get Terraform outputs. Make sure infrastructure is deployed.${NC}"
    exit 1
fi

cd "$FRONTEND_DIR"

# Check if build exists
if [ ! -d ".open-next" ]; then
    echo -e "${RED}Error: .open-next directory not found. Run build.sh first.${NC}"
    exit 1
fi

# Upload static assets to S3
echo -e "${YELLOW}Uploading static assets to S3...${NC}"
aws s3 sync .open-next/assets "s3://${S3_BUCKET}/" --delete

# Upload cache assets
if [ -d ".open-next/cache" ]; then
    echo -e "${YELLOW}Uploading cache assets to S3...${NC}"
    aws s3 sync .open-next/cache "s3://${S3_BUCKET}/_next/cache/" --delete
fi

# Package and update Lambda function
echo -e "${YELLOW}Packaging Lambda function...${NC}"
cd .open-next/server-functions/default

# Remove .env file to prevent it from overriding Lambda environment variables
# Next.js reads .env files before environment variables, so bundled .env would override Lambda config
if [ -f ".env" ]; then
    echo -e "${YELLOW}Removing bundled .env file (Lambda env vars will be used instead)...${NC}"
    rm -f .env
fi

zip -r ../../../lambda-server.zip . -x "*.git*" -x "*.DS_Store"
cd "$FRONTEND_DIR"

echo -e "${YELLOW}Updating Lambda function...${NC}"
aws lambda update-function-code \
    --function-name "user-management-server-dev" \
    --zip-file fileb://lambda-server.zip \
    --publish \
    --no-cli-pager > /dev/null

# Wait for Lambda update to complete (with timeout)
echo -e "${YELLOW}Waiting for Lambda update to complete...${NC}"
for i in {1..30}; do
    STATUS=$(aws lambda get-function --function-name "user-management-server-dev" --query 'Configuration.LastUpdateStatus' --output text --no-cli-pager 2>/dev/null)
    if [ "$STATUS" = "Successful" ]; then
        echo -e "${GREEN}Lambda update completed.${NC}"
        break
    elif [ "$STATUS" = "Failed" ]; then
        echo -e "${RED}Lambda update failed.${NC}"
        exit 1
    fi
    sleep 2
done

# Invalidate CloudFront cache
if [ -n "$CLOUDFRONT_ID" ]; then
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_ID" \
        --paths "/*" \
        --no-cli-pager > /dev/null
    echo -e "${GREEN}CloudFront invalidation started.${NC}"
fi

# Cleanup
rm -f lambda-server.zip

echo -e "${GREEN}Deployment completed successfully!${NC}"

# Print the URL
CLOUDFRONT_URL=$(terraform -chdir="$INFRA_DIR" output -raw frontend_url 2>/dev/null || echo "")
if [ -n "$CLOUDFRONT_URL" ]; then
    echo -e "${GREEN}Application URL: ${CLOUDFRONT_URL}${NC}"
fi
