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

- AWS `us-east-2` (Ohio), una sola VM, creada con Terraform (`infra/terraform`).
  La cuenta solo permite esa región. La región aparece en `variables.tf`,
  `backend.hcl`, el inventario y `group_vars` de Ansible: si cambia, cambiarla
  en todos.
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

## Stack de la app (decidido el 2026-11-02)

- **TypeScript** en todo, **Node 24 LTS**. Monorepo con npm workspaces:
  `apps/api`, `apps/web`, `packages/shared`.
- **API**: Fastify. **BD**: SQLite con better-sqlite3 + Drizzle ORM.
  Node corre el TypeScript de `@atk/shared` directo (el workspace es un
  enlace, no está dentro de `node_modules`).
- **Login**: Better Auth (sesiones en cookie httpOnly, roles). No escribir
  autenticación a mano.
- **Front**: React + Vite + React Router, TanStack Query, react-hook-form.
  Estilos con CSS Modules y los tokens de `DESIGN.md` (sin Tailwind).
- **Validación**: esquemas zod compartidos en `packages/shared`.
- **Excel del histórico**: exceljs (no el paquete `xlsx` de npm).
- **Tests**: Vitest.
- Un solo contenedor sirve la API (`/api/*`) y el front compilado: mismo
  origen, sin CORS. La imagen es `app/Dockerfile`; arranca en
  `apps/api/src/principal.ts`, aplica las migraciones y sirve `/health`,
  `/api` y el front (`apps/web/dist`, ver `src/http/front.ts`): las
  direcciones del front responden `index.html`; una ruta de `/api` que no
  existe, siempre 404 en JSON.
- La imagen instala con `npm ci --omit=dev --omit=optional`: Better Auth
  declara React, Vitest y otros como *peer* opcionales y, sin `--omit=optional`,
  npm los mete en producción. El front se compila en una etapa aparte: en
  producción no corre Node para él, solo se sirven sus archivos.
- API: `src/servidor.ts` arma Fastify; `src/rutas/` (una por tema, delgadas);
  `src/http/` (actor, errores, JSON con bigint). Tests en `test/rutas/` con
  `app.inject` y la cabecera `x-actor-prueba`, que existe solo en los tests.

### SQLite: configuración obligatoria
- Tablas `STRICT`, `PRAGMA foreign_keys = ON` en cada conexión,
  `journal_mode = WAL`, `busy_timeout`, transacciones de escritura `IMMEDIATE`.
- Un solo proceso de Node (sin cluster): las escrituras van en fila.
- Backups con `VACUUM INTO`, la API de backup o Litestream. Nunca copiar el
  archivo mientras la app escribe.
- Toda conexión se abre con `abrirBase()` (`apps/api/src/db/conexion.ts`).

### Migraciones y esquema
- **La fuente de verdad es el SQL escrito a mano** en
  `app/db/migraciones/NNNN_nombre.sql`. drizzle-kit no se usa: no sabe
  expresar `STRICT`, triggers ni columnas generadas.
- Las migraciones aplicadas **no se editan**: se escribe una nueva.
  `migrar()` se detiene si el hash de una aplicada cambió. `0001` se
  reescribió por última vez antes del primer despliegue de la app (no había
  ninguna base real); desde ese despliegue (2026-11-08), `0001` está
  congelada y todo cambio es una migración nueva (`0002_cuenta_cliente`, ...).
- `0001` trae datos de referencia que valen en producción (monedas,
  parámetros, categorías de gasto). Los de ejemplo van en `semillas/`.
- Las tablas de Better Auth (`user`, `session`, `account`, `verification`)
  están en `0001` con el SQL que genera Better Auth, no son STRICT y Better
  Auth las usa con su propia conexión (sin `safeIntegers`).
- `apps/api/src/db/esquema.ts` es el espejo en Drizzle para consultar con
  tipos. Al cambiar una migración se actualiza; `test/esquema.test.ts` lo
  compara con una base real.
- `app/db/semillas/` es solo para desarrollo y tests: **nunca en producción**.
- `app/db/probar.sh` prueba las restricciones y triggers directamente en SQL.

### Dinero en JavaScript (además de la regla 4)
- Montos como `bigint` (opción `safeIntegers` de better-sqlite3), nunca `number`.
- **Nunca usar `integer()` de Drizzle**: con `safeIntegers` declara `number`
  pero entrega `bigint`. Cada columna INTEGER usa un tipo de
  `apps/api/src/db/tipos.ts`: `dinero` (bigint), `entero` (number exacto),
  `fecha` (Date), `booleano`.
- Drizzle inserta NULL en columnas sin valor ni default declarado: toda
  columna con `DEFAULT` en el SQL repite su default en `esquema.ts`.
