variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "user-management"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "domain_name" {
  description = "Custom domain name for CloudFront distribution (optional)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for custom domain (optional)"
  type        = string
  default     = ""
}

variable "nextauth_secret" {
  description = "Secret key for NextAuth.js session encryption"
  type        = string
  sensitive   = true
}

variable "saml_issuer" {
  description = "SAML Issuer URL from AWS Identity Center"
  type        = string
}

variable "saml_entry_point" {
  description = "SAML Entry Point URL from AWS Identity Center"
  type        = string
}

variable "saml_client_id" {
  description = "SAML Client ID from AWS Identity Center"
  type        = string
}

variable "saml_client_secret" {
  description = "SAML Client Secret from AWS Identity Center"
  type        = string
  sensitive   = true
}
