# ==================================================================================
# Lambda Functions - Reference Core Infrastructure Outputs
# ==================================================================================

# Lambda function for API (User Management)
resource "aws_lambda_function" "api" {
  filename         = "${path.module}/../../backend/lambda_package.zip"
  function_name    = "${var.project_name}-api-${var.environment}"
  role             = data.terraform_remote_state.core.outputs.lambda_execution_role_arn
  handler          = "handlers.users.handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 512
  source_code_hash = filebase64sha256("${path.module}/../../backend/lambda_package.zip")

  environment {
    variables = {
      USERS_TABLE_NAME        = data.terraform_remote_state.core.outputs.dynamodb_users_table_name
      POWERTOOLS_SERVICE_NAME = var.project_name
      LOG_LEVEL               = "INFO"
    }
  }

  tracing_config {
    mode = "Active"
  }

  tags = {
    Name = "${var.project_name}-api"
  }
}

# Lambda function for Authorizer
resource "aws_lambda_function" "authorizer" {
  filename         = "${path.module}/../../backend/lambda_package.zip"
  function_name    = "${var.project_name}-authorizer-${var.environment}"
  role             = data.terraform_remote_state.core.outputs.lambda_execution_role_arn
  handler          = "handlers.authorizer.handler"
  runtime          = "python3.11"
  timeout          = 10
  memory_size      = 256
  source_code_hash = filebase64sha256("${path.module}/../../backend/lambda_package.zip")

  environment {
    variables = {
      NEXTAUTH_SECRET      = data.terraform_remote_state.core.outputs.nextauth_secret
      COGNITO_USER_POOL_ID = data.terraform_remote_state.core.outputs.cognito_user_pool_id
      COGNITO_CLIENT_ID    = data.terraform_remote_state.core.outputs.cognito_user_pool_client_id
      COGNITO_ISSUER       = data.terraform_remote_state.core.outputs.cognito_issuer
      ALLOWED_ISSUERS      = "nextauth,${data.terraform_remote_state.core.outputs.cognito_issuer}"
    }
  }

  tags = {
    Name = "${var.project_name}-authorizer"
  }
}

# Lambda function for Server (Next.js SSR)
resource "aws_lambda_function" "server" {
  filename         = data.archive_file.lambda_server.output_path
  function_name    = "${var.project_name}-server-${var.environment}"
  role             = data.terraform_remote_state.core.outputs.lambda_execution_role_arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 1024
  source_code_hash = data.archive_file.lambda_server.output_base64sha256

  environment {
    variables = {
      # Placeholder URL - will be updated by null_resource after CloudFront is created
      NEXTAUTH_URL    = "http://localhost:3000"
      NEXTAUTH_SECRET = data.terraform_remote_state.core.outputs.nextauth_secret
      API_BASE_URL    = aws_apigatewayv2_stage.api.invoke_url

      # Cognito Configuration (OIDC) - from core outputs
      COGNITO_CLIENT_ID     = data.terraform_remote_state.core.outputs.cognito_user_pool_client_id
      COGNITO_CLIENT_SECRET = data.terraform_remote_state.core.outputs.cognito_user_pool_client_secret
      COGNITO_USER_POOL_ID  = data.terraform_remote_state.core.outputs.cognito_user_pool_id
      COGNITO_ISSUER        = data.terraform_remote_state.core.outputs.cognito_issuer
      COGNITO_DOMAIN        = data.terraform_remote_state.core.outputs.cognito_domain

      # IDC OIDC Token Exchange (Primary Method)
      IDC_TOKEN_EXCHANGE_ROLE_ARN = data.terraform_remote_state.core.outputs.idc_token_exchange_role_arn

      # Cognito Identity Pool for AWS Credentials (Legacy Fallback)
      COGNITO_IDENTITY_POOL_ID = data.terraform_remote_state.core.outputs.cognito_identity_pool_id

      # S3 Access Grants
      S3_USER_DATA_BUCKET           = data.terraform_remote_state.core.outputs.s3_user_data_bucket_name
      S3_ACCESS_GRANTS_INSTANCE_ARN = data.terraform_remote_state.core.outputs.s3_access_grants_instance_arn
      AWS_ACCOUNT_ID                = data.terraform_remote_state.core.outputs.aws_account_id

      # Next.js ISR Cache
      CACHE_BUCKET_NAME   = data.terraform_remote_state.core.outputs.s3_nextjs_cache_bucket_name
      CACHE_BUCKET_REGION = data.terraform_remote_state.core.outputs.aws_region
    }
  }

  # Ignore changes to NEXTAUTH_URL as it will be updated externally
  /*
  lifecycle {
    ignore_changes = [environment[0].variables["NEXTAUTH_URL"]]
  }
  */

  tags = {
    Name = "${var.project_name}-server"
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

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${aws_lambda_function.api.function_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${aws_lambda_function.authorizer.function_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/aws/lambda/${aws_lambda_function.server.function_name}"
  retention_in_days = 30
}
