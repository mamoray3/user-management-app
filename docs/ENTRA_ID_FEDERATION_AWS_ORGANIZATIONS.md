# Entra ID Federation for AWS Organizations Setup

This guide covers setting up Microsoft Entra ID (Azure AD) as an external identity provider for AWS IAM Identity Center when using **AWS Organizations with a management account and member accounts**.

## Architecture Overview

```
AWS Organization Structure:
├── Management Account (where IAM Identity Center is enabled)
│   └── IAM Identity Center (formerly AWS SSO)
│       └── External IdP: Entra ID
└── Member Accounts (workload accounts)
    └── Users login via IAM Identity Center from management account
```

**Key Points:**
- IAM Identity Center is **only enabled in the management account**
- Entra ID federation is configured **once in the management account**
- Users from Entra ID can access **all member accounts** via permission sets
- Your application infrastructure is likely in a **member account**

---

## Prerequisites

- [ ] AWS Organizations enabled
- [ ] Management account credentials
- [ ] IAM Identity Center enabled in management account
- [ ] Microsoft Entra ID (Azure AD) tenant
- [ ] Global Administrator role in Entra ID
- [ ] Identity of which account your app infrastructure is deployed in

---

## Part 1: Verify Your AWS Organization Setup

### Step 1: Confirm You're Using AWS Organizations

```bash
# Login to MANAGEMENT ACCOUNT
# Set profile or credentials for management account
export AWS_PROFILE=management-account

# Verify organization
aws organizations describe-organization
```

Expected output:
```json
{
  "Organization": {
    "Id": "o-xxxxxxxxxx",
    "Arn": "arn:aws:organizations::123456789012:organization/o-xxxxxxxxxx",
    "MasterAccountArn": "arn:aws:organizations::123456789012:account/o-xxxxxxxxxx/123456789012",
    "MasterAccountId": "123456789012",
    "MasterAccountEmail": "management@example.com"
  }
}
```

- [ ] Organization ID noted: `o-ldvixs1qll`
- [ ] Management Account ID: `261447197741`

### Step 2: List Member Accounts

```bash
# List all accounts in the organization
aws organizations list-accounts --query 'Accounts[*].[Id,Name,Status]' --output table
```

Identify which account has your application:
- [ ] App/Workload Account ID: `540150371887`
- [ ] App/Workload Account Name: `dev`

### Step 3: Verify IAM Identity Center Location

```bash
# Check IAM Identity Center (should be in management account)
aws sso-admin list-instances
```

If you get an error like "AccessDeniedException" or "Identity Center is not available", you're likely in a member account. **Switch to the management account credentials.**

Expected output:
```json
{
  "Instances": [
    {
      "InstanceArn": "arn:aws:sso:::instance/ssoins-xxxxxxxxxxxx",
      "IdentityStoreId": "d-xxxxxxxxxx"
    }
  ]
}
```

**Important:** IAM Identity Center is **organization-wide** and lives only in the management account.

- [ ] Identity Store ID: `d-90662bc4fb`
- [ ] Instance ARN: `arn:aws:sso:::instance/ssoins-7223cb5151a8dfaa`

---

## Part 2: Configure Entra ID Federation (In Management Account)

### Step 1: Access AWS Console with Management Account

1. **Sign in to AWS Console using management account credentials**
2. Verify you're in the management account:
   - Top right corner should show management account ID
   - Or check: AWS Console → Account dropdown → My Account

### Step 2: Navigate to IAM Identity Center

1. Search for **IAM Identity Center** (or AWS SSO)
2. You should see the Identity Center dashboard
3. Click **Settings** in the left navigation

### Step 3: Download AWS SSO SAML Metadata

1. Under **Identity source**, click **Actions** → **Change identity source**
2. Select **External identity provider**
3. **Download AWS SSO SAML metadata file** → Save as `aws-sso-metadata.xml`
4. **Note these URLs** (copy to notepad):

```
Identifier (Entity ID):
https://us-east-1.signin.aws.amazon.com/platform/saml/d-90662bc4fb

ACS URL (Reply URL):
https://us-east-1.signin.aws.amazon.com/platform/saml/acs/4ac38751-0bc8-4220-b40b-e027af9ecaa5

Sign-on URL:
https://d-90662bc4fb.awsapps.com/start
```

