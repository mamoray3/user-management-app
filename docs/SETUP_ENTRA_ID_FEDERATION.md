# Setting Up Entra ID as External IdP for AWS IAM Identity Center

This guide walks you through configuring Microsoft Entra ID (formerly Azure AD) as an external identity provider for AWS IAM Identity Center (formerly AWS SSO).

## Architecture

```
User Login Flow:
User → Your App → Cognito → AWS IAM Identity Center → Entra ID
                                     ↓
                            (SAML Federation)
                                     ↓
                            Microsoft Entra ID authenticates user
```

## Prerequisites

- [ ] AWS account with IAM Identity Center enabled
- [ ] Microsoft Entra ID (Azure AD) tenant
- [ ] Global Administrator or Application Administrator role in Entra ID
- [ ] AWS administrator access

---

## Part 1: Prepare AWS IAM Identity Center

### Step 1: Get AWS SSO Instance Details

```bash
# Get IAM Identity Center instance ARN
aws sso-admin list-instances

# Save the output - you'll need InstanceArn and IdentityStoreId
```

Example output:
```json
{
  "Instances": [
    {
      "InstanceArn": "arn:aws:sso:::instance/ssoins-1234567890abcdef",
      "IdentityStoreId": "d-90662bc4fb"
    }
  ]
}
```

### Step 2: Access IAM Identity Center Console

1. Go to **AWS Console** → Search for **IAM Identity Center**
2. Click **Settings** in the left navigation
3. Note your **AWS access portal URL**: `https://d-xxxxxxxxxx.awsapps.com/start`

### Step 3: Download AWS SSO SAML Metadata

**Option A: Via AWS Console (Recommended)**

1. In IAM Identity Center, go to **Settings**
2. Under **Identity source**, click **Actions** → **Change identity source**
3. Select **External identity provider**
4. **DO NOT save yet!** - You'll see download options:
   - **Download AWS SSO SAML metadata file** → Save this as `aws-sso-metadata.xml`
   - **Download AWS SSO certificate** → Save this as `aws-sso-certificate.cer`
5. **Note these URLs** (copy to a text file):
   - **AWS SSO sign-in URL**: `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/xxxxx`
   - **AWS SSO ACS URL**: `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/xxxxx`
   - **AWS SSO issuer URL**: `https://portal.sso.us-east-1.amazonaws.com/saml/metadata/xxxxx`

**Option B: Via AWS CLI**

```bash
# Get the metadata URL
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)

echo "Instance ARN: $INSTANCE_ARN"
echo "Identity Store ID: $IDENTITY_STORE_ID"

# The metadata URL format is:
echo "Metadata URL: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"

# Download metadata
curl -o aws-sso-metadata.xml "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"
```

### Step 4: Keep AWS Console Open

**IMPORTANT:** Do NOT click "Finish" or save the identity source change yet! Keep this browser tab open. You'll come back to complete this after configuring Entra ID.

---

## Part 2: Configure Entra ID Enterprise Application

### Step 1: Access Azure Portal

1. Go to **https://portal.azure.com**
2. Sign in with Global Administrator or Application Administrator credentials

### Step 2: Create Enterprise Application

1. Navigate to **Microsoft Entra ID** (search in top bar)
2. Go to **Enterprise applications** in left menu
3. Click **+ New application**
4. Click **+ Create your own application**
5. Name: `AWS IAM Identity Center`
6. Select **Integrate any other application you don't find in the gallery (Non-gallery)**
7. Click **Create**

### Step 3: Configure Single Sign-On

1. In your new application, go to **Single sign-on** in left menu
2. Select **SAML** as the single sign-on method
3. You'll see the SAML-based Sign-on configuration screen

### Step 4: Configure Basic SAML Configuration

Click **Edit** in the "Basic SAML Configuration" section:

1. **Identifier (Entity ID)**:
   ```
   https://portal.sso.us-east-1.amazonaws.com/saml/metadata/<your-identity-store-id>
   ```
   Replace `<your-identity-store-id>` with your actual ID (e.g., `d-90662bc4fb`)

2. **Reply URL (Assertion Consumer Service URL)**:
   ```
   https://portal.sso.us-east-1.amazonaws.com/saml/assertion/<your-identity-store-id>
   ```

3. **Sign on URL** (optional but recommended):
   ```
   https://portal.sso.us-east-1.amazonaws.com/login
   ```

4. **Relay State** (optional):
   ```
   https://d-<your-identity-store-id>.awsapps.com/start
   ```

5. Click **Save**

**Example Configuration:**
```
Identifier: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/d-90662bc4fb
Reply URL: https://portal.sso.us-east-1.amazonaws.com/saml/assertion/d-90662bc4fb
Sign on URL: https://portal.sso.us-east-1.amazonaws.com/login
Relay State: https://d-90662bc4fb.awsapps.com/start
```

### Step 5: Configure Attributes & Claims

Click **Edit** in the "Attributes & Claims" section:

#### Required Claims:

