# ==================================================================================
# App Infrastructure Outputs
# ==================================================================================

# CloudFront Distribution
output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.frontend.arn
}

# API Gateway
output "api_gateway_invoke_url" {
  description = "API Gateway invoke URL"
  value       = aws_apigatewayv2_stage.api.invoke_url
}

output "api_gateway_id" {
  description = "API Gateway ID"
  value       = aws_apigatewayv2_api.api.id
}

# Lambda Functions
output "lambda_api_function_name" {
  description = "API Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "lambda_api_function_arn" {
  description = "API Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "lambda_authorizer_function_name" {
  description = "Authorizer Lambda function name"
  value       = aws_lambda_function.authorizer.function_name
}

output "lambda_authorizer_function_arn" {
  description = "Authorizer Lambda function ARN"
  value       = aws_lambda_function.authorizer.arn
}

output "lambda_server_function_name" {
  description = "Server Lambda function name"
  value       = aws_lambda_function.server.function_name
}

output "lambda_server_function_arn" {
  description = "Server Lambda function ARN"
  value       = aws_lambda_function.server.arn
}

output "lambda_server_function_url" {
  description = "Server Lambda function URL"
  value       = aws_lambda_function_url.server.function_url
}

# S3 Static Assets Bucket (from core)
output "s3_bucket_name" {
  description = "S3 bucket for static assets"
  value       = data.terraform_remote_state.core.outputs.s3_static_bucket_name
}

# Frontend Application URLs
output "frontend_url" {
  description = "Frontend application URL"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "api_url" {
  description = "Backend API URL"
  value       = aws_apigatewayv2_stage.api.invoke_url
}
