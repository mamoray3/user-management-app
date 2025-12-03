# User Management Application Architecture

## Overview

This is a modern, serverless user management application built on AWS with advanced identity federation and fine-grained access control capabilities.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER AUTHENTICATION FLOW                         │
│                                                                          │
│  User Browser                                                            │
│       ↓                                                                  │
│  CloudFront (Next.js SSR)                                               │
│       ↓                                                                  │
│  Cognito User Pool ←─(SAML)─→ AWS Identity Center ←→ Entra ID/Okta     │
│       ↓                                                                  │
│  NextAuth Session                                                        │
│       ↓                                                                  │
│  IDC OIDC Token Exchange (STS AssumeRoleWithWebIdentity)                │
│       ↓                                                                  │
│  AWS Credentials (with IDC identity preserved)                          │
│       ↓                                                                  │
│  S3 Access Grants → Per-user S3 access                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Frontend Layer

**Technology**: Next.js 14 with App Router (SSR via Lambda@Edge)

**Components**:
- **CloudFront Distribution**: CDN with Lambda@Edge for SSR
- **S3 Static Assets**: Frontend build artifacts
- **Next.js Application**: React-based UI

**Key Features**:
- Server-side rendering for improved SEO and performance
- NextAuth for authentication management
- React components for user management and file browsing

### 2. Authentication & Authorization Layer

**Multi-layered authentication**:

```
┌──────────────────────────────────────────────────────────────────┐
│                    Authentication Layers                          │
│                                                                   │
│  Layer 1: External IdP (Entra ID/Okta)                          │
│       ↓                                                           │
│  Layer 2: AWS Identity Center (IDC)                             │
│       ↓ (SAML)                                                   │
│  Layer 3: Cognito User Pool                                      │
│       ↓ (OIDC)                                                   │
│  Layer 4: NextAuth Session                                       │
│       ↓                                                           │
│  Layer 5: IDC OIDC Token → AWS STS Credentials                  │
└──────────────────────────────────────────────────────────────────┘
```

**Components**:

- **External Identity Provider**: Entra ID, Okta, or other SAML 2.0 provider
- **AWS Identity Center (IDC)**: Enterprise SSO with SAML federation
- **Cognito User Pool**: OIDC token issuer for application
- **Cognito Identity Pool**: Legacy fallback for AWS credentials
- **NextAuth**: Session management library
- **IAM OIDC Provider**: Trusts IDC for AssumeRoleWithWebIdentity
- **IAM Roles**: Token exchange role with S3 Access Grants permissions

**Authentication Flow**:

1. User accesses application → Redirected to Cognito hosted UI
2. Cognito redirects to IDC SAML endpoint
3. IDC authenticates via external IdP (Entra ID)
4. IDC sends SAML assertion to Cognito with attributes:
   - Standard: email, firstName, lastName
   - **Critical**: `accessToken` = IDC OIDC access token
   - Subject = IDC User ID
5. Cognito creates user session and returns OIDC tokens
6. NextAuth stores session including `idcAccessToken`
7. Application exchanges IDC token for AWS credentials via STS
8. AWS credentials preserve IDC identity for S3 Access Grants

### 3. Backend API Layer

**Technology**: Python Lambda functions

**Components**:
- **API Gateway**: RESTful API endpoints
- **Lambda Functions**:
  - User CRUD operations
  - User approval workflow
  - Admin functions

**API Endpoints**:
- `GET /users` - List all users
- `GET /users/{id}` - Get user details
- `POST /users` - Create new user
- `PUT /users/{id}` - Update user
- `DELETE /users/{id}` - Delete user
- `POST /users/{id}/approve` - Approve pending user

### 4. Data Layer

**DynamoDB Table**: `user-management-users-{env}`

**Schema**:
```json
{
  "userId": "string (partition key)",
  "email": "string (GSI)",
  "firstName": "string",
  "lastName": "string",
  "role": "admin | data_owner | process_owner | viewer",
  "status": "pending | approved | suspended",
  "createdAt": "ISO8601 timestamp",
  "updatedAt": "ISO8601 timestamp",
  "lastLogin": "ISO8601 timestamp",
  "metadata": {
    "department": "string",
    "location": "string",
    "custom_fields": {}
  }
}
```

**Indexes**:
- Primary: `userId` (partition key)
- GSI: `email-index` for email lookups
- GSI: `status-index` for filtering by status
- GSI: `role-index` for role-based queries

### 5. Storage Layer

**S3 Buckets**:

1. **Static Assets Bucket**: `{project}-static-{env}-{random}`
   - Frontend build artifacts
   - Public read access via CloudFront OAC
   - Versioning enabled

