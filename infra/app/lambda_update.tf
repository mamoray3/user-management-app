# ==================================================================================
# Lambda Environment Variable Update - Updates NEXTAUTH_URL after CloudFront
# ==================================================================================

# Update Lambda Server environment to include CloudFront URL
resource "null_resource" "update_lambda_server_env" {
  depends_on = [
    aws_lambda_function.server,
    aws_cloudfront_distribution.frontend
  ]

  triggers = {
    cloudfront_domain = aws_cloudfront_distribution.frontend.domain_name
    lambda_function   = aws_lambda_function.server.function_name
    always_run        = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      # Get current Lambda configuration
      CURRENT_CONFIG=$(aws lambda get-function-configuration \
        --function-name ${aws_lambda_function.server.function_name} \
        --region ${var.aws_region})

      # Extract current environment variables
      CURRENT_ENV=$(echo "$CURRENT_CONFIG" | jq -r '.Environment.Variables')

      # Update NEXTAUTH_URL with CloudFront domain
      UPDATED_ENV=$(echo "$CURRENT_ENV" | jq '. + {"NEXTAUTH_URL": "https://${aws_cloudfront_distribution.frontend.domain_name}"}')

      # Update Lambda function environment
      aws lambda update-function-configuration \
        --function-name ${aws_lambda_function.server.function_name} \
        --environment "Variables=$UPDATED_ENV" \
        --region ${var.aws_region}

      echo "Updated Lambda Server NEXTAUTH_URL to: https://${aws_cloudfront_distribution.frontend.domain_name}"
    EOT
  }
}
