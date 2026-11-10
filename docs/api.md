# API de ATK

Contrato entre el front (`apps/web`) y la API (`apps/api`). Si una ruta
cambia, se actualiza este documento en el mismo PR.

Los esquemas de entrada están en `@atk/shared`. El front puede importarlos
para validar sus formularios igual que la API: por ejemplo,
`entradaOperacion`, `registroCliente` o `rutValido`.

## 1. Convenciones

| Tema | Regla |
|---|---|
| Origen | El front y la API se sirven desde el mismo origen: no hay CORS. Todas las rutas están bajo `/api`. |
| Sesión | Cookie `atk.session_token` (httpOnly, SameSite=Lax). El navegador la envía sola en `fetch` al mismo origen; no hay token que guardar. |
| Inactividad | La sesión vence tras 15 minutos sin peticiones (parámetro `sesion_inactividad_minutos`). Cada petición la renueva. |
| Escrituras | Toda petición `POST`, `PATCH` o `DELETE` debe llevar cuerpo JSON (`Content-Type: application/json`), aunque sea `{}`. El navegador agrega el `Origin` solo. Sin él → 403 `ORIGEN_NO_PERMITIDO`. |
| Montos | Siempre **texto de dígitos** en la unidad mínima de su moneda: US$ 150,25 → `"15025"`; $ 95.410 → `"95410"`. Nunca `number`: se perdería precisión. Para mostrarlos, usar los `decimales` de la moneda (vienen en `/api/casa`). |
| Tasas, precios y márgenes | Texto con escala ×10^6 y sufijo `E6`: 954,10 → `"954100000"`; 1,5 % → `"1500000"`. |
| Fechas con hora | ISO 8601: `"2026-11-08T15:30:00.000Z"`. Al enviarlas se acepta cualquier zona (`"2026-11-08T12:30:00-03:00"`). |
| Fechas sin hora | `"AAAA-MM-DD"`, en la zona de la casa (America/Coyhaique). |
| Campos desconocidos | Se rechazan con 400: un error de tipeo no se ignora en silencio. |

### Errores

Todas las respuestas de error tienen la misma forma:

```json
{ "error": { "codigo": "SIN_TURNO", "mensaje": "Abra un turno antes de registrar operaciones" } }
```

El `mensaje` está en español y se puede mostrar tal cual. El `codigo` es
para decidir qué hacer en el front.

| HTTP | Cuándo | Ejemplos de `codigo` |
|---|---|---|
| 400 | Datos mal formados. Trae `detalles: [{ campo, mensaje }]` | `DATOS_INVALIDOS` |
| 401 | Sin sesión o sesión vencida → ir al login | `SIN_SESION` |
| 403 | Sin permiso para esa acción | `SIN_PERMISO`, `CUENTA_NO_VERIFICADA`, `ORIGEN_NO_PERMITIDO` |
| 404 | No existe | `OPERACION_NO_EXISTE`, `CLIENTE_NO_EXISTE`, `RUTA_NO_EXISTE` |
| 409 | Una regla de negocio lo impide | `SIN_TURNO`, `SALDO_INSUFICIENTE`, `FALTA_FOLIO`, `CORREO_EN_USO` |
| 429 | Demasiados intentos (login o registro) | — |
| 500 | Error inesperado; el detalle queda en el log del servidor | `ERROR_INTERNO` |

**Excepción:** las 4 rutas de `/api/auth/*` son de Better Auth y sus
errores vienen como `{ "message": "...", "code": "INVALID_EMAIL_OR_PASSWORD" }`.

## 2. Sesión y datos públicos

