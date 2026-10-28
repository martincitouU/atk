provider "aws" {
  region = var.region

  # Se aplican a todos los recursos. El inventario de Ansible filtra por Project.
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