Replace `d-XXXXXXXXXX` with your actual Identity Store ID.

**⚠️ IMPORTANT:** Keep this browser tab open! Don't click "Finish" yet!

- [ ] AWS metadata downloaded
- [ ] URLs copied to notepad
- [ ] Browser tab kept open

---

## Part 3: Configure Entra ID Enterprise Application

### Step 1: Create Enterprise Application in Azure

1. Go to **https://portal.azure.com**
2. **Microsoft Entra ID** → **Enterprise applications**
3. **+ New application** → **+ Create your own application**
4. Name: `AWS IAM Identity Center - Organization`
5. Select: **Integrate any other application you don't find in the gallery**
6. Click **Create**

### Step 2: Configure SAML

1. Click **Single sign-on** → Select **SAML**
2. Click **Edit** on "Basic SAML Configuration"
3. Enter the values from AWS (replace with your Identity Store ID):

**Identifier (Entity ID):**
```
https://portal.sso.us-east-1.amazonaws.com/saml/metadata/d-XXXXXXXXXX
```

**Reply URL (Assertion Consumer Service URL):**
```
https://portal.sso.us-east-1.amazonaws.com/saml/assertion/d-XXXXXXXXXX
```

**Sign on URL:**
```
https://portal.sso.us-east-1.amazonaws.com/login
```

**Relay State (optional):**
```
https://d-XXXXXXXXXX.awsapps.com/start
```

4. Click **Save**

- [ ] SAML configuration saved in Entra ID

### Step 3: Configure Attributes & Claims

1. Click **Edit** on "Attributes & Claims"
2. Configure **Name ID** (Unique User Identifier):
   - Click on the Name ID claim
   - **Name identifier format**: `Persistent`
   - **Source attribute**: `user.userprincipalname`
   - Click **Save**

3. Verify default claims (should already exist):
   - Email: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → `user.mail`
   - Given Name: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` → `user.givenname`
   - Surname: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` → `user.surname`

- [ ] Name ID configured
- [ ] Claims verified

### Step 4: Download Federation Metadata XML

1. Scroll to **SAML Certificates** section
2. Find **Federation Metadata XML**
3. Click **Download** → Save as `entra-id-metadata.xml`

- [ ] Entra ID metadata downloaded

### Step 5: Assign Users/Groups

**Important:** Only users assigned here will be able to authenticate.

1. Go to **Users and groups**
2. Click **+ Add user/group**
3. Select users or groups who need AWS access
4. Click **Assign**

Recommended: Assign a security group like "AWS-Users" for easier management.

- [ ] Users/groups assigned

---

## Part 4: Complete AWS Configuration (Management Account)

### Step 1: Upload Entra ID Metadata to AWS

Go back to AWS Console (the tab from Part 2, Step 3):

1. You should still be on **Change identity source → External identity provider**
2. Under **IdP SAML metadata**, click **Choose file**
3. Upload `entra-id-metadata.xml`
4. Click **Next**
5. Review the warning about changing identity source
6. Type **ACCEPT**
7. Click **Change identity source**

Wait for the "Identity source updated" confirmation message (may take 1-2 minutes).

- [ ] Entra ID metadata uploaded to AWS
- [ ] Identity source change completed

### Step 2: Verify Identity Source

```bash
# Verify identity source changed
aws sso-admin list-instances

# Check identity store
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
echo "Identity Store ID: $IDENTITY_STORE_ID"
```

- [ ] Identity source verified

---

## Part 5: Configure Access to Member Accounts

Now that Entra ID federation is working, you need to grant users access to member accounts.

### Step 1: Create Permission Sets

Permission sets define what users can do in AWS accounts.

**In AWS Console (IAM Identity Center):**

1. Click **Permission sets** in left navigation
2. Click **Create permission set**
3. Choose a preset or custom:
   - **AdministratorAccess** (for admins)
   - **PowerUserAccess** (for developers)
   - **ReadOnlyAccess** (for viewers)
   - Or create custom

