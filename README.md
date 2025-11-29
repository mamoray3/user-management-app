# User Management Application

A serverless user management application built with Next.js and deployed on AWS using CloudFront, Lambda, API Gateway, and DynamoDB.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                   Users                                      │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
                                          ▼
                              ┌───────────────────────┐
                              │     CloudFront        │
                              │  (CDN + HTTPS)        │
                              └───────────┬───────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
          ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
          │   S3 Bucket     │   │  Lambda (SSR)   │   │  API Gateway    │
          │ Static Assets   │   │   Next.js       │   │    (REST)       │
          └─────────────────┘   └─────────────────┘   └────────┬────────┘
                                                               │
                                                    ┌──────────┼──────────┐
                                                    │          │          │
                                                    ▼          ▼          ▼
                                            ┌──────────┐ ┌──────────┐ ┌──────────┐
                                            │ Lambda   │ │ Lambda   │ │ DynamoDB │
                                            │Authorizer│ │   API    │ │  Users   │
                                            └──────────┘ └──────────┘ └──────────┘
```

## Features

- **SSO Authentication**: AWS Identity Center SAML2 integration via NextAuth.js
- **User Management CRUD**: Create, Read, Update, Delete users
- **Role-Based Access Control**: Admin and User roles
- **User Approval Workflow**: Admins can approve pending users
- **Serverless Architecture**: Fully serverless on AWS
- **SSR Support**: Server-side rendering with Next.js via Open-Next

## Project Structure

```
user-management-app/
├── frontend/                 # Next.js application
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # React components
│   │   └── lib/             # Utilities and API client
│   ├── scripts/             # Build and deploy scripts
│   └── open-next.config.js  # Open-Next configuration
├── backend/                  # Python Lambda functions
│   └── handlers/            # Lambda handlers
└── infra/                   # Terraform infrastructure
    ├── main.tf
    ├── cloudfront.tf
    ├── lambda.tf
    ├── api_gateway.tf
    ├── dynamodb.tf
    └── s3.tf
```

## Prerequisites

- Node.js 18+ and npm
- Python 3.11+
- AWS CLI configured with appropriate credentials
- Terraform 1.0+
- AWS Identity Center SAML application configured

## Quick Start

### 1. Configure AWS Identity Center

1. Create a SAML 2.0 application in AWS Identity Center
2. Note down the following values:
   - SAML Issuer URL
   - SAML Entry Point URL
   - Client ID and Client Secret

### 2. Setup Environment Variables

```bash
cd frontend
cp .env.example .env
# Edit .env with your configuration
```

### 3. Install Dependencies

```bash
# Frontend
cd frontend
npm install

# Backend (for local testing)
cd ../backend
pip install -r requirements.txt
```

### 4. Local Development

```bash
cd frontend
npm run dev
```

### 5. Deploy Infrastructure

```bash
cd infra

# Initialize Terraform
terraform init

# Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Plan deployment
terraform plan

# Apply infrastructure
terraform apply
```

### 6. Build and Deploy Application

```bash
cd frontend

# Build with Open-Next
chmod +x scripts/build.sh scripts/deploy.sh
./scripts/build.sh

# Deploy to AWS
./scripts/deploy.sh
```

## Environment Variables

### Frontend (.env)

| Variable             | Description                               |
| -------------------- | ----------------------------------------- |
| `NEXTAUTH_URL`       | Full URL of your application              |
| `NEXTAUTH_SECRET`    | Secret for NextAuth.js session encryption |
| `SAML_ISSUER`        | AWS Identity Center issuer URL            |
| `SAML_ENTRY_POINT`   | SAML SSO endpoint URL                     |
| `SAML_CLIENT_ID`     | SAML application client ID                |
| `SAML_CLIENT_SECRET` | SAML application client secret            |
| `API_BASE_URL`       | API Gateway URL                           |

### Backend (Lambda Environment)

| Variable           | Description                             |
| ------------------ | --------------------------------------- |
| `USERS_TABLE_NAME` | DynamoDB table name                     |
| `NEXTAUTH_SECRET`  | Secret for token validation             |
| `ALLOWED_ISSUERS`  | Comma-separated list of allowed issuers |

## API Endpoints

| Method | Endpoint                | Description          | Auth     |
| ------ | ----------------------- | -------------------- | -------- |
| GET    | `/users`                | List all users       | Required |
| GET    | `/users?status=pending` | List users by status | Required |
| POST   | `/users`                | Create new user      | Admin    |
| GET    | `/users/{id}`           | Get user by ID       | Required |
| PUT    | `/users/{id}`           | Update user          | Admin    |
| DELETE | `/users/{id}`           | Delete user          | Admin    |
| POST   | `/users/{id}/approve`   | Approve pending user | Admin    |
| GET    | `/health`               | Health check         | None     |

## User Schema

```json
{
  "id": "uuid",
  "name": "string",
  "email": "string",
  "role": "admin | user",
  "status": "pending | active | inactive",
  "department": "string",
  "phone": "string",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "approvedBy": "string (email)",
  "approvedAt": "ISO 8601 timestamp"
}
```

## Security Features

- **HTTPS Only**: All traffic encrypted via CloudFront
- **SAML2 Authentication**: Enterprise SSO via AWS Identity Center
- **JWT Token Validation**: API Gateway authorizer validates tokens
- **Role-Based Access Control**: Admin-only operations protected
- **DynamoDB Encryption**: Server-side encryption enabled
- **S3 Bucket Protection**: No public access, OAC only
- **Security Headers**: X-Frame-Options, X-Content-Type-Options, etc.

## Monitoring

- **CloudWatch Logs**: All Lambda functions log to CloudWatch
- **X-Ray Tracing**: Enabled for API Lambda function
- **API Gateway Access Logs**: Request/response logging

## Cost Optimization

- **Pay-per-request DynamoDB**: No provisioned capacity charges
- **Lambda**: Pay only for execution time
- **CloudFront PriceClass_100**: Uses only North America and Europe edge locations

## Troubleshooting

### Common Issues

1. **Authentication Errors**

   - Verify SAML configuration in AWS Identity Center
   - Check NEXTAUTH_SECRET matches in frontend and authorizer

2. **CORS Errors**

   - Ensure CloudFront domain is in API Gateway CORS origins
   - Check API Gateway stage settings

3. **Lambda Cold Starts**

   - Consider enabling provisioned concurrency for production
   - Use Lambda warmer function

4. **Build Failures**
   - Ensure Node.js 18+ is installed
   - Clear `.next` and `.open-next` directories

## License

MIT License
