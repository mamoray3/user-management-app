"""
User Management API Lambda Handlers
"""
import json
import os
import uuid
from datetime import datetime
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr
from aws_lambda_powertools import Logger, Tracer
from aws_lambda_powertools.utilities.typing import LambdaContext
from aws_lambda_powertools.event_handler import APIGatewayHttpResolver
from aws_lambda_powertools.event_handler.exceptions import (
    BadRequestError,
    NotFoundError,
    UnauthorizedError,
    ForbiddenError,
)

# Initialize utilities
logger = Logger()
tracer = Tracer()
app = APIGatewayHttpResolver()

# DynamoDB setup
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('USERS_TABLE_NAME', 'users')
table = dynamodb.Table(table_name)


class DecimalEncoder(json.JSONEncoder):
    """Handle Decimal types from DynamoDB."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


def get_user_from_token(event):
    """Extract user info from the request context (set by API Gateway authorizer)."""
    try:
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        
        return {
            'id': authorizer.get('userId', ''),
            'email': authorizer.get('email', ''),
            'role': authorizer.get('role', 'user'),
        }
    except Exception as e:
        logger.error(f"Error extracting user from token: {e}")
        return None


def require_admin(current_user):
    """Check if the current user is an admin."""
    if not current_user or current_user.get('role') != 'admin':
        raise ForbiddenError("Admin access required")


def format_user_response(user):
    """Format user data for API response."""
    if not user:
        return None
    
    return {
        'id': user.get('id'),
        'name': user.get('name'),
        'email': user.get('email'),
        'role': user.get('role', 'user'),
        'status': user.get('status', 'pending'),
        'department': user.get('department', ''),
        'phone': user.get('phone', ''),
        'createdAt': user.get('createdAt'),
        'updatedAt': user.get('updatedAt'),
        'lastLogin': user.get('lastLogin'),
        'approvedBy': user.get('approvedBy'),
        'approvedAt': user.get('approvedAt'),
    }


@app.get("/users")
@tracer.capture_method
def get_users():
    """Get all users with optional status filter."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")

        # Get query parameters
        status_filter = app.current_event.get_query_string_value("status")
        
        if status_filter:
            # Filter by status
            response = table.scan(
                FilterExpression=Attr('status').eq(status_filter)
            )
        else:
            # Get all users
            response = table.scan()

        users = [format_user_response(user) for user in response.get('Items', [])]
        
        # Sort by createdAt descending
        users.sort(key=lambda x: x.get('createdAt', ''), reverse=True)

        return {"users": users}

    except Exception as e:
        logger.error(f"Error fetching users: {e}")
        raise


@app.get("/users/<user_id>")
@tracer.capture_method
def get_user(user_id: str):
    """Get a single user by ID."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")

        response = table.get_item(Key={'id': user_id})
        
        if 'Item' not in response:
            raise NotFoundError(f"User with id '{user_id}' not found")

        return format_user_response(response['Item'])

    except NotFoundError:
        raise
    except Exception as e:
        logger.error(f"Error fetching user {user_id}: {e}")
        raise


@app.post("/users")
@tracer.capture_method
def create_user():
    """Create a new user."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")
        
        require_admin(current_user)

        body = app.current_event.json_body
        if not body:
            raise BadRequestError("Request body is required")

        # Validate required fields
        required_fields = ['name', 'email']
        for field in required_fields:
            if not body.get(field):
                raise BadRequestError(f"Field '{field}' is required")

        # Check if email already exists
        existing_users = table.scan(
            FilterExpression=Attr('email').eq(body['email'])
        )
        if existing_users.get('Items'):
            raise BadRequestError("A user with this email already exists")

        now = datetime.utcnow().isoformat() + 'Z'
        
        user = {
            'id': str(uuid.uuid4()),
            'name': body['name'],
            'email': body['email'].lower(),
            'role': body.get('role', 'user'),
            'status': body.get('status', 'pending'),
            'department': body.get('department', ''),
            'phone': body.get('phone', ''),
            'createdAt': now,
            'updatedAt': now,
            'createdBy': current_user.get('email', ''),
        }

        table.put_item(Item=user)
        
        logger.info(f"User created: {user['id']} by {current_user.get('email')}")
        
        return format_user_response(user)

    except (BadRequestError, ForbiddenError):
        raise
    except Exception as e:
        logger.error(f"Error creating user: {e}")
        raise


