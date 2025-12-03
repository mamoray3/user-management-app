# User Management Application

A modern, serverless user management application with enterprise SSO, fine-grained S3 access control, and advanced identity federation capabilities. Built with Next.js, AWS Lambda, DynamoDB, and AWS Identity Center.

## 🌟 Key Features

- **Enterprise SSO**: Multi-layer authentication (Entra ID → AWS Identity Center → Cognito)
- **Fine-Grained S3 Access**: S3 Access Grants with per-user folders
- **IDC OIDC Token Exchange**: Preserves Identity Center identity through to S3
- **User Management**: Full CRUD operations with approval workflow
- **Role-Based Access Control**: Admin, Data Owner, Process Owner, Viewer roles
- **Serverless Architecture**: Fully serverless on AWS with global CDN
- **Modern Frontend**: Next.js 14 with SSR via Lambda@Edge

## 📐 Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Authentication Flow                        │
│                                                               │
│  User → CloudFront → Cognito → IDC → Entra ID/Okta          │
│                         ↓                                     │
│                   IDC OIDC Token                             │
│                         ↓                                     │
│            STS AssumeRoleWithWebIdentity                     │
│                         ↓                                     │
│         AWS Credentials (IDC identity preserved)             │
│                         ↓                                     │
│              S3 Access Grants (per-user access)              │
└──────────────────────────────────────────────────────────────┘
```

### Components

- **Frontend**: Next.js 14 (App Router) with SSR via CloudFront + Lambda@Edge
- **Backend**: Python Lambda functions behind API Gateway
- **Database**: DynamoDB with GSIs for efficient queries
- **Storage**: S3 with Access Grants for fine-grained control
- **Authentication**: Cognito + AWS Identity Center + External IdP
- **CDN**: CloudFront with custom domain support
- **Infrastructure**: Terraform for IaC

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Python 3.12+
- AWS CLI configured
- Terraform 1.0+
- AWS Identity Center configured with external IdP (Entra ID, Okta, etc.)

### 1. Setup Guide

Follow the comprehensive setup guide:

📖 **[Quick Start: IDC OIDC Setup](./docs/QUICK_START_IDC_OIDC.md)**

This guide walks you through:
1. Creating IDC SAML application
2. Configuring attribute mappings
3. Setting up Terraform
4. Deploying infrastructure
5. Testing the application

### 2. Deploy Infrastructure

```bash
cd infra/core

# Copy and edit configuration
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# Initialize and deploy
terraform init
terraform plan
terraform apply
```

### 3. Local Development

```bash
cd frontend

# Setup environment
cp .env.example .env.local
# Edit .env.local with your values

# Install dependencies
npm install

# Run development server
npm run dev
```

## 📚 Documentation

### Main Documentation

| Document | Description |
|----------|-------------|
| **[Documentation Index](./docs/README.md)** | Complete documentation catalog |
| [Architecture](./docs/ARCHITECTURE.md) | System architecture and design |
| [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md) | How to deploy to AWS |
| [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md) | Configuration guide |

### Advanced Topics

| Document | Description |
|----------|-------------|
| [IDC OIDC Token Exchange](./docs/IDC_OIDC_TOKEN_EXCHANGE.md) | Advanced identity federation |
| [Troubleshooting](./docs/troubleshooting/) | Debug and verify guides |

## 🔑 Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 + React | Modern web framework with SSR |
| Auth Client | NextAuth.js | Session management |
| Styling | Tailwind CSS | Utility-first CSS framework |
| Backend | Python 3.12 | Lambda functions |
| API | AWS API Gateway | RESTful API endpoints |
| Database | DynamoDB | NoSQL user data store |
| Storage | S3 + Access Grants | File storage with fine-grained access |
| CDN | CloudFront | Global content delivery |
| Auth | Cognito + Identity Center | Multi-layer authentication |
| IaC | Terraform | Infrastructure as code |
| Monitoring | CloudWatch + X-Ray | Logs, metrics, and tracing |

## 🏗️ Project Structure

```
user-management-app/
├── docs/                       # 📖 Documentation
│   ├── README.md              # Documentation index
│   ├── ARCHITECTURE.md        # System architecture
│   ├── QUICK_START_IDC_OIDC.md # Setup guide
│   ├── DEPLOYMENT_GUIDE.md    # Deployment procedures
│   ├── ENVIRONMENT_VARIABLES.md # Configuration guide
│   ├── troubleshooting/       # Debug guides
│   └── archive/               # Historical docs
│
├── frontend/                   # Next.js Application
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   │   ├── api/           # API routes
│   │   │   ├── login/         # Login page
│   │   │   ├── users/         # User management
│   │   │   └── files/         # File browser
│   │   ├── components/        # React components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Utilities
│   ├── scripts/               # Build and deploy scripts
│   ├── .env.example           # Environment template
│   └── package.json
│
├── backend/                    # Python Lambda Functions
│   ├── handlers/              # Lambda function code
│   ├── requirements.txt       # Python dependencies
│   └── README.md
│
└── infra/                     # Terraform Infrastructure
    ├── core/                  # Core infrastructure
    │   ├── cognito.tf         # Cognito User Pool + SAML
    │   ├── dynamodb.tf        # Users table
    │   ├── s3.tf              # Static assets bucket
    │   ├── s3_access_grants.tf # User data bucket + grants
    │   ├── idc_oidc.tf        # OIDC provider + token exchange
    │   ├── iam.tf             # IAM roles
    │   ├── variables.tf       # Input variables
    │   ├── outputs.tf         # Exported values
    │   └── terraform.tfvars   # Configuration (gitignored)
    └── app/                   # App deployment (planned)
