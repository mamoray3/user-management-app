# Entra ID Federation Quick Start Checklist

Fix the 400 SAML assertion error by properly configuring Entra ID federation with AWS IAM Identity Center.

## Quick Overview

**Time Required:** 20-30 minutes

**What You'll Do:**
1. Get AWS SSO metadata
2. Create Entra ID enterprise application
3. Upload Entra ID metadata to AWS
4. Test the connection

---

## Step-by-Step Checklist

### Part 1: AWS Preparation (5 minutes)

#### 1. Get Your Identity Store ID

```bash
aws sso-admin list-instances
```

Note the `IdentityStoreId` (e.g., `d-90662bc4fb`)

- [ ] Identity Store ID saved: `___________________`

#### 2. Start Identity Source Change (Don't Finish!)

1. [ ] AWS Console → **IAM Identity Center**
2. [ ] Click **Settings**
3. [ ] **Actions** → **Change identity source**
4. [ ] Select **External identity provider**
5. [ ] **Download AWS SSO SAML metadata file** → Save as `aws-sso-metadata.xml`
6. [ ] Copy these URLs to notepad:
   - Identifier: `https://portal.sso.us-east-1.amazonaws.com/saml/metadata/d-XXXXXXXXXX`
   - Reply URL: `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/d-XXXXXXXXXX`

**⚠️ IMPORTANT:** Keep this browser tab open! Don't click "Finish" yet!

---

### Part 2: Configure Entra ID (10 minutes)

#### 3. Create Enterprise Application

1. [ ] Go to **https://portal.azure.com**
2. [ ] **Microsoft Entra ID** → **Enterprise applications**
3. [ ] **+ New application** → **+ Create your own application**
4. [ ] Name: `AWS IAM Identity Center`
5. [ ] Select: **Integrate any other application...**
6. [ ] Click **Create**

#### 4. Configure SAML

1. [ ] Click **Single sign-on** → Select **SAML**
2. [ ] Click **Edit** on "Basic SAML Configuration"
3. [ ] Fill in (replace `d-XXXXXXXXXX` with your actual ID):

   **Identifier (Entity ID):**
   ```
   https://portal.sso.us-east-1.amazonaws.com/saml/metadata/d-XXXXXXXXXX
   ```

   **Reply URL:**
   ```
   https://portal.sso.us-east-1.amazonaws.com/saml/assertion/d-XXXXXXXXXX
   ```

   **Sign on URL (optional):**
   ```
   https://portal.sso.us-east-1.amazonaws.com/login
   ```

4. [ ] Click **Save**

#### 5. Configure Attributes

1. [ ] Click **Edit** on "Attributes & Claims"
2. [ ] Click on **Unique User Identifier (Name ID)**
3. [ ] Set **Name identifier format**: `Persistent`
4. [ ] Set **Source attribute**: `user.userprincipalname`
5. [ ] Click **Save**
6. [ ] Verify these default claims exist:
   - [ ] Email: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress` → `user.mail`
   - [ ] Given Name: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname` → `user.givenname`
   - [ ] Surname: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname` → `user.surname`

#### 6. Download Metadata

1. [ ] Scroll to **SAML Certificates** section
2. [ ] Click **Download** on **Federation Metadata XML**
3. [ ] Save as `entra-id-metadata.xml`

#### 7. Assign Users

1. [ ] Go to **Users and groups**
2. [ ] Click **+ Add user/group**
3. [ ] Select yourself (or test user)
4. [ ] Click **Assign**

---

### Part 3: Complete AWS Configuration (5 minutes)

#### 8. Upload Entra ID Metadata

Go back to AWS Console (the tab you left open):

1. [ ] Under **IdP SAML metadata**, choose **Upload file**
2. [ ] Upload `entra-id-metadata.xml`
3. [ ] Click **Next**
4. [ ] Type **ACCEPT**
5. [ ] Click **Change identity source**
6. [ ] Wait for "Identity source updated" message

---

### Part 4: Testing (5 minutes)

#### 9. Test AWS Access Portal

1. [ ] Open **new incognito window**
2. [ ] Go to: `https://d-XXXXXXXXXX.awsapps.com/start` (use your actual ID)
3. [ ] Should redirect to Microsoft login
4. [ ] Enter your Entra ID credentials
5. [ ] Should see AWS access portal after login

**✅ If this works:** SAML federation is configured correctly!

#### 10. Verify in AWS CLI

```bash
# Should now show users from Entra ID (if SCIM enabled)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
aws identitystore list-users --identity-store-id $IDENTITY_STORE_ID
```

#### 11. Test Your Application

