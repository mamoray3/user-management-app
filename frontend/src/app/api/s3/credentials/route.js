/**
 * S3 Access Credentials API
 *
 * This API endpoint provides AWS credentials for S3 access via:
 * 1. IDC OIDC Token Exchange - AssumeRoleWithWebIdentity() using IDC token
 * 2. S3 Access Grants - GetDataAccess() for scoped credentials
 *
 * Flow:
 * - Authentication: Cognito User Pool → IDC → Entra ID ✓
 * - AWS Credentials: IDC OIDC Token Exchange ✓ (preserves IDC identity)
 * - S3 Access: GetDataAccess with IDC creds ✓ (DIRECTORY_USER grants work!)
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { STSClient, AssumeRoleWithWebIdentityCommand } from '@aws-sdk/client-sts';
import { S3ControlClient, GetDataAccessCommand } from '@aws-sdk/client-s3-control';

const REGION = process.env.AWS_REGION || 'us-east-1';
// IDC OIDC Token Exchange (primary method)
const IDC_TOKEN_EXCHANGE_ROLE_ARN = process.env.IDC_TOKEN_EXCHANGE_ROLE_ARN;
// S3 Access Grants
const S3_ACCESS_GRANTS_INSTANCE_ARN = process.env.S3_ACCESS_GRANTS_INSTANCE_ARN;
const S3_USER_DATA_BUCKET = process.env.S3_USER_DATA_BUCKET;
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Helper function to get AWS credentials via IDC OIDC Token Exchange
 * This preserves the IDC identity through to S3 Access Grants
 */
async function getCredentialsViaIdcToken(idcAccessToken, idcUserId) {
  if (!IDC_TOKEN_EXCHANGE_ROLE_ARN) {
    throw new Error('IDC_TOKEN_EXCHANGE_ROLE_ARN not configured');
  }

  const stsClient = new STSClient({ region: REGION });

  const command = new AssumeRoleWithWebIdentityCommand({
    RoleArn: IDC_TOKEN_EXCHANGE_ROLE_ARN,
    RoleSessionName: `idc-user-${idcUserId}`,
    WebIdentityToken: idcAccessToken,
    DurationSeconds: 3600, // 1 hour
  });

  const response = await stsClient.send(command);

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration?.toISOString(),
  };
}

