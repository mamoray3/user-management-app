# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Lambda basic execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda X-Ray tracing policy
resource "aws_iam_role_policy_attachment" "lambda_xray" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# DynamoDB access policy for Lambda
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${var.project_name}-lambda-dynamodb-${var.environment}"
  role = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.users.arn,
          "${aws_dynamodb_table.users.arn}/index/*"
        ]
      }
    ]
  })
}

# Lambda function for API
resource "aws_lambda_function" "api" {
  filename         = data.archive_file.lambda_api.output_path
  function_name    = "${var.project_name}-api-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "handlers.users.handler"
  runtime          = "python3.11"
  timeout          = 30
  memory_size      = 512
  source_code_hash = data.archive_file.lambda_api.output_base64sha256

  environment {
    variables = {
      USERS_TABLE_NAME        = aws_dynamodb_table.users.name
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
  filename         = data.archive_file.lambda_api.output_path
  function_name    = "${var.project_name}-authorizer-${var.environment}"
  role             = aws_iam_role.lambda_execution.arn
  handler          = "handlers.authorizer.handler"
  runtime          = "python3.11"
  timeout          = 10
  memory_size      = 256
  source_code_hash = data.archive_file.lambda_api.output_base64sha256

  environment {
    variables = {
      NEXTAUTH_SECRET = var.nextauth_secret
      ALLOWED_ISSUERS = var.saml_issuer
    }
  }

  tags = {
    Name = "${var.project_name}-authorizer"
  }
}

# Archive the Lambda code
data "archive_file" "lambda_api" {
  type        = "zip"
  source_dir  = "${path.module}/../backend"
  output_path = "${path.module}/lambda_api.zip"
  excludes    = ["__pycache__", "*.pyc", ".pytest_cache"]
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