1. **Name ID** (Unique User Identifier):
   - **Name identifier format**: `Persistent`
   - **Source attribute**: `user.userprincipalname` (or `user.mail` if you prefer email)

2. **Email** (Required):
   - **Claim name**: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`
   - **Source attribute**: `user.mail`

3. **First Name** (Optional but recommended):
   - **Claim name**: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname`
   - **Source attribute**: `user.givenname`

4. **Last Name** (Optional but recommended):
   - **Claim name**: `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname`
   - **Source attribute**: `user.surname`

**To add a claim:**
1. Click **+ Add new claim**
2. Fill in the name and source attribute
3. Click **Save**

### Step 6: Download Federation Metadata XML

1. Scroll down to **SAML Certificates** section
2. Find **Federation Metadata XML**
3. Click **Download** → Save as `entra-id-metadata.xml`

**Alternative - Copy Metadata URL:**
If download doesn't work, copy the **App Federation Metadata Url** and download it:
```bash
curl -o entra-id-metadata.xml "https://login.microsoftonline.com/<tenant-id>/federationmetadata/2007-06/federationmetadata.xml?appid=<app-id>"
```

### Step 7: Assign Users/Groups

1. Go to **Users and groups** in left menu
2. Click **+ Add user/group**
3. Select users or groups who should have access
4. Click **Assign**

**Important:** Only assigned users will be able to authenticate through this application.

---

## Part 3: Complete AWS IAM Identity Center Configuration

### Step 1: Upload Entra ID Metadata to AWS

Go back to your AWS Console browser tab (from Part 1, Step 4):

1. You should still be on the **Change identity source** page
2. If not, go to **Settings → Identity source → Actions → Change identity source → External identity provider**
3. Under **IdP SAML metadata**, choose **Upload file**
4. Upload the `entra-id-metadata.xml` file you downloaded from Entra ID
5. Review the **Service provider metadata** section to confirm AWS values
6. Click **Next**

### Step 2: Review and Confirm

1. Review the warning message about changing identity source
2. Type **ACCEPT** to confirm
3. Click **Change identity source**

### Step 3: Wait for Provisioning

The identity source change may take a few minutes. You'll see a status message.

---

## Part 4: Configure Automatic Provisioning (SCIM)

This step is **optional** but recommended for automatic user synchronization.

### In Microsoft Entra ID:

1. Go back to your AWS IAM Identity Center application in Azure Portal
2. Click **Provisioning** in left menu
3. Click **Get started**
4. Set **Provisioning Mode** to **Automatic**

### In AWS IAM Identity Center:

1. Go to **Settings → Automatic provisioning**
2. Click **Enable**
3. Copy the **SCIM endpoint** and **Access token**

### Back in Entra ID:

1. **Tenant URL**: Paste the SCIM endpoint
2. **Secret Token**: Paste the Access token
3. Click **Test Connection**
4. If successful, click **Save**
5. Go to **Mappings** and review attribute mappings
6. Click **Start provisioning**

---

## Part 5: Verification and Testing

### Step 1: Verify Identity Source

```bash
# Check identity source is now external
aws sso-admin list-instances --query 'Instances[0]'
```

### Step 2: Test Authentication Flow

1. Open a **new incognito/private browser window**
2. Go to your AWS access portal: `https://d-xxxxxxxxxx.awsapps.com/start`
3. You should be redirected to Microsoft login
4. Enter your Entra ID credentials
5. After successful login, you should see the AWS access portal

**If it works:** ✅ SAML federation is configured correctly!

**If it fails:** See troubleshooting section below.

### Step 3: Verify User Identity

After successful login, check the user in AWS:

```bash
# List users in Identity Center
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)

aws identitystore list-users --identity-store-id $IDENTITY_STORE_ID
```

You should see users from Entra ID (if SCIM provisioning is enabled and has run).

### Step 4: Test Your Application

Now test your full application flow:

1. Go to your application URL (CloudFront URL)
2. Click **Sign In**
3. You should be redirected through: NextAuth → Cognito → IAM Identity Center → Entra ID
4. Login with Entra ID credentials
5. Should land back on your application dashboard

---

## Troubleshooting

### Issue: 400 Error on SAML Assertion

**Error:** `400 Bad Request` when accessing `/saml/v2/assertion/`

**Possible Causes:**
1. Federation metadata not uploaded correctly
2. Identifier/Reply URL mismatch
3. SAML certificate expired or invalid

**Solutions:**

1. **Verify URLs match exactly:**
   ```bash
   # AWS Side
   echo "AWS Identifier: https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"
   echo "AWS Reply URL: https://portal.sso.us-east-1.amazonaws.com/saml/assertion/$IDENTITY_STORE_ID"
   ```

   These must match what you configured in Entra ID exactly.

2. **Re-download and re-upload metadata:**
   - Download fresh metadata from Entra ID
   - Re-upload to AWS IAM Identity Center
   - Wait 5 minutes for changes to propagate