| Método y ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|
| `GET /api/casa` | Público | — | Nombre de la casa y sus monedas. Ver abajo |
| `POST /api/auth/sign-in/email` | Público | `{ email, password }` | 200 y la cookie; 401 si no coincide |
| `POST /api/auth/sign-out` | Con sesión | `{}` | 200; la cookie deja de valer |
| `POST /api/auth/change-password` | Con sesión | `{ currentPassword, newPassword, revokeOtherSessions? }` | 200 |
| `GET /api/auth/get-session` | Con sesión | — | Sesión de Better Auth (mejor usar `/api/yo`) |
| `GET /api/yo` | Con sesión | — | Ver abajo |
| `POST /api/registro` | Público (5 por hora por IP) | `{ nombre, rut, email, contrasena }` | 201 `{ nombre, rut, estado: "PENDIENTE", mensaje }` |

`/api/casa` es lo que muestra la pizarra del local, sin nada privado. Lo
necesitan el login (el nombre) y todas las vistas (los decimales y el símbolo
para mostrar montos y tasas), también las del portal de clientes:

```json
{ "nombre": "Cambios Demo",
  "monedaBase": { "codigo": "CLP", "nombre": "Peso chileno", "simbolo": "$", "decimales": 0 },
  "divisas": [
    { "codigo": "USD", "nombre": "Dólar estadounidense", "simbolo": "US$", "decimales": 2, "decimalesTasa": 2, "activa": true } ] }
```

Las divisas vienen en el orden de la pizarra e incluyen las que la casa ya no
opera (`activa: false`), porque sus operaciones antiguas se siguen mostrando.
Antes de configurar la casa: `{ "nombre": null, "monedaBase": null, "divisas": [] }`.

`/api/yo` es lo primero que el front pide al cargar. Según quién sea:

```json
{ "tipo": "personal",
  "usuario": { "id": 3, "nombre": "Cajero", "email": "cajero@demo.cl", "rol": "CAJERO", "sucursalId": null },
  "turnoAbierto": { "id": 1, "cajaId": 1, "estado": "ABIERTO", "...": "..." } }

{ "tipo": "cliente",
  "cuenta": { "nombre": "Ana", "rut": "12345678-5", "estado": "PENDIENTE", "motivoRechazo": null, "creadaEn": "..." } }
```

Con 401, mostrar el login.

```js
// Ejemplo con fetch: no hace falta ninguna librería
await fetch("/api/auth/sign-in/email", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const yo = await fetch("/api/yo").then((r) => r.json());
```

## 3. Rutas del personal

Exigen una sesión de un usuario del personal activo. Un cliente recibe 403.

**Roles:** C = cajero, S = supervisor, A = admin. El servicio aplica además
las reglas finas (por ejemplo, solo quien registró un borrador puede
editarlo).

### Catálogo y pizarra

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `GET /api/catalogo` | C S A | — | Casa, moneda base, divisas (con `decimales` y `decimalesTasa`), sucursales, cajas, categorías de gasto y de cliente, parámetros. Pedirlo una vez al entrar. |
| `GET /api/personal` | C S A | — | `[{ id, nombre }]` de todo el personal, también el inactivo. Para mostrar el nombre donde llega un id (`usuarioId`, `confirmadaPor`, `reversadaPor`...). Sin correo ni RUT. |
| `GET /api/pizarra` | C S A | `?sucursalId=` | Por divisa: `compraE6`, `ventaE6`, `referenciaE6`, márgenes, `vigenteDesde`, `vencida`. |
| `POST /api/cotizaciones` | A | `{ monedaCodigo, referenciaE6, margenCompraE6, margenVentaE6, tipoMargen? }` | Publica una tasa nueva. `tipoMargen`: `PORCENTAJE` (por defecto) o `MONTO_FIJO`. |

