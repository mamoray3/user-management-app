/**
 * SAML Response Debug Endpoint
 *
 * This endpoint captures and displays SAML responses from IDC for debugging.
 *
 * USAGE:
 * 1. Temporarily change the IDC Application ACS URL to:
 *    http://localhost:3000/api/test-saml
 * 2. Try to sign in
 * 3. Check server console logs for the SAML response
 * 4. Restore the correct ACS URL when done:
 *    https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse
 *
 * WARNING: This endpoint logs sensitive data. Use only for debugging!
 */

export async function POST(request) {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🔍 SAML Response Captured at:', new Date().toISOString());
    console.log('='.repeat(80));

    const formData = await request.formData();
    const samlResponse = formData.get('SAMLResponse');
    const relayState = formData.get('RelayState');

    console.log('\n📋 Form Data:');
    console.log('RelayState:', relayState);
    console.log('SAMLResponse (base64) length:', samlResponse?.length || 0);

    // Decode the SAML response
    if (samlResponse) {
      const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

      console.log('\n📄 SAMLResponse (Decoded XML):');
      console.log('-'.repeat(80));
      console.log(decoded);
      console.log('-'.repeat(80));

      // Extract key values
      const audienceMatch = decoded.match(/<saml2?:Audience>(.*?)<\/saml2?:Audience>/);
      const recipientMatch = decoded.match(/Recipient="(.*?)"/);
      const issuerMatch = decoded.match(/<saml2?:Issuer>(.*?)<\/saml2?:Issuer>/);

      console.log('\n🔑 Key Values:');
      console.log('Issuer:', issuerMatch ? issuerMatch[1] : 'NOT FOUND');
      console.log('Audience:', audienceMatch ? audienceMatch[1] : 'NOT FOUND');
      console.log('Recipient:', recipientMatch ? recipientMatch[1] : 'NOT FOUND');

      // Extract attributes
      const attributeMatches = decoded.matchAll(/<saml2?:Attribute Name="(.*?)">(.*?)<\/saml2?:Attribute>/gs);
      console.log('\n📦 SAML Attributes:');
      for (const match of attributeMatches) {
        const attrName = match[1];
        const attrContent = match[2];
        // Extract attribute value
        const valueMatch = attrContent.match(/<saml2?:AttributeValue[^>]*>(.*?)<\/saml2?:AttributeValue>/s);
        const value = valueMatch ? valueMatch[1].trim() : 'EMPTY';
        console.log(`  - ${attrName}: ${value.substring(0, 100)}${value.length > 100 ? '...' : ''}`);
      }

      console.log('\n✅ Expected Values (for comparison):');
      console.log('Expected Audience: urn:amazon:cognito:sp:us-east-1_CuBrLbl6B');
      console.log('Expected Recipient: https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse');

      console.log('\n' + '='.repeat(80));
      console.log('End of SAML Response');
      console.log('='.repeat(80) + '\n');

      // Return HTML response showing the data
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>SAML Response Captured</title>
          <style>
            body {
              font-family: monospace;
              padding: 20px;
              background: #1e1e1e;
              color: #d4d4d4;
            }
            h1 { color: #4ec9b0; }
            h2 { color: #dcdcaa; margin-top: 30px; }
            pre {
              background: #2d2d30;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
              border-left: 3px solid #4ec9b0;
            }
            .key { color: #9cdcfe; }
            .value { color: #ce9178; }
            .success { color: #4ec9b0; }
            .error { color: #f48771; }
          </style>
        </head>
        <body>
          <h1>🔍 SAML Response Debug Capture</h1>
          <p>SAML response captured at: ${new Date().toISOString()}</p>

          <h2>📋 Form Data</h2>
          <pre><span class="key">RelayState:</span> <span class="value">${relayState || 'null'}</span>
<span class="key">SAMLResponse length:</span> <span class="value">${samlResponse?.length || 0} characters</span></pre>

          <h2>🔑 Key Values Extracted</h2>
          <pre><span class="key">Issuer:</span> <span class="value">${issuerMatch ? issuerMatch[1] : 'NOT FOUND'}</span>
<span class="key">Audience:</span> <span class="value">${audienceMatch ? audienceMatch[1] : 'NOT FOUND'}</span>
<span class="key">Recipient:</span> <span class="value">${recipientMatch ? recipientMatch[1] : 'NOT FOUND'}</span></pre>

          <h2>✅ Expected Values</h2>
          <pre><span class="key">Expected Audience:</span> <span class="${audienceMatch && audienceMatch[1] === 'urn:amazon:cognito:sp:us-east-1_CuBrLbl6B' ? 'success' : 'error'}">urn:amazon:cognito:sp:us-east-1_CuBrLbl6B</span>
<span class="key">Expected Recipient:</span> <span class="${recipientMatch && recipientMatch[1] === 'https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse' ? 'success' : 'error'}">https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse</span></pre>

          <h2>📄 Full Decoded SAML Response</h2>
          <pre>${decoded.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>

          <h2>📝 Instructions</h2>
          <ol>
            <li>Check the server console for detailed logs</li>
            <li>Compare "Key Values" with "Expected Values" above</li>
            <li>If values don't match, update them in IDC console</li>
            <li><strong>IMPORTANT:</strong> Restore the correct ACS URL in IDC:
              <pre>https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse</pre>
            </li>
          </ol>
        </body>
        </html>
      `, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
        },
      });
    } else {
      console.log('❌ No SAMLResponse found in form data');
      return new Response('No SAML response received', { status: 400 });
    }
  } catch (error) {
    console.error('❌ Error processing SAML response:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

export async function GET() {
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>SAML Debug Endpoint</title>
      <style>
        body {
          font-family: system-ui, -apple-system, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          line-height: 1.6;
        }
        code {
          background: #f4f4f4;
          padding: 2px 8px;
          border-radius: 3px;
          font-family: monospace;
        }
        pre {
          background: #f4f4f4;
          padding: 15px;
          border-radius: 5px;
          overflow-x: auto;
        }
        h1 { color: #2c3e50; }
        .warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <h1>🔍 SAML Debug Endpoint</h1>
      <p>This endpoint is used to capture and inspect SAML responses from AWS Identity Center.</p>

      <div class="warning">
        <strong>⚠️ Warning:</strong> This is a debug endpoint and should only be used temporarily.
      </div>

      <h2>How to Use:</h2>
      <ol>
        <li>Go to AWS Identity Center (organization account)</li>
        <li>Edit your Cognito application</li>
        <li>Temporarily change the <strong>Application ACS URL</strong> to:
          <pre>http://localhost:3000/api/test-saml</pre>
        </li>
        <li>Save the application</li>
        <li>Try to sign in to your application</li>
        <li>You'll see the SAML response displayed here</li>
        <li>Check the server console for detailed logs</li>
        <li><strong>IMPORTANT:</strong> Restore the correct ACS URL:
          <pre>https://user-management-dev-88ayq0v6.auth.us-east-1.amazoncognito.com/saml2/idpresponse</pre>
        </li>
      </ol>

      <h2>What to Check:</h2>
      <ul>
        <li><strong>Audience:</strong> Should be <code>urn:amazon:cognito:sp:us-east-1_CuBrLbl6B</code></li>
        <li><strong>Recipient:</strong> Should be the Cognito SAML endpoint (see above)</li>
        <li><strong>Attributes:</strong> Should include email, firstName, lastName, Subject, accessToken</li>
      </ul>
    </body>
    </html>
  `, {
    status: 200,
    headers: {
      'Content-Type': 'text/html',
    },
  });
}
