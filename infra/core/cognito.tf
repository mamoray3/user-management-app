# =============================================================================
# Cognito User Pool + Identity Pool for S3 Access Grants
# Authentication Flow: App (OIDC) → Cognito User Pool (SAML) → IDC → Entra ID
# =============================================================================

# -----------------------------------------------------------------------------
# Cognito User Pool - Federates with IDC via SAML, issues OIDC tokens to app
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  # User attributes
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy (for local users, if any)
  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Standard schema attributes
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "given_name"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  schema {
    name                     = "family_name"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  # Custom attribute for S3 prefix mapping
  schema {
    name                     = "s3_prefix"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  # Custom attribute for user ID from IDC
  schema {
    name                     = "idc_user_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  # Custom attribute for IDC access token (for OIDC token exchange)
  schema {
    name                     = "idc_access_token"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 2048
    }
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # MFA configuration
  mfa_configuration = "OFF"

  tags = {
    Name        = "${var.project_name}-${var.environment}-user-pool"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Cognito User Pool Domain - For hosted UI
# -----------------------------------------------------------------------------

resource "random_string" "cognito_domain_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${var.environment}-${random_string.cognito_domain_suffix.result}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# -----------------------------------------------------------------------------
# SAML Identity Provider - AWS Identity Center
# -----------------------------------------------------------------------------

resource "aws_cognito_identity_provider" "idc_saml" {
  count = var.idc_saml_metadata_url != "" ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "IdentityCenter"
  provider_type = "SAML"

  provider_details = {
    MetadataURL             = var.idc_saml_metadata_url
    IDPSignout              = "false"
    RequestSigningAlgorithm = "rsa-sha256"
  }

  # Map SAML attributes to Cognito user attributes
  # Note: 'cognito:groups' is populated automatically from the SAML Group attribute
  attribute_mapping = {
    email       = "email"
    given_name  = "firstName"
    family_name = "lastName"
    username    = "email"
    # Custom attribute mappings
    "custom:idc_user_id"      = "Subject"
    "custom:s3_prefix"        = "s3Prefix"
    "custom:idc_access_token" = "accessToken"
  }

  # IDC sends groups in the SAML assertion when configured in:
  # IDC > Applications > Your App > Attribute mappings > Groups
  # The groups appear in the ID token as 'cognito:groups' claim

  /*
  lifecycle {
    ignore_changes = [provider_details["MetadataURL"]]
  }
  */
}

# -----------------------------------------------------------------------------
# Cognito User Pool Client - For your web application
# -----------------------------------------------------------------------------

resource "aws_cognito_user_pool_client" "web_app" {
  name         = "${var.project_name}-${var.environment}-web-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # OAuth settings
  generate_secret                      = true # Required for authorization code flow with SAML
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]

  # Callback URLs (CloudFront URL will be added by app stage via AWS CLI)
  callback_urls = [
    "http://localhost:3000/api/auth/callback/cognito"
  ]

  logout_urls = [
    "http://localhost:3000/login"
  ]

  # Allow external updates to callback URLs without Terraform detecting drift
  /*
  lifecycle {
    ignore_changes = [callback_urls, logout_urls]
  }
*/

  # Supported identity providers
  supported_identity_providers = var.idc_saml_metadata_url != "" ? ["IdentityCenter"] : ["COGNITO"]

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Security settings
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # Read/write attributes
  read_attributes  = ["email", "given_name", "family_name", "custom:idc_user_id", "custom:s3_prefix", "custom:idc_access_token"]
  write_attributes = ["email", "given_name", "family_name", "custom:idc_user_id", "custom:s3_prefix", "custom:idc_access_token"]

  # CRITICAL: Explicit dependency on SAML provider
  # Note: depends_on alone is not enough! AWS Cognito silently accepts
  # invalid supported_identity_providers and sets them to null.
  # We need null_resource validation below to catch this.
  depends_on = [
    aws_cognito_identity_provider.idc_saml
  ]
}

# -----------------------------------------------------------------------------
# Validation: Verify Cognito Client Configuration
# -----------------------------------------------------------------------------
# AWS Cognito has a bug where it silently ignores supported_identity_providers
# if they don't exist, setting the value to null instead of failing.
# This null_resource validates the actual AWS state matches our intent.

resource "null_resource" "validate_cognito_client" {
  count = var.idc_saml_metadata_url != "" ? 1 : 0

  # Re-run validation when client or provider changes
  triggers = {
    client_id              = aws_cognito_user_pool_client.web_app.id
    provider_name          = try(aws_cognito_identity_provider.idc_saml[0].provider_name, "")
    expected_idp           = "IdentityCenter"
    user_pool_id           = aws_cognito_user_pool.main.id
    oauth_flows_enabled    = aws_cognito_user_pool_client.web_app.allowed_oauth_flows_user_pool_client
    supported_providers    = join(",", aws_cognito_user_pool_client.web_app.supported_identity_providers)
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e

      echo "Validating Cognito User Pool Client configuration..."

      # Get actual configuration from AWS
      CLIENT_CONFIG=$(aws cognito-idp describe-user-pool-client \
        --user-pool-id ${self.triggers.user_pool_id} \
        --client-id ${self.triggers.client_id} \
        --query 'UserPoolClient.{SupportedIdPs:SupportedIdentityProviders,OAuthEnabled:AllowedOAuthFlowsUserPoolClient}' \
        --output json)

      # Check if IdentityCenter is in supported providers
      SUPPORTED_IDPS=$(echo $CLIENT_CONFIG | jq -r '.SupportedIdPs // [] | @json')
      OAUTH_ENABLED=$(echo $CLIENT_CONFIG | jq -r '.OAuthEnabled')

      echo "Expected supported_identity_providers: [\"IdentityCenter\"]"
      echo "Actual supported_identity_providers: $SUPPORTED_IDPS"
      echo "Expected OAuth enabled: true"
      echo "Actual OAuth enabled: $OAUTH_ENABLED"

      # Validate IdentityCenter is in the list
      if ! echo "$SUPPORTED_IDPS" | jq -e '. | index("IdentityCenter")' > /dev/null; then
        echo "ERROR: Cognito client does not have 'IdentityCenter' in supported_identity_providers!"
        echo "This indicates a Terraform/AWS race condition or API bug."
        echo "Run 'terraform apply' again to fix this issue."
        exit 1
      fi

      # Validate OAuth is enabled
      if [ "$OAUTH_ENABLED" != "true" ]; then
        echo "ERROR: OAuth flows are not enabled on the Cognito client!"
        echo "This will prevent SAML authentication from working."
        exit 1
      fi

      echo "✓ Cognito User Pool Client configuration is valid!"
    EOT
  }

  depends_on = [
    aws_cognito_user_pool_client.web_app,
    aws_cognito_identity_provider.idc_saml
  ]
}

# -----------------------------------------------------------------------------
# Cognito Identity Pool - For AWS credentials (S3 Access via Access Grants)
# -----------------------------------------------------------------------------

resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${var.project_name}-${var.environment}-identity-pool"
  allow_unauthenticated_identities = false
  allow_classic_flow               = false

  # Link to Cognito User Pool
  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.web_app.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-identity-pool"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# IAM Roles for Cognito Identity Pool
# -----------------------------------------------------------------------------

# Authenticated user role - gets S3 access via Access Grants
resource "aws_iam_role" "cognito_authenticated" {
  name = "${var.project_name}-${var.environment}-cognito-auth"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "authenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-cognito-authenticated"
    Environment = var.environment
  }
}

# Policy for authenticated users to use S3 Access Grants
resource "aws_iam_role_policy" "cognito_authenticated_s3_access_grants" {
  name = "s3-access-grants-policy"
  role = aws_iam_role.cognito_authenticated.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowGetDataAccess"
        Effect = "Allow"
        Action = [
          "s3:GetDataAccess"
        ]
        Resource = "*"
      },
      {
        Sid    = "AllowS3AccessGrantsOperations"
        Effect = "Allow"
        Action = [
          "s3:GetAccessGrantsInstanceForPrefix",
          "s3:ListAccessGrants"
        ]
        Resource = "*"
      }
    ]
  })
}

# Unauthenticated role (minimal/no permissions)
resource "aws_iam_role" "cognito_unauthenticated" {
  name = "${var.project_name}-${var.environment}-cognito-unauth"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "cognito-identity.amazonaws.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "cognito-identity.amazonaws.com:aud" = aws_cognito_identity_pool.main.id
          }
          "ForAnyValue:StringLike" = {
            "cognito-identity.amazonaws.com:amr" = "unauthenticated"
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-cognito-unauthenticated"
    Environment = var.environment
  }
}

# Attach roles to Identity Pool
resource "aws_cognito_identity_pool_roles_attachment" "main" {
  identity_pool_id = aws_cognito_identity_pool.main.id

  roles = {
    authenticated   = aws_iam_role.cognito_authenticated.arn
    unauthenticated = aws_iam_role.cognito_unauthenticated.arn
  }
}