### Operaciones (RF-01, 02, 03, 07, 20, 21)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `POST /api/operaciones/previsualizar` | C S A | Igual que crear | Calcula precio, montos y `requiereFicha` sin guardar. Para mostrar mientras se escribe. |
| `POST /api/operaciones` | C S A | Ver abajo | 201 con el borrador. Exige turno abierto. |
| `PATCH /api/operaciones/:id` | Quien lo registró | Los campos que cambian | Solo borradores. Recalcula con la pizarra vigente (`{}` solo recalcula). La autorización de una tasa preferencial se conserva si el precio y el monto no cambian (por ejemplo, al agregar el folio). |
| `DELETE /api/operaciones/:id` | Quien lo registró | — | 204. Solo borradores. |
| `POST /api/operaciones/:id/autorizar` | S A | `{}` | Autoriza una tasa preferencial. |
| `POST /api/operaciones/:id/confirmar` | C S A | `{}` | Recalcula con la pizarra vigente, valida folio y ficha, y mueve la caja. Si la pizarra cambió desde el borrador, falla. |
| `POST /api/operaciones/:id/reversar` | S A | `{ motivo }` | Movimientos inversos; la operación queda REVERSADA. |
| `GET /api/operaciones` | C S A | `?estado=&monedaCodigo=&turnoId=&cajaId=&usuarioId=&desde=&hasta=&limite=` | De la más reciente a la más antigua. Cada una con `clienteNombre` (null si es anónima). |
| `GET /api/operaciones/:id` | C S A | — | Con `clienteNombre`. |

Entrada para crear una operación:

```json
{ "tipo": "VENTA",            // VENTA: la casa vende divisa; COMPRA: la compra
  "monedaCodigo": "USD",
  "montoDivisa": "10000",     // US$ 100,00
  "medioPago": "EFECTIVO",    // cómo se pagan los pesos: EFECTIVO | TRANSFERENCIA | TARJETA
  "clienteId": 2,             // obligatorio desde US$ 5.000 (ficha UAF)
  "proposito": "Viaje",
  "tipoDte": 41, "folioDte": 1001,   // 41 boleta, 34 factura; el folio se exige al confirmar
  "tasaSolicitadaE6": null,   // tasa preferencial; si difiere de la pizarra, requiere autorizar
  "realizadaEn": null,        // hora real si se ingresa después (mismo día del turno)
  "observacion": null }
```

### Turnos y caja (RF-04, 05, 06)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `POST /api/turnos` | C S A | `{ cajaId }` | 201. Un turno por persona y por caja. |
| `GET /api/turnos/abiertos` | C S A | — | Con nombre de caja y de cajero. |
| `POST /api/turnos/:id/cerrar` | Dueño del turno, S, A | `{ conteo: { "CLP": "1250000", "USD": "45000" } }` | Devuelve `{ turno, arqueo }`. Falla si hay borradores o falta contar una moneda con saldo. |
| `GET /api/turnos/:id/arqueo` | C S A | — | Por moneda: `saldoSistema`, `saldoContado`, `diferencia`. |
| `GET /api/turnos/:id/movimientos` | C S A | — | Libro de caja del turno. |
| `GET /api/saldos` | C S A | `?cajaId=` | Saldo y costo promedio por moneda. |
| `POST /api/caja/movimientos` | C S A (con turno) | `{ tipo: "INGRESO" \| "RETIRO", monedaCodigo, monto, motivo, costoE6? }` | En la caja del propio turno. |
| `POST /api/caja/ajustes` | S A | `{ cajaId, monedaCodigo, monto, motivo, turnoId? }` | `monto` con signo: `"-1000"` resta. |

### Clientes (RF-17, 18)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `GET /api/clientes` | C S A | `?q=texto&limite=` | Busca en nombre y documento. `q` es obligatorio. Cada ficha trae `faltantesUaf`. |
| `GET /api/clientes/:id` | C S A | — | Ficha y `faltantesUaf` (lo que falta para cumplir con la UAF). |
| `POST /api/clientes` | C S A | `{ tipoDocumento, numeroDocumento, nombre, nacionalidad?, oficio?, paisResidencia?, domicilio?, telefono?, email?, relacionPermanente?, categoriaId? }` | `tipoDocumento`: RUT, PASAPORTE, DNI u OTRO. Países en ISO de 2 letras. |
| `PATCH /api/clientes/:id` | C S A | Los campos que cambian | |
| `GET /api/categorias-cliente` | C S A | — | Categorías de fidelización. |
| `POST /api/categorias-cliente` | A | `{ nombre, descuentoMargenPctE6 }` | 30 % → `"30000000"`. |

