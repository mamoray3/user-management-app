# ==================================================================================
# CloudFront Distribution - References Core S3 Bucket
# ==================================================================================

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "static_assets" {
  name                              = "${var.project_name}-oac-${var.environment}"
  description                       = "OAC for ${var.project_name} static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Cache Policy for Static Assets
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

  # Origin for static assets (S3) - Reference core S3 bucket
  origin {
    domain_name              = data.terraform_remote_state.core.outputs.s3_static_bucket_regional_domain_name
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
    cloudfront_default_certificate = true
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
