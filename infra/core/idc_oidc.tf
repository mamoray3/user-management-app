# =============================================================================
# AWS Identity Center (IDC) OIDC Provider for Direct AWS Credential Exchange
# =============================================================================
# This enables the application to exchange IDC OIDC tokens directly for AWS
# credentials via AssumeRoleWithWebIdentity, preserving IDC identity through
# to S3 Access Grants.
#
# Flow: Cognito User Pool (receives IDC token via SAML) → App (extracts IDC token)
#       → STS AssumeRoleWithWebIdentity → AWS Credentials → S3 Access Grants
# =============================================================================

# -----------------------------------------------------------------------------
# IDC OIDC Identity Provider
# -----------------------------------------------------------------------------
# This allows AWS to trust IDC OIDC tokens for AssumeRoleWithWebIdentity
# Note: The IDC OIDC issuer URL is typically:
# https://[your-region].awsapps.com/start/oidc
# -----------------------------------------------------------------------------

resource "aws_iam_openid_connect_provider" "idc" {
  count = var.idc_oidc_issuer_url != "" ? 1 : 0

  url = var.idc_oidc_issuer_url

  # IDC OIDC uses the same issuer URL as client ID
  client_id_list = [
    var.idc_oidc_client_id != "" ? var.idc_oidc_client_id : var.idc_oidc_issuer_url
  ]

  # Thumbprints for SSL certificate validation
  # AWS automatically validates against AWS-managed certificates for IDC
  thumbprint_list = var.idc_oidc_thumbprint != "" ? [var.idc_oidc_thumbprint] : ["0000000000000000000000000000000000000000"]

  tags = {
    Name        = "${var.project_name}-${var.environment}-idc-oidc"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# IAM Role for IDC OIDC Token Exchange
# -----------------------------------------------------------------------------
# This role can be assumed using IDC OIDC tokens via AssumeRoleWithWebIdentity
# It grants access to S3 Access Grants GetDataAccess API
# -----------------------------------------------------------------------------

resource "aws_iam_role" "idc_token_exchange" {
  name = "${var.project_name}-${var.environment}-idc-token-exchange"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = var.idc_oidc_issuer_url != "" ? aws_iam_openid_connect_provider.idc[0].arn : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${var.idc_oidc_issuer_url}"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "${replace(var.idc_oidc_issuer_url, "https://", "")}:aud" = var.idc_oidc_client_id != "" ? var.idc_oidc_client_id : var.idc_oidc_issuer_url
          }
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-${var.environment}-idc-token-exchange"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# IAM Policy for S3 Access Grants
# -----------------------------------------------------------------------------
# Grants permissions to use S3 Access Grants GetDataAccess API
# This is the same permission as the Cognito authenticated role
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "idc_token_exchange_s3_access_grants" {
  name = "s3-access-grants-policy"
  role = aws_iam_role.idc_token_exchange.id

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

# Outputs are defined in outputs.tf
