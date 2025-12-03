# User Management Application Documentation

Welcome to the comprehensive documentation for the User Management Application with AWS Identity Center integration and S3 Access Grants.

## 📚 Documentation Index

### Getting Started

| Document | Description | Audience |
|----------|-------------|----------|
| [Quick Start: IDC OIDC](./QUICK_START_IDC_OIDC.md) | Step-by-step setup guide from scratch | Developers, DevOps |
| [Deployment Guide](./DEPLOYMENT_GUIDE.md) | How to deploy frontend and backend | DevOps, Developers |
| [Environment Variables](./ENVIRONMENT_VARIABLES.md) | Environment configuration guide | All |

### Architecture & Design

| Document | Description | Audience |
|----------|-------------|----------|
| [Architecture Overview](./ARCHITECTURE.md) | Complete system architecture | Architects, Developers |
| [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md) | Technical deep-dive on token exchange | Developers, Security |
| [Refactoring Summary](./REFACTORING_SUMMARY.md) | Summary of IDC OIDC implementation | Developers |

### Troubleshooting

| Document | Description | Audience |
|----------|-------------|----------|
| [Debug SAML](./troubleshooting/debug-saml.md) | SAML authentication debugging | DevOps, Developers |
| [Trace Auth Flow](./troubleshooting/trace-auth-flow.md) | Authentication flow troubleshooting | DevOps, Developers |
| [Verify IDC Config](./troubleshooting/verify-idc-config.md) | IDC configuration verification | DevOps |

### Archives

| Document | Description | Note |
|----------|-------------|------|
| [Archive](./archive/) | Outdated two-stage refactoring docs | Historical reference only |

## 🚀 Quick Navigation

### I want to...

**Set up the application from scratch**
→ Start with [Quick Start: IDC OIDC](./QUICK_START_IDC_OIDC.md)

**Understand the architecture**
→ Read [Architecture Overview](./ARCHITECTURE.md)

**Deploy to AWS**
→ Follow [Deployment Guide](./DEPLOYMENT_GUIDE.md)

**Configure environment variables**
→ Check [Environment Variables](./ENVIRONMENT_VARIABLES.md)