export async function GET(request) {
  try {
    console.log('========================================');
    console.log('S3 Credentials API - GET Request Started');
    console.log('========================================');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Request URL:', request.url);

    // Get the authenticated session
    const session = await getServerSession(authOptions);

    if (!session) {
      console.error('ERROR: No valid session found');
      return Response.json(
        { error: 'Unauthorized - No valid session' },
        { status: 401 }
      );
    }

    console.log('Session found for user:', session.user?.email);
    console.log('Session user details:', {
      email: session.user?.email,
      id: session.user?.id,
      role: session.user?.role,
      s3Prefix: session.user?.s3Prefix,
      idcUserId: session.user?.idcUserId,
      hasIdcAccessToken: !!session.idcAccessToken,
      idcAccessTokenLength: session.idcAccessToken?.length || 0,
    });

    const userPrefix = session.user.s3Prefix || session.user.idcUserId;
    const idcUserId = session.user.idcUserId;

    console.log('User prefix for S3:', userPrefix);
    console.log('IDC User ID:', idcUserId);

    if (!session.idcAccessToken) {
      console.error('ERROR: Missing IDC access token in session');
      console.error('Session keys present:', Object.keys(session));
      console.error('User keys present:', Object.keys(session.user || {}));
      return Response.json(
        { error: 'Missing IDC access token in session; re-authenticate to refresh your session.' },
        { status: 401 }
      );
    }

    console.log('IDC access token present in session (length):', session.idcAccessToken.length);
    console.log('IDC access token preview (first 50 chars):', session.idcAccessToken.substring(0, 50) + '...');

    if (!IDC_TOKEN_EXCHANGE_ROLE_ARN) {
      console.error('ERROR: IDC_TOKEN_EXCHANGE_ROLE_ARN is not configured');
      console.error('Environment variables present:', {
        IDC_TOKEN_EXCHANGE_ROLE_ARN: !!IDC_TOKEN_EXCHANGE_ROLE_ARN,
        S3_ACCESS_GRANTS_INSTANCE_ARN: !!S3_ACCESS_GRANTS_INSTANCE_ARN,
        S3_USER_DATA_BUCKET: !!S3_USER_DATA_BUCKET,
        AWS_ACCOUNT_ID: !!AWS_ACCOUNT_ID,
        REGION: REGION,
      });
      return Response.json(
        { error: 'Server configuration error: IDC token exchange role not set' },
        { status: 500 }
      );
    }

    console.log('Configuration check passed');
    console.log('IDC_TOKEN_EXCHANGE_ROLE_ARN:', IDC_TOKEN_EXCHANGE_ROLE_ARN);
    console.log('Region:', REGION);

    let credentials;

    try {
      console.log('Attempting IDC OIDC Token Exchange...');
      console.log('Calling AssumeRoleWithWebIdentity with:', {
        roleArn: IDC_TOKEN_EXCHANGE_ROLE_ARN,
        roleSessionName: `idc-user-${idcUserId}`,
        idcUserId: idcUserId,
        tokenLength: session.idcAccessToken.length,
      });

      credentials = await getCredentialsViaIdcToken(session.idcAccessToken, idcUserId);

      console.log('SUCCESS: IDC OIDC Token Exchange completed successfully');
      console.log('Credentials obtained:', {
        accessKeyId: credentials.accessKeyId?.substring(0, 10) + '...',
        hasSecretAccessKey: !!credentials.secretAccessKey,
        hasSessionToken: !!credentials.sessionToken,
        expiration: credentials.expiration,
      });
    } catch (error) {
      console.error('========================================');
      console.error('ERROR: IDC token exchange failed');
      console.error('========================================');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error stack:', error.stack);

      if (error.$metadata) {
        console.error('AWS Error metadata:', {
          httpStatusCode: error.$metadata.httpStatusCode,
          requestId: error.$metadata.requestId,
          attempts: error.$metadata.attempts,
        });
      }

      console.error('Token exchange parameters used:', {
        roleArn: IDC_TOKEN_EXCHANGE_ROLE_ARN,
        roleSessionName: `idc-user-${idcUserId}`,
        region: REGION,
        tokenPresent: !!session.idcAccessToken,
        tokenLength: session.idcAccessToken?.length,
      });

      return Response.json(
        { error: 'Unable to obtain AWS credentials via IDC token exchange', details: error.message },
        { status: error.name === 'NotAuthorizedException' ? 401 : 500 }
      );
    }

    console.log('Preparing response with credentials');
    const response = {
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: credentials.expiration,
      },
      s3Bucket: S3_USER_DATA_BUCKET,
      userPrefix: `users/${userPrefix}/`,
      idcUserId: idcUserId,
      region: REGION,
    };

    console.log('Response prepared (without sensitive data):', {
      s3Bucket: response.s3Bucket,
      userPrefix: response.userPrefix,
      idcUserId: response.idcUserId,
      region: response.region,
      hasCredentials: !!response.credentials,
    });
    console.log('========================================');
    console.log('S3 Credentials API - GET Request Completed Successfully');
    console.log('========================================');

    return Response.json(response);

  } catch (error) {
    console.error('Error getting S3 credentials:', error);

    if (error.name === 'NotAuthorizedException' || error.name === 'ExpiredTokenException') {
      return Response.json(
        { error: 'Authentication expired. Please sign in again.' },
        { status: 401 }
      );
    }

    return Response.json(
      { error: 'Failed to get S3 access credentials', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST handler for S3 Access Grants - GetDataAccess
 * Returns scoped credentials for specific S3 paths
 * Uses IDC credentials (via token exchange) to preserve identity through to S3 Access Grants
 */
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return Response.json(
        { error: 'Unauthorized - No valid session' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { target, permission = 'READ' } = body;

    if (!target) {
      return Response.json(
        { error: 'Missing target parameter' },
        { status: 400 }
      );
    }

    if (!S3_ACCESS_GRANTS_INSTANCE_ARN || !AWS_ACCOUNT_ID) {
      console.error('Missing S3 Access Grants configuration');
      return Response.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const idcUserId = session.user.idcUserId;
    if (!session.idcAccessToken) {
      return Response.json(
        { error: 'Missing IDC access token in session; re-authenticate to refresh your session.' },
        { status: 401 }
      );
    }

    if (!IDC_TOKEN_EXCHANGE_ROLE_ARN) {
      console.error('IDC_TOKEN_EXCHANGE_ROLE_ARN is not configured');
      return Response.json(
        { error: 'Server configuration error: IDC token exchange role not set' },
        { status: 500 }
      );
    }

    let baseCredentials;

    try {
      baseCredentials = await getCredentialsViaIdcToken(session.idcAccessToken, idcUserId);
      console.log('✓ Using IDC credentials for S3 Access Grants GetDataAccess');
    } catch (error) {
      console.error('IDC token exchange failed:', error.message);
      return Response.json(
        { error: 'Unable to obtain base AWS credentials via IDC token exchange', details: error.message },
        { status: error.name === 'NotAuthorizedException' ? 401 : 500 }
      );
    }

    // Use base credentials to call S3 Access Grants GetDataAccess
    const s3ControlClient = new S3ControlClient({
      region: REGION,
      credentials: {
        accessKeyId: baseCredentials.accessKeyId,
        secretAccessKey: baseCredentials.secretAccessKey,
        sessionToken: baseCredentials.sessionToken,
      },
    });

    const s3Target = target.startsWith('s3://')
      ? target
      : `s3://${S3_USER_DATA_BUCKET}/${target}`;

    const dataAccessResponse = await s3ControlClient.send(new GetDataAccessCommand({
      AccountId: AWS_ACCOUNT_ID,
      Target: s3Target,
      Permission: permission, // READ, WRITE, or READWRITE
      DurationSeconds: 3600, // 1 hour
    }));

    return Response.json({
      method: 'idc-oidc',
      credentials: {
        accessKeyId: dataAccessResponse.Credentials.AccessKeyId,
        secretAccessKey: dataAccessResponse.Credentials.SecretAccessKey,
        sessionToken: dataAccessResponse.Credentials.SessionToken,
        expiration: dataAccessResponse.Credentials.Expiration?.toISOString(),
      },
      matchedGrantTarget: dataAccessResponse.MatchedGrantTarget,
      s3Target,
      idcUserId,
      region: REGION,
    });

  } catch (error) {
    console.error('Error getting S3 data access:', error);

    if (error.name === 'AccessDeniedException') {
      return Response.json(
        { error: 'Access denied to the requested S3 path', details: error.message },
        { status: 403 }
      );
    }

    if (error.name === 'NotAuthorizedException' || error.name === 'ExpiredTokenException') {
      return Response.json(
        { error: 'Authentication expired. Please sign in again.' },
        { status: 401 }
      );
    }

    return Response.json(
      { error: 'Failed to get S3 data access', details: error.message },
      { status: 500 }
    );
  }
}
