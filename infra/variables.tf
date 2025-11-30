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
  default     = "dev"
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

variable "saml_cert" {
  description = "X509 Certificate from AWS Identity Center SAML metadata"
  type        = string
  sensitive   = true
}

# Role Mapping - AWS Identity Center Group IDs
variable "role_mapping_admin" {
  description = "AWS Identity Center Group ID(s) for Admin role (comma-separated)"
  type        = string
  default     = ""
}

variable "role_mapping_data_owner" {
  description = "AWS Identity Center Group ID(s) for Data Owner role (comma-separated)"
  type        = string
  default     = ""
}

variable "role_mapping_process_owner" {
  description = "AWS Identity Center Group ID(s) for Process Owner role (comma-separated)"
  type        = string
  default     = ""
}

variable "role_mapping_viewer" {
  description = "AWS Identity Center Group ID(s) for Viewer role (comma-separated)"
  type        = string
  default     = ""
}
