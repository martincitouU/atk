# Quién puede asumir el rol: el servicio EC2, en nombre de la VM
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${var.project}-${var.environment}-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# Lo mínimo para que el agente SSM se registre y acepte sesiones
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Una EC2 no recibe un rol directamente, sino un instance profile que lo contiene
resource "aws_iam_instance_profile" "app" {
  name = "${var.project}-${var.environment}-ec2"
  role = aws_iam_role.app.name
}