3. **Check SAML Response:**
   Use browser developer tools:
   - Open DevTools (F12) → Network tab
   - Try to login
   - Find the POST request to `/saml/assertion/`
   - Check the SAML response payload

### Issue: "User not found" Error

**Solution:**
1. Ensure user is assigned to the enterprise application in Entra ID
2. If using SCIM, check provisioning status:
   - Azure Portal → Your App → Provisioning → View provisioning logs
3. Manually provision user if needed:
   - Click **Provision on demand**
   - Select a user and test

### Issue: Attributes Not Mapping Correctly

**Solution:**
1. In Entra ID, go to **Single sign-on → Attributes & Claims**
2. Verify claim mappings:
   - Email: `user.mail`
   - FirstName: `user.givenname`
   - LastName: `user.surname`
3. Test with a SAML response viewer:
   - Use browser extension like "SAML Chrome Panel"
   - Inspect actual SAML response

### Issue: Infinite Redirect Loop

**Possible Causes:**
1. Relay State misconfigured
2. Reply URL wrong
3. Browser cookies blocked

**Solutions:**
1. Clear all cookies and cache
2. Try incognito mode
3. Verify Reply URL in Entra ID matches AWS ACS URL exactly
4. Check Relay State points to correct portal URL

### Issue: Certificate Error

**Error:** Certificate validation failed

**Solution:**
1. Download fresh metadata from Entra ID
2. Certificate may have expired
3. Check certificate validity:
   ```bash
   openssl x509 -in aws-sso-certificate.cer -text -noout
   ```

---

## Common Configuration Mistakes

### ❌ Wrong URLs
- Using `https://portal.sso.us-west-2.amazonaws.com` when your IDC is in `us-east-1`
- **Fix:** Always use the region where your IAM Identity Center is configured

### ❌ Missing User Assignment
- User not assigned to enterprise application in Entra ID
- **Fix:** Go to Users and groups → Add user/group

### ❌ Incorrect Identifier Format
- Using custom identifier instead of AWS-required format
- **Fix:** Must be `https://portal.sso.<region>.amazonaws.com/saml/metadata/<id>`

### ❌ Name ID Not Configured
- Missing or wrong Name ID claim
- **Fix:** Set to `user.userprincipalname` with Persistent format

### ❌ Provisioning Not Enabled
- SCIM not configured, users don't sync
- **Fix:** Enable automatic provisioning (Part 4)

---

## Verification Checklist

After configuration, verify:

- [ ] Identity source changed to "External identity provider" in AWS
- [ ] Can login to AWS access portal with Entra ID credentials
- [ ] Users appear in IAM Identity Center (if SCIM enabled)
- [ ] Can access your application via full auth flow
- [ ] Cognito receives SAML assertion from IDC correctly
- [ ] User attributes (email, name, groups) are passed through
- [ ] IDC access token is captured for S3 Access Grants

---

## Next Steps

After successful setup:

1. **Configure IDC Application for Your App:**
   - See: `docs/IDC_OIDC_TOKEN_EXCHANGE.md`
   - Set up attribute mappings for `accessToken` → `${session:access_token}`

2. **Configure Cognito SAML Identity Provider:**
   - Point to your IDC application
   - Map SAML attributes to Cognito custom attributes

3. **Test Full Authentication Flow:**
   - User → App → Cognito → IDC → Entra ID
   - Verify all tokens are captured correctly

4. **Set Up S3 Access Grants:**
   - Link Access Grants instance to Identity Center
   - Create grants for IDC users/groups

---

## Useful Commands

```bash
# Get IAM Identity Center details
aws sso-admin list-instances

# List users in Identity Store
IDENTITY_STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
aws identitystore list-users --identity-store-id $IDENTITY_STORE_ID

# List groups
aws identitystore list-groups --identity-store-id $IDENTITY_STORE_ID

# Get specific user
aws identitystore list-users \
  --identity-store-id $IDENTITY_STORE_ID \
  --filters AttributePath=UserName,AttributeValue=user@example.com

# Download metadata
curl -o aws-sso-metadata.xml \
  "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/$IDENTITY_STORE_ID"
```

---

## Additional Resources

- [AWS IAM Identity Center Documentation](https://docs.aws.amazon.com/singlesignon/latest/userguide/)
- [Configure Entra ID with AWS SSO](https://learn.microsoft.com/en-us/azure/active-directory/saas-apps/aws-single-sign-on-tutorial)
- [SAML 2.0 Technical Overview](https://docs.oasis-open.org/security/saml/Post2.0/sstc-saml-tech-overview-2.0.html)
- [Troubleshooting SAML](https://docs.aws.amazon.com/singlesignon/latest/userguide/troubleshooting.html)

---

## Summary

You've configured:
1. ✅ AWS IAM Identity Center with external identity provider
2. ✅ Entra ID enterprise application with SAML
3. ✅ SAML federation between AWS and Entra ID
4. ✅ (Optional) SCIM provisioning for automatic user sync

**Result:** Users can now authenticate with their Entra ID credentials through AWS IAM Identity Center!