2. **User Data Bucket**: `{project}-user-data-{env}-{random}`
   - User-specific files with prefix structure
   - S3 Access Grants for fine-grained access control
   - Structure:
     ```
     /users/{idc-user-id}/     # Per-user private folders
     /shared/                   # Shared read-only folder
     ```

**S3 Access Grants**:

```
┌────────────────────────────────────────────────────────────┐
│              S3 Access Grants Architecture                 │
│                                                             │
│  Access Grants Instance                                    │
│    ↓ (linked to IDC via identity_center_arn)              │
│  Access Grants Location                                    │
│    ↓ (s3://{bucket}/*)                                     │
│  Access Grants:                                            │
│    - DIRECTORY_USER grants (per-user folders)             │
│    - DIRECTORY_GROUP grants (admin full access)           │
│    - IAM grants (fallback for shared resources)           │
└────────────────────────────────────────────────────────────┘
```

**Grant Types**:
- **DIRECTORY_USER**: IDC User ID → `/users/{idc-user-id}/*` (READWRITE)
- **DIRECTORY_GROUP**: IDC Group ID → `/*` (admin full access)
- **IAM**: Cognito authenticated role → `/shared/*` (READ)

## Advanced Features

### 1. IDC OIDC Token Exchange

**Purpose**: Preserve IDC identity through to S3 Access Grants

**How it works**:

```
Traditional (Cognito Identity Pool):
  Cognito Token → Identity Pool → Generic AWS Credentials
  Problem: S3 Access Grants sees IAM role, not IDC user

Enhanced (IDC OIDC Token Exchange):
  IDC Token → STS AssumeRoleWithWebIdentity → AWS Credentials with IDC context
  Result: S3 Access Grants sees actual IDC User ID
```

**Implementation**:
- IDC SAML attribute mapping captures `${session:access_token}`
- Cognito stores as custom attribute `idc_access_token`
- Application extracts token from NextAuth session
- STS `AssumeRoleWithWebIdentity` with IDC token
- Receives credentials that S3 Access Grants recognizes

**Benefits**:
- ✅ DIRECTORY_USER grants work (per-user S3 access)
- ✅ DIRECTORY_GROUP grants work (group-based access)
- ✅ Audit trail shows actual IDC user in CloudTrail
- ✅ Simplified credential flow
- ✅ Better security posture

### 2. Role-Based Access Control (RBAC)

**Roles**:
- **admin**: Full access to all features
- **data_owner**: Manage users and data within department
- **process_owner**: Read/write access to specific processes
- **viewer**: Read-only access

**Implementation**:
- Roles stored in DynamoDB user records
- IDC groups mapped to roles via Terraform variables:
  ```hcl
  role_mapping_admin = "IDC-Admins"
  role_mapping_data_owner = "IDC-DataOwners"
  ```
- Frontend checks roles via NextAuth session
- Backend validates roles on API requests

### 3. User Approval Workflow

**Flow**:
1. New user registers → Status: `pending`
2. Admin reviews user details
3. Admin approves → Status: `approved`
4. S3 Access Grant created for user (Lambda trigger)
5. User gains S3 access to personal folder

**Automation**:
- Lambda function triggers on DynamoDB Stream
- Creates S3 Access Grant when user approved
- Grant: `DIRECTORY_USER` → `/users/{idc-user-id}/*`

## Infrastructure as Code

**Technology**: Terraform

**Structure**:
```
infra/
├── core/                    # Main infrastructure
│   ├── cognito.tf          # User Pool, Identity Pool, SAML
│   ├── dynamodb.tf         # Users table
│   ├── s3.tf               # Static assets bucket
│   ├── s3_access_grants.tf # User data bucket + grants
│   ├── idc_oidc.tf         # OIDC provider + token exchange role
│   ├── iam.tf              # Lambda execution roles
│   ├── variables.tf        # Input variables
│   ├── outputs.tf          # Export values
│   └── terraform.tfvars    # Configuration values
└── app/                     # App deployment (planned)
```

**Key Resources**:
- `aws_cognito_user_pool` - Authentication
- `aws_cognito_identity_provider` - IDC SAML integration
- `aws_iam_openid_connect_provider` - IDC OIDC provider
- `aws_iam_role` - Token exchange role
- `aws_s3control_access_grants_instance` - S3 Access Grants
- `aws_dynamodb_table` - User data store
- `aws_cloudfront_distribution` - CDN

## Security Features

### 1. Multi-Factor Authentication (MFA)
- Configured in external IdP (Entra ID/Okta)
- Enforced before reaching application

### 2. Encryption
- **At Rest**:
  - S3: AES-256 server-side encryption
  - DynamoDB: AWS-managed encryption
