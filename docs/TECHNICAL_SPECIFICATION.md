# User Management Application - Technical Specification

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Folder Structure](#3-folder-structure)
4. [Frontend Application](#4-frontend-application)
5. [Backend Application](#5-backend-application)
6. [Infrastructure (Terraform)](#6-infrastructure-terraform)
7. [Request Process Flow](#7-request-process-flow)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Deployment Process](#9-deployment-process)
10. [Deployment Dependencies](#10-deployment-dependencies)
11. [Environment Variables](#11-environment-variables)
12. [Security Considerations](#12-security-considerations)

---

## 1. Project Overview

The User Management Application is a serverless web application built on AWS that provides:

- **User Management**: Create, Read, Update, Delete (CRUD) operations for users
- **SAML-based SSO**: Integration with AWS Identity Center for authentication
- **Role-Based Access Control (RBAC)**: Five-tier permission system
- **Server-Side Rendering**: Next.js with Open-Next for optimal performance

### Technology Stack

| Layer          | Technology                            |
| -------------- | ------------------------------------- |
| Frontend       | Next.js 14, React, TailwindCSS        |
| Authentication | NextAuth.js with custom SAML provider |
| Backend        | Python 3.11, AWS Lambda Powertools    |
| Database       | Amazon DynamoDB                       |
| Infrastructure | Terraform                             |
| CDN            | Amazon CloudFront                     |
| API            | Amazon API Gateway HTTP API           |
| SSR Runtime    | Lambda Function URL (via Open-Next)   |

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                    USERS                                         │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           AWS Identity Center                                    │
│                              (SAML 2.0 IdP)                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │ Attribute Mappings:                                                       │   │
│  │   Subject → ${user:email}     role → ${user:groups}                      │   │
│  │   firstName → ${user:givenName}    lastName → ${user:familyName}         │   │
│  │   email → ${user:email}       userguid → ${user:subject}                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │ SAML Response
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CloudFront Distribution                             │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │ CloudFront Function: add-host-header                                      │  │
│  │   → Adds x-forwarded-host header for SSR                                  │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  Behaviors:                                                                      │
│  ├── Default (*) ──────────────────────► Lambda Function URL (SSR)              │
│  ├── /_next/static/* ──────────────────► S3 Bucket (static assets)              │
│  └── /public/* ────────────────────────► S3 Bucket (static assets)              │
└──────────────────┬──────────────────────────────────────────────┬───────────────┘
                   │                                              │
                   ▼                                              ▼
┌──────────────────────────────────┐    ┌─────────────────────────────────────────┐
│   Lambda Function (SSR Server)   │    │         S3 Bucket (Static Assets)       │
│                                  │    │                                          │
│ Environment Variables:           │    │  Contents:                               │
│ - NEXTAUTH_URL                  │    │  - /_next/static/*  (JS, CSS, etc.)      │
│ - NEXTAUTH_SECRET               │    │  - /public/*        (images, fonts)      │
│ - API_BASE_URL                  │    │                                          │
│ - SAML_*                        │    │  Access: CloudFront OAC only             │
│ - ROLE_MAPPING_*                │    │                                          │
└──────────────────────────────────┘    └─────────────────────────────────────────┘
                   │
                   │ API Requests (Bearer JWT)
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway HTTP API                                   │
│                                                                                  │
│  Routes:                                                                         │
│  ├── GET    /users           ─┐                                                 │
│  ├── POST   /users            │                                                 │
│  ├── GET    /users/{id}       ├──► Lambda Authorizer ──► API Lambda            │
│  ├── PUT    /users/{id}       │    (validates JWT)       (handlers.users)       │
│  ├── DELETE /users/{id}       │                                                 │
│  ├── POST   /users/{id}/approve                                                 │
│  └── GET    /health ──────────┴──► (no auth) ────────► API Lambda              │
└─────────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Lambda Functions                                    │
│                                                                                  │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │   Authorizer Lambda         │    │           API Lambda                     │ │
│  │                             │    │                                          │ │
│  │ - Validates JWT tokens      │    │ - CRUD operations for users             │ │
│  │ - Extracts user context     │    │ - Role-based authorization              │ │
│  │ - Returns IAM policy        │    │ - DynamoDB interactions                 │ │
│  │                             │    │                                          │ │
│  │ handlers/authorizer.py      │    │ handlers/users.py                       │ │
│  └─────────────────────────────┘    └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   DynamoDB                                       │
│                                                                                  │
│  Table: user-management-users-{env}                                             │
│                                                                                  │
│  Primary Key: id (String)                                                       │
│  GSI: email-index (email)                                                       │
│  GSI: status-index (status)                                                     │
│                                                                                  │
│  Attributes:                                                                     │
│  - id, name, email, role, status, department, phone                            │
│  - createdAt, updatedAt, lastLogin, approvedBy, approvedAt                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Folder Structure

```
user-management-app/
├── README.md                      # Project documentation
├── docs/                          # Documentation folder
│   └── TECHNICAL_SPECIFICATION.md # This document
│
├── backend/                       # Python Lambda backend
│   ├── build.sh                   # Build script for Lambda package
│   ├── requirements.txt           # Python dependencies
│   ├── generate_test_token.py     # Utility for generating test JWTs
│   ├── test_api.sh               # API testing script
│   ├── lambda_package.zip         # Built Lambda deployment package
│   │
│   ├── handlers/                  # Lambda handler modules
│   │   ├── __init__.py
│   │   ├── authorizer.py          # JWT authorizer for API Gateway
│   │   └── users.py               # User CRUD operations handler
│   │
│   └── build/                     # Dependency build artifacts
│       ├── aws_lambda_powertools/ # Lambda Powertools library
│       ├── boto3/                 # AWS SDK for Python
│       ├── jwt/                   # PyJWT library
│       └── ...                    # Other dependencies
│
├── frontend/                      # Next.js frontend application
│   ├── package.json               # Node.js dependencies
│   ├── next.config.js             # Next.js configuration
│   ├── open-next.config.js        # Open-Next SSR configuration
│   ├── tailwind.config.js         # TailwindCSS configuration
│   ├── postcss.config.mjs         # PostCSS configuration
│   ├── jsconfig.json              # JavaScript path aliases
│   │
│   ├── scripts/                   # Build and deploy scripts
│   │   ├── build.sh               # Frontend build script
│   │   └── deploy.sh              # Deployment script
│   │
│   ├── public/                    # Static public assets
│   │   └── saml-metadata.xml      # SAML SP metadata for IdP setup
│   │
│   └── src/                       # Source code
│       ├── middleware.js          # Next.js middleware (auth + routing)
│       │
│       ├── app/                   # Next.js App Router pages
│       │   ├── layout.jsx         # Root layout with providers
│       │   ├── page.jsx           # Home/Dashboard page
│       │   │
│       │   ├── login/             # Login page
│       │   │   └── page.jsx       # SSO login UI
│       │   │
│       │   ├── users/             # User management pages
│       │   │   ├── page.jsx       # Users list page (server component)
│       │   │   ├── UsersClient.jsx # Users list client component
│       │   │   ├── new/           # Create new user
│       │   │   │   └── page.jsx
│       │   │   └── [id]/          # User detail/edit
│       │   │       ├── page.jsx
│       │   │       └── edit/
│       │   │           └── page.jsx
│       │   │
│       │   └── api/               # API routes
│       │       ├── health/        # Health check endpoint
│       │       │   └── route.js
│       │       ├── users/         # User API proxy routes
│       │       │   ├── route.js
│       │       │   └── [id]/
│       │       │       └── route.js
│       │       └── auth/          # Authentication routes
│       │           ├── [...nextauth]/ # NextAuth handler
│       │           │   └── route.js
│       │           └── saml/      # SAML routes
│       │               ├── login/
│       │               │   └── route.js
│       │               ├── callback/
│       │               │   └── route.js
│       │               └── metadata/
│       │                   └── route.js
│       │
│       ├── components/            # React components
│       │   ├── Header.jsx         # Navigation header
│       │   ├── Providers.jsx      # Context providers wrapper
│       │   └── UserForm.jsx       # User create/edit form
│       │
│       ├── hooks/                 # Custom React hooks
│       │   └── useAuth.js         # Authentication hook
│       │
│       └── lib/                   # Utility libraries
│           ├── api.js             # API client class
│           ├── auth.js            # Auth exports
│           ├── roles.js           # RBAC configuration
│           └── saml.js            # SAML utilities
│
└── infra/                         # Terraform infrastructure
    ├── main.tf                    # Provider and backend config
    ├── variables.tf               # Variable definitions
    ├── terraform.tfvars           # Variable values (gitignored)
    ├── terraform.tfvars.example   # Example variables template
    ├── outputs.tf                 # Output values
    │
    ├── api_gateway.tf             # API Gateway HTTP API
    ├── cloudfront.tf              # CloudFront + Lambda SSR
    ├── dynamodb.tf                # DynamoDB table
    ├── lambda.tf                  # Lambda functions
    └── s3.tf                      # S3 bucket for static assets
```

---

## 4. Frontend Application

### 4.1 Core Files

#### `src/middleware.js`

**Purpose**: Edge middleware for authentication and authorization

**Functionality**:

- Intercepts all requests before they reach the page
- Checks for NextAuth session token
- Redirects unauthenticated users to `/login`
- Enforces page-level permissions based on user roles
- Adds user context headers for API routes

**Key Logic**:

```javascript
// Public paths that don't require authentication
const publicPaths = ["/login", "/api/auth", "/api/health"];

// Permission requirements for protected pages
const PAGE_PERMISSIONS = {
  "/users/new": ["users:create"],
  "/users/[id]/edit": ["users:edit"],
  "/admin": ["admin:access"],
};
```

#### `src/lib/saml.js`

**Purpose**: SAML request/response handling

**Functions**:
| Function | Description |
|----------|-------------|
| `getSAMLConfig()` | Returns SAML configuration from environment |
| `createSAMLRequest()` | Creates deflated, base64-encoded AuthnRequest |
| `validateSAMLResponse()` | Validates SAML response signature and status |
| `parseSAMLAssertion()` | Extracts user attributes from SAML assertion |

**Attribute Extraction**:

```javascript
// Extracted from SAML assertion
userData = {
  email, // From NameID or email attribute
  firstName, // From givenName attribute
  lastName, // From surname/familyName attribute
  name, // Constructed or from name attribute
  groups: [], // From role/groups attribute
  roles: [], // Mapped from groups
  role, // Highest role in hierarchy
  userId, // From userguid attribute
  userguid, // From userguid attribute
};
```

#### `src/lib/roles.js`

**Purpose**: Role-Based Access Control (RBAC) configuration

**Role Hierarchy** (ascending privileges):

```
USER → VIEWER → PROCESS_OWNER → DATA_OWNER → ADMIN
```

**Key Functions**:
| Function | Description |
|----------|-------------|
| `mapGroupToRole(groupValue)` | Maps AWS Identity Center group ID to app role |
| `mapGroupsToRoles(groups)` | Maps multiple groups to roles array |
| `getHighestRole(roles)` | Returns highest role from array |
| `hasPermission(roles, permission)` | Checks if user has specific permission |
| `canAccessPage(roles, pathname)` | Checks page access permission |

**Permission Matrix**:
| Permission | Viewer | Process Owner | Data Owner | Admin |
|------------|--------|---------------|------------|-------|
| users:view | ✓ | ✓ | ✓ | ✓ |
| users:create | | | ✓ | ✓ |
| users:edit | | | ✓ | ✓ |
| users:delete | | | | ✓ |
| users:approve | | | ✓ | ✓ |

#### `src/lib/api.js`

**Purpose**: API client for backend communication

**Class**: `ApiClient`

**Methods**:

```javascript
class ApiClient {
  request(endpoint, options)  // Base request method
  getUsers(filter)            // GET /users
  getUser(id)                 // GET /users/{id}
  createUser(userData)        // POST /users
  updateUser(id, userData)    // PUT /users/{id}
  deleteUser(id)              // DELETE /users/{id}
  approveUser(id, email)      // POST /users/{id}/approve
}
```

### 4.2 Authentication Flow Files

#### `src/app/api/auth/[...nextauth]/route.js`

**Purpose**: NextAuth.js configuration

**Features**:

- Custom SAML credentials provider
- JWT token generation for backend API
- Session management with 24-hour expiry
- Callback handlers for JWT and session enrichment

**Token Structure**:

```javascript
{
  id,           // User ID
  userId,       // Original user ID
  userguid,     // User GUID from Identity Center
  email,
  name,
  role,         // Primary role
  roles: [],    // All roles
  groups: [],   // Raw group IDs
}
```

#### `src/app/api/auth/saml/callback/route.js`

**Purpose**: SAML Assertion Consumer Service (ACS)

**Flow**:

1. Receives POST with SAMLResponse from IdP
2. Validates SAML response signature
3. Parses user attributes from assertion
4. Creates NextAuth session token
5. Sets session cookie
6. Redirects to callback URL

#### `src/app/login/page.jsx`

**Purpose**: Login page with SSO button

**Features**:

- Error message display
- Session check on mount
- Redirect to SAML login endpoint
- Loading state handling

### 4.3 Page Components

#### `src/app/page.jsx` (Home/Dashboard)

- Server component with session check
- Displays welcome message
- Quick access cards (View Users, Add User, Pending)
- User profile summary

#### `src/app/users/page.jsx` (Users List)

- Server component for data fetching
- Uses `session.accessToken` for API calls
- Passes data to `UsersClient` component

#### `src/components/Header.jsx`

- Client component for navigation
- User menu with session info
- Role display
- Sign out functionality

---

## 5. Backend Application

### 5.1 Lambda Handlers

#### `handlers/authorizer.py`

**Purpose**: JWT validation for API Gateway

**Input**: HTTP API v2 Request Event

**Validation Steps**:

1. Extract token from Authorization header
2. Decode without verification to get issuer
3. Verify issuer is in allowed list
4. Validate signature with NEXTAUTH_SECRET
5. Check expiration and issued-at claims

**Response Format**:

```python
{
    'isAuthorized': True/False,
    'principalId': user_id,
    'context': {
        'userId': str,
        'email': str,
        'role': str,
    }
}
```

#### `handlers/users.py`

**Purpose**: User CRUD operations

**Endpoints**:

| Method | Endpoint            | Function           | Auth Required |
| ------ | ------------------- | ------------------ | ------------- |
| GET    | /users              | `get_users()`      | Yes           |
| GET    | /users/{id}         | `get_user(id)`     | Yes           |
| POST   | /users              | `create_user()`    | Admin         |
| PUT    | /users/{id}         | `update_user(id)`  | Admin         |
| DELETE | /users/{id}         | `delete_user(id)`  | Admin         |
| POST   | /users/{id}/approve | `approve_user(id)` | Admin         |
| GET    | /health             | `health_check()`   | No            |

**User Schema**:

```python
{
    'id': str,          # UUID
    'name': str,
    'email': str,
    'role': str,        # user|viewer|process_owner|data_owner|admin
    'status': str,      # pending|active|inactive
    'department': str,
    'phone': str,
    'createdAt': str,   # ISO 8601
    'updatedAt': str,
    'lastLogin': str,
    'approvedBy': str,
    'approvedAt': str,
    'createdBy': str,
    'updatedBy': str,
}
```

### 5.2 Dependencies

**requirements.txt**:

```
aws-lambda-powertools>=2.0.0
boto3>=1.26.0
PyJWT>=2.6.0
aws-xray-sdk>=2.12.0
```

---

## 6. Infrastructure (Terraform)

### 6.1 File Descriptions

#### `main.tf`

- Terraform and provider configuration
- AWS provider with default tags
- S3 backend for state storage

#### `variables.tf`

**Variables**:
| Variable | Description |
|----------|-------------|
| `aws_region` | AWS region (default: us-east-1) |
| `project_name` | Project identifier |
| `environment` | dev/staging/prod |
| `domain_name` | Custom domain (optional) |
| `acm_certificate_arn` | SSL certificate ARN |
| `nextauth_secret` | Session encryption key |
| `saml_issuer` | IdP issuer URL |
| `saml_entry_point` | IdP SSO URL |
| `saml_cert` | IdP X509 certificate |
| `role_mapping_*` | Group ID to role mappings |

#### `cloudfront.tf`

**Resources**:

- CloudFront Distribution
- Origin Access Control (OAC)
- Cache Policies (static, SSR)
- Origin Request Policy
- CloudFront Function (add-host-header)
- Lambda Function URL (SSR server)
- Server Lambda function

#### `lambda.tf`

**Resources**:

- IAM Role for Lambda execution
- API Lambda function (Python 3.11)
- Authorizer Lambda function
- CloudWatch Log Groups
- IAM policies (basic execution, X-Ray, DynamoDB)

#### `api_gateway.tf`

**Resources**:

- HTTP API
- Lambda Authorizer (REQUEST type)
- Lambda Integration
- Routes (6 protected + 1 health)
- API Stage with logging

#### `dynamodb.tf`

**Resources**:

- Users table
- Global Secondary Indexes (email, status)
- Encryption and point-in-time recovery

#### `s3.tf`

**Resources**:

- Static assets bucket
- Bucket policy for CloudFront OAC
- Versioning and encryption

#### `outputs.tf`

**Outputs**:

- `cloudfront_distribution_id`
- `cloudfront_domain_name`
- `frontend_url`
- `api_gateway_url`
- `s3_bucket_name`
- `dynamodb_table_name`
- `lambda_function_name`

---

## 7. Request Process Flow

### 7.1 Initial Page Load Flow

```
┌─────────┐     ┌──────────┐     ┌────────────────┐     ┌─────────────────┐
│ Browser │ ──► │CloudFront│ ──► │Lambda SSR      │ ──► │ Next.js App     │
└─────────┘     └──────────┘     │(Function URL)  │     │ (Server-side)   │
                                 └────────────────┘     └─────────────────┘
                                                               │
                    ┌──────────────────────────────────────────┘
                    ▼
           ┌──────────────────┐
           │ middleware.js    │
           │ - Check session  │
           │ - Validate perms │
           └────────┬─────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   [No Session]          [Has Session]
          │                   │
          ▼                   ▼
┌──────────────────┐  ┌────────────────────┐
│ Redirect to      │  │ Render page with   │
│ /login           │  │ server components  │
└──────────────────┘  └────────────────────┘
```

### 7.2 SAML Authentication Flow

```
┌─────────┐  1. Click Login   ┌───────────────────┐
│ Browser │ ───────────────►  │ /api/auth/saml/   │
└─────────┘                   │ login             │
                              └─────────┬─────────┘
                                        │ 2. Create SAML Request
                                        ▼
                              ┌───────────────────┐
                              │ Redirect to       │
                              │ Identity Center   │
                              └─────────┬─────────┘
                                        │ 3. User authenticates
                                        ▼
                              ┌───────────────────┐
                              │ AWS Identity      │
                              │ Center            │
                              │ (SAML IdP)        │
                              └─────────┬─────────┘
                                        │ 4. POST SAML Response
                                        ▼
                              ┌───────────────────┐
                              │ /api/auth/saml/   │
                              │ callback          │
                              └─────────┬─────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │ 5. Parse SAML Assertion               │
                    │    - Extract NameID (email)           │
                    │    - Extract attributes               │
                    │    - Map groups to roles              │
                    └───────────────────┬───────────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ 6. Create JWT     │
                              │    session token  │
                              └─────────┬─────────┘
                                        │
                              ┌─────────▼─────────┐
                              │ 7. Set cookie &   │
                              │    redirect       │
                              └───────────────────┘
```

### 7.3 API Request Flow

```
┌─────────────────┐
│ Frontend Page   │
│ (Server/Client) │
└────────┬────────┘
         │ 1. API request with session.accessToken
         ▼
┌─────────────────┐
│ API Gateway     │
│ HTTP API        │
└────────┬────────┘
         │ 2. Invoke authorizer
         ▼
┌─────────────────┐
│ Authorizer      │
│ Lambda          │
│                 │
│ - Extract JWT   │
│ - Verify sig    │
│ - Check expiry  │
│ - Return policy │
└────────┬────────┘
         │ 3. If authorized
         ▼
┌─────────────────┐
│ API Lambda      │
│                 │
│ - Get user from │
│   context       │
│ - Check role    │
│ - Execute op    │
│ - Return data   │
└────────┬────────┘
         │ 4. Query/update
         ▼
┌─────────────────┐
│ DynamoDB        │
└─────────────────┘
```

### 7.4 Role Mapping Flow

```
SAML Assertion                Role Mapping Process               Application Role
┌────────────────┐         ┌─────────────────────┐         ┌───────────────────┐
│ groups:        │         │                     │         │                   │
│ - 14588468-... │ ──────► │ 1. Get ROLE_MAPPING │         │                   │
│ - (group IDs)  │         │    env variables    │         │                   │
└────────────────┘         │                     │         │                   │
                           │ 2. Match group ID   │         │ roles: [          │
                           │    to role mapping  │ ──────► │   'data_owner',   │
                           │                     │         │   'user'          │
                           │ 3. Apply hierarchy  │         │ ]                 │
                           │    to get primary   │         │                   │
                           │    role             │         │ role: 'data_owner'│
                           └─────────────────────┘         └───────────────────┘

Environment Variables:
ROLE_MAPPING_ADMIN=<group-id>
ROLE_MAPPING_DATA_OWNER=14588468-9051-7063-d632-5dc8871f6361
ROLE_MAPPING_PROCESS_OWNER=<group-id>
ROLE_MAPPING_VIEWER=<group-id>
```

---

## 8. Authentication & Authorization

### 8.1 SAML Configuration

**AWS Identity Center Attribute Mappings**:

| Application Attribute | Identity Center Attribute | Description                 |
| --------------------- | ------------------------- | --------------------------- |
| Subject               | `${user:email}`           | Primary identifier (NameID) |
| firstName             | `${user:givenName}`       | User's first name           |
| lastName              | `${user:familyName}`      | User's last name            |
| email                 | `${user:email}`           | Email address               |
| role                  | `${user:groups}`          | Group memberships           |
| userguid              | `${user:subject}`         | Unique user identifier      |

### 8.2 JWT Token Structure

**Session Token (NextAuth)**:

```javascript
{
  id: "user-email@domain.com",
  userId: "user-guid",
  userguid: "user-guid",
  email: "user-email@domain.com",
  name: "User Name",
  role: "data_owner",
  roles: ["data_owner", "user"],
  groups: ["14588468-9051-7063-d632-5dc8871f6361"],
  iat: 1234567890,
  exp: 1234654290
}
```

**API Token (for Backend)**:

```javascript
{
  sub: "user-id",
  email: "user-email@domain.com",
  name: "User Name",
  role: "data_owner",
  user: {
    id: "user-id",
    email: "user-email@domain.com",
    name: "User Name",
    role: "data_owner"
  },
  iat: 1234567890,
  exp: 1234654290,
  iss: "nextauth"
}
```

### 8.3 Permission Model

**Three-Layer Authorization**:

1. **Middleware Layer** (Edge)

   - Session validation
   - Page-level permissions
   - Redirect unauthenticated users

2. **API Gateway Layer**

   - JWT validation via Lambda authorizer
   - Token expiration check
   - Issuer verification

3. **Application Layer**
   - Role-based function access
   - Business logic authorization
   - Resource ownership checks

---

## 9. Deployment Process

### 9.1 Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **Terraform** >= 1.0 installed
3. **Node.js** >= 18.x installed
4. **Python** >= 3.11 installed
5. **AWS Identity Center** application configured
6. **S3 bucket** for Terraform state

### 9.2 Initial Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd user-management-app

# 2. Configure Terraform variables
cd infra
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# 3. Initialize Terraform
terraform init

# 4. Plan and apply infrastructure
terraform plan
terraform apply
```

### 9.3 Backend Deployment

```bash
cd backend

# 1. Build Lambda package
./build.sh

# 2. Package is created at lambda_package.zip
# Terraform will automatically use this file

# 3. If updating after infrastructure exists:
aws lambda update-function-code \
  --function-name user-management-api-dev \
  --zip-file fileb://lambda_package.zip
```

### 9.4 Frontend Deployment

```bash
cd frontend

# 1. Install dependencies
npm ci

# 2. Build with Open-Next
./scripts/build.sh

# 3. Deploy (uploads to S3 and updates Lambda)
./scripts/deploy.sh
```

### 9.5 Deployment Script Details

**`frontend/scripts/deploy.sh`** performs:

1. Gets Terraform outputs (bucket name, Lambda name, CloudFront ID)
2. Syncs `.open-next/assets` to S3 bucket
3. Syncs `.open-next/cache` to S3 bucket
4. **Removes bundled `.env` file** from Lambda package
5. Zips and uploads Lambda function code
6. Waits for Lambda update completion
7. Creates CloudFront invalidation
8. Prints application URL

### 9.6 Post-Deployment Steps

1. **Update Identity Center**:

   - Set ACS URL: `https://<cloudfront-domain>/api/auth/saml/callback`
   - Set Audience URI: `https://<cloudfront-domain>/api/auth/saml/metadata`

2. **Update Lambda NEXTAUTH_URL** (if using CloudFront domain):

   ```bash
   aws lambda update-function-configuration \
     --function-name user-management-server-dev \
     --environment "Variables={NEXTAUTH_URL=https://xxx.cloudfront.net,...}"
   ```

3. **Verify Deployment**:
   - Access CloudFront URL
   - Test SSO login
   - Verify role mapping

---

## 10. Deployment Dependencies

### 10.1 Build Order

```
1. Terraform Infrastructure
   ├── DynamoDB table
   ├── S3 bucket
   ├── IAM roles
   ├── Lambda functions (placeholder)
   ├── API Gateway
   └── CloudFront distribution

2. Backend Lambda
   └── handlers + dependencies → lambda_package.zip

3. Frontend SSR Lambda
   └── npm build → Open-Next → Lambda code + S3 assets
```

### 10.2 Dependency Matrix

| Component         | Depends On                                  |
| ----------------- | ------------------------------------------- |
| API Gateway       | Lambda API, Lambda Authorizer               |
| Lambda API        | DynamoDB, IAM Role                          |
| Lambda Authorizer | IAM Role, NEXTAUTH_SECRET                   |
| Lambda SSR        | API Gateway URL, SAML config, Role mappings |
| CloudFront        | Lambda SSR (URL), S3 bucket                 |
| S3 Assets         | CloudFront (for OAC policy)                 |

### 10.3 Circular Dependencies (Handled)

- **CloudFront ↔ Lambda NEXTAUTH_URL**:
  - Terraform uses placeholder URL
  - `null_resource` updates Lambda after CloudFront creation
  - Deploy script also updates

### 10.4 Required AWS Services

| Service         | Purpose                        |
| --------------- | ------------------------------ |
| CloudFront      | CDN and SSL termination        |
| Lambda          | Serverless compute (SSR + API) |
| API Gateway     | REST API with authorization    |
| DynamoDB        | User data storage              |
| S3              | Static asset hosting           |
| CloudWatch      | Logging and monitoring         |
| IAM             | Access control                 |
| ACM             | SSL certificates (optional)    |
| Identity Center | SSO authentication             |

---

## 11. Environment Variables

### 11.1 Lambda SSR (Server) Environment

| Variable                     | Description               | Example                                                         |
| ---------------------------- | ------------------------- | --------------------------------------------------------------- |
| `NEXTAUTH_URL`               | Application base URL      | `https://xxx.cloudfront.net`                                    |
| `NEXTAUTH_SECRET`            | Session encryption key    | `<random-32-chars>`                                             |
| `API_BASE_URL`               | Backend API URL           | `https://xxx.execute-api.us-east-1.amazonaws.com/dev`           |
| `SAML_ISSUER`                | Identity Center issuer    | `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/xxx` |
| `SAML_ENTRY_POINT`           | SSO login URL             | `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/xxx` |
| `SAML_CERT`                  | IdP X509 certificate      | `MIIC...` (base64)                                              |
| `ROLE_MAPPING_ADMIN`         | Admin group ID(s)         | `<group-id>`                                                    |
| `ROLE_MAPPING_DATA_OWNER`    | Data owner group ID(s)    | `14588468-9051-7063-d632-5dc8871f6361`                          |
| `ROLE_MAPPING_PROCESS_OWNER` | Process owner group ID(s) | `<group-id>`                                                    |
| `ROLE_MAPPING_VIEWER`        | Viewer group ID(s)        | `<group-id>`                                                    |

### 11.2 Lambda API Environment

| Variable                  | Description                |
| ------------------------- | -------------------------- |
| `USERS_TABLE_NAME`        | DynamoDB table name        |
| `POWERTOOLS_SERVICE_NAME` | Service name for logging   |
| `LOG_LEVEL`               | Logging level (INFO/DEBUG) |

### 11.3 Lambda Authorizer Environment

| Variable          | Description                     |
| ----------------- | ------------------------------- |
| `NEXTAUTH_SECRET` | JWT signing secret              |
| `ALLOWED_ISSUERS` | Comma-separated allowed issuers |

---

## 12. Security Considerations

### 12.1 Authentication Security

- **SAML 2.0**: Industry-standard federation protocol
- **Session tokens**: HS256-signed JWTs with 24-hour expiry
- **Cookie security**: HttpOnly, Secure (HTTPS), SameSite=Lax

### 12.2 Data Protection

- **DynamoDB**: Server-side encryption enabled
- **S3**: Server-side encryption (AES-256)
- **Transit**: TLS 1.2+ for all communications
- **Secrets**: Sensitive variables marked as `sensitive` in Terraform

### 12.3 Access Control

- **CloudFront OAC**: S3 not publicly accessible
- **API Gateway**: All routes (except /health) require authorization
- **Lambda**: Minimal IAM permissions (least privilege)
- **RBAC**: Five-tier role hierarchy with granular permissions

### 12.4 Monitoring

- **CloudWatch Logs**: All Lambda functions log to CloudWatch
- **X-Ray Tracing**: Enabled for API Lambda
- **API Gateway**: Access logs with request details

### 12.5 Recommendations

1. **Rotate NEXTAUTH_SECRET** periodically
2. **Enable AWS WAF** for CloudFront (optional)
3. **Use custom domain** with Route 53 for production
4. **Enable CloudTrail** for audit logging
5. **Implement IP allowlisting** if required
6. **Review and update dependencies** regularly

---

## Appendix A: Troubleshooting

### Common Issues

1. **"Role shows as 'User' instead of expected role"**

   - Verify `ROLE_MAPPING_*` environment variables in Lambda
   - Check group ID format matches exactly
   - Review CloudWatch logs for group extraction

2. **"Bad input" error from Identity Center**

   - Check attribute mappings use valid expressions
   - Use `${user:subject}` instead of `${user:userId}`

3. **"Unauthorized" API errors**

   - Verify session token exists
   - Check token expiration
   - Confirm API_BASE_URL is correct

4. **Old code still running after deploy**
   - Ensure `.env` file is removed from Lambda package
   - Wait for Lambda update to complete
   - Invalidate CloudFront cache

### Debug Commands

```bash
# Check Lambda configuration
aws lambda get-function-configuration --function-name user-management-server-dev

# View CloudWatch logs
aws logs tail /aws/lambda/user-management-server-dev --follow

# Test API directly
curl -H "Authorization: Bearer <token>" https://<api-url>/users

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id <id> --paths "/*"
```

---

_Document generated: 2024_
_Version: 1.0_
