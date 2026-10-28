terraform {
  # 1.11+ trae el bloqueo nativo del estado en S3 (use_lockfile), sin DynamoDB
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Configuración parcial: bucket, key y region vienen de backend.hcl
  # (terraform init -backend-config=backend.hcl). Lo que es igual para
  # todo el equipo queda fijo aquí.
  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
