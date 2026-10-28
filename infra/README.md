# Infraestructura de ATK

Cómo crear la VM en AWS y desplegar la app. Son tres etapas, en este orden:

1. **Terraform** crea los recursos en AWS (red, VM, disco, IP, permisos).
2. **Ansible** configura la VM por SSM (Docker, disco de datos, contenedores).
3. **Verificar** desde el navegador y desde la VM.

> La app todavía no existe: lo que se despliega es el contenedor de prueba de
> `deploy/app/`. Sirve para comprobar que la infraestructura funciona.

## 0. Requisitos (una vez, en tu computador)

| Herramienta | Para qué | Instalación (macOS) |
|---|---|---|
| Terraform ≥ 1.11 | Crear recursos | `brew install terraform` |
| AWS CLI v2 | Credenciales y SSM | `brew install awscli` |
| session-manager-plugin | Conectarse a la VM por SSM | `brew install --cask session-manager-plugin` |
| Ansible | Configurar la VM | `brew install ansible` |
| boto3 | Lo usan el inventario y la conexión SSM | `$(brew --prefix ansible)/libexec/bin/pip install boto3` |

Credenciales de AWS: cada integrante usa su propio perfil (`aws configure
--profile atk` o SSO). Antes de trabajar:

```bash
export AWS_PROFILE=atk
aws sts get-caller-identity   # debe mostrar tu usuario, no un error
```

Las credenciales **nunca** van en archivos del repo.

## 1. Bucket del estado de Terraform (una vez por equipo)

Terraform guarda en S3 qué recursos creó. Ese bucket tiene que existir
**antes** del primer `init`, así que se crea a mano. Lo crea una sola
persona y comparte el nombre con el resto.

```bash
BUCKET=atk-tfstate-<algo-único>   # los nombres de bucket son únicos en todo AWS
aws s3api create-bucket --bucket $BUCKET --region sa-east-1 \
  --create-bucket-configuration LocationConstraint=sa-east-1
aws s3api put-bucket-versioning --bucket $BUCKET \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

El versionado permite recuperar un estado anterior si uno se corrompe.

## 2. Terraform: crear la infraestructura

```bash
cd infra/terraform
cp backend.hcl.example backend.hcl            # poner el nombre real del bucket
cp terraform.tfvars.example terraform.tfvars  # ajustar si hace falta
terraform init -backend-config=backend.hcl
terraform plan -out=atk.tfplan
```

**Lee el plan antes de seguir.** La primera vez debe decir solo `to add`.
Si alguna vez dice `to destroy` o `must be replaced` en `aws_instance.app` o
`aws_ebs_volume.data`, detente y pregunta al equipo.

```bash
terraform apply atk.tfplan
terraform output
```

`output` muestra `public_ip`, `app_url`, `instance_id`, `data_volume_id` y
`ssm_bucket_name`. Ansible usa los dos últimos.

Espera 2 o 3 minutos a que la VM arranque y el agente SSM se registre:

```bash
aws ssm describe-instance-information \
  --query 'InstanceInformationList[].[InstanceId,PingStatus]' --output table
```

Cuando aparezca la instancia con `Online`, sigue.

## 3. Ansible: configurar la VM

Todo desde `infra/ansible/`, para que Ansible lea su `ansible.cfg`:

```bash
cd infra/ansible
ansible-galaxy collection install -r requirements.yml

# Datos que vienen de Terraform
SSM_BUCKET=$(terraform -chdir=../terraform output -raw ssm_bucket_name)
DATA_VOLUME=$(terraform -chdir=../terraform output -raw data_volume_id)

# ¿El inventario encuentra la VM? Debe listar un i-xxxxxxxx
ansible-inventory --graph

# ¿Ansible llega por SSM?
ansible all -m ping -e ansible_aws_ssm_bucket_name=$SSM_BUCKET

# Configurar todo
ansible-playbook playbooks/site.yml \
  -e ansible_aws_ssm_bucket_name=$SSM_BUCKET \
  -e data_volume_id=$DATA_VOLUME
```

La primera ejecución tarda unos minutos (instala Docker). Termina con la
tarea "Comprobar que la app responde a través de Nginx"; si esa falla, el
despliegue no quedó bien.

**Para volver a desplegar** (por ejemplo, después de cambiar algo en
`deploy/`), se corre el mismo `ansible-playbook`. Es idempotente: lo que ya
está bien aparece como `ok` y no se toca.

**Simulacro (`--check --diff`)**: agrega esas opciones para ver qué cambiaría
sin cambiar nada. En una VM recién creada falla, porque algunas tareas
dependen de paquetes que las anteriores habrían instalado (por ejemplo,
Docker); es esperado. Es útil desde la segunda ejecución en adelante.

## 4. Verificar

```bash
curl http://$(terraform -chdir=infra/terraform output -raw public_ip)/health
# {"status":"ok","firstBoot":"..."}
```

`firstBoot` es la fecha en que la app escribió por primera vez en el disco
de datos. Si después de recrear el contenedor o la VM sigue igual, el
volumen persiste.

Para entrar a la VM (no hay SSH):

```bash
aws ssm start-session --target $(terraform -chdir=infra/terraform output -raw instance_id)
sudo docker compose -f /srv/atk/compose.yaml ps
df -h /srv/atk/data   # debe mostrar el volumen EBS, no el disco del sistema
```

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `ansible-inventory --graph` no muestra hosts | `AWS_PROFILE` no exportado, VM detenida o tags distintos a `Project=atk` y `Environment=dev` |
| `session-manager-plugin` not found | El plugin está en otra ruta: agrega `-e ansible_aws_ssm_plugin=$(which session-manager-plugin)` |
| `ping` se queda esperando | El agente SSM aún no está `Online` (ver paso 2) |
| Falla "Esperar a que el disco aparezca" | `data_volume_id` incorrecto o el attachment no terminó: revisa `terraform output` |
| `/health` responde 503 | El disco de datos no está montado o no es del UID 1000: revisa `df -h /srv/atk/data` en la VM |
| `502 Bad Gateway` | La app no está corriendo: `sudo docker compose -f /srv/atk/compose.yaml logs app` |

## Lo que protege los datos

- El volumen EBS tiene `prevent_destroy`: `terraform destroy` **falla** a
  propósito. Borrar los datos requiere quitar esa línea de `storage.tf` de
  forma deliberada.
- Ansible nunca formatea un disco que ya tiene sistema de archivos.
- Si el disco no se monta, la app no puede escribir (responde 503) en vez de
  crear una base vacía en el disco del sistema.
- **Pendiente**: no hay backups. Un snapshot manual antes de cambios grandes:
  `aws ec2 create-snapshot --volume-id <data_volume_id> --description "antes de X"`.

## Costos aproximados

Con la VM encendida todo el mes: EC2 t3.micro, 30 GB gp3 y una IPv4 pública
suman cerca de USD 12–15 al mes en `sa-east-1`. Detener la VM ahorra el
cómputo, pero el disco y la IP siguen cobrando.
