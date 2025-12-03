variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "user-management"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "idc_saml_metadata_url" {
  description = "IDC SAML metadata URL"
  type        = string
}

variable "idc_oidc_issuer_url" {
  description = "IDC OIDC issuer URL"
  type        = string
}

variable "idc_oidc_client_id" {
  description = "IDC OIDC Client ID"
  type        = string
  default     = ""
}

variable "idc_oidc_thumbprint" {
  description = "IDC OIDC Thumbprint for SSL certificate validation"
  type        = string
  default     = ""
}

variable "identity_center_arn" {
  description = "ARN of Identity Center instance for S3 Access Grants"
  type        = string
}

variable "domain_name" {
  description = "Custom domain name for CloudFront (will be set by app stage)"
  type        = string
  default     = ""
}

variable "role_mapping_admin" {
  description = "IDC group name for admin role"
  type        = string
  default     = ""
}

variable "role_mapping_data_owner" {
  description = "IDC group name for data owner role"
  type        = string
  default     = ""
}

variable "role_mapping_process_owner" {
  description = "IDC group name for process owner role"
  type        = string
  default     = ""
}

variable "role_mapping_viewer" {
  description = "IDC group name for viewer role"
  type        = string
  default     = ""
}



variable "create_example_user_grant" {
  description = "Whether to create example user grant"
  type        = bool
  default     = false
}

variable "example_idc_user_id" {
  description = "Example IDC User ID for test grant"
  type        = string
  default     = ""
}

variable "create_admin_grant" {
  description = "Whether to create admin group grant"
  type        = bool
  default     = false
}

variable "admin_idc_group_id" {
  description = "IDC Group ID for admins"
  type        = string
  default     = ""
}

variable "create_shared_grant" {
  description = "Whether to create shared folder grant"
  type        = bool
  default     = true
}
