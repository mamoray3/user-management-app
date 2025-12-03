# S3 Bucket for Static Assets (Open-Next)
resource "aws_s3_bucket" "static_assets" {
  bucket = "${var.project_name}-static-${var.environment}-${random_string.bucket_suffix.result}"

  tags = {
    Name = "${var.project_name}-static-assets"
  }
}

resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

resource "aws_s3_bucket_public_access_block" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "static_assets" {
  bucket = aws_s3_bucket.static_assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# S3 bucket policy for CloudFront OAC will be added by app stage

# S3 Bucket for Next.js ISR Cache (Open-Next)
resource "aws_s3_bucket" "nextjs_cache" {
  bucket = "${var.project_name}-nextjs-cache-${var.environment}-${random_string.bucket_suffix.result}"

  tags = {
    Name = "${var.project_name}-nextjs-cache"
  }
}

resource "aws_s3_bucket_public_access_block" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id
  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle policy to auto-delete old cache entries
resource "aws_s3_bucket_lifecycle_configuration" "nextjs_cache" {
  bucket = aws_s3_bucket.nextjs_cache.id

  rule {
    id     = "delete-old-cache"
    status = "Enabled"

    expiration {
      days = 30
    }
  }
}
