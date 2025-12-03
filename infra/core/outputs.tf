# Core Infrastructure Outputs
# These will be consumed by the app infrastructure stage

# Cognito Outputs
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID"
  value       = aws_cognito_user_pool_client.web_app.id
}

output "cognito_user_pool_client_secret" {
  description = "Cognito User Pool Client Secret"
  value       = aws_cognito_user_pool_client.web_app.client_secret
  sensitive   = true
}

output "cognito_domain" {
  description = "Cognito User Pool Domain"
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com"
}

output "cognito_issuer" {
  description = "Cognito Issuer URL"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = aws_cognito_identity_pool.main.id
}

# S3 Outputs
output "s3_static_bucket_name" {
  description = "S3 bucket for static assets"
  value       = aws_s3_bucket.static_assets.bucket
}

output "s3_static_bucket_arn" {
  description = "S3 bucket ARN for static assets"
  value       = aws_s3_bucket.static_assets.arn
}

output "s3_static_bucket_regional_domain_name" {
  description = "S3 bucket regional domain name for static assets"
  value       = aws_s3_bucket.static_assets.bucket_regional_domain_name
}

output "s3_user_data_bucket_name" {
  description = "S3 bucket for user data"
  value       = aws_s3_bucket.user_data.bucket
}

output "s3_user_data_bucket_arn" {
  description = "S3 bucket ARN for user data"
  value       = aws_s3_bucket.user_data.arn
}

output "s3_nextjs_cache_bucket_name" {
  description = "S3 bucket for Next.js ISR cache"
  value       = aws_s3_bucket.nextjs_cache.bucket
}

output "s3_nextjs_cache_bucket_arn" {
  description = "S3 bucket ARN for Next.js ISR cache"
  value       = aws_s3_bucket.nextjs_cache.arn
}

# S3 Access Grants Outputs
output "s3_access_grants_instance_arn" {
  description = "S3 Access Grants Instance ARN"
  value       = aws_s3control_access_grants_instance.main.access_grants_instance_arn
}

output "s3_access_grants_location_id" {
  description = "S3 Access Grants Location ID"
  value       = aws_s3control_access_grants_location.user_data_bucket.access_grants_location_id
}

# DynamoDB Outputs
output "dynamodb_users_table_name" {
  description = "DynamoDB users table name"
  value       = aws_dynamodb_table.users.name
}

output "dynamodb_users_table_arn" {
  description = "DynamoDB users table ARN"
  value       = aws_dynamodb_table.users.arn
}

# IAM Outputs
output "lambda_execution_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda_execution.arn
}

output "lambda_execution_role_name" {
  description = "Lambda execution role name"
  value       = aws_iam_role.lambda_execution.name
}

output "cognito_authenticated_role_arn" {
  description = "Cognito authenticated role ARN"
  value       = aws_iam_role.cognito_authenticated.arn
}

output "cognito_unauthenticated_role_arn" {
  description = "Cognito unauthenticated role ARN"
  value       = aws_iam_role.cognito_unauthenticated.arn
}

# IDC OIDC Outputs
output "idc_oidc_provider_arn" {
  description = "IDC OIDC Provider ARN"
  value       = length(aws_iam_openid_connect_provider.idc) > 0 ? aws_iam_openid_connect_provider.idc[0].arn : ""
}

output "idc_token_exchange_role_arn" {
  description = "IDC Token Exchange Role ARN"
  value       = aws_iam_role.idc_token_exchange.arn
}

# Random values
output "nextauth_secret" {
  description = "NextAuth secret for JWT signing"
  value       = random_password.nextauth_secret.result
  sensitive   = true
}

# Account and Region
output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

output "aws_region" {
  description = "AWS Region"
  value       = data.aws_region.current.name
}
