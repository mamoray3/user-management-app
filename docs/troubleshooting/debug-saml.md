# Debugging SAML Authentication Flow

## Overview

When you see "Bad input" error, it means IDC is sending a SAML response to Cognito, but Cognito is rejecting it. Let's capture and inspect what's being sent.

## Method 1: Browser DevTools (Easiest)

### Step 1: Open Browser DevTools
1. Open Chrome/Firefox in **incognito/private mode**
2. Press `F12` to open DevTools
3. Go to **Network** tab
4. Check **"Preserve log"** option (important!)

### Step 2: Start Authentication Flow
1. Navigate to `http://localhost:3000`
2. Click "Sign in"
3. Watch the Network tab

### Step 3: Find the SAML POST
Look for a request to:
```
https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse
```

This is the POST request from IDC to Cognito containing the SAML response.

### Step 4: Inspect the Request

Click on the `saml2/idpresponse` request and look at:

**Headers tab:**
```
Request URL: https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse
Request Method: POST
Status Code: 400 Bad Request (if failing)
```

**Payload tab:**
You'll see form data like:
```
SAMLResponse: <base64-encoded-string>
RelayState: <some-value>
```

### Step 5: Decode the SAML Response

Copy the `SAMLResponse` value (long base64 string) and decode it:

**Option A: Online decoder**
1. Go to: https://www.samltool.com/decode.php
2. Paste the SAMLResponse value
3. Click "Decode"
4. You'll see the XML SAML assertion

**Option B: Command line**
```bash
# Copy the SAMLResponse value and save to a file
echo "YOUR_BASE64_SAML_RESPONSE" | base64 -d | xmllint --format -
```

### What to Look For in the Decoded SAML

The decoded XML should look like:
```xml
<saml2p:Response>
  <saml2:Issuer>https://portal.sso.us-east-1.amazonaws.com/...</saml2:Issuer>
  <saml2:Assertion>
    <saml2:Subject>
      <saml2:NameID>user-guid-here</saml2:NameID>
      <saml2:SubjectConfirmation>
        <saml2:SubjectConfirmationData
          Recipient="..."
          NotOnOrAfter="..."/>
      </saml2:SubjectConfirmation>
    </saml2:Subject>
    <saml2:Conditions>
      <saml2:AudienceRestriction>
        <saml2:Audience>urn:amazon:cognito:sp:us-east-1_CuBrLbl6B</saml2:Audience>
      </saml2:AudienceRestriction>
    </saml2:Conditions>
    <saml2:AttributeStatement>
      <saml2:Attribute Name="email">
        <saml2:AttributeValue>user@example.com</saml2:AttributeValue>
      </saml2:Attribute>
      <saml2:Attribute Name="firstName">...</saml2:Attribute>
      <saml2:Attribute Name="lastName">...</saml2:Attribute>
      <saml2:Attribute Name="accessToken">...</saml2:Attribute>
    </saml2:AttributeStatement>
  </saml2:Assertion>
</saml2p:Response>
```

**Check these values:**

| Field | What to Check | Expected Value |
|-------|---------------|----------------|
| `<saml2:Audience>` | Must match Cognito User Pool | `urn:amazon:cognito:sp:us-east-1_CuBrLbl6B` |
| `<saml2:SubjectConfirmationData Recipient>` | Must match ACS URL | `https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse` |
| `<saml2:Attribute Name="email">` | Email attribute present | Should have user email |
| `<saml2:Attribute Name="accessToken">` | IDC access token present | Should have token value |

---

## Method 2: Using SAML-tracer Browser Extension

### Install SAML-tracer
- **Firefox**: https://addons.mozilla.org/en-US/firefox/addon/saml-tracer/
- **Chrome**: https://chrome.google.com/webstore/detail/saml-tracer

### How to Use
1. Install the extension
2. Open SAML-tracer (click extension icon)
3. Click "Sign in" in your app
4. SAML-tracer will automatically capture and show:
   - SAML Request (from Cognito to IDC)
   - SAML Response (from IDC to Cognito)
5. Click on the POST to `/saml2/idpresponse`
6. View the decoded SAML assertion

---

## Method 3: Check Cognito CloudWatch Logs

### Enable CloudWatch Logs
```bash
aws cognito-idp set-log-delivery-configuration \
  --user-pool-id us-east-1_CuBrLbl6B \
  --log-configurations \
    LogLevel=ERROR,EventSource=userNotification \
  --region us-east-1
```

### View Logs
1. Go to CloudWatch Console
2. Navigate to **Logs** → **Log groups**
3. Find: `/aws/cognito/userpools/us-east-1_CuBrLbl6B`
4. Look for recent errors around the time you tried to sign in

