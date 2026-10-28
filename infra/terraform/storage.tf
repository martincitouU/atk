# Volumen de datos (SQLite). Es un recurso separado de la VM para que
# sobreviva si la VM se destruye o se recrea.
resource "aws_ebs_volume" "data" {
  # Un EBS solo se puede conectar a una VM de su misma AZ
  availability_zone = aws_subnet.public.availability_zone
  size              = var.data_volume_size
  type              = "gp3"
  encrypted         = true

  # Terraform se niega a borrarlo. Para borrarlo de verdad hay que quitar
  # esta línea a propósito.
  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = "${var.project}-${var.environment}-data" }
}

resource "aws_volume_attachment" "data" {
  # Nombre que pide la API. En instancias Nitro (t3) Linux lo ve como
  # /dev/nvme1n1; Ansible lo busca por el volume_id, no por este nombre.
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.app.id

  # Detiene la VM antes de desconectar el disco, para no cortar a SQLite
  # a mitad de una escritura.
  stop_instance_before_detaching = true
}
