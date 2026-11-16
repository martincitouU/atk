# Infraestructura de ATK

Cómo crear la VM en AWS y desplegar la app. Son tres etapas, en este orden:

1. **Terraform** crea los recursos en AWS (red, VM, disco, IP, permisos).
2. **Ansible** configura la VM por SSM (Docker, disco de datos, contenedores).
3. **Verificar** desde el navegador y desde la VM.

> Lo que se despliega es la imagen de `app/` (`app/Dockerfile`): aplica las
> migraciones sobre el disco de datos y sirve `/health`, la API (`/api`) y
> el front compilado (todo lo demás). La imagen compila el front al
> construirse en la VM. El contrato de la API está en `docs/api.md`.

## 0. Requisitos (una vez, en tu computador)

| Herramienta | Para qué | Instalación (macOS) |
|---|---|---|
| Terraform ≥ 1.11 | Crear recursos | `brew install terraform` |
| AWS CLI v2 | Credenciales y SSM | `brew install awscli` |
| session-manager-plugin | Entrar a la VM por SSM (`aws ssm start-session`) | `brew install --cask session-manager-plugin` |
| Docker | Ansible corre dentro de un contenedor (ver sección 3) | Docker Desktop |

Ansible **no** se instala en el computador: corre en el contenedor de
`infra/ansible/Dockerfile`, que trae Ansible, boto3, las colecciones y el
plugin de SSM para Linux.

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
aws s3api create-bucket --bucket $BUCKET --region us-east-2 \
  --create-bucket-configuration LocationConstraint=us-east-2
aws s3api put-bucket-versioning --bucket $BUCKET \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

El versionado permite recuperar un estado anterior si uno se corrompe.

También se puede crear desde la consola web (S3 → *Create bucket*): región
`us-east-2`, tipo *General purpose*, ACLs deshabilitadas, bloqueo de acceso
público total, **Bucket Versioning: Enable** (viene desactivado), cifrado
SSE-S3 y Object Lock desactivado.

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

Ansible se corre con `infra/ansible/run.sh`, que lo ejecuta en un contenedor
Linux. **En macOS no funciona instalado directamente**: la conexión por SSM
hace que sus procesos se caigan ("Python se cerró inesperadamente"), porque
macOS no deja que un proceso creado con `fork` use DNS.

`run.sh` toma las credenciales temporales de tu sesión de AWS, lee de
Terraform el bucket de paso y el volumen de datos, y monta el repo en solo
lectura. Necesita una sesión vigente (`aws login`) y Terraform inicializado.

```bash
infra/ansible/run.sh ansible-inventory --graph   # debe listar un i-xxxxxxxx
infra/ansible/run.sh ansible all -m ping         # Ansible llega por SSM
infra/ansible/run.sh ansible-playbook playbooks/site.yml
```

El playbook agrega swap, instala Docker, monta el disco de datos, deja la
configuración del login en `/etc/atk` (ver abajo), copia `deploy/` y el
código de `app/` (sin `node_modules`), construye la imagen en la VM y
levanta los contenedores. La primera vez tarda varios minutos. Termina
mostrando el `/health` de la app y comprobando que el login esté activo;
si alguna de esas tareas falla, el despliegue no quedó bien.

### El secreto del login

La app necesita `BETTER_AUTH_SECRET` (firma las cookies de sesión) y
`BETTER_AUTH_URL` (la dirección pública, para validar el `Origin`).
Ansible los deja en la VM, **nunca en el repo**:

| Archivo | Contenido | Cuándo se escribe |
|---|---|---|
| `/etc/atk/secreto.env` | 64 caracteres aleatorios, generados dentro de la VM | Solo la primera vez |
| `/etc/atk/url.env` | `http://<IP elástica>` (variable `atk_url_publica`) | En cada despliegue |

Si el secreto se pierde o se borra, el siguiente despliegue genera otro:
se cierran todas las sesiones, pero no se pierde ningún dato. Para cambiar
la dirección (por ejemplo, al tener dominio), se cambia `atk_url_publica`
en `inventory/group_vars/all.yml`.

**Para volver a desplegar** (por ejemplo, después de cambiar algo en `app/`
o en `deploy/`), se corre el mismo playbook. Es idempotente: lo que ya está
bien aparece como `ok` y no se toca.

**Simulacro (`--check --diff`)**: agrega esas opciones para ver qué cambiaría
sin cambiar nada. En una VM recién creada falla, porque algunas tareas
dependen de paquetes que las anteriores habrían instalado (por ejemplo,
Docker); es esperado. Es útil desde la segunda ejecución en adelante.

## 4. Verificar

```bash
curl http://$(terraform -chdir=infra/terraform output -raw public_ip)/health
# {"status":"ok","migraciones":["0001_esquema.sql","0002_cuenta_cliente.sql"],"configurada":false}
```

`migraciones` son las aplicadas a la base del disco de datos
(`/srv/atk/data/atk.db`). `configurada` dice si ya se cargaron los datos de
la casa de cambio; en una base nueva es `false`.

En el navegador, `http://<IP>` muestra el login de la app.

## 5. Configuración inicial (una sola vez)

La base de producción nace vacía: sin casa, sin cajas y sin usuarios. La
semilla de ejemplo **nunca** se carga aquí. El comando `inicializar` pide
los datos de la casa, sus divisas, la sucursal, las cajas y el primer
administrador. La contraseña se escribe sin mostrarse.

```bash
aws ssm start-session --target $(terraform -chdir=infra/terraform output -raw instance_id)
sudo docker compose -f /srv/atk/compose.yaml exec app node apps/api/src/cli/inicializar.ts
```

Al terminar, `/health` dice `"configurada": true`. Ese admin inicia sesión,
publica los tipos de cambio y crea al resto del personal desde la app.

> **Sin HTTPS** la contraseña viaja sin cifrar: usar una que no se use en
> otro lado y solo datos de prueba hasta tener dominio y certificado.

Para entrar a la VM (no hay SSH):

```bash
aws ssm start-session --target $(terraform -chdir=infra/terraform output -raw instance_id)
sudo docker compose -f /srv/atk/compose.yaml ps
df -h /srv/atk/data   # debe mostrar el volumen EBS, no el disco del sistema
```

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `run.sh` dice que la sesión expiró | Vuelve a iniciar sesión con `aws login` |
| `ansible-inventory --graph` no muestra hosts | VM detenida o tags distintos a `Project=atk` y `Environment=dev` |
| "Python se cerró inesperadamente" en macOS | Se corrió Ansible fuera del contenedor: usa `run.sh` |
| `ping` se queda esperando | El agente SSM aún no está `Online` (ver paso 2) |
| Falla "Esperar a que el disco aparezca" | `data_volume_id` incorrecto o el attachment no terminó: revisa `terraform output` |
| La app se reinicia con `unable to open database file` | El disco de datos no está montado o no es del UID 1000: revisa `df -h /srv/atk/data` en la VM |
| `502 Bad Gateway` | La app no está corriendo: `sudo docker compose -f /srv/atk/compose.yaml logs app` |
| Falla "Comprobar que el login está activo" | La app no leyó `/etc/atk/*.env`: revisa que existan (`sudo ls -l /etc/atk`) y el log de la app |
| `inicializar` dice que necesita una terminal | Se usó `exec -T` o no hay TTY: corre el comando dentro de `aws ssm start-session` |

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
suman cerca de USD 9–11 al mes en `us-east-2`. Detener la VM ahorra el
cómputo, pero el disco y la IP siguen cobrando.
