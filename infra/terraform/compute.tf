# Ubuntu 24.04 oficial de Canonical (trae el agente SSM instalado)
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }
}

# Las descripciones de security groups solo aceptan ASCII (sin tildes)
resource "aws_security_group" "app" {
  name        = "${var.project}-${var.environment}-app"
  description = "HTTP de entrada a Nginx; sin SSH (acceso por SSM)"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${var.project}-${var.environment}-app" }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP publico"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

# Salida libre: la usan el agente SSM, apt y Docker Hub
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.app.id
  description       = "Toda la salida"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name

  # IMDSv2 obligatorio: los metadatos de la VM (incluidas las credenciales
  # del rol) solo se piden con token, lo que frena ataques tipo SSRF.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_size
    encrypted   = true
  }

  # most_recent hace que la AMI cambie cuando Canonical publica una nueva.
  # Sin esto, un apply cualquiera reemplazaría la VM sin que nadie lo pidiera.
  lifecycle {
    ignore_changes = [ami]
  }

  tags = { Name = "${var.project}-${var.environment}-app" }
}

resource "aws_eip" "app" {
  domain = "vpc"

  # La EIP solo sirve si la VPC ya tiene salida a internet
  depends_on = [aws_internet_gateway.main]

  tags = { Name = "${var.project}-${var.environment}-app" }
}

# Separada de la EIP: si la VM se recrea, la IP se reasocia y no cambia
resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