### Gastos (RF-05)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `POST /api/gastos` | C S A | `{ categoriaId, descripcion, monto, medioPago, fecha?, documento? }` | EFECTIVO sale de la caja del turno. Otros medios, solo admin. |
| `POST /api/gastos/:id/reversar` | S A | `{ motivo }` | |
| `GET /api/gastos` | C S A | `?desde=&hasta=&estado=` | `estado`: VIGENTE o REVERSADO. |

### Consultas (RF-15, 16)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `GET /api/resumen` | S A | `?fecha=AAAA-MM-DD` | Saldos, operaciones, margen y gastos del día; turnos abiertos y borradores pendientes. |
| `GET /api/auditoria` | A | `?desde=&hasta=&tabla=&registroId=&usuarioId=&accion=&limite=` | Quién hizo qué y cuándo, con datos antes y después. |

### Cuentas de clientes (verificación en el local)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `GET /api/cuentas-cliente` | C S A | `?estado=PENDIENTE&limite=` | |
| `POST /api/cuentas-cliente/:id/verificar` | C S A | `{}` | El cajero revisó el carnet. Enlaza con la ficha **del mismo RUT**; si no existe, crearla antes (`POST /api/clientes`). |
| `POST /api/cuentas-cliente/:id/rechazar` | C S A | `{ motivo }` | |

### Usuarios del personal (RF-14)

| Método y ruta | Roles | Entrada | Notas |
|---|---|---|---|
| `GET /api/usuarios` | A | — | Con `tieneCuenta` (si puede iniciar sesión). |
| `POST /api/usuarios` | A | `{ rut, nombre, email, rol, sucursalId?, contrasena }` | 201. |
| `PATCH /api/usuarios/:id` | A | `{ nombre?, rol?, sucursalId?, activo? }` | `activo: false` cierra sus sesiones. Nadie puede desactivarse ni quitarse el rol a sí mismo. |
| `POST /api/usuarios/:id/contrasena` | A | `{ contrasena }` | 204. Cierra sus sesiones. |

## 4. Portal de clientes

Exigen una sesión de cliente. Un usuario del personal recibe 403. Siempre
devuelven lo de la cuenta de la sesión, nunca de otro id.

| Método y ruta | Notas |
|---|---|
| `GET /api/mi/operaciones` | Operaciones confirmadas y reversadas del cliente: tipo, divisa, montos, tasa, medio de pago, DTE y fecha. Sin márgenes ni datos internos. |
| `GET /api/mi/ficha` | Sus datos. |

Las dos responden 403 `CUENTA_NO_VERIFICADA` mientras la cuenta esté
pendiente o rechazada. El mensaje explica qué hacer.

## 5. Flujos típicos

**Cajero, al comenzar el día:** login → `/api/yo` (sin turno) →
`POST /api/turnos` → `POST /api/caja/movimientos` (fondo inicial por moneda).

**Una venta:** `previsualizar` mientras se escribe → `POST /api/operaciones`
→ `POST /api/operaciones/:id/confirmar`. Desde US$ 5.000 se exige
`clienteId` con ficha completa.

**Cierre:** `POST /api/turnos/:id/cerrar` con el conteo → mostrar el arqueo.
Si hay diferencias, el supervisor registra `POST /api/caja/ajustes`.

**Cliente nuevo en el portal:** `POST /api/registro` → login → ve "pendiente"
→ va al local → el cajero lo busca en `GET /api/cuentas-cliente?estado=PENDIENTE`,
revisa el carnet y `verificar` → el cliente ve `/api/mi/operaciones`.