4. Name it: `DeveloperAccess` (or appropriate name)
5. Click **Create**

Common permission sets to create:
- [ ] AdministratorAccess
- [ ] DeveloperAccess
- [ ] ReadOnlyAccess

### Step 2: Assign Users to Member Accounts

**For your application/workload account:**

1. Go to **AWS accounts** in IAM Identity Center
2. Find your application/workload account
3. Click on it → **Assign users or groups**
4. Select users or groups from Entra ID
5. Select permission set (e.g., DeveloperAccess)
6. Click **Assign**

Repeat for each member account and permission set combination.

- [ ] Users assigned to workload account with appropriate permissions

### Step 3: Verify Multi-Account Setup

```bash
# List account assignments
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)

# List permission sets
aws sso-admin list-permission-sets --instance-arn $INSTANCE_ARN

# List accounts
aws organizations list-accounts --query 'Accounts[*].[Id,Name]' --output table
```

- [ ] Permission sets created
- [ ] Account assignments verified

---

## Part 6: Configure Your Application (Member Account)

Your application infrastructure is in a **member account**, but authentication happens through the **management account's IAM Identity Center**.

### Important: Where Things Live

```
Management Account:
├── IAM Identity Center
├── Entra ID Federation
└── User/Group → Account Assignments

Member Account (Workload):
├── Cognito User Pool
├── Lambda Functions
├── DynamoDB
├── S3 Buckets
└── Your Application Infrastructure
```

### Step 1: Get IAM Identity Center Application Details

From **management account**:

```bash
# Get Identity Store ID
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)

echo "Identity Store ID: $IDENTITY_STORE_ID"
echo "IDC Application URL: https://${IDENTITY_STORE_ID}.awsapps.com/start"
echo "SAML Metadata URL: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/${IDENTITY_STORE_ID}"
```

### Step 2: Create IDC Application (Management Account)

You need to create a **custom SAML 2.0 application** in IAM Identity Center for your application.

**In AWS Console (Management Account) → IAM Identity Center:**

1. Click **Applications** in left navigation
2. Click **Add application**
3. Select **Add custom SAML 2.0 application**
4. **Display name**: `User Management App`
5. **Application start URL**: Your CloudFront URL
6. **Application ACS URL**: `https://YOUR-COGNITO-DOMAIN.auth.us-east-1.amazoncognito.com/saml2/idpresponse`
7. **Application SAML audience**: Use Cognito User Pool URN

**Get Cognito details from member account:**

```bash
# Switch to MEMBER/WORKLOAD account
export AWS_PROFILE=workload-account

# Get Cognito User Pool ID
cd /Users/mn/csl/web_apps/user-management-app/infra/core
terraform output cognito_user_pool_id

# Get Cognito Domain
terraform output cognito_domain
```

8. **Application SAML audience**: `urn:amazon:cognito:sp:<COGNITO_USER_POOL_ID>`
9. Click **Save**

### Step 3: Configure Attribute Mappings (Critical!)

Still in the IDC Application configuration:

1. Click **Attribute mappings** tab
2. Add these mappings:

| User attribute in application | Maps to this string value or user attribute | Format    |
|-------------------------------|---------------------------------------------|-----------|
| `Subject`                     | `${user:subject}`                          | persistent |
| `email`                       | `${user:email}`                            | basic     |
| `firstName`                   | `${user:givenName}`                        | basic     |
| `lastName`                    | `${user:familyName}`                       | basic     |
| `accessToken`                 | `${session:access_token}`                  | unspecified |
| `groups`                      | `${user:groups}`                           | basic     |

**⚠️ CRITICAL:** The `accessToken` → `${session:access_token}` mapping is essential for S3 Access Grants!

3. Click **Save changes**

### Step 4: Download IDC Application Metadata

1. In the application details, find **IAM Identity Center SAML metadata file**
2. Click **Download**
3. Save as `idc-app-metadata.xml`

### Step 5: Configure Cognito SAML IdP (Member Account)

Now switch to your **member/workload account** and configure Cognito to use the IDC application.

**Via Terraform (Recommended):**

Your Cognito configuration should already have the SAML IdP configured. Verify it:

