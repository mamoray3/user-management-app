"""
JWT Authorizer Lambda for API Gateway
Validates tokens from the frontend application
"""
import os
import re
import jwt
from aws_lambda_powertools import Logger

logger = Logger()

# Configuration
NEXTAUTH_SECRET = os.environ.get('NEXTAUTH_SECRET', '')
ALLOWED_ISSUERS = os.environ.get('ALLOWED_ISSUERS', '').split(',')


def generate_policy(principal_id, effect, resource, context=None):
    """Generate IAM policy for API Gateway authorizer."""
    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': resource
                }
            ]
        }
    }
    
    if context:
        policy['context'] = context
    
    return policy


def extract_token(event):
    """Extract JWT token from the Authorization header."""
    auth_header = event.get('authorizationToken', '')
    
    if not auth_header:
        return None
    
    # Remove 'Bearer ' prefix if present
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    
    return auth_header


def validate_token(token):
    """Validate JWT token and return decoded payload."""
    try:
        # Decode without verification first to get issuer
        unverified = jwt.decode(token, options={"verify_signature": False})
        
        issuer = unverified.get('iss', '')
        
        # Verify the issuer is allowed
        if issuer and ALLOWED_ISSUERS and issuer not in ALLOWED_ISSUERS:
            logger.warning(f"Token from unauthorized issuer: {issuer}")
            return None
        
        # Decode and verify with secret
        decoded = jwt.decode(
            token,
            NEXTAUTH_SECRET,
            algorithms=['HS256'],
            options={
                'verify_exp': True,
                'verify_iat': True,
                'require': ['exp', 'iat']
            }
        )
        
        return decoded
        
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None


@logger.inject_lambda_context
def handler(event, context):
    """
    Lambda authorizer handler for API Gateway.
    
    Returns:
        IAM policy allowing or denying access to the API
    """
    logger.info("Authorizer invoked")
    
    token = extract_token(event)
    method_arn = event.get('methodArn', '')
    
    if not token:
        logger.warning("No token provided")
        raise Exception('Unauthorized')
    
    decoded = validate_token(token)
    
    if not decoded:
        logger.warning("Token validation failed")
        raise Exception('Unauthorized')
    
    # Extract user information from token
    user = decoded.get('user', {})
    user_id = user.get('id', decoded.get('sub', 'unknown'))
    email = user.get('email', '')
    role = user.get('role', 'user')
    
    # Build resource ARN pattern to allow all methods in the API
    # methodArn format: arn:aws:execute-api:{region}:{accountId}:{apiId}/{stage}/{method}/{resource}
    arn_parts = method_arn.split(':')
    api_gateway_arn = ':'.join(arn_parts[0:5])
    api_parts = arn_parts[5].split('/')
    resource = f"{api_gateway_arn}:{api_parts[0]}/*"
    
    # Create context to pass to downstream Lambda
    auth_context = {
        'userId': user_id,
        'email': email,
        'role': role,
    }
    
    logger.info(f"Authorized user: {email} with role: {role}")
    
    return generate_policy(user_id, 'Allow', resource, auth_context)