**Debug authentication issues**
→ See [Troubleshooting section](#troubleshooting)

**Understand IDC OIDC token exchange**
→ Read [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md)

## 📖 Reading Order for New Users

1. **[Architecture Overview](./ARCHITECTURE.md)** - Understand the big picture
2. **[Quick Start: IDC OIDC](./QUICK_START_IDC_OIDC.md)** - Set up your environment
3. **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** - Configure your application
4. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Deploy to AWS
5. **[Troubleshooting guides](./troubleshooting/)** - Fix issues as they arise

## 🔍 Documentation by Role

### For Developers

- [Architecture Overview](./ARCHITECTURE.md) - System design
- [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md) - Authentication implementation
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Local development setup
- [Refactoring Summary](./REFACTORING_SUMMARY.md) - What was changed

### For DevOps/SRE

- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Deployment procedures
- [Quick Start: IDC OIDC](./QUICK_START_IDC_OIDC.md) - Infrastructure setup
- [Troubleshooting guides](./troubleshooting/) - Debugging reference
- [Verify IDC Config](./troubleshooting/verify-idc-config.md) - Configuration checklist

### For Architects

- [Architecture Overview](./ARCHITECTURE.md) - Complete system architecture
- [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md) - Authentication architecture
- Technology stack and design decisions

### For Security Teams

- [Architecture Overview](./ARCHITECTURE.md) - Security features section
- [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md) - Identity preservation
- S3 Access Grants implementation
- Encryption and compliance features

## 📝 Key Concepts

### Authentication Flow

This application uses a multi-layered authentication approach:

```
External IdP (Entra ID/Okta)
    ↓
AWS Identity Center (IDC)
    ↓ (SAML)
Cognito User Pool
    ↓ (OIDC)
NextAuth Session
    ↓
IDC OIDC Token Exchange
    ↓
AWS Credentials (with IDC identity)
    ↓
S3 Access Grants
```

See [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md) for details.

### S3 Access Grants

Fine-grained, per-user S3 access control using:
- **DIRECTORY_USER** grants - Per-user private folders
- **DIRECTORY_GROUP** grants - Group-based access
- **IAM** grants - Role-based fallback

See [Architecture Overview](./ARCHITECTURE.md#storage-layer) for details.

### Infrastructure

Terraform-managed AWS infrastructure with:
- **Cognito** - User authentication
- **Identity Center** - Enterprise SSO
- **S3 Access Grants** - Fine-grained file access
- **DynamoDB** - User data storage
- **Lambda** - Backend API
- **CloudFront** - Frontend delivery

See [Deployment Guide](./DEPLOYMENT_GUIDE.md) for deployment procedures.

## 🔧 Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `terraform.tfvars` | Infrastructure configuration | `infra/core/` |
| `.env.local` | Local development environment | `frontend/` (gitignored) |
| `.env.example` | Environment variable template | `frontend/` |

## 🆘 Getting Help

### Common Issues

1. **SAML authentication fails**
   → See [Debug SAML](./troubleshooting/debug-saml.md)

2. **Can't find OIDC issuer URL**
   → See [Quick Start: IDC OIDC - Step 1](./QUICK_START_IDC_OIDC.md#step-1-find-your-idc-configuration-values)

3. **Environment variables not working**
   → See [Environment Variables Guide](./ENVIRONMENT_VARIABLES.md)

4. **S3 Access Grants not working**
   → Verify `identity_center_arn` is set in `terraform.tfvars`

5. **Deployment fails**
   → Check [Deployment Guide](./DEPLOYMENT_GUIDE.md) and logs

### Where to Look

- **Setup questions** → [Quick Start Guide](./QUICK_START_IDC_OIDC.md)
- **Architecture questions** → [Architecture Overview](./ARCHITECTURE.md)
- **Deployment issues** → [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- **Authentication issues** → [Troubleshooting guides](./troubleshooting/)
- **Configuration questions** → [Environment Variables](./ENVIRONMENT_VARIABLES.md)

## 📚 External Resources

### AWS Documentation
- [AWS Identity Center](https://docs.aws.amazon.com/singlesignon/)
- [S3 Access Grants](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-grants.html)
- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [AssumeRoleWithWebIdentity](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html)

### Framework Documentation
- [Next.js](https://nextjs.org/docs)
- [NextAuth.js](https://next-auth.js.org/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

## 🤝 Contributing

When adding new documentation:

1. **Update this index** - Add your document to the appropriate section
2. **Follow the style** - Match existing documentation format
3. **Cross-reference** - Link related documents
4. **Test instructions** - Verify all commands and steps work
5. **Update examples** - Use realistic, working examples

## 📋 Documentation Standards

### File Naming
- Use descriptive names: `QUICK_START_IDC_OIDC.md`, not `setup.md`
- Use UPPERCASE for main documents: `ARCHITECTURE.md`, `README.md`
- Use lowercase for specific guides: `debug-saml.md`, `verify-idc-config.md`

### Content Structure
1. **Overview** - Brief description
2. **Prerequisites** - What's needed
3. **Step-by-step instructions** - Numbered steps
4. **Examples** - Working code/commands
5. **Troubleshooting** - Common issues
6. **References** - Related documents

### Code Examples
- Use real, working examples
- Include expected output
- Show both success and error cases
- Explain what each command does

## 📅 Document Maintenance

| Document | Last Major Update | Status |
|----------|------------------|--------|
| Architecture Overview | 2025-12 | ✅ Current |
| Quick Start IDC OIDC | 2025-12 | ✅ Current |
| Environment Variables | 2025-12 | ✅ Current |
| Deployment Guide | 2025-11 | ⚠️ Review needed |
| IDC OIDC Token Exchange | 2025-11 | ✅ Current |
| Refactoring Summary | 2025-11 | ✅ Current |
| Troubleshooting guides | 2025-11 | ✅ Current |

## 🔄 Version History

- **v2.0** (2025-12): Comprehensive documentation reorganization
  - Created unified [ARCHITECTURE.md](./ARCHITECTURE.md)
  - Updated [Quick Start Guide](./QUICK_START_IDC_OIDC.md) with application setup
  - Moved troubleshooting guides to dedicated folder
  - Archived outdated two-stage refactoring docs

- **v1.0** (2025-11): Initial IDC OIDC token exchange implementation
  - Added [IDC OIDC Token Exchange](./IDC_OIDC_TOKEN_EXCHANGE.md)
  - Created [Quick Start Guide](./QUICK_START_IDC_OIDC.md)
  - Added [Environment Variables Guide](./ENVIRONMENT_VARIABLES.md)

---

**Need help?** Start with the appropriate document from the index above, or browse by role/task in the Quick Navigation section.
