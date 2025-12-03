# Common resources shared across core infrastructure

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Random password for NextAuth JWT signing
resource "random_password" "nextauth_secret" {
  length  = 32
  special = true
}
