# =============================================================================
# S3 Access Grants for User-Level S3 Access
# Flow: Cognito Identity Pool → GetDataAccess() → Scoped S3 Credentials → S3
# =============================================================================

# -----------------------------------------------------------------------------
# S3 Bucket for User Data with Prefix Structure
# Structure: /users/{user-email}/ for user-specific files
# -----------------------------------------------------------------------------

resource "random_string" "user_data_bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket" "user_data" {
  bucket = "${var.project_name}-${var.environment}-user-data-${random_string.user_data_bucket_suffix.result}"

  tags = {
    Name        = "${var.project_name}-${var.environment}-user-data"
    Environment = var.environment
  }
}

# Enable versioning
resource "aws_s3_bucket_versioning" "user_data" {
  bucket = aws_s3_bucket.user_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "user_data" {
  bucket = aws_s3_bucket.user_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "user_data" {
  bucket = aws_s3_bucket.user_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CORS configuration for browser access
resource "aws_s3_bucket_cors_configuration" "user_data" {
  bucket = aws_s3_bucket.user_data.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = compact([
      "http://localhost:3000",
      var.domain_name != "" ? "https://${var.domain_name}" : null,
    ])
    expose_headers  = ["ETag", "x-amz-request-id", "x-amz-id-2"]
    max_age_seconds = 3600
    }
}

# -----------------------------------------------------------------------------
# S3 Access Grants Instance with Identity Center Integration
# This enables using IDC User IDs for per-user grants
# -----------------------------------------------------------------------------

resource "aws_s3control_access_grants_instance" "main" {
  account_id = data.aws_caller_identity.current.account_id

  # Link to Identity Center for directory-based grants
  # This allows using IDC User IDs (e.g., 3448e4c8-70b1-7069-c7f1-e42f103a6ab5) as grantees
  # Optional: If not set, only IAM principals can be used as grantees
  identity_center_arn = var.identity_center_arn != "" ? var.identity_center_arn : null

  tags = {
    Name        = "${var.project_name}-${var.environment}-access-grants"
    Environment = var.environment
  }

  # Workaround for provider bug where identity_center_application_arn remains unknown after apply
  lifecycle {
    ignore_changes = [identity_center_application_arn]
  }
} 

# -----------------------------------------------------------------------------
# S3 Access Grants Location - Root of the user data bucket
# -----------------------------------------------------------------------------

resource "aws_s3control_access_grants_location" "user_data_bucket" {
  account_id = data.aws_caller_identity.current.account_id

  location_scope = "s3://${aws_s3_bucket.user_data.bucket}/*"
  iam_role_arn   = aws_iam_role.access_grants_location.arn

  tags = {
    Name        = "${var.project_name}-${var.environment}-location-user-data"
    Environment = var.environment
  }

  depends_on = [aws_s3control_access_grants_instance.main]
}

# IAM Role for Access Grants Location
resource "aws_iam_role" "access_grants_location" {
  name = "${var.project_name}-${var.environment}-access-grants-loc"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "access-grants.s3.amazonaws.com"
        }
        Action = [
          "sts:AssumeRole",
          "sts:SetSourceIdentity"
        ]
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:s3:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:access-grants/default"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-access-grants-location"
    Environment = var.environment
  }
}

