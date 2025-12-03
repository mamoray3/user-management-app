'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function FileBrowser() {
  const { data: session } = useSession();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [credentials, setCredentials] = useState(null);
  const [customTarget, setCustomTarget] = useState('');
  const [testResult, setTestResult] = useState(null);

  // Get initial credentials on mount
  useEffect(() => {
    if (session) {
      fetchCredentials();
    }
  }, [session]);

  const fetchCredentials = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/s3/credentials');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get credentials');
      }
      
      setCredentials(data);
      setTestResult({
        type: 'success',
        message: 'Successfully obtained AWS credentials via IDC token exchange',
        data: {
          bucket: data.s3Bucket,
          userPrefix: data.userPrefix,
          expiration: data.credentials?.expiration,
        }
      });
    } catch (err) {
      setError(err.message);
      setTestResult({
        type: 'error',
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const testAccessGrant = async (target) => {
    setLoading(true);
    setError(null);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/s3/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target: target,
          permission: 'READ' 
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Access denied');
      }
      
      setTestResult({
        type: 'success',
        message: `Access Grant matched for: ${data.matchedGrantTarget}`,
        data: {
          target: data.s3Target,
          matchedGrant: data.matchedGrantTarget,
          expiration: data.credentials?.expiration,
        }
      });
    } catch (err) {
      setTestResult({
        type: 'error',
        message: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestCustomTarget = () => {
    if (customTarget.trim()) {
      testAccessGrant(customTarget.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Cognito Identity Credentials Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Step 1: IDC Token Exchange Credentials</h3>
        <p className="text-sm text-gray-500 mb-4">
          Exchange your IDC access token (from Cognito → IDC → Entra ID) for AWS credentials.
        </p>
        
        <button
          onClick={fetchCredentials}
          disabled={loading}
          className="btn btn-primary mb-4"
        >
          {loading ? 'Loading...' : 'Get Identity Credentials'}
        </button>
        
        {credentials && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <div className="font-medium text-green-800 mb-2">✓ Credentials Obtained</div>
            <div className="text-green-700 space-y-1 font-mono text-xs">
              <div>Bucket: {credentials.s3Bucket}</div>
              <div>User Prefix: {credentials.userPrefix}</div>
              <div>IDC User ID: {credentials.idcUserId}</div>
              <div>Expires: {credentials.credentials?.expiration}</div>
            </div>
          </div>
        )}
      </div>

      {/* S3 Access Grants Test Section */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Step 2: Test S3 Access Grants</h3>
        <p className="text-sm text-gray-500 mb-4">
          Test if you have access to specific S3 paths via Access Grants.
        </p>
        
        {/* Quick test buttons for known paths */}
        <div className="space-y-2 mb-4">
          <div className="text-sm font-medium text-gray-700">Quick Tests:</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => testAccessGrant('s3://mamoray-dev-bucket/app_1/*')}
              disabled={loading}
              className="btn btn-secondary text-sm"
            >
              Test app_1/* (mamoray-dev-bucket)
            </button>
            <button
              onClick={() => testAccessGrant('s3://mamoray-dev-bucket/app_2/*')}
              disabled={loading}
              className="btn btn-secondary text-sm"
            >
              Test app_2/* (mamoray-dev-bucket)
            </button>
          </div>
        </div>
        
        {/* Custom target input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={customTarget}
            onChange={(e) => setCustomTarget(e.target.value)}
            placeholder="s3://bucket-name/prefix/*"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={handleTestCustomTarget}
            disabled={loading || !customTarget.trim()}
            className="btn btn-primary"
          >
            Test Access
          </button>
        </div>
        
        {/* Test Result */}
        {testResult && (
          <div className={`rounded-lg p-3 text-sm ${
            testResult.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            <div className={`font-medium mb-2 ${
              testResult.type === 'success' ? 'text-green-800' : 'text-red-800'
            }`}>
              {testResult.type === 'success' ? '✓' : '✗'} {testResult.message}
            </div>
            {testResult.data && (
              <div className={`space-y-1 font-mono text-xs ${
                testResult.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}>
                {Object.entries(testResult.data).map(([key, value]) => (
                  <div key={key}>{key}: {value}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800 font-medium">Error</div>
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
        <h4 className="font-medium text-gray-800 mb-2">How S3 Access Grants Work:</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>You authenticate via Cognito (OIDC) → IDC (SAML) → Entra ID</li>
          <li>Your IDC User ID and access token are embedded in your Cognito tokens</li>
          <li>STS exchanges the IDC token for AWS creds (assume-role-with-web-identity)</li>
          <li>S3 Access Grants match your IDC identity to specific S3 prefixes</li>
          <li>You get scoped credentials that only work for your assigned paths</li>
        </ol>
      </div>
    </div>
  );
}