Look for errors like:
- "Invalid SAML response"
- "Audience validation failed"
- "Recipient validation failed"
- "Signature validation failed"

---

## Method 4: Create a Simple SAML Response Capture Page

Create a test endpoint to capture what IDC is sending:

```javascript
// frontend/src/app/api/test-saml/route.js
export async function POST(request) {
  const formData = await request.formData();
  const samlResponse = formData.get('SAMLResponse');
  const relayState = formData.get('RelayState');

  console.log('=== SAML Response Captured ===');
  console.log('RelayState:', relayState);
  console.log('SAMLResponse (base64):', samlResponse);

  // Decode the SAML response
  if (samlResponse) {
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');
    console.log('SAMLResponse (decoded XML):');
    console.log(decoded);
  }

  return Response.json({
    received: true,
    relayState,
    samlResponse: samlResponse ? 'captured' : 'missing'
  });
}
```

Then temporarily change the ACS URL in IDC to:
```
http://localhost:3000/api/test-saml
```

This will show you exactly what IDC is sending.

---

## Common "Bad Input" Causes and How to Spot Them

### 1. Wrong Audience URI
**In SAML Response, look for:**
```xml
<saml2:Audience>WRONG_VALUE</saml2:Audience>
```

**Should be:**
```xml
<saml2:Audience>urn:amazon:cognito:sp:us-east-1_CuBrLbl6B</saml2:Audience>
```

**Fix:** Update "Application SAML audience" in IDC

---

### 2. Wrong Recipient URL
**In SAML Response, look for:**
```xml
<saml2:SubjectConfirmationData Recipient="WRONG_URL" .../>
```

**Should be:**
```xml
<saml2:SubjectConfirmationData
  Recipient="https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse"
  .../>
```

**Fix:** Update "Application ACS URL" in IDC

---

### 3. Missing Required Attributes
**In SAML Response, check AttributeStatement:**
```xml
<saml2:AttributeStatement>
  <saml2:Attribute Name="email">...</saml2:Attribute>
  <!-- Missing firstName, lastName, Subject, or accessToken -->
</saml2:AttributeStatement>
```

**Fix:** Add missing attribute mappings in IDC

---

### 4. Expired Assertion
**In SAML Response, check timestamps:**
```xml
<saml2:Conditions NotBefore="2024-01-01T10:00:00Z"
                   NotOnOrAfter="2024-01-01T10:05:00Z">
```

If current time is past `NotOnOrAfter`, the assertion is expired.

**Fix:** Check system clocks are synchronized (NTP)

---

### 5. Invalid Signature
**In SAML Response, look for:**
```xml
<ds:Signature>...</ds:Signature>
```

If Cognito can't verify the signature against IDC's certificate, it will reject.

**Fix:** Ensure IDC metadata URL is current and accessible

---

## Quick Troubleshooting Script

Create this script to capture the SAML flow:

```bash
#!/bin/bash
# Save as: debug-saml-flow.sh

echo "=== Cognito Configuration ==="
echo "User Pool ID: us-east-1_CuBrLbl6B"
echo "Expected Audience: urn:amazon:cognito:sp:us-east-1_CuBrLbl6B"
echo "Expected Recipient: https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse"
echo ""

echo "=== IDC SAML Metadata ==="
curl -s "https://portal.sso.us-east-1.amazonaws.com/saml/metadata/MjYxNDQ3MTk3NzQxX2lucy03MjIzMzBjYmI1Y2IwMWY3" | xmllint --format - | grep -A 5 "SingleSignOnService"
echo ""

echo "=== Instructions ==="
echo "1. Open browser DevTools (F12)"
echo "2. Go to Network tab"
echo "3. Check 'Preserve log'"
echo "4. Sign in to your app"
echo "5. Find POST to /saml2/idpresponse"
echo "6. Copy SAMLResponse value from Payload tab"
echo "7. Decode it at: https://www.samltool.com/decode.php"
echo "8. Verify Audience and Recipient values match above"
```

---

## Next Steps After Capturing SAML

Once you capture and decode the SAML response:

1. **Share the relevant parts** (NOT the full response, as it may contain sensitive data):
   - `<saml2:Audience>` value
   - `<saml2:SubjectConfirmationData Recipient>` value
   - List of `<saml2:Attribute Name="">` values
   - Any error messages in browser console

2. **Compare with expected values** from the script above

3. **Update IDC configuration** if values don't match

4. **Clear browser cache** and try again

---

## Security Note

The SAML response contains sensitive information like user IDs and tokens. When debugging:
- Use private/incognito mode
- Don't share full SAML responses publicly
- Clear browser data after testing
- Rotate tokens if exposed