1. [ ] Go to your application URL: `https://dXXXXXXXXXXX.cloudfront.net`
2. [ ] Click **Sign In**
3. [ ] Should go through: Cognito → IDC → Entra ID
4. [ ] Login with Entra ID credentials
5. [ ] Should land on dashboard

**✅ If this works:** Full authentication flow is working!

---

## Troubleshooting

### Still Getting 400 Error?

#### Check URLs Match Exactly

```bash
# Your Identity Store ID
IDENTITY_STORE_ID="d-90662bc4fb"  # Replace with yours

# These URLs must match what you put in Entra ID
echo "Identifier: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"
echo "Reply URL: https://portal.sso.us-east-1.amazonaws.com/saml/assertion/$IDENTITY_STORE_ID"
```

Go back to Entra ID → Your App → Single sign-on → Basic SAML Configuration and verify these match exactly.

#### Re-download and Re-upload Metadata

1. Delete and re-download metadata from Entra ID
2. Go back to AWS → Settings → Identity source → **Manage certificates**
3. Upload fresh metadata
4. Wait 5 minutes
5. Try again

#### Check User Assignment

In Azure Portal → Your App → Users and groups:
- Ensure your user is listed
- If not, add them

### Login Redirects But Fails?

Check CloudWatch Logs for your Lambda:

```bash
cd /Users/mn/csl/web_apps/user-management-app/infra/app
LAMBDA_NAME=$(terraform output -raw lambda_server_function_name)
aws logs tail "/aws/lambda/${LAMBDA_NAME}" --follow
```

Look for errors related to:
- Missing IDC attributes
- Token validation failures
- Cognito configuration issues

---

## What URLs Should I Use?

**If your IAM Identity Center is in us-east-1:**
```
Identifier: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/d-XXXXXXXXXX
Reply URL: https://portal.sso.us-east-1.amazonaws.com/saml/assertion/d-XXXXXXXXXX
```

**If your IAM Identity Center is in another region (e.g., us-west-2):**
```
Identifier: https://portal.sso.us-west-2.amazonaws.com/saml/metadata/d-XXXXXXXXXX
Reply URL: https://portal.sso.us-west-2.amazonaws.com/saml/assertion/d-XXXXXXXXXX
```

Replace `d-XXXXXXXXXX` with your actual Identity Store ID.

---

## Quick Commands Reference

```bash
# Get Identity Store ID
aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text

# List users (after federation)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
aws identitystore list-users --identity-store-id $IDENTITY_STORE_ID

# Download AWS metadata
curl -o aws-sso-metadata.xml \
  "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"

# Test access portal URL
echo "Access Portal: https://${IDENTITY_STORE_ID}.awsapps.com/start"
```

---

## Completion Checklist

After setup, you should have:

- [ ] AWS IAM Identity Center using "External identity provider"
- [ ] Entra ID enterprise application configured with SAML
- [ ] Federation metadata uploaded to both sides
- [ ] Can login to AWS access portal with Entra ID credentials
- [ ] Can login to your application with Entra ID credentials
- [ ] No more 400 errors on SAML assertion endpoint

---

## Next Steps

Once federation works:

1. **Enable SCIM Provisioning** (optional but recommended)
   - Automatically sync users from Entra ID to AWS
   - See full guide: `SETUP_ENTRA_ID_FEDERATION.md` Part 4

2. **Configure IDC Application Attributes**
   - Set up `accessToken` mapping for S3 Access Grants
   - See: `IDC_OIDC_TOKEN_EXCHANGE.md`

3. **Test S3 Access Grants**
   - Verify token exchange works
   - Test file access with scoped credentials

---

## Need More Help?

- **Full detailed guide:** `SETUP_ENTRA_ID_FEDERATION.md`
- **Authentication troubleshooting:** `troubleshooting/IDC_TOKEN_EXCHANGE_TROUBLESHOOTING.md`
- **AWS IAM Identity Center docs:** https://docs.aws.amazon.com/singlesignon/
- **Entra ID SAML tutorial:** https://learn.microsoft.com/en-us/azure/active-directory/saas-apps/aws-single-sign-on-tutorial

---

## Common Mistakes to Avoid

❌ **Wrong region in URLs** - Use the region where your IDC is located
❌ **Typo in Identity Store ID** - Double-check it matches exactly
❌ **Not assigning users** - User must be assigned to enterprise app in Entra ID
❌ **Wrong Name ID format** - Must be "Persistent"
❌ **Finishing AWS config before Entra ID** - Configure Entra ID first, then finish AWS

---

**Estimated Time:** 20-30 minutes total

**Good luck! 🚀**
