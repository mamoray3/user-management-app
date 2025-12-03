/**
 * S3 Access Hook
 * 
 * Provides client-side S3 access using IDC OIDC token exchange
 * (assume-role-with-web-identity) and S3 Access Grants for
 * user-level access control.
 * 
 * Usage:
 *   const { credentials, listFiles, uploadFile, downloadFile } = useS3Access();
 */

import { useState, useCallback, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function useS3Access() {
  const { data: session, status } = useSession();
  const [credentials, setCredentials] = useState(null);
  const [s3Client, setS3Client] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get credentials from the API
  const fetchCredentials = useCallback(async () => {
    if (status !== 'authenticated') return null;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/s3/credentials');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get credentials');
      }

      const data = await response.json();
      setCredentials(data);

      // Create S3 client with the credentials
      const client = new S3Client({
        region: data.region,
        credentials: {
          accessKeyId: data.credentials.accessKeyId,
          secretAccessKey: data.credentials.secretAccessKey,
          sessionToken: data.credentials.sessionToken,
        },
      });
      setS3Client(client);

      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [status]);

  // Get scoped credentials via S3 Access Grants
  const getDataAccess = useCallback(async (target, permission = 'READ') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/s3/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, permission }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get data access');
      }

      return await response.json();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize credentials when session is ready
  useEffect(() => {
    if (status === 'authenticated' && !credentials) {
      fetchCredentials().catch(console.error);
    }
  }, [status, credentials, fetchCredentials]);

  // Refresh credentials if they're about to expire
  useEffect(() => {
    if (!credentials?.credentials?.expiration) return;

    const expirationTime = new Date(credentials.credentials.expiration).getTime();
    const now = Date.now();
    const refreshTime = expirationTime - 5 * 60 * 1000; // Refresh 5 minutes before expiry

    if (now >= refreshTime) {
      fetchCredentials().catch(console.error);
      return;
    }

    const timeout = setTimeout(() => {
      fetchCredentials().catch(console.error);
    }, refreshTime - now);

    return () => clearTimeout(timeout);
  }, [credentials, fetchCredentials]);

  // List files in user's folder
  const listFiles = useCallback(async (prefix = '') => {
    if (!s3Client || !credentials) {
      await fetchCredentials();
    }

    if (!s3Client || !credentials) {
      throw new Error('S3 client not initialized');
    }

    const fullPrefix = credentials.userPrefix + prefix;

    const command = new ListObjectsV2Command({
      Bucket: credentials.s3Bucket,
      Prefix: fullPrefix,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    return {
      files: (response.Contents || []).map(obj => ({
        key: obj.Key.replace(credentials.userPrefix, ''),
        size: obj.Size,
        lastModified: obj.LastModified,
      })),
      folders: (response.CommonPrefixes || []).map(prefix => ({
        prefix: prefix.Prefix.replace(credentials.userPrefix, ''),
      })),
    };
  }, [s3Client, credentials, fetchCredentials]);

  // Get a signed URL for downloading a file
  const getDownloadUrl = useCallback(async (key, expiresIn = 3600) => {
    if (!s3Client || !credentials) {
      await fetchCredentials();
    }

    if (!s3Client || !credentials) {
      throw new Error('S3 client not initialized');
    }

    const command = new GetObjectCommand({
      Bucket: credentials.s3Bucket,
      Key: credentials.userPrefix + key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  }, [s3Client, credentials, fetchCredentials]);

  // Upload a file
  const uploadFile = useCallback(async (key, file, contentType) => {
    if (!s3Client || !credentials) {
      await fetchCredentials();
    }

    if (!s3Client || !credentials) {
      throw new Error('S3 client not initialized');
    }

    const command = new PutObjectCommand({
      Bucket: credentials.s3Bucket,
      Key: credentials.userPrefix + key,
      Body: file,
      ContentType: contentType || file.type,
    });

    return await s3Client.send(command);
  }, [s3Client, credentials, fetchCredentials]);

  // Delete a file
  const deleteFile = useCallback(async (key) => {
    if (!s3Client || !credentials) {
      await fetchCredentials();
    }

    if (!s3Client || !credentials) {
      throw new Error('S3 client not initialized');
    }

    const command = new DeleteObjectCommand({
      Bucket: credentials.s3Bucket,
      Key: credentials.userPrefix + key,
    });

    return await s3Client.send(command);
  }, [s3Client, credentials, fetchCredentials]);

  return {
    credentials,
    loading,
    error,
    isReady: !!s3Client && !!credentials,
    fetchCredentials,
    getDataAccess,
    listFiles,
    getDownloadUrl,
    uploadFile,
    deleteFile,
  };
}

export default useS3Access;
