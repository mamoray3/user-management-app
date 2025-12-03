# Tracing the Authentication Flow

## The Complete Expected Flow

```
1. User clicks "Sign in" at http://localhost:3000

2. NextAuth redirects to Cognito OAuth authorize:
   https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/oauth2/authorize
   ?client_id=5tqp4avm5g0df2e41khqtsnmfi
   &response_type=code
   &scope=openid+email+profile
   &redirect_uri=http://localhost:3000/api/auth/callback/cognito
   &identity_provider=IdentityCenter

3. Cognito redirects to IDC SAML SSO endpoint:
   https://portal.sso.us-east-1.amazonaws.com/saml/assertion/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3

4. IDC should redirect to Entra ID (external IdP):
   https://login.microsoftonline.com/...

5. User signs in to Entra ID

6. Entra ID redirects back to IDC

7. IDC posts SAML response to Cognito:
   POST https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse

8. Cognito redirects back to NextAuth callback:
   http://localhost:3000/api/auth/callback/cognito?code=...

9. NextAuth exchanges code for tokens

10. User is signed in at http://localhost:3000
```

## What's Going Wrong

You're seeing this URL:
```
https://portal.sso.us-east-1.amazonaws.com/login
  ?directory_id=d-90662bc4fb
  &redirect_url=https://d-90662bc4fb.awsapps.com/start/?relayId=c2c6ea01-d836-4f51-9b1c-1dedb7f440b3
```

This is **Step 4** going to the wrong place. Instead of redirecting to Entra ID, it's showing the IDC login page.

## Root Cause Analysis

### Cause 1: IDC is Not Federated with Entra ID

**Symptom:** You see an IDC username/password login form

**Check:**
1. Log into AWS Identity Center (organization account)
2. Go to **Settings** → **Identity source**
3. What does it show?

**If it shows "Identity Center directory":**
- This means IDC is using its own user directory
- It's NOT federated with Entra ID
- You need to configure external identity provider

**If it shows "External identity provider" or "Microsoft Entra ID":**
- IDC is configured correctly
- The issue is elsewhere

### Cause 2: User Accessing IDC Portal Directly

**Symptom:** You're on the IDC application portal, not signing in from your app

**Check:**
- Are you clicking "Sign in" from http://localhost:3000?
- Or are you accessing the IDC portal directly?

**The RelayId URL suggests:**
The `relayId=c2c6ea01-d836-4f51-9b1c-1dedb7f440b3` is trying to launch an IDC application, but it's going through the user portal instead of SAML SSO.

### Cause 3: Wrong Identity Provider Configuration in Cognito

**Symptom:** Cognito is redirecting to wrong IDC endpoint

**Check:**
```bash
aws cognito-idp describe-identity-provider \
  --user-pool-id us-east-1_CuBrLbl6B \
  --provider-name IdentityCenter \
  --region us-east-1 \
  --query 'IdentityProvider.ProviderDetails'
```

Look for:
- `MetadataURL` should be: `https://portal.sso.us-east-1.amazonaws.com/saml/metadata/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3`
- `SSORedirectBindingURI` should be: `https://portal.sso.us-east-1.amazonaws.com/saml/assertion/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3`

### Cause 4: IDC Application is Application Type, Not SAML

**Symptom:** IDC is treating this as an application launch, not SAML SSO

**Check in IDC Console:**
1. Go to **Applications**
2. Find your Cognito application
3. What is the **Application type**?
   - ❌ If "AWS account" or "Cloud application" → Wrong type
   - ✅ Should be **"SAML 2.0"** or **"Custom SAML 2.0 application"**

## How to Trace the Flow

### Method 1: Browser DevTools

1. Open browser in **incognito mode**
2. Press **F12** → **Network** tab
3. Check **"Preserve log"**
4. Go to http://localhost:3000
5. Click "Sign in"
6. Watch the redirects in Network tab

**Look for this sequence:**
```
1. localhost:3000/api/auth/signin
2. user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/oauth2/authorize
3. portal.sso.us-east-1.amazonaws.com/saml/assertion/...
4. login.microsoftonline.com/... (THIS MIGHT BE MISSING!)
```

If you DON'T see step 4 (login.microsoftonline.com), then IDC is not redirecting to Entra ID.

### Method 2: Check Where You Started

**Question:** How did you end up at that IDC login URL?

**Option A:** You clicked "Sign in" on localhost:3000
- This is the expected flow
- If you end up at IDC login page, IDC is not configured for Entra ID

**Option B:** You went directly to IDC portal (https://d-90662bc4fb.awsapps.com)
- This is NOT the correct way to sign in
- You should always start from localhost:3000

**Option C:** You bookmarked an old URL
- Clear browser history and start fresh

## Immediate Action Items

### 1. Verify You're Starting from the Right Place

✅ **Correct:** http://localhost:3000 → Click "Sign in"
❌ **Wrong:** Accessing IDC portal directly

### 2. Check IDC Identity Source Configuration

In AWS Identity Center console (organization account):

```
Settings → Identity source

Expected: "External identity provider" or "Microsoft Entra ID"
Current: ???
```

If it says "Identity Center directory", you need to:
1. Configure external identity provider (Entra ID)
2. Or create users directly in IDC

### 3. Verify IDC Application Type

In AWS Identity Center console (organization account):

```
Applications → [Your Cognito App]

Expected: Application type = "SAML 2.0"
Current: ???
```

### 4. Check Cognito SAML Provider Configuration

Run this command:
```bash
aws cognito-idp describe-identity-provider \
  --user-pool-id us-east-1_CuBrLbl6B \
  --provider-name IdentityCenter \
  --region us-east-1
```

Verify the `SSORedirectBindingURI` is NOT pointing to `/login` endpoint.

## Different RelayId Values

You've mentioned multiple relayId values:
- `00a75376-c1e1-4ce0-944f-849cc655a512` (earlier)
- `c2c6ea01-d836-4f51-9b1c-1dedb7f440b3` (now)

**This suggests:**
- Multiple applications configured in IDC?
- Or you're accessing different endpoints?

**Check:** In IDC console, how many applications do you have? There should be only ONE for Cognito.

## Questions to Answer

Please provide:

1. **IDC Identity Source Type:**
   - Go to IDC Settings → Identity source
   - What does it say? (Identity Center directory / External IdP / Active Directory?)

2. **How are you initiating sign-in:**
   - From localhost:3000 clicking "Sign in"?
   - From IDC portal?
   - From a bookmark?

3. **What happens after the IDC login page:**
   - Do you see a username/password form?
   - Does it redirect to Entra ID?
   - Do you get an error?

4. **Browser Network Tab:**
   - Can you share the sequence of URLs from Network tab?
   - Starting from clicking "Sign in" to ending at the error?

5. **IDC Applications:**
   - How many applications are configured in your IDC?
   - Can you confirm the application type is "SAML 2.0"?

## Quick Test

Try this to verify IDC → Entra ID federation:

1. Go directly to: `https://d-90662bc4fb.awsapps.com`
2. Does it:
   - Show username/password form? (Not federated)
   - Redirect to login.microsoftonline.com? (Federated correctly)