```

## 🔐 Security Features

- **Multi-Factor Authentication**: Enforced via external IdP
- **End-to-End Encryption**: TLS 1.2+ for all communications
- **Data Encryption at Rest**: S3 and DynamoDB server-side encryption
- **Fine-Grained Access Control**: S3 Access Grants with DIRECTORY_USER/GROUP
- **Identity Preservation**: IDC user identity tracked to S3 operations
- **Audit Logging**: CloudTrail logs show actual IDC user, not generic role
- **Security Headers**: Comprehensive HTTP security headers
- **Network Security**: CloudFront WAF integration ready

## 📊 API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users` | List all users | Required |
| GET | `/api/users/{id}` | Get user details | Required |
| POST | `/api/users` | Create new user | Admin |
| PUT | `/api/users/{id}` | Update user | Admin |
| DELETE | `/api/users/{id}` | Delete user | Admin |
| POST | `/api/users/{id}/approve` | Approve pending user | Admin |
| GET | `/api/s3/credentials` | Get S3 credentials | Required |
| GET | `/api/health` | Health check | None |

## 💾 User Data Schema

```typescript
{
  userId: string;           // Primary key (UUID)
  email: string;            // GSI for lookups
  firstName: string;
  lastName: string;
  role: 'admin' | 'data_owner' | 'process_owner' | 'viewer';
  status: 'pending' | 'approved' | 'suspended';
  createdAt: string;        // ISO8601 timestamp
  updatedAt: string;
  lastLogin?: string;
  metadata?: {
    department?: string;
    location?: string;
    customFields?: Record<string, any>;
  };
}
```

## 🎯 Advanced Features

### IDC OIDC Token Exchange

**What it does**: Preserves AWS Identity Center user identity through to S3 Access Grants

**Why it matters**:
- ✅ Enables `DIRECTORY_USER` grants (per-user S3 folders)
- ✅ Enables `DIRECTORY_GROUP` grants (group-based access)
- ✅ CloudTrail shows actual IDC user, not generic IAM role
- ✅ Simplified credential management

**How it works**:
1. User authenticates via IDC (gets IDC OIDC token)
2. Token passed through SAML to Cognito
3. Application extracts token from session
4. STS `AssumeRoleWithWebIdentity` with IDC token
5. Receives AWS credentials with IDC context
6. S3 Access Grants recognizes IDC user

See [IDC OIDC Token Exchange](./docs/IDC_OIDC_TOKEN_EXCHANGE.md) for details.

### S3 Access Grants

**Structure**:
```
s3://user-data-bucket/
├── users/
│   ├── {idc-user-id-1}/    # Per-user private folder
│   ├── {idc-user-id-2}/
│   └── ...
└── shared/                  # Shared read-only folder
```

**Grant Types**:
- `DIRECTORY_USER`: IDC User ID → `/users/{user-id}/*` (READWRITE)
- `DIRECTORY_GROUP`: IDC Admin Group → `/*` (full access)
- `IAM`: Cognito role → `/shared/*` (READ)

