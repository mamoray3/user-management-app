# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "static_assets" {
  name                              = "${var.project_name}-oac-${var.environment}"
  description                       = "OAC for ${var.project_name} static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Cache Policy
resource "aws_cloudfront_cache_policy" "static_assets" {
  name        = "${var.project_name}-static-cache-${var.environment}"
  comment     = "Cache policy for static assets"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# CloudFront Cache Policy for SSR
resource "aws_cloudfront_cache_policy" "ssr" {
  name        = "${var.project_name}-ssr-cache-${var.environment}"
  comment     = "Cache policy for SSR content"
  default_ttl = 0
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }
    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "Accept"]
      }
    }
    query_strings_config {
      query_string_behavior = "all"
    }
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# CloudFront Origin Request Policy for SSR
resource "aws_cloudfront_origin_request_policy" "ssr" {
  name    = "${var.project_name}-ssr-origin-${var.environment}"
  comment = "Origin request policy for SSR"

  cookies_config {
    cookie_behavior = "all"
  }
  headers_config {
    header_behavior = "allExcept"
    headers {
      items = ["Host"]
    }
  }
  query_strings_config {
    query_string_behavior = "all"
  }
}

# Lambda@Edge or Lambda Function URL for SSR
resource "aws_lambda_function" "server" {
  filename         = data.archive_file.lambda_server.output_path
  function_name    = "${var.project_name}-server-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 1024
  source_code_hash = data.archive_file.lambda_server.output_base64sha256

  environment {
    variables = {
      # NEXTAUTH_URL will be set after CloudFront is created via deploy script or manual update
      NEXTAUTH_URL     = var.domain_name != "" ? "https://${var.domain_name}" : "https://placeholder.cloudfront.net"
      NEXTAUTH_SECRET  = var.nextauth_secret
      API_BASE_URL     = aws_apigatewayv2_stage.api.invoke_url
      SAML_ISSUER      = var.saml_issuer
      SAML_ENTRY_POINT = var.saml_entry_point
      SAML_CERT        = var.saml_cert
      # Role Mapping - AWS Identity Center Group IDs
      ROLE_MAPPING_ADMIN         = var.role_mapping_admin
      ROLE_MAPPING_DATA_OWNER    = var.role_mapping_data_owner
      ROLE_MAPPING_PROCESS_OWNER = var.role_mapping_process_owner
      ROLE_MAPPING_VIEWER        = var.role_mapping_viewer
    }
  }

  tags = {
    Name = "${var.project_name}-server"
  }

  lifecycle {
    ignore_changes = [environment[0].variables["NEXTAUTH_URL"]]
  }
}

# Lambda Function URL for SSR
resource "aws_lambda_function_url" "server" {
  function_name      = aws_lambda_function.server.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = true
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    max_age           = 86400
  }
}

# Placeholder archive for server Lambda (to be replaced by open-next build output)
data "archive_file" "lambda_server" {
  type        = "zip"
  output_path = "${path.module}/lambda_server.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder - deploy open-next build' });"
    filename = "index.js"
  }
}

# CloudWatch Log Group for Server Lambda
resource "aws_cloudwatch_log_group" "server" {
  name              = "/aws/lambda/${aws_lambda_function.server.function_name}"
  retention_in_days = 30
}

# CloudFront Function to add x-forwarded-host header
resource "aws_cloudfront_function" "add_host_header" {
  name    = "${var.project_name}-add-host-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Add x-forwarded-host header for SSR"
  publish = true
  code    = <<-EOF
function handler(event) {
  var request = event.request;
  request.headers['x-forwarded-host'] = {value: request.headers.host.value};
  return request;
}
EOF
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.project_name} frontend distribution"
  default_root_object = ""
  price_class         = "PriceClass_100"

  aliases = var.domain_name != "" ? [var.domain_name] : []

  # Origin for static assets (S3)
  origin {
    domain_name              = aws_s3_bucket.static_assets.bucket_regional_domain_name
    origin_id                = "S3-static-assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.static_assets.id
  }

  # Origin for SSR (Lambda Function URL)
  origin {
    domain_name = replace(replace(aws_lambda_function_url.server.function_url, "https://", ""), "/", "")
    origin_id   = "Lambda-SSR"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default behavior - SSR
  default_cache_behavior {
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    target_origin_id         = "Lambda-SSR"
    viewer_protocol_policy   = "redirect-to-https"
    compress                 = true
    cache_policy_id          = aws_cloudfront_cache_policy.ssr.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.ssr.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.add_host_header.arn
    }
  }

  # Cache behavior for static assets
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-static-assets"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static_assets.id
  }

  # Cache behavior for public assets
  ordered_cache_behavior {
    path_pattern           = "/public/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-static-assets"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.static_assets.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == ""
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404"
  }

  tags = {
    Name = "${var.project_name}-distribution"
  }
}

# Update Lambda NEXTAUTH_URL after CloudFront is created (breaks the cycle)
resource "null_resource" "update_lambda_env" {
  depends_on = [aws_cloudfront_distribution.frontend, aws_lambda_function.server]

  triggers = {
    cloudfront_domain = aws_cloudfront_distribution.frontend.domain_name
  }

  provisioner "local-exec" {
    command = <<-EOT
      if [ "${var.domain_name}" = "" ]; then
        aws lambda update-function-configuration \
          --function-name ${aws_lambda_function.server.function_name} \
          --environment "Variables={NEXTAUTH_URL=https://${aws_cloudfront_distribution.frontend.domain_name},NEXTAUTH_SECRET=${var.nextauth_secret},API_BASE_URL=${aws_apigatewayv2_stage.api.invoke_url},SAML_ISSUER=${var.saml_issuer},SAML_ENTRY_POINT=${var.saml_entry_point},SAML_CERT=${var.saml_cert}}" \
          --region ${var.aws_region}
      fi
    EOT
  }
}
