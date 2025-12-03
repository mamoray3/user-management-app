# ==================================================================================
# S3 Bucket Policy - Allow CloudFront OAC Access to Static Assets
# ==================================================================================

# S3 bucket policy for CloudFront OAC
resource "aws_s3_bucket_policy" "cloudfront_oac" {
  bucket = data.terraform_remote_state.core.outputs.s3_static_bucket_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${data.terraform_remote_state.core.outputs.s3_static_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
