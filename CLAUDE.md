# ATK: plataforma para una casa de cambio

Proyecto del equipo ATK (3 personas), ramo Proyectos en TICs II (UDP).
Plataforma web para una casa de cambio real en Coyhaique que hoy registra
todo en papel y planillas: compra/venta multidivisa, reportes, digitalización
del histórico y gestión de usuarios.

## Reglas de trabajo (obligatorias)

1. **Explicar antes de cambiar.** El equipo está aprendiendo DevOps y backend.
   Antes de cada cambio no trivial: explicar qué se hará y por qué, y esperar
   el OK. Nada de código que no se entienda.
2. **Nunca** `terraform apply`, `terraform destroy` ni nada que cree o borre
   recursos en AWS. Sí se permite `terraform fmt`, `init` y `validate`.
3. **Sin secretos en el repo**: ni credenciales, ni llaves, ni datos reales
   del cliente. `terraform.tfvars` y `backend.hcl` están en `.gitignore` y
   deben seguir ahí; solo se suben los `.example`.
4. **Dinero**:
   - Montos como enteros en la unidad mínima de cada divisa. Nunca float.
   - Toda compra/venta dentro de una transacción de base de datos.
   - Cada operación deja auditoría: quién, cuándo, tasa usada, montos de
     entrada y salida.
5. **Commits pequeños**, mensajes en español que expliquen el porqué. Commit
   solo cuando el equipo lo pide.

## Arquitectura

```
Navegador → EIP → IGW → SG (solo :80) → EC2 Ubuntu 24.04
  → Docker Compose: nginx :80 → app :3000 (sin puertos publicados)
  → app escribe SQLite en DATABASE_PATH=/data/atk.db
  → /data = bind mount de /srv/atk/data = volumen EBS persistente
```

- AWS `sa-east-1`, una sola VM, creada con Terraform (`infra/terraform`).
- Acceso a la VM **solo por SSM**: no hay SSH ni puerto 22. Ansible también
  entra por SSM (`community.aws.aws_ssm`), usando un bucket S3 de paso.
- Sin dominio todavía: HTTP por IP. **Sin HTTPS**, así que no se deben usar
  datos reales hasta tener dominio y certificado.
- Sin backups del EBS todavía (pendiente: snapshots con DLM).

## Contrato app ↔ infra

La app debe:
- Escuchar en el puerto de la variable `PORT` (hoy 3000).
- Guardar SQLite en la ruta de `DATABASE_PATH` (hoy `/data/atk.db`).
- Correr como UID 1000 (dueño de la carpeta de datos, `atk_app_uid`).
- Responder `GET /health` con 200 (lo usan el HEALTHCHECK y Ansible).
- Leer la IP del cliente de `X-Real-IP` / `X-Forwarded-For` (detrás de Nginx).

Stack de la app: **por definir**. Hoy `deploy/app/` es un contenedor de
prueba en Node sin dependencias que solo verifica este contrato.

## Estructura

- `infra/terraform/`: VPC, subred, IGW, rutas, SG, EC2, EIP, EBS, IAM y el
  bucket SSM. Estado en S3 con `use_lockfile`.
- `infra/ansible/`: inventario dinámico por tags; roles `docker`,
  `data_volume` y `app`. Se ejecuta desde `infra/ansible/`.
- `deploy/`: lo que se copia a `/srv/atk` en la VM (compose, nginx, app).
- `infra/README.md`: guía paso a paso para desplegar.

## Comandos

```bash
# Terraform (validación local, sin tocar AWS)
cd infra/terraform && terraform fmt -check && terraform init -backend=false && terraform validate

# Ansible (sin tocar AWS); se habilita host_list porque ansible.cfg solo habilita aws_ec2
cd infra/ansible && ANSIBLE_INVENTORY_ENABLED=host_list ansible-playbook -i localhost, playbooks/site.yml --syntax-check

# Prueba local del stack
cd deploy && HTTP_PORT=8080 docker compose up -d --build --wait
curl localhost:8080/health
docker compose down && rm -rf data
```

## Decisiones no obvias (no revertir sin entenderlas)

- `ignore_changes = [ami]` en la EC2: `most_recent` cambia la AMI con cada
  publicación de Canonical y reemplazaría la VM en cualquier `apply`.
- El EBS tiene `prevent_destroy` y toma su AZ de la subred.
- Las descripciones de security groups solo aceptan ASCII (sin tildes).
- `group_vars` está en `infra/ansible/inventory/group_vars/`: Ansible solo lo
  lee junto al inventario o al playbook.
- El disco se ubica por `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol…`,
  no por `/dev/nvme1n1`, que puede cambiar.
- `community.general.filesystem` **sin** `force`: nunca formatea un disco con
  datos. No agregar `force: true`.
- `/srv/atk/data` es de root mientras el EBS no está montado: si el montaje
  falla, la app falla a la vista en vez de crear una base vacía en el disco
  del sistema.
- Nginx usa `resolver 127.0.0.11` + `proxy_pass` a una variable para no
  responder 502 cuando la app se recrea con otra IP.
- No usar `ansible.posix.synchronize`: usa rsync sobre SSH y no funciona por SSM.
