# Bucket de paso para Ansible: la conexión SSM no transfiere archivos por sí
# misma, así que Ansible los sube aquí y la VM los descarga con una URL firmada.
# No es el bucket del estado de Terraform (ese se crea a mano, antes del init).
resource "aws_s3_bucket" "ssm_transfer" {
  # AWS completa el nombre con un sufijo aleatorio (deben ser únicos en el mundo)
  bucket_prefix = "${var.project}-${var.environment}-ssm-"

  # Solo guarda archivos temporales: se puede borrar aunque no esté vacío
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "ssm_transfer" {
  bucket = aws_s3_bucket.ssm_transfer.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ssm_transfer" {
  bucket = aws_s3_bucket.ssm_transfer.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Ansible borra sus archivos al terminar; esto limpia lo que quede si una
# ejecución se corta a la mitad.
resource "aws_s3_bucket_lifecycle_configuration" "ssm_transfer" {
  bucket = aws_s3_bucket.ssm_transfer.id

  rule {
    id     = "borrar-temporales"
    status = "Enabled"

    filter {}

    expiration {
      days = 1
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