- En JSON los montos viajan como string (`JSON.stringify` falla con `bigint`).
- Tasas, precios, costos y márgenes: enteros con **escala única ×10^6**
  (sufijo `_e6`/`E6`), igual para todas las monedas.
- Todo cálculo con dinero vive en `apps/api/src/dominio/dinero.ts` (puro,
  `bigint`, redondeo explícito) y tiene tablas de casos en sus tests.
- Redondeo a favor de la casa: lo que paga, hacia abajo; lo que cobra,
  hacia arriba; márgenes y costos, al más cercano.
- La tabla de auditoría tiene triggers que abortan `UPDATE` y `DELETE`.

### Lógica de negocio (`apps/api/src/servicios/`)
- Un archivo por tema: `cotizaciones`, `operaciones`, `caja`, `turnos`,
  `gastos`, `clientes`, `auditoria`, `resumen`, `cuentas` (portal de
  clientes), `usuarios` e `inicializacion`. Cada acción pública abre su
  propia transacción `IMMEDIATE` y audita dentro de ella.
- Excepción: la cuenta de Better Auth vive en otra conexión. Se crea antes
  de la transacción y, si esta falla, se borra (`borrarCuenta`).
- Todo servicio recibe un `Contexto` (base + reloj) y un `Actor` (id + rol).
  El reloj es inyectable: los tests controlan la hora.
- Los errores esperables son `ErrorNegocio` (código + mensaje en español
  para mostrar tal cual). Un parámetro faltante es un `Error` común.
- Operación: **BORRADOR** (se edita/elimina, no mueve caja) →
  **CONFIRMADA** (mueve caja, inmutable) → **REVERSADA** (con motivo,
  movimientos inversos). Los triggers lo garantizan también en SQL.
- Los tests de servicios se nombran por RF (`RF-07: ...`) y usan
  `test/servicios/escenario.ts` (semilla + reloj + usuarios).

### Front (`app/apps/web/`)
- **`DESIGN.md` (raíz) es la guía visual de todas las vistas.** Sus valores
  viven en `src/estilos/tokens.css`; ningún componente escribe colores ni
  medidas sueltas. Se toma su lenguaje visual, no la marca Uniswap: la marca
  es la de la casa. Basel es privada: se usa Inter Variable (peso 485 real),
  servida desde el mismo origen.
- Decisiones sobre `DESIGN.md` (se contradice en algunos puntos):
  - Magenta `#ff37c7` = la acción principal: **máximo un botón magenta
    relleno por vista** (`<Boton variante="primario">`). El resto, `suave`,
    `secundario` o `texto`.
  - Texto magenta sobre blanco en `#c8148f` (5,3:1); el `#ff37c7` da 3,2:1.
  - Coral `#e01a2b` **solo para errores**, siempre con texto. Verde
    `#0c8911` solo para datos en vivo (el día en curso, tasa vigente).
- **El front no calcula dinero.** Precios y montos vienen de la API
  (`previsualizar`). `src/lib/montos.ts` solo traduce entre lo que se ve
  ("150,25") y el texto de dígitos de la API (`"15025"`), con `bigint` y sin
  redondear nunca lo que se escribe. Un monto no se corta con "…".
- Estructura: `componentes/` (piezas del diseño, sin lógica de negocio),
  `marcos/` (barra por rol y quién entra a cada parte), `vistas/` (una por
  pantalla), `api/` (`tipos.ts` = forma del JSON, `consultas.ts` = hooks de
  TanStack Query), `lib/` (montos, fechas en la zona de la casa, RUT,
  textos y tonos de cada estado), `sesion/`.
- **Toda petición pasa por `src/api/cliente.ts`**: envía JSON (`{}` en una
  escritura sin datos) y convierte cualquier falla en un `ErrorApi`
  (`estado`, `codigo`, `mensaje` para mostrar, `detalles` por campo). Ahí se
  traducen los errores de Better Auth y los 429. Ninguna vista llama a
  `fetch`.
- Sesión (`src/sesion/Sesion.tsx`): lo que dice `GET /api/yo` (401 = sin
  sesión); `ingresar` y `salir` usan Better Auth. El proveedor crea la caché
  (`src/api/cache.ts`): un 401 en pleno uso borra los datos de la sesión y
  lleva al login con el aviso de inactividad; al entrar de nuevo, vuelve a la
  vista. Al cerrar sesión no se vuelve a la vista (puede entrar otra persona).
- Fechas en los filtros: la API pide instantes en operaciones y auditoría;
  un día "hasta" se envía como el inicio del día siguiente en la zona de la
  casa (`inicioDelDia`, `diaSiguiente` en `lib/fechas.ts`).