```bash
# In member account
cd /Users/mn/csl/web_apps/user-management-app/infra/core

# Check if SAML IdP is configured
aws cognito-idp list-identity-providers \
  --user-pool-id $(terraform output -raw cognito_user_pool_id)
```

If not configured, you need to add it to your Terraform or configure manually in AWS Console.

### Step 6: Update Cognito User Pool (Member Account)

The SAML IdP should map attributes from IDC to Cognito custom attributes:

```hcl
# In your Terraform cognito.tf
resource "aws_cognito_identity_provider" "identity_center" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "IdentityCenter"
  provider_type = "SAML"

  provider_details = {
    MetadataURL = "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/${var.idc_identity_store_id}"
  }

  attribute_mapping = {
    email                      = "email"
    given_name                 = "firstName"
    family_name                = "lastName"
    username                   = "email"
    "custom:idc_user_id"      = "Subject"
    "custom:s3_prefix"        = "Subject"  # Or custom s3Prefix if you add it
    "custom:idc_access_token" = "accessToken"
  }
}
```

Apply the changes:

```bash
terraform plan
terraform apply
```

---

## Part 7: Test the Complete Flow

### Step 1: Test AWS Access Portal

1. Open **new incognito window**
2. Go to: `https://d-XXXXXXXXXX.awsapps.com/start`
3. Should redirect to Microsoft Entra ID login
4. Enter Entra ID credentials
5. After login, should see available AWS accounts

✅ If you see your member accounts listed, federation is working!

### Step 2: Test Application Authentication

1. Go to your application URL: `https://dXXXXXXXXXXX.cloudfront.net`
2. Click **Sign In**
3. Should redirect through: NextAuth → Cognito → IDC → Entra ID
4. Login with Entra ID credentials
5. Should land on dashboard

✅ If this works, the full auth flow is configured correctly!

### Step 3: Verify in CloudWatch Logs

```bash
# Switch to member/workload account
export AWS_PROFILE=workload-account

cd /Users/mn/csl/web_apps/user-management-app/infra/app
LAMBDA_NAME=$(terraform output -raw lambda_server_function_name)

# Tail logs
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow
```

Look for SUCCESS messages about IDC access token.

---

## Part 8: Configure Cross-Account S3 Access Grants (Optional)

If you want S3 Access Grants to work across accounts:

### Option 1: S3 Access Grants in Same Account

Keep S3 buckets and Access Grants instance in the **same member account** as your application. This is simpler and recommended.

### Option 2: Cross-Account Access Grants

If S3 buckets are in a different account:

1. Link Access Grants instance to IAM Identity Center (management account)
2. Configure cross-account IAM roles
3. More complex - see AWS documentation

**Recommended:** Keep everything in the workload account for simplicity.

---

## Troubleshooting

### Issue: Can't Find IAM Identity Center in Member Account

**Solution:** IAM Identity Center only exists in the **management account**. Switch to management account credentials.

```bash
# Use management account profile
export AWS_PROFILE=management-account
aws sso-admin list-instances
```

### Issue: Users Can't See Any AWS Accounts

**Problem:** Users not assigned to accounts with permission sets.

**Solution:**
1. Management Account → IAM Identity Center → AWS accounts
2. Select member account → Assign users or groups
3. Choose permission set
4. Assign

### Issue: SAML Error When Logging Into Application

**Problem:** Cognito (member account) can't validate SAML from IDC.

**Solution:**
1. Verify IDC application metadata URL is correct
2. Check attribute mappings in IDC application
3. Ensure `accessToken` → `${session:access_token}` mapping exists
4. Re-download and update Cognito SAML IdP metadata

### Issue: Missing IDC Access Token in Session

**Problem:** `custom:idc_access_token` is null in session.

**Solution:**
1. Check IDC application attribute mapping: `accessToken` → `${session:access_token}`
2. Verify Cognito SAML IdP mapping: `custom:idc_access_token` ← `accessToken`
3. Check Cognito User Pool Client read attributes includes `custom:idc_access_token`

---

## Security Best Practices

### 1. Separate Management and Workload Accounts