@app.put("/users/<user_id>")
@tracer.capture_method
def update_user(user_id: str):
    """Update an existing user."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")
        
        require_admin(current_user)

        body = app.current_event.json_body
        if not body:
            raise BadRequestError("Request body is required")

        # Check if user exists
        response = table.get_item(Key={'id': user_id})
        if 'Item' not in response:
            raise NotFoundError(f"User with id '{user_id}' not found")

        now = datetime.utcnow().isoformat() + 'Z'
        
        # Build update expression
        update_expression_parts = ['#updatedAt = :updatedAt']
        expression_attribute_names = {'#updatedAt': 'updatedAt'}
        expression_attribute_values = {':updatedAt': now}

        allowed_fields = ['name', 'email', 'role', 'status', 'department', 'phone']
        
        for field in allowed_fields:
            if field in body:
                update_expression_parts.append(f'#{field} = :{field}')
                expression_attribute_names[f'#{field}'] = field
                value = body[field].lower() if field == 'email' else body[field]
                expression_attribute_values[f':{field}'] = value

        # Add updatedBy
        update_expression_parts.append('#updatedBy = :updatedBy')
        expression_attribute_names['#updatedBy'] = 'updatedBy'
        expression_attribute_values[':updatedBy'] = current_user.get('email', '')

        update_expression = 'SET ' + ', '.join(update_expression_parts)

        response = table.update_item(
            Key={'id': user_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )

        logger.info(f"User updated: {user_id} by {current_user.get('email')}")

        return format_user_response(response['Attributes'])

    except (BadRequestError, NotFoundError, ForbiddenError):
        raise
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}")
        raise


@app.delete("/users/<user_id>")
@tracer.capture_method
def delete_user(user_id: str):
    """Delete a user."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")
        
        require_admin(current_user)

        # Check if user exists
        response = table.get_item(Key={'id': user_id})
        if 'Item' not in response:
            raise NotFoundError(f"User with id '{user_id}' not found")

        table.delete_item(Key={'id': user_id})
        
        logger.info(f"User deleted: {user_id} by {current_user.get('email')}")

        return {"success": True, "message": "User deleted successfully"}

    except (NotFoundError, ForbiddenError):
        raise
    except Exception as e:
        logger.error(f"Error deleting user {user_id}: {e}")
        raise


@app.post("/users/<user_id>/approve")
@tracer.capture_method
def approve_user(user_id: str):
    """Approve a pending user."""
    try:
        current_user = get_user_from_token(app.current_event.raw_event)
        if not current_user:
            raise UnauthorizedError("Authentication required")
        
        require_admin(current_user)

        # Check if user exists
        response = table.get_item(Key={'id': user_id})
        if 'Item' not in response:
            raise NotFoundError(f"User with id '{user_id}' not found")

        user = response['Item']
        
        if user.get('status') != 'pending':
            raise BadRequestError("Only pending users can be approved")

        now = datetime.utcnow().isoformat() + 'Z'

        response = table.update_item(
            Key={'id': user_id},
            UpdateExpression='SET #status = :status, #approvedBy = :approvedBy, #approvedAt = :approvedAt, #updatedAt = :updatedAt',
            ExpressionAttributeNames={
                '#status': 'status',
                '#approvedBy': 'approvedBy',
                '#approvedAt': 'approvedAt',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues={
                ':status': 'active',
                ':approvedBy': current_user.get('email', ''),
                ':approvedAt': now,
                ':updatedAt': now,
            },
            ReturnValues='ALL_NEW'
        )

        logger.info(f"User approved: {user_id} by {current_user.get('email')}")

        return format_user_response(response['Attributes'])

    except (BadRequestError, NotFoundError, ForbiddenError):
        raise
    except Exception as e:
        logger.error(f"Error approving user {user_id}: {e}")
        raise


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat() + 'Z'
    }


@logger.inject_lambda_context
@tracer.capture_lambda_handler
def handler(event: dict, context: LambdaContext):
    """Main Lambda handler."""
    return app.resolve(event, context)