## 📈 Monitoring & Observability

- **CloudWatch Logs**: All Lambda execution logs
- **CloudWatch Metrics**: Custom metrics and dashboards
- **X-Ray Tracing**: Distributed tracing enabled
- **CloudFront Logs**: Access logs to S3
- **API Gateway Logs**: Request/response logging
- **DynamoDB Metrics**: Read/write capacity tracking

## 💰 Cost Optimization

### Free Tier Usage
- Cognito: 50,000 MAUs free
- Lambda: 1M requests/month free
- API Gateway: 1M calls/month free
- DynamoDB: 25 GB storage free

### Cost Drivers
1. CloudFront data transfer (largest cost)
2. Lambda execution time
3. DynamoDB capacity (on-demand)
4. S3 storage and requests

### Optimization Strategies
- Aggressive CloudFront caching
- DynamoDB single-table design
- S3 Intelligent-Tiering for long-term storage
- Right-sized Lambda memory allocation

## 🐛 Troubleshooting

### Common Issues

**1. SAML Authentication Fails**
- See [Debug SAML Guide](./docs/troubleshooting/debug-saml.md)
- Verify IDC application configuration
- Check attribute mappings (especially `accessToken`)

**2. S3 Access Grants Not Working**
- Verify `identity_center_arn` in `terraform.tfvars`
- Check grant's `grantee_identifier` matches IDC User ID
- Confirm using IDC OIDC method (not Cognito Identity Pool)

**3. Environment Variables Not Set**
- See [Environment Variables Guide](./docs/ENVIRONMENT_VARIABLES.md)
- Check Lambda environment variables in AWS Console
- For local dev, use `.env.local` not `.env`

**4. Deployment Failures**
- Review [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md)
- Check Terraform plan output carefully
- Verify AWS credentials and permissions

### Where to Get Help

- **Setup Questions**: [Quick Start Guide](./docs/QUICK_START_IDC_OIDC.md)
- **Architecture Questions**: [Architecture Docs](./docs/ARCHITECTURE.md)
- **Debugging**: [Troubleshooting Guides](./docs/troubleshooting/)
- **Configuration**: [Environment Variables](./docs/ENVIRONMENT_VARIABLES.md)

## 🔄 Deployment Workflow

```bash
# 1. Update infrastructure configuration
cd infra/core
vim terraform.tfvars

# 2. Apply infrastructure changes
terraform plan
terraform apply

# 3. Build frontend
cd ../../frontend
npm run build

# 4. Deploy application
./scripts/deploy.sh

# 5. Verify deployment
curl https://your-domain.com/api/health
```

## 🧪 Testing

### Local Testing
```bash
# Run frontend
cd frontend
npm run dev

# Test authentication flow
# Test user management
# Test file browser
```

### Integration Testing
- Verify SAML authentication
- Test S3 credential exchange
- Validate S3 Access Grants
- Check user approval workflow

## 📝 Environment Configuration

### Local Development (`.env.local`)
```bash
# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# Cognito
COGNITO_CLIENT_ID=xxx
COGNITO_CLIENT_SECRET=xxx
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/xxx

# IDC OIDC Token Exchange
IDC_TOKEN_EXCHANGE_ROLE_ARN=arn:aws:iam::xxx:role/xxx

# S3 Access
S3_USER_DATA_BUCKET=xxx
S3_ACCESS_GRANTS_INSTANCE_ARN=arn:aws:s3:xxx
AWS_REGION=us-east-1
```

### AWS Deployment (Terraform)
See [Environment Variables Guide](./docs/ENVIRONMENT_VARIABLES.md) for complete reference.

## 🤝 Contributing

1. Read the [Architecture Documentation](./docs/ARCHITECTURE.md)
2. Set up local development environment
3. Make changes and test locally
4. Update documentation as needed
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Quick Links

- [📖 Full Documentation](./docs/README.md)
- [🏗️ Architecture Guide](./docs/ARCHITECTURE.md)
- [🚀 Quick Start](./docs/QUICK_START_IDC_OIDC.md)
- [🐛 Troubleshooting](./docs/troubleshooting/)

---

**Need help getting started?** Check out the [Quick Start Guide](./docs/QUICK_START_IDC_OIDC.md) for step-by-step instructions.
