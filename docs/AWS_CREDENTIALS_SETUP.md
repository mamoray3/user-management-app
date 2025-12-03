# AWS Credentials Setup and Refresh Guide

## Quick Reference

### Check Current Credentials
```bash
aws sts get-caller-identity
```

### Refresh Expired Credentials

**If using AWS SSO:**
```bash
aws sso login --profile <your-profile-name>
export AWS_PROFILE=<your-profile-name>
```

**If using IAM User:**
```bash
aws configure
# Re-enter your Access Key ID and Secret Access Key
```

---

## Common Error Messages

### Error: ExpiredToken
```
Error: validating provider credentials: retrieving caller identity from STS:
operation error STS: GetCallerIdentity, https response error StatusCode: 403,
RequestID: xxx, api error ExpiredToken: The security token included in the request is expired
```

**Solution:** Your AWS credentials have expired. Follow the refresh steps below.

### Error: NoCredentialsError
```
Error: No credentials found. Please run 'aws configure'
```

**Solution:** AWS credentials are not configured. Follow the initial setup steps below.

---

## Initial Setup

### Method 1: AWS SSO (Recommended for Organizations)

#### Step 1: Configure SSO Profile
```bash
aws configure sso
```

You'll be prompted for:
- **SSO session name:** (e.g., `my-sso`)
- **SSO start URL:** Your organization's SSO URL (e.g., `https://my-org.awsapps.com/start`)
- **SSO Region:** Region where Identity Center is configured (e.g., `us-east-1`)
- **SSO registration scopes:** Press Enter for default (`sso:account:access`)

#### Step 2: Select Account and Role
The CLI will open a browser for authentication. After successful authentication:
- Select the AWS account
- Select the IAM role
- Choose a profile name (e.g., `dev-admin`)

#### Step 3: Set Default Region
```bash
aws configure set region us-east-1 --profile <profile-name>
```

#### Step 4: Set Default Output Format
```bash
aws configure set output json --profile <profile-name>
```

#### Step 5: Verify Configuration
```bash
aws sts get-caller-identity --profile <profile-name>
```

Expected output:
```json
{
    "UserId": "AROAXXXXXXXXXXXXXXXXX:user@example.com",
    "Account": "123456789012",
    "Arn": "arn:aws:sts::123456789012:assumed-role/RoleName/user@example.com"
}
```

#### Step 6: Set as Default (Optional)
```bash
export AWS_PROFILE=<profile-name>

# Make permanent by adding to ~/.bashrc or ~/.zshrc
echo 'export AWS_PROFILE=<profile-name>' >> ~/.zshrc
```

### Method 2: IAM User Credentials

#### Step 1: Create IAM User (if needed)
1. Go to AWS Console → IAM → Users
2. Click "Create user"
3. User name: `deployment-user`
4. Attach policies:
   - `AdministratorAccess` (for full deployment) OR
   - Custom policy with specific permissions

#### Step 2: Create Access Keys
1. Select the user
2. Go to "Security credentials" tab
3. Click "Create access key"
4. Choose "Command Line Interface (CLI)"
5. Download or copy the credentials

#### Step 3: Configure AWS CLI
```bash
aws configure
```

Enter when prompted:
- **AWS Access Key ID:** `AKIAXXXXXXXXXXXXXXXXX`
- **AWS Secret Access Key:** `your-secret-key`
- **Default region name:** `us-east-1`
- **Default output format:** `json`

#### Step 4: Verify Configuration
```bash
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AIDAXXXXXXXXXXXXXXXXX",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/deployment-user"
}
```

---

## Refreshing Credentials

### AWS SSO Session Expired

When you see `ExpiredToken` error with SSO:

```bash
# Login to refresh credentials
aws sso login --profile <profile-name>

# If you set AWS_PROFILE, credentials are automatically refreshed
# Otherwise, specify profile in commands:
aws sts get-caller-identity --profile <profile-name>
```

**SSO Session Duration:**
- Default: 8 hours
- After expiration, run `aws sso login` again

### IAM User Credentials Expired or Rotated

If your access keys were rotated:

```bash
# Reconfigure with new credentials
aws configure

# Enter new Access Key ID and Secret Access Key
# Keep region and output format unchanged
```

---

## Managing Multiple Profiles

### List All Profiles
```bash
aws configure list-profiles
```

### View Profile Configuration
```bash
# View all settings
aws configure list --profile <profile-name>

# View specific setting
aws configure get region --profile <profile-name>
aws configure get aws_access_key_id --profile <profile-name>
```

### Switch Between Profiles

**Temporary (current session):**
```bash
export AWS_PROFILE=<profile-name>
```

**Per-command:**
```bash
aws sts get-caller-identity --profile <profile-name>
terraform plan -var="profile=<profile-name>"
```

**Permanent:**
```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export AWS_PROFILE=<profile-name>' >> ~/.zshrc
source ~/.zshrc
```

### Example Multi-Profile Setup

**~/.aws/config:**
```ini
[profile dev-admin]
sso_session = my-sso
sso_account_id = 111111111111
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile prod-admin]
sso_session = my-sso
sso_account_id = 222222222222
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[sso-session my-sso]
sso_start_url = https://my-org.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

**Usage:**
```bash
# Deploy to dev
export AWS_PROFILE=dev-admin
aws sso login
cd infra/core && terraform apply