- Lecturas con `<ConDatos consulta={...}>` (cargando, error con "Reintentar"
  o los datos). Un 404 se muestra como "Esta página no existe".
- Formularios: react-hook-form con los esquemas zod de `@atk/shared` (los
  mismos que valida la API); lo que la API rechaza va junto a su campo.
- Fases: F1 esqueleto y F2 lectura con la API están hechas. **F3 pendiente**:
  los formularios que guardan (turnos, movimientos, operaciones con
  `previsualizar`, clientes, cuentas, gastos, pizarra, usuarios, contraseña),
  la prueba de punta a punta y el despliegue. Hasta F3 esos botones no hacen
  nada: no desplegar antes.
- Tests en `apps/web/test/` (Vitest + Testing Library, jsdom). La API se
  simula con `test/apiFalsa.tsx` (`usarApi`, `rutasDe(sesion)`, `abrir(ruta)`).

## Estructura

- `infra/terraform/`: VPC, subred, IGW, rutas, SG, EC2, EIP, EBS, IAM y el
  bucket SSM. Estado en S3 con `use_lockfile`.
- `infra/ansible/`: inventario dinámico por tags; roles `swap`, `docker`,
  `data_volume` y `app`. **Se corre con `infra/ansible/run.sh`**, dentro de
  un contenedor Linux (`infra/ansible/Dockerfile`).
- `deploy/`: compose y nginx; se copian a `/srv/atk` en la VM. El código de
  `app/` se copia a `/srv/atk/codigo` y la imagen se construye en la VM.
- `app/`: la aplicación (npm workspaces). `app/db/` tiene migraciones,
  semillas y `probar.sh`; `app/apps/api/` el backend; `app/apps/web/` el
  front; `app/scripts/dev.ts` levanta los dos en desarrollo.
- `DESIGN.md`: guía visual de todas las vistas.
- `docs/api.md`: contrato de la API para el front. Si una ruta cambia, se
  actualiza en el mismo PR.
- `docs/casa_cambio_schema_postgres.sql`: diseño original del modelo, solo
  referencia.
- `infra/README.md`: guía paso a paso para desplegar.

## Comandos

