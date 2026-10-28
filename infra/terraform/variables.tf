variable "project" {
  description = "Nombre del proyecto, usado en nombres y tags"
  type        = string
  default     = "atk"
}

variable "environment" {
  description = "Entorno (dev, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Región de AWS"
  type        = string
  default     = "sa-east-1"
}

variable "availability_zone" {
  description = "AZ de la subred. La VM y el volumen EBS deben quedar en la misma"
  type        = string
  default     = "sa-east-1a"
}

variable "vpc_cidr" {
  description = "Rango de IPs privadas de la VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr debe ser un CIDR válido, ej: 10.0.0.0/16."
  }
}

variable "public_subnet_cidr" {
  description = "Rango de la subred pública; debe estar dentro de vpc_cidr"
  type        = string
  default     = "10.0.1.0/24"

  validation {
    condition     = can(cidrhost(var.public_subnet_cidr, 0))
    error_message = "public_subnet_cidr debe ser un CIDR válido, ej: 10.0.1.0/24."
  }
}

variable "instance_type" {
  description = "Tipo de instancia EC2"
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "Tamaño del disco del sistema, en GiB"
  type        = number
  default     = 20
}

variable "data_volume_size" {
  description = "Tamaño del volumen EBS de datos (SQLite), en GiB"
  type        = number
  default     = 10
}