# Deploy to prod
export AWS_PROFILE=prod-admin
aws sso login
cd infra/core && terraform apply
```

---

## Troubleshooting

### Issue: SSO Login Opens Wrong Browser

**Solution:**
```bash
# Copy the URL and paste in your preferred browser
aws sso login --profile <profile-name> --no-browser
```

### Issue: "Token is expired" After Recent Login

**Possible Causes:**
1. Using wrong profile
2. Session expired during command execution
3. Clock skew on local machine

**Solutions:**
```bash
# Verify current profile
echo $AWS_PROFILE

# Check profile credentials
aws sts get-caller-identity --profile <profile-name>

# Sync system clock (macOS)
sudo sntp -sS time.apple.com

# Sync system clock (Linux)
sudo ntpdate -s time.nist.gov

# Login again
aws sso login --profile <profile-name>
```

### Issue: Cannot Assume Role

**Error:**
```
An error occurred (AccessDenied) when calling the AssumeRole operation:
User: arn:aws:iam::123456789012:user/username is not authorized to perform:
sts:AssumeRole on resource: arn:aws:iam::123456789012:role/RoleName
```

**Solution:**
1. Verify IAM user has `sts:AssumeRole` permission
2. Check role trust policy allows your IAM user/role
3. Verify role name is correct

### Issue: MFA Token Required

If MFA is enabled on your account:

```bash
# Get MFA device ARN
aws iam list-mfa-devices

# Get temporary credentials with MFA
aws sts get-session-token \
  --serial-number arn:aws:iam::123456789012:mfa/username \
  --token-code 123456

# Use returned credentials
export AWS_ACCESS_KEY_ID=ASIAxxxxxxxxxxxx
export AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export AWS_SESSION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Issue: Profile Not Found

**Error:**
```
The config profile (my-profile) could not be found
```

**Solution:**
```bash
# List available profiles
aws configure list-profiles

# Check config file
cat ~/.aws/config

# Reconfigure profile
aws configure --profile my-profile
# OR for SSO
aws configure sso --profile my-profile
```

---

## Best Practices

### 1. Use AWS SSO for Organizations
- Centralized access management
- Temporary credentials (more secure)
- Multi-account access
- Automatic credential refresh

### 2. Rotate IAM User Keys Regularly
```bash
# Create new access key
aws iam create-access-key --user-name deployment-user

# Update local configuration
aws configure

# Delete old access key
aws iam delete-access-key \
  --user-name deployment-user \
  --access-key-id AKIAXXXXXXXXXXXXXXXXX
```

### 3. Use Least Privilege
- Grant only necessary permissions
- Use separate roles for dev/prod
- Avoid using AdministratorAccess in production

### 4. Secure Credentials
```bash
# Restrict permissions on AWS config files
chmod 600 ~/.aws/credentials
chmod 600 ~/.aws/config

# Never commit credentials to git
# Add to .gitignore:
.aws/
*.pem
*.key
```

### 5. Monitor Credential Usage
```bash
# Last used information for IAM users
aws iam get-user --user-name deployment-user

# CloudTrail events
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=deployment-user \
  --max-results 10
```

---

## Integration with Deployment Scripts

### Option 1: Use AWS_PROFILE Environment Variable
```bash
# Set profile before running deployment
export AWS_PROFILE=dev-admin
cd frontend
./scripts/deploy.sh
```

### Option 2: Modify Terraform Provider
**infra/core/provider.tf:**
```hcl
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile  # Add this

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
    }
  }
}
```

**infra/core/variables.tf:**
```hcl
variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "default"
}
```

**Usage:**
```bash
terraform plan -var="aws_profile=dev-admin"
terraform apply -var="aws_profile=dev-admin"
```

### Option 3: Use Environment Variables Directly
```bash
# Export credentials from SSO session
export AWS_ACCESS_KEY_ID=$(aws configure get aws_access_key_id --profile dev-admin)
export AWS_SECRET_ACCESS_KEY=$(aws configure get aws_secret_access_key --profile dev-admin)
export AWS_SESSION_TOKEN=$(aws configure get aws_session_token --profile dev-admin)

# Run deployment
cd frontend
./scripts/deploy.sh
```

---

## Quick Commands Reference

```bash
# Check current credentials
aws sts get-caller-identity

# SSO login
aws sso login --profile <profile-name>

# List profiles
aws configure list-profiles

# Switch profile
export AWS_PROFILE=<profile-name>

# Configure new profile
aws configure --profile <profile-name>
aws configure sso --profile <profile-name>

# View profile settings
aws configure list --profile <profile-name>

# Test credentials
aws s3 ls
aws lambda list-functions --max-items 5

# Clear cached credentials (SSO)
rm -rf ~/.aws/sso/cache/
rm -rf ~/.aws/cli/cache/

# Refresh SSO credentials
aws sso login --profile <profile-name>
```

---

## Related Documentation

- [AWS CLI Configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html)
- [AWS SSO Configuration](https://docs.aws.amazon.com/cli/latest/userguide/sso-configure-profile-token.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)

---

## Summary

1. **Initial Setup:** Choose AWS SSO (recommended) or IAM user credentials
2. **Configure:** Run `aws configure sso` or `aws configure`
3. **Verify:** Run `aws sts get-caller-identity`
4. **Refresh:** Run `aws sso login` when credentials expire
5. **Deploy:** Use `AWS_PROFILE` environment variable or `--profile` flag

**Remember:** SSO credentials expire (typically 8 hours). Keep this guide handy for quick credential refresh!
