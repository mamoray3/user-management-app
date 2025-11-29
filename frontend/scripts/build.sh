#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment...${NC}"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Run this script from the frontend directory.${NC}"
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
npm ci

# Build with open-next
echo -e "${YELLOW}Building with Open-Next...${NC}"
npx open-next build

# Check if build was successful
if [ ! -d ".open-next" ]; then
    echo -e "${RED}Error: Open-Next build failed. .open-next directory not found.${NC}"
    exit 1
fi

echo -e "${GREEN}Build completed successfully!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Navigate to the infra directory: cd ../infra"
echo "2. Initialize Terraform: terraform init"
echo "3. Copy terraform.tfvars.example to terraform.tfvars and fill in values"
echo "4. Plan the deployment: terraform plan"
echo "5. Apply the deployment: terraform apply"
echo ""
echo "After Terraform deploys:"
echo "6. Upload .open-next/assets to S3 bucket"
echo "7. Update Lambda function with .open-next/server-function"
