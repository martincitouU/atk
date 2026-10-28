output "public_ip" {
  description = "IP elástica de la VM"
  value       = aws_eip.app.public_ip
}

output "app_url" {
  description = "URL para probar la app desde el navegador"
  value       = "http://${aws_eip.app.public_ip}"
}

output "instance_id" {
  description = "ID de la VM, para SSM: aws ssm start-session --target <id>"
  value       = aws_instance.app.id
}

output "data_volume_id" {
  description = "ID del volumen EBS de datos; Ansible lo usa para encontrar el disco"
  value       = aws_ebs_volume.data.id
}
