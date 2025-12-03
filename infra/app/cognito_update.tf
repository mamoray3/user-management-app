# ==================================================================================
# Cognito Callback URL Updater - Updates Core Cognito with CloudFront URL
# ==================================================================================

# Update Cognito callback URLs to include CloudFront domain
resource "null_resource" "update_cognito_callback_urls" {
  depends_on = [aws_cloudfront_distribution.frontend]

  triggers = {
    cloudfront_domain = aws_cloudfront_distribution.frontend.domain_name
    always_run        = timestamp() # Always update on every apply
  }

  provisioner "local-exec" {
    command = <<-EOT
      # Build callback and logout URLs
      CALLBACK_URLS=(
        "http://localhost:3000/api/auth/callback/cognito"
        "https://${aws_cloudfront_distribution.frontend.domain_name}/api/auth/callback/cognito"
      )

      LOGOUT_URLS=(
        "http://localhost:3000/login"
        "https://${aws_cloudfront_distribution.frontend.domain_name}/login"
      )

      # Convert arrays to JSON format
      CALLBACK_JSON=$(printf '%s\n' "$${CALLBACK_URLS[@]}" | jq -R . | jq -s .)
      LOGOUT_JSON=$(printf '%s\n' "$${LOGOUT_URLS[@]}" | jq -R . | jq -s .)

      # Update Cognito User Pool Client
      aws cognito-idp update-user-pool-client \
        --user-pool-id ${data.terraform_remote_state.core.outputs.cognito_user_pool_id} \
        --client-id ${data.terraform_remote_state.core.outputs.cognito_user_pool_client_id} \
        --callback-urls "$${CALLBACK_JSON}" \
        --logout-urls "$${LOGOUT_JSON}" \
        --allowed-o-auth-flows code \
        --allowed-o-auth-scopes email openid profile aws.cognito.signin.user.admin \
        --allowed-o-auth-flows-user-pool-client \
        --region ${var.aws_region}

      echo "Updated Cognito callback URLs to include CloudFront domain: ${aws_cloudfront_distribution.frontend.domain_name}"
    EOT
  }
}
