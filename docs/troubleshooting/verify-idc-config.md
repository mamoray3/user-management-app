# IDC Application Configuration Verification

## Error Symptoms
- "Bad input" error when signing in
- Redirected to: `https://d-90662bc4fb.awsapps.com/start/#/?relayId=...`
- Cannot complete authentication

## Required IDC Configuration

### Step 1: Log into Organization Account
Access AWS Identity Center in your **organization account** (where IDC is hosted).

### Step 2: Find Your Application
1. Go to **AWS Identity Center Console**
2. Click **Applications** in the left sidebar
3. Look for your Cognito application (it might be named something like "Cognito-UserManagement" or similar)
4. The relay ID in your error URL (`00a75376-c1e1-4ce0-944f-849cc655a512`) corresponds to this application

### Step 3: Verify Application Configuration

Click on your application and verify these **exact values**:

#### Required Settings:

| Setting | Required Value | Where to find in IDC Console |
|---------|---------------|------------------------------|
| **Application ACS URL** | `https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse` | Application details → Edit configuration |
| **Application SAML audience** | `urn:amazon:cognito:sp:us-east-1_CuBrLbl6B` | Application details → Edit configuration |
| **Application start URL** | `http://localhost:3000` (for testing) or `https://d29dg44rriqw5p.cloudfront.net` | Application details → Application properties |

#### CRITICAL: Attribute Mappings

Go to **Actions** → **Edit attribute mappings** and ensure these are configured:

| User attribute in application | Maps to this string value | Format |
|-------------------------------|---------------------------|---------|
| `Subject` | `${user:subject}` | persistent |
| `email` | `${user:email}` | unspecified |
| `firstName` | `${user:givenName}` | unspecified |
| `lastName` | `${user:familyName}` | unspecified |
| `accessToken` | `${session:access_token}` | unspecified |

**NOTE:** The `accessToken` attribute is critical for IDC OIDC token exchange to work!

### Step 4: Verify User Assignment

1. In your application, go to **Assigned users** tab
2. Ensure your user is assigned to this application
3. Verify your user has a **primary email address** set in IDC

### Step 5: Check Identity Source

1. Go to **Settings** in AWS Identity Center
2. Under **Identity source**, verify it's connected to your directory (Entra ID)
3. Ensure users are syncing properly

## Common Issues and Fixes

### Issue 1: Wrong Application ACS URL
**Symptom:** "Bad input" error immediately after IDC login

**Fix:** The ACS URL must poin
t to Cognito's SAML endpoint, NOT your application:
- ❌ Wrong: `http://localhost:3000/api/auth/callback/cognito`
- ✅ Correct: `https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse`

### Issue 2: Wrong SAML Audience
**Symptom:** "Bad input" error or authentication loop

**Fix:** Must match the Cognito User Pool SP Entity ID:
- ❌ Wrong: `https://signin.aws.amazon.com/saml`
- ✅ Correct: `urn:amazon:cognito:sp:us-east-1_CuBrLbl6B`

### Issue 3: Missing Attribute Mappings
**Symptom:** Authentication completes but user has no data, or IDC token exchange fails

**Fix:** Ensure all 5 attribute mappings are configured (especially `accessToken`)

### Issue 4: User Not Assigned
**Symptom:** "Access Denied" or "You don't have permission"

**Fix:** Assign your user to the application in IDC

### Issue 5: No Primary Email
**Symptom:** "Bad input" error

**Fix:** Ensure user has primary email set in IDC user profile

## After Configuration Changes

1. **Save all changes in IDC console**
2. **Clear browser cache/cookies** or use incognito window
3. **Restart local dev server:**
   ```bash
   cd frontend
   npm run dev
   ```
4. **Test authentication:**
   - Navigate to: `http://localhost:3000`
   - Click "Sign in"
   - Monitor browser Network tab for any errors

## Debugging Tips

### Check Browser Network Tab
1. Open DevTools → Network tab
2. Click "Sign in"
3. Look for:
   - Redirect to Cognito (`user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com`)
   - Redirect to IDC SAML (`portal.sso.us-east-1.amazonaws.com`)
   - POST back to Cognito (`/saml2/idpresponse`)
   - Look for any 400/500 errors

### Check Server Logs
If you see errors in terminal, they will provide more details about what's failing.

### Common Error Messages

| Error | Meaning | Fix |
|-------|---------|-----|
| "Bad input" | SAML response rejected | Check ACS URL and SAML audience |
| "Resource not found" | Application doesn't exist | Verify application ID in IDC |
| "Access denied" | User not assigned | Assign user to application |
| "Invalid SAML response" | Malformed SAML | Check attribute mappings |

## Verification Command

From your application account, run:
```bash
cd /Users/mn/csl/web_apps/user-management-app/infra
./scripts/get-cognito-saml-urls.sh
```

This will show you the exact values that should be configured in IDC.

## Still Not Working?

If you've verified all the above and still getting errors:

1. **Check Cognito CloudWatch Logs:**
   - Go to CloudWatch in AWS Console
   - Look for `/aws/cognito/userpools/us-east-1_CuBrLbl6B` log group
   - Check for recent error logs

2. **Verify SAML Metadata is Current:**
   ```bash
   curl -s "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3"
   ```
   Should return valid XML.

3. **Check if Cognito SAML provider is configured:**
   ```bash
   aws cognito-idp describe-identity-provider \
     --user-pool-id us-east-1_CuBrLbl6B \
     --provider-name IdentityCenter \
     --region us-east-1
   ```

## Contact Points

- **Organization Account:** Where AWS Identity Center (IDC) is configured
- **Application Account:** Where Cognito User Pool is configured (Account: 540150371887)

Make sure you're checking IDC configuration in the **organization account**, not the application account!