- **In Transit**: TLS 1.2+ for all connections

### 3. Access Control
- **S3**: Access Grants with DIRECTORY_USER/GROUP types
- **DynamoDB**: IAM role-based access
- **API**: Cognito token validation on all endpoints

### 4. Audit & Compliance
- **CloudTrail**: All API calls logged with IDC user identity
- **CloudWatch Logs**: Application and Lambda logs
- **DynamoDB**: createdAt, updatedAt timestamps
- **S3**: Access logs and versioning

### 5. Network Security
- **CloudFront**: WAF integration capability
- **API Gateway**: Throttling and request validation
- **Lambda**: VPC integration capability (optional)

## Deployment Architecture

### Local Development
```
Developer Machine
├── Frontend: localhost:3000 (Next.js dev server)
├── Backend: AWS Lambda (deployed)
├── Auth: Cognito + IDC (AWS)
└── Data: DynamoDB + S3 (AWS)
```

### AWS Production
```
CloudFront Distribution
├── Lambda@Edge (Next.js SSR)
├── S3 Origin (static assets)
└── API Gateway Origin (backend API)
    └── Lambda Functions (Python)
        ├── DynamoDB
        └── S3 (via Access Grants)
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 | React framework with SSR |
| UI Library | React | Component library |
| Auth Client | NextAuth | Session management |
| Styling | Tailwind CSS | Utility-first CSS |
| Backend | Python 3.12 | Lambda runtime |
| API | AWS API Gateway | RESTful API |
| Database | DynamoDB | NoSQL user data |
| Storage | S3 | File storage |
| CDN | CloudFront | Global content delivery |
| Auth | Cognito + IDC | Multi-layer authentication |
| IaC | Terraform | Infrastructure provisioning |
| Monitoring | CloudWatch | Logs and metrics |

## Scalability Considerations

### Auto-Scaling Components
- **Lambda**: Automatic based on requests
- **DynamoDB**: On-demand capacity mode
- **CloudFront**: Global edge network
- **API Gateway**: Unlimited concurrent requests

### Performance Optimizations
- **CloudFront**: Edge caching with custom TTLs
- **S3**: Transfer acceleration capability
- **DynamoDB**: GSIs for efficient queries
- **Lambda**: Provisioned concurrency (optional)

## Cost Optimization

### Free Tier Usage
- Cognito: 50,000 MAUs
- Lambda: 1M requests/month
- API Gateway: 1M calls/month
- DynamoDB: 25 GB storage

### Cost Drivers
1. CloudFront data transfer
2. Lambda execution time
3. DynamoDB read/write capacity
4. S3 storage and requests

### Optimization Strategies
- Use CloudFront caching aggressively
- Implement DynamoDB single-table design
- Use S3 Intelligent-Tiering
- Right-size Lambda memory

## Monitoring & Observability

### Metrics
- **CloudWatch Dashboards**: Application health
- **Lambda Insights**: Function performance
- **X-Ray**: Distributed tracing (enabled)
- **CloudFront Metrics**: CDN performance

### Alerts
- Lambda errors > threshold
- API Gateway 4xx/5xx rates
- DynamoDB throttling events
- S3 Access Grants denials

### Logging
- **Application Logs**: CloudWatch Logs
- **Access Logs**: S3 and CloudFront
- **API Logs**: API Gateway execution logs
- **Auth Logs**: Cognito sign-in logs

## Disaster Recovery

### Backup Strategy
- **DynamoDB**: Point-in-time recovery enabled
- **S3**: Versioning enabled on user data bucket
- **Infrastructure**: Terraform state in version control

### RTO/RPO Targets
- **RTO**: < 1 hour (re-deploy via Terraform)
- **RPO**: < 24 hours (DynamoDB PITR)

## Future Enhancements

### Planned Features
1. **Multi-region deployment** for DR
2. **Advanced S3 lifecycle policies** for cost optimization
3. **GraphQL API** with AppSync
4. **Real-time notifications** with EventBridge
5. **Advanced analytics** with Athena/QuickSight
6. **Automated S3 grant management** via Lambda

### Technical Debt
1. Migrate Cognito Identity Pool to pure IDC OIDC
2. Implement comprehensive integration tests
3. Add frontend unit tests
4. Optimize Lambda cold starts
5. Implement caching layer (ElastiCache)

## References

- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Environment Variables Guide](./ENVIRONMENT_VARIABLES.md)
- [IDC OIDC Token Exchange Architecture](./IDC_OIDC_TOKEN_EXCHANGE.md)
- [Quick Start: IDC OIDC Setup](./QUICK_START_IDC_OIDC.md)
- [Troubleshooting Guides](./troubleshooting/)
