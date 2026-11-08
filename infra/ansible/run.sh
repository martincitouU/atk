#!/usr/bin/env bash
# Corre un comando de Ansible dentro del contenedor Linux (ver Dockerfile).
#
# Uso, desde cualquier carpeta del repo:
#   infra/ansible/run.sh ansible-inventory --graph
#   infra/ansible/run.sh ansible all -m ping
#   infra/ansible/run.sh ansible-playbook playbooks/site.yml
#
# Necesita Docker, credenciales de AWS vigentes (aws login) y Terraform
# inicializado en infra/terraform: de sus outputs salen el bucket de paso
# de SSM y el volumen de datos.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"

# Credenciales temporales como variables de entorno: nunca se escriben en archivos
eval "$(aws configure export-credentials --format env)"

SSM_BUCKET="$(terraform -chdir="$REPO/infra/terraform" output -raw ssm_bucket_name)"
DATA_VOLUME="$(terraform -chdir="$REPO/infra/terraform" output -raw data_volume_id)"

docker build -q -t atk-ansible "$AQUI" >/dev/null

# El repo entra en solo lectura
docker run --rm -t \
  -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_SESSION_TOKEN \
  -e ANSIBLE_DEPRECATION_WARNINGS=False \
  -v "$REPO":/work:ro \
  -w /work/infra/ansible \
  atk-ansible "$@" \
  -e ansible_aws_ssm_bucket_name="$SSM_BUCKET" \
  -e data_volume_id="$DATA_VOLUME"