```bash
# Terraform (validación local, sin tocar AWS)
cd infra/terraform && terraform fmt -check && terraform init -backend=false && terraform validate

# Ansible (sin tocar AWS); se habilita host_list porque ansible.cfg solo habilita aws_ec2
cd infra/ansible && ANSIBLE_INVENTORY_ENABLED=host_list ansible-playbook -i localhost, playbooks/site.yml --syntax-check

# App: tests, tipos y pruebas SQL del esquema
cd app && npm test && npm run typecheck && npm run db:probar

# Desarrollo: API (127.0.0.1:3000) + front (Vite) → http://localhost:5173
# La primera vez crea app/.dev con la semilla, cuentas de prueba y una
# jornada de ejemplo (ver apps/api/src/cli/desarrollo.ts). Para partir de
# cero, o para tener la jornada con fecha de hoy: rm -rf app/.dev
cd app && npm run dev

# Prueba local del stack (imagen real de app/)
cd deploy && CODIGO=../app HTTP_PORT=8080 docker compose up -d --build --wait
curl localhost:8080/health
docker compose down && rm -rf data

# Desplegar en la VM (requiere aws login y Terraform inicializado)
infra/ansible/run.sh ansible-playbook playbooks/site.yml

# Configuración inicial de producción (una sola vez, dentro de la VM por SSM)
sudo docker compose -f /srv/atk/compose.yaml exec app node apps/api/src/cli/inicializar.ts
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
- El secreto del login vive en `/etc/atk/secreto.env` de la VM: lo genera
  Ansible dentro de la VM, solo si no existe. Va fuera de `/srv/atk` porque
  esa carpeta se rellena con `deploy/` en cada despliegue. La URL pública
  va en `/etc/atk/url.env` (`atk_url_publica`). Compose los lee con
  `required: false`: en local no existen y la app arranca cerrada.
- `community.general.filesystem` **sin** `force`: nunca formatea un disco con
  datos. No agregar `force: true`.
- `/srv/atk/data` es de root mientras el EBS no está montado: si el montaje
  falla, la app falla a la vista en vez de crear una base vacía en el disco
  del sistema.
- Nginx usa `resolver 127.0.0.11` + `proxy_pass` a una variable para no
  responder 502 cuando la app se recrea con otra IP.
- No usar `ansible.posix.synchronize`: usa rsync sobre SSH y no funciona por SSM.
- Ansible por SSM **no funciona en macOS** fuera del contenedor: los procesos
  hijos (fork) no pueden usar DNS y se caen. Por eso `run.sh`.
- El código viaja a la VM empaquetado **sin `node_modules`** (los del Mac son
  binarios de macOS); las dependencias se instalan dentro de la imagen.
- La imagen crea `/data` con dueño `node` solo para volúmenes locales; en la
  VM la reemplaza el bind mount de `/srv/atk/data`.
- Zona horaria por defecto **`America/Coyhaique`** (UTC-3 todo el año desde
  2025), no `America/Santiago`: en invierno los cortes diarios se correrían
  una hora.
- Confirmar recalcula con la pizarra vigente: si cambió desde el borrador,
  no se confirma (el cliente vería un precio y pagaría otro).
- Editar un borrador lo recalcula. La autorización de una tasa preferencial
  vale para el precio y el monto que vio el supervisor: se conserva si la
  edición no los cambia (agregar el folio al confirmar) y se pierde si sí.
- Cambiar un margen cierra la regla de spread y crea otra: cada operación
  conserva la regla con que se cobró.
- La divisa siempre es efectivo; `medio_pago` es cómo se pagan los pesos.
  Solo EFECTIVO mueve los pesos de la caja.
- Umbrales UAF en USD (ficha desde 5.000, ROE sobre 10.000), con el
  equivalente calculado con la referencia del USD y guardado en la operación.

## Cuentas y acceso (decidido el 2026-11-08)

- Dos tipos de cuenta, ambas con login de Better Auth:
  - **Personal** (`usuario`, roles ADMIN/SUPERVISOR/CAJERO): la crea un
    admin; el primer admin, el comando `inicializar`. Solo el personal
    obtiene un `Actor` y puede llamar a los servicios.
  - **Cliente** (`cuenta_cliente`, migración 0002): se registra solo, con
    RUT. **Solo lee** lo suyo en `/api/mi/...`, filtrado siempre por su
    `cliente_id` de la sesión, nunca por un id de la petición.
- La cuenta de cliente queda **pendiente** hasta que un cajero verifica su
  carnet en el local y la aprueba (queda auditado quién y cuándo). Mientras,
  no ve datos: cualquiera podría registrarse con un RUT ajeno.
- El rol que autoriza es `usuario.rol`, no el de Better Auth.
- La API es una capa delgada: valida con zod (`packages/shared`), arma el
  `Actor` desde la sesión y llama al servicio. `ErrorNegocio` se traduce:
  `SIN_PERMISO` → 403, `*_NO_EXISTE` → 404, el resto → 409.
- El portal de clientes no se abre al público sin HTTPS.
- Login (`src/auth/`): Better Auth con su propia conexión (`abrirBaseAuth`,
  sin bigint). La sesión vence tras `sesion_inactividad_minutos` sin uso.
  `src/rutas/auth.ts` deja pasar solo sign-in, sign-out, get-session y
  change-password; el registro público de Better Auth está apagado.
  Sus errores vienen como `{ message, code }`, no con nuestro formato.
- La app lee `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` (dirección pública,
  para validar `Origin`). Si faltan, arranca **cerrada**: sin login, toda
  `/api` responde 401 y no se acepta ninguna escritura. La única excepción
  es `GET /api/casa`: público siempre (nombre y monedas, lo de la pizarra).
- Las cuentas se crean con `crearCuenta()` (`src/auth/auth.ts`), nunca a mano.

## Supuestos de la iteración 1 (por confirmar con el cliente)

- Folio del DTE (tipo 41 o 34) obligatorio para confirmar (parámetro).
- Reverso: solo supervisor o admin, y solo con el turno de la operación abierto.
- Las diferencias del arqueo no se ajustan solas: el supervisor registra un AJUSTE.
- Registro diferido: hora real del mismo día en que se abrió el turno.
- Fidelización (RF-18): la categoría reduce el margen en un % igual para
  todas las divisas, sin autorización; una tasa manual la reemplaza.
- Histórico (RF-13): quien importa elige la caja del lote (`lote_migracion.caja_id`).
- ROE: ¿se suman las operaciones fraccionadas de un cliente en el día?
- ¿Se aplica el redondeo del efectivo a $10?

## Decisiones pendientes

- Dominio y HTTPS: requisito antes de usar datos reales.
- Backups del EBS (DLM) y de SQLite (Litestream o VACUUM INTO a S3).
- Obligaciones del cliente ante la UAF y la Ley 21.719: confirmar con el
  cliente antes de diseñar las tablas. Con datos reales en `us-east-2`
  (EE.UU.) hay transferencia internacional de datos personales.
- Formato del histórico (Excel, CSV, papel).