# Policy for Access Grants Location Role - Full access to bucket
resource "aws_iam_role_policy" "access_grants_location" {
  name = "s3-full-access"
  role = aws_iam_role.access_grants_location.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ObjectLevelReadPermissions"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:GetObjectAcl",
          "s3:GetObjectVersionAcl"
        ]
        Resource = "${aws_s3_bucket.user_data.arn}/*"
      },
      {
        Sid    = "ObjectLevelWritePermissions"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:DeleteObject",
          "s3:DeleteObjectVersion"
        ]
        Resource = "${aws_s3_bucket.user_data.arn}/*"
      },
      {
        Sid    = "BucketLevelReadPermissions"
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = aws_s3_bucket.user_data.arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Example S3 Access Grant - Template for user-level grants
# 
# Grant Types using Directory Identity (IDC User ID):
# - user-a (IDC User ID) → /users/{idc-user-id}/*
# - user-b (IDC User ID) → /users/{idc-user-id}/*
# 
# The IDC User ID (e.g., 3448e4c8-70b1-7069-c7f1-e42f103a6ab5) is used as:
# 1. The grantee identifier (DIRECTORY_USER)
# 2. The S3 prefix path (/users/{idc-user-id}/*)
# -----------------------------------------------------------------------------

# Grant for a specific IDC user - uses IDC User ID for both identity and path
resource "aws_s3control_access_grant" "example_user" {
  count = var.create_example_user_grant ? 1 : 0

  account_id                = data.aws_caller_identity.current.account_id
  access_grants_location_id = aws_s3control_access_grants_location.user_data_bucket.access_grants_location_id

  permission = "READWRITE"

  # Scope down to user's prefix using their IDC User ID
  access_grants_location_configuration {
    s3_sub_prefix = "users/${var.example_idc_user_id}/*"
  }

  # Grantee: Directory User (IDC User ID)
  grantee {
    grantee_type       = "DIRECTORY_USER"
    grantee_identifier = var.example_idc_user_id
  }

  tags = {
    Name        = "example-user-grant"
    IdcUserId   = var.example_idc_user_id
    Environment = var.environment
  }

  depends_on = [aws_s3control_access_grants_instance.main]
}

# Example grant for admins group - full bucket access
resource "aws_s3control_access_grant" "admin_full_access" {
  count = var.create_admin_grant && var.admin_idc_group_id != "" ? 1 : 0

  account_id                = data.aws_caller_identity.current.account_id
  access_grants_location_id = aws_s3control_access_grants_location.user_data_bucket.access_grants_location_id

  permission = "READWRITE"

  # Full bucket access for admins
  access_grants_location_configuration {
    s3_sub_prefix = "*"
  }

  # Grantee: Directory Group (IDC Group ID)
  grantee {
    grantee_type       = "DIRECTORY_GROUP"
    grantee_identifier = var.admin_idc_group_id
  }

  tags = {
    Name        = "admin-full-access-grant"
    Environment = var.environment
  }

  depends_on = [aws_s3control_access_grants_instance.main]
}

# Shared folder grant - for /shared/ prefix
resource "aws_s3control_access_grant" "shared_folder" {
  count = var.create_shared_grant ? 1 : 0

  account_id                = data.aws_caller_identity.current.account_id
  access_grants_location_id = aws_s3control_access_grants_location.user_data_bucket.access_grants_location_id

  permission = "READ"

  access_grants_location_configuration {
    s3_sub_prefix = "shared/*"
  }

  grantee {
    grantee_type       = "IAM"
    grantee_identifier = aws_iam_role.cognito_authenticated.arn
  }

  tags = {
    Name        = "shared-folder-grant"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Lambda Function for Dynamic Grant Management (Optional)
# Creates/deletes grants when users are provisioned/deprovisioned
# -----------------------------------------------------------------------------

resource "aws_iam_role" "grant_manager_lambda" {
  name = "${var.project_name}-${var.environment}-grant-manager"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-grant-manager"
    Environment = var.environment
  }
}

resource "aws_iam_role_policy" "grant_manager_lambda" {
  name = "access-grants-management"
  role = aws_iam_role.grant_manager_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageAccessGrants"
        Effect = "Allow"
        Action = [
          "s3:CreateAccessGrant",
          "s3:DeleteAccessGrant",
          "s3:GetAccessGrant",
          "s3:ListAccessGrants"
        ]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.users.arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Create initial folder structure in S3 bucket
# -----------------------------------------------------------------------------

resource "aws_s3_object" "users_folder" {
  bucket       = aws_s3_bucket.user_data.id
  key          = "users/"
  content_type = "application/x-directory"
  content      = ""
}

resource "aws_s3_object" "shared_folder" {
  bucket       = aws_s3_bucket.user_data.id
  key          = "shared/"
  content_type = "application/x-directory"
  content      = ""
}