✅ **DO:** Keep management account for identity and governance only
✅ **DO:** Deploy applications in member/workload accounts
❌ **DON'T:** Deploy applications in management account

### 2. Least Privilege Permission Sets

Create specific permission sets:
- **AdministratorAccess**: Only for account administrators
- **DeveloperAccess**: For developers (EC2, Lambda, S3, etc.)
- **ReadOnlyAccess**: For auditors and viewers
- **CustomAppAccess**: Minimal permissions for application deployment

### 3. Use Groups in Entra ID

- Create groups like "AWS-Admins", "AWS-Developers"
- Assign groups (not individual users) to AWS accounts
- Manage membership in Entra ID

### 4. Enable CloudTrail Organization Trail

```bash
# In management account
aws cloudtrail create-trail \
  --name organization-trail \
  --s3-bucket-name my-org-cloudtrail-bucket \
  --is-organization-trail
```

### 5. Enable AWS Config

Monitor configuration changes across all accounts.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Microsoft Entra ID (Azure AD)                                   │
│  - User Directory                                               │
│  - Groups                                                       │
│  - Enterprise Application (AWS IAM Identity Center)             │
└────────────────────────────┬────────────────────────────────────┘
                             │ SAML Federation
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ AWS Management Account                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AWS IAM Identity Center                                  │  │
│  │  - Identity Source: External (Entra ID)                  │  │
│  │  - Permission Sets                                       │  │
│  │  - Account Assignments                                   │  │
│  │  - Custom SAML Application (for your app)               │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Organization-wide SSO
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│ Member Account 1 (Dev)   │    │ Member Account 2 (Prod)  │
│  - Your Application      │    │  - Production Resources  │
│  - Cognito (SAML → IDC)  │    │  - Cognito               │
│  - Lambda Functions      │    │  - Lambda Functions      │
│  - DynamoDB              │    │  - DynamoDB              │
│  - S3 Buckets            │    │  - S3 Buckets            │
└──────────────────────────┘    └──────────────────────────┘
```

---

## Summary

You've configured:

1. ✅ Entra ID as external identity provider for AWS Organizations
2. ✅ IAM Identity Center in management account
3. ✅ SAML federation between Entra ID and AWS
4. ✅ Permission sets and account assignments
5. ✅ Custom IDC application for your app
6. ✅ Cognito SAML integration in member account
7. ✅ Full authentication flow working

**Users can now:**
- Login with Entra ID credentials
- Access multiple AWS accounts via IAM Identity Center
- Access your application with SSO
- Get scoped S3 credentials via IDC token exchange

---

## Quick Commands Cheat Sheet

```bash
# === Management Account ===
export AWS_PROFILE=management-account

# Get Identity Store ID
aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text

# List users (after federation + SCIM)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
aws identitystore list-users --identity-store-id $IDENTITY_STORE_ID

# List permission sets
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
aws sso-admin list-permission-sets --instance-arn $INSTANCE_ARN

# List account assignments
aws sso-admin list-account-assignments --instance-arn $INSTANCE_ARN --account-id <ACCOUNT_ID>

# === Member/Workload Account ===
export AWS_PROFILE=workload-account

# Get Cognito details
cd /Users/mn/csl/web_apps/user-management-app/infra/core
terraform output cognito_user_pool_id
terraform output cognito_domain

# Check SAML IdP
aws cognito-idp list-identity-providers \
  --user-pool-id $(terraform output -raw cognito_user_pool_id)

# Check Lambda logs
cd ../app
LAMBDA_NAME=$(terraform output -raw lambda_server_function_name)
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow
```

---

## Next Steps

1. **Enable SCIM Provisioning** (optional)
   - Automatically sync users from Entra ID
   - See: `SETUP_ENTRA_ID_FEDERATION.md` Part 4

2. **Deploy Application Changes**
   - Rebuild frontend with updated config
   - Deploy to member account
   - See: `DEPLOY_NOW.md`

3. **Test S3 Access Grants**
   - Verify token exchange works
   - Test scoped file access

4. **Set Up Monitoring**
   - CloudWatch alarms
   - CloudTrail organization trail
   - AWS Config rules

---

**This completes the AWS Organizations setup with Entra ID federation! 🎉**
