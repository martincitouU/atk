-- =====================================================================
--  Sistema de gestión para casas de cambio — Esquema SQLite
--  Port de docs/casa_cambio_schema_postgres.sql (diseño original),
--  ajustado a los requerimientos funcionales RF-01 a RF-21.
--
--  Convención: COMPRA / VENTA se expresan SIEMPRE desde la perspectiva
--  de la casa de cambio.
--    COMPRA → la casa recibe divisa y entrega moneda base.
--    VENTA  → la casa entrega divisa y recibe moneda base.
--
--  Unidades y tipos:
--    - Una base de datos por casa de cambio: no hay casa_id. Los datos de
--      la casa viven en la tabla "casa" (una sola fila).
--    - Montos: INTEGER en la unidad mínima de su moneda (moneda.decimales).
--        US$ 150,25 → 15025      $ 141.000 → 141000
--    - Tasas, precios, costos y márgenes: INTEGER escalado ×10^6, columnas
--      con sufijo _e6. Una sola escala para todas las monedas.
--        940,50 CLP por USD → 940500000      1,5 % → 1500000
--    - Fechas: INTEGER, milisegundos desde 1970 en UTC. Los cortes diarios
--      se calculan en la app con el parámetro zona_horaria.
--    - Booleanos: INTEGER 0/1. ENUM → TEXT con CHECK.
--
--  Ciclo de una operación (RF-07):
--    BORRADOR   se edita y se puede eliminar; no mueve la caja.
--    CONFIRMADA mueve la caja; ya no se modifica ni se elimina.
--    REVERSADA  se anuló con motivo; los movimientos inversos quedan en el
--               libro de caja. Tampoco se modifica.
--
--  La lógica de negocio (precios, caja, costo promedio, reverso, turnos)
--  vive en la app, en TypeScript. Aquí quedan las restricciones y los
--  triggers que protegen los datos aunque la app tenga un bug.
--
--  La app debe abrir cada conexión con:
--    PRAGMA foreign_keys = ON;      (SQLite no lo guarda en el archivo)
--    PRAGMA journal_mode = WAL;
--    PRAGMA busy_timeout = 5000;
--  y hacer las escrituras con BEGIN IMMEDIATE.
--
--  Organización:
--    1. Catálogo y configuración     5. Gastos y libro de caja
--    2. Usuarios y autenticación     6. Auditoría
--    3. Precios y spread             7. Triggers de protección
--    4. Clientes, fidelización, turnos, operación, histórico y ROE
--    8. Datos de referencia
-- =====================================================================


-- =====================================================================
-- 1. CATÁLOGO Y CONFIGURACIÓN
-- =====================================================================

-- Catálogo de monedas (ISO 4217)
CREATE TABLE moneda (
    codigo     TEXT    NOT NULL PRIMARY KEY CHECK (codigo GLOB '[A-Z][A-Z][A-Z]'),
    nombre     TEXT    NOT NULL,
    simbolo    TEXT    NOT NULL,
    decimales  INTEGER NOT NULL CHECK (decimales BETWEEN 0 AND 4)  -- define la unidad mínima
) STRICT;

-- Datos de la casa de cambio. Una sola fila (id = 1).
CREATE TABLE casa (
    id               INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
    rut              TEXT    NOT NULL,
    razon_social     TEXT    NOT NULL,
    nombre_fantasia  TEXT,
    moneda_base      TEXT    NOT NULL REFERENCES moneda(codigo),
    creada_en        INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;

-- Divisas que la casa opera y cómo las cotiza.
-- Las demás tablas apuntan aquí, no a "moneda": no se puede cotizar ni
-- operar una divisa que no esté habilitada.
CREATE TABLE casa_moneda (
    moneda_codigo   TEXT    NOT NULL PRIMARY KEY REFERENCES moneda(codigo),
    activa          INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    decimales_tasa  INTEGER NOT NULL DEFAULT 2 CHECK (decimales_tasa BETWEEN 0 AND 6),  -- redondeo del precio publicado
    monto_minimo    INTEGER NOT NULL DEFAULT 0 CHECK (monto_minimo >= 0),               -- unidad mínima de la divisa
    orden_pizarra   INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE sucursal (
    id         INTEGER NOT NULL PRIMARY KEY,
    nombre     TEXT    NOT NULL UNIQUE,
    direccion  TEXT,
    comuna     TEXT,
    activa     INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
) STRICT;

CREATE TABLE caja (
    id           INTEGER NOT NULL PRIMARY KEY,
    sucursal_id  INTEGER NOT NULL REFERENCES sucursal(id),
    nombre       TEXT    NOT NULL,
    activa       INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    UNIQUE (sucursal_id, nombre)
) STRICT;


-- =====================================================================
-- 2. USUARIOS Y AUTENTICACIÓN (RF-14)
-- =====================================================================

-- Tablas de Better Auth: SQL generado por Better Auth 1.7 con el plugin
-- admin. No son STRICT (Better Auth usa el tipo "date") y no se modifican
-- a mano: las maneja Better Auth con su propia conexión.
create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "role" text, "banned" integer, "banReason" text, "banExpires" date);

create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "impersonatedBy" text);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- Usuarios del negocio. El rol de esta tabla es el que autoriza; la
-- contraseña vive en Better Auth ("account"). Sin auth_user_id, el usuario
-- no puede iniciar sesión.
CREATE TABLE usuario (
    id            INTEGER NOT NULL PRIMARY KEY,
    auth_user_id  TEXT    UNIQUE REFERENCES "user"(id),
    sucursal_id   INTEGER REFERENCES sucursal(id),   -- NULL = todas las sucursales
    rut           TEXT    NOT NULL UNIQUE,
    nombre        TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,           -- el mismo de Better Auth
    rol           TEXT    NOT NULL CHECK (rol IN ('ADMIN', 'SUPERVISOR', 'CAJERO')),
    activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;

-- Parámetros del rubro (clave-valor tipado). La app convierte "valor"
-- según tipo_dato; los DECIMAL se leen como texto exacto, nunca con float.
CREATE TABLE parametro (
    clave            TEXT    NOT NULL PRIMARY KEY,
    valor            TEXT    NOT NULL,
    tipo_dato        TEXT    NOT NULL CHECK (tipo_dato IN ('ENTERO', 'DECIMAL', 'TEXTO', 'BOOLEANO')),
    descripcion      TEXT,
    actualizado_por  INTEGER REFERENCES usuario(id),
    actualizado_en   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;


-- =====================================================================
-- 3. PRECIOS: TASA DE REFERENCIA → REGLA DE SPREAD → COTIZACIÓN (RF-08)
-- =====================================================================

-- Valor de mercado ("medio") de 1 unidad de divisa en moneda base. Historial.
CREATE TABLE tasa_referencia (
    id              INTEGER NOT NULL PRIMARY KEY,
    moneda_codigo   TEXT    NOT NULL REFERENCES casa_moneda(moneda_codigo),
    valor_e6        INTEGER NOT NULL CHECK (valor_e6 > 0),
    fuente          TEXT    NOT NULL DEFAULT 'MANUAL',   -- MANUAL, API, BANCO_CENTRAL...
    registrada_por  INTEGER REFERENCES usuario(id),
    obtenida_en     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;

-- Regla de margen: cuánto se descuenta (compra) y se recarga (venta) sobre
-- la tasa de referencia. Admite tramos por monto y vigencia.
--   PORCENTAJE : margen_*_e6 es un porcentaje ×10^6   (1,5 % → 1500000)
--   MONTO_FIJO : margen_*_e6 es moneda base ×10^6     (5 CLP → 5000000)
-- Una regla no se modifica: para cambiar un margen se cierra su vigencia y
-- se crea otra. Así cada operación conserva la regla con que se cobró.
CREATE TABLE regla_spread (
    id                INTEGER NOT NULL PRIMARY KEY,
    sucursal_id       INTEGER REFERENCES sucursal(id),   -- NULL = regla general
    moneda_codigo     TEXT    NOT NULL REFERENCES casa_moneda(moneda_codigo),
    tipo_margen       TEXT    NOT NULL DEFAULT 'PORCENTAJE' CHECK (tipo_margen IN ('PORCENTAJE', 'MONTO_FIJO')),
    margen_compra_e6  INTEGER NOT NULL CHECK (margen_compra_e6 >= 0),
    margen_venta_e6   INTEGER NOT NULL CHECK (margen_venta_e6  >= 0),
    monto_desde       INTEGER NOT NULL DEFAULT 0 CHECK (monto_desde >= 0),  -- tramo en unidad mínima de la divisa
    monto_hasta       INTEGER,                                              -- NULL = sin tope
    vigente_desde     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    vigente_hasta     INTEGER,
    prioridad         INTEGER NOT NULL DEFAULT 0,
    creada_por        INTEGER REFERENCES usuario(id),
    CHECK (monto_hasta IS NULL OR monto_hasta > monto_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
    CHECK (tipo_margen <> 'PORCENTAJE' OR margen_compra_e6 < 100000000)  -- < 100 %
) STRICT;
CREATE INDEX ix_regla_spread_moneda ON regla_spread (moneda_codigo, vigente_desde);

-- Precio publicado en pizarra (historial completo; vigente_hasta NULL = actual)
CREATE TABLE cotizacion (
    id                  INTEGER NOT NULL PRIMARY KEY,
    sucursal_id         INTEGER REFERENCES sucursal(id),  -- NULL = todas
    moneda_codigo       TEXT    NOT NULL REFERENCES casa_moneda(moneda_codigo),
    tasa_referencia_id  INTEGER NOT NULL REFERENCES tasa_referencia(id),
    regla_spread_id     INTEGER NOT NULL REFERENCES regla_spread(id),
    precio_compra_e6    INTEGER NOT NULL CHECK (precio_compra_e6 > 0),
    precio_venta_e6     INTEGER NOT NULL,
    vigente_desde       INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    vigente_hasta       INTEGER,
    publicada_por       INTEGER REFERENCES usuario(id),
    CHECK (precio_venta_e6 >= precio_compra_e6),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
) STRICT;
CREATE UNIQUE INDEX ux_cotizacion_vigente
    ON cotizacion (ifnull(sucursal_id, 0), moneda_codigo)
    WHERE vigente_hasta IS NULL;
-- Para buscar la cotización vigente a una hora pasada (registro diferido, RF-21)
CREATE INDEX ix_cotizacion_historial ON cotizacion (moneda_codigo, vigente_desde);


-- =====================================================================
-- 4. CLIENTES, TURNOS Y OPERACIÓN
-- =====================================================================

-- Categorías de fidelización (RF-18). Un cliente con categoría recibe
-- automáticamente una tasa preferente: el margen de la regla de spread se
-- reduce en descuento_margen_pct_e6 (30 % → 30000000), en todas las divisas.
-- No requiere autorización, a diferencia de la tasa preferencial manual.
CREATE TABLE categoria_cliente (
    id                       INTEGER NOT NULL PRIMARY KEY,
    nombre                   TEXT    NOT NULL UNIQUE CHECK (trim(nombre) <> ''),
    descuento_margen_pct_e6  INTEGER NOT NULL CHECK (descuento_margen_pct_e6 > 0 AND descuento_margen_pct_e6 <= 100000000),
    activa                   INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
) STRICT;

-- Ficha de cliente con los datos que exige la UAF (RF-17). Las columnas
-- opcionales se exigen en la app cuando la operación requiere la ficha.
CREATE TABLE cliente (
    id                   INTEGER NOT NULL PRIMARY KEY,
    tipo_documento       TEXT    NOT NULL CHECK (tipo_documento IN ('RUT', 'PASAPORTE', 'DNI', 'OTRO')),
    numero_documento     TEXT    NOT NULL,
    nombre               TEXT    NOT NULL,
    nacionalidad         TEXT    CHECK (nacionalidad GLOB '[A-Z][A-Z]'),     -- ISO 3166-1 alfa-2
    oficio               TEXT,                                             -- profesión u oficio
    pais_residencia      TEXT    CHECK (pais_residencia GLOB '[A-Z][A-Z]'),  -- ISO 3166-1 alfa-2
    domicilio            TEXT,
    telefono             TEXT,
    email                TEXT,
    relacion_permanente  INTEGER NOT NULL DEFAULT 0 CHECK (relacion_permanente IN (0, 1)),
    categoria_id         INTEGER REFERENCES categoria_cliente(id),        -- fidelización (RF-18)
    creado_en            INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    actualizado_en       INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    UNIQUE (tipo_documento, numero_documento)
) STRICT;

-- El turno es de una persona en una caja
CREATE TABLE turno (
    id           INTEGER NOT NULL PRIMARY KEY,
    caja_id      INTEGER NOT NULL REFERENCES caja(id),
    usuario_id   INTEGER NOT NULL REFERENCES usuario(id),
    estado       TEXT    NOT NULL DEFAULT 'ABIERTO' CHECK (estado IN ('ABIERTO', 'CERRADO')),
    abierto_en   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    cerrado_en   INTEGER,
    cerrado_por  INTEGER REFERENCES usuario(id),
    observacion  TEXT,
    CHECK ((estado = 'ABIERTO' AND cerrado_en IS NULL AND cerrado_por IS NULL) OR
           (estado = 'CERRADO' AND cerrado_en IS NOT NULL AND cerrado_por IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX ux_turno_abierto ON turno (caja_id) WHERE estado = 'ABIERTO';

-- Saldo actual por caja y moneda (incluye la moneda base) + costo promedio.
-- Es un resumen de movimiento_caja: la app lo actualiza en la misma transacción.
CREATE TABLE saldo_caja (
    caja_id            INTEGER NOT NULL REFERENCES caja(id),
    moneda_codigo      TEXT    NOT NULL REFERENCES moneda(codigo),
    saldo              INTEGER NOT NULL DEFAULT 0,  -- unidad mínima
    costo_promedio_e6  INTEGER,                     -- costo ponderado en moneda base (solo divisas)
    actualizado_en     INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    PRIMARY KEY (caja_id, moneda_codigo)
) STRICT;

-- Conteo físico al cerrar turno vs. saldo del sistema (RF-06). Solo inserción.
CREATE TABLE arqueo (
    id             INTEGER NOT NULL PRIMARY KEY,
    turno_id       INTEGER NOT NULL REFERENCES turno(id),
    moneda_codigo  TEXT    NOT NULL REFERENCES moneda(codigo),
    saldo_sistema  INTEGER NOT NULL,
    saldo_contado  INTEGER NOT NULL,
    diferencia     INTEGER GENERATED ALWAYS AS (saldo_contado - saldo_sistema) STORED,
    registrado_en  INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    UNIQUE (turno_id, moneda_codigo)
) STRICT;

-- Importación de historial (papel / Excel, RF-13). Quien importa elige la
-- caja a la que se asignan las operaciones del lote (el papel no la dice).
CREATE TABLE lote_migracion (
    id                INTEGER NOT NULL PRIMARY KEY,
    archivo_origen    TEXT    NOT NULL,
    caja_id           INTEGER NOT NULL REFERENCES caja(id),
    filas_leidas      INTEGER NOT NULL DEFAULT 0,
    filas_importadas  INTEGER NOT NULL DEFAULT 0,
    filas_rechazadas  INTEGER NOT NULL DEFAULT 0,
    importado_por     INTEGER NOT NULL REFERENCES usuario(id),
    importado_en      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    observaciones     TEXT
) STRICT;

-- Cada fila rechazada de un lote, con su causa (RF-13). Solo inserción.
CREATE TABLE lote_migracion_rechazo (
    id                 INTEGER NOT NULL PRIMARY KEY,
    lote_migracion_id  INTEGER NOT NULL REFERENCES lote_migracion(id),
    fila               INTEGER NOT NULL CHECK (fila > 0),      -- número de fila en el archivo
    causa              TEXT    NOT NULL CHECK (trim(causa) <> ''),
    datos              TEXT    CHECK (datos IS NULL OR json_valid(datos)),  -- la fila original
    UNIQUE (lote_migracion_id, fila)
) STRICT;

-- Compra o venta de divisa (RF-01, RF-02). Ver el ciclo de estados arriba.
-- La divisa siempre se entrega en efectivo; medio_pago es cómo se pagan
-- los pesos: solo EFECTIVO mueve los pesos de la caja.
CREATE TABLE operacion (
    id                  INTEGER NOT NULL PRIMARY KEY,
    caja_id             INTEGER NOT NULL REFERENCES caja(id),
    turno_id            INTEGER REFERENCES turno(id),
    usuario_id          INTEGER NOT NULL REFERENCES usuario(id),     -- quien la registra
    cliente_id          INTEGER REFERENCES cliente(id),
    tipo                TEXT    NOT NULL CHECK (tipo IN ('COMPRA', 'VENTA')),
    moneda_codigo       TEXT    NOT NULL REFERENCES casa_moneda(moneda_codigo),
    monto_divisa        INTEGER NOT NULL CHECK (monto_divisa > 0),   -- unidad mínima de la divisa
    medio_pago          TEXT    NOT NULL DEFAULT 'EFECTIVO' CHECK (medio_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA')),
    tasa_aplicada_e6    INTEGER NOT NULL CHECK (tasa_aplicada_e6 > 0),
    monto_base          INTEGER NOT NULL CHECK (monto_base > 0),     -- unidad mínima de la moneda base
    tasa_referencia_e6  INTEGER,                                     -- snapshot al momento de operar
    cotizacion_id       INTEGER REFERENCES cotizacion(id),
    regla_spread_id     INTEGER REFERENCES regla_spread(id),
    es_preferencial     INTEGER NOT NULL DEFAULT 0 CHECK (es_preferencial IN (0, 1)),  -- tasa manual autorizada
    categoria_cliente_id INTEGER REFERENCES categoria_cliente(id),   -- tasa preferente de fidelización (RF-18)
    autorizado_por      INTEGER REFERENCES usuario(id),
    autorizado_en       INTEGER,
    margen_bruto        INTEGER,   -- moneda base, vs. tasa de referencia (RF-03)
    margen_realizado    INTEGER,   -- moneda base, solo ventas: vs. costo promedio del stock
    equivalente_usd     INTEGER CHECK (equivalente_usd >= 0),        -- unidad mínima del USD (RF-17, RF-19)
    proposito           TEXT,                                        -- propósito de la transacción (RF-17)
    tipo_dte            INTEGER CHECK (tipo_dte IN (34, 41)),        -- 34 factura exenta, 41 boleta exenta (RF-20)
    folio_dte           INTEGER CHECK (folio_dte > 0),
    estado              TEXT    NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'CONFIRMADA', 'REVERSADA')),
    confirmada_por      INTEGER REFERENCES usuario(id),
    confirmada_en       INTEGER,
    reversada_por       INTEGER REFERENCES usuario(id),
    reversada_en        INTEGER,
    motivo_reverso      TEXT,
    origen              TEXT    NOT NULL DEFAULT 'SISTEMA' CHECK (origen IN ('SISTEMA', 'MIGRACION')),
    lote_migracion_id   INTEGER REFERENCES lote_migracion(id),
    registro_diferido   INTEGER NOT NULL DEFAULT 0 CHECK (registro_diferido IN (0, 1)),  -- RF-21
    realizada_en        INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),  -- cuándo ocurrió
    registrada_en       INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),  -- cuándo se ingresó
    observacion         TEXT,
    CHECK ((estado = 'BORRADOR'   AND confirmada_en IS NULL     AND confirmada_por IS NULL
                                  AND reversada_en IS NULL      AND reversada_por IS NULL AND motivo_reverso IS NULL) OR
           (estado = 'CONFIRMADA' AND confirmada_en IS NOT NULL AND confirmada_por IS NOT NULL
                                  AND reversada_en IS NULL      AND reversada_por IS NULL AND motivo_reverso IS NULL) OR
           (estado = 'REVERSADA'  AND confirmada_en IS NOT NULL AND confirmada_por IS NOT NULL
                                  AND reversada_en IS NOT NULL  AND reversada_por IS NOT NULL
                                  AND motivo_reverso IS NOT NULL AND trim(motivo_reverso) <> '')),
    CHECK ((origen = 'SISTEMA'   AND turno_id IS NOT NULL AND lote_migracion_id IS NULL) OR
           (origen = 'MIGRACION' AND lote_migracion_id IS NOT NULL)),
    CHECK (estado = 'BORRADOR' OR es_preferencial = 0 OR autorizado_por IS NOT NULL),
    CHECK (es_preferencial = 0 OR categoria_cliente_id IS NULL),  -- la tasa manual reemplaza a la de categoría
    CHECK ((autorizado_por IS NULL) = (autorizado_en IS NULL)),
    CHECK ((tipo_dte IS NULL) = (folio_dte IS NULL)),
    CHECK (registro_diferido = 0 OR realizada_en <= registrada_en),
    UNIQUE (tipo_dte, folio_dte)
) STRICT;
CREATE INDEX ix_operacion_caja_fecha   ON operacion (caja_id, realizada_en);
CREATE INDEX ix_operacion_moneda_fecha ON operacion (moneda_codigo, realizada_en);
CREATE INDEX ix_operacion_fecha        ON operacion (realizada_en);
CREATE INDEX ix_operacion_cliente      ON operacion (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX ix_operacion_turno        ON operacion (turno_id);

-- Reporte de Operaciones en Efectivo a la UAF (RF-19), uno por trimestre.
-- Queda registro de cada generación (puede regenerarse si hubo un error),
-- de qué operaciones incluyó y de cuándo se envió. Sin operaciones es un
-- reporte negativo, que también se envía.
CREATE TABLE reporte_roe (
    id                    INTEGER NOT NULL PRIMARY KEY,
    anio                  INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2100),
    trimestre             INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
    umbral_usd            INTEGER NOT NULL CHECK (umbral_usd > 0),            -- umbral con que se generó
    cantidad_operaciones  INTEGER NOT NULL CHECK (cantidad_operaciones >= 0),
    es_negativo           INTEGER GENERATED ALWAYS AS (cantidad_operaciones = 0) STORED,
    generado_por          INTEGER NOT NULL REFERENCES usuario(id),
    generado_en           INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    enviado_por           INTEGER REFERENCES usuario(id),
    enviado_en            INTEGER,
    CHECK ((enviado_por IS NULL) = (enviado_en IS NULL))
) STRICT;

CREATE TABLE reporte_roe_operacion (
    reporte_roe_id  INTEGER NOT NULL REFERENCES reporte_roe(id),
    operacion_id    INTEGER NOT NULL REFERENCES operacion(id),
    PRIMARY KEY (reporte_roe_id, operacion_id)
) STRICT;


-- =====================================================================
-- 5. GASTOS Y LIBRO DE CAJA (RF-04, RF-05)
-- =====================================================================

CREATE TABLE categoria_gasto (
    id      INTEGER NOT NULL PRIMARY KEY,
    nombre  TEXT    NOT NULL UNIQUE,
    activa  INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1))
) STRICT;

-- Gasto operacional en moneda base. Pagado en EFECTIVO sale de una caja,
-- dentro de un turno; pagado de otra forma no toca la caja.
CREATE TABLE gasto (
    id              INTEGER NOT NULL PRIMARY KEY,
    fecha           TEXT    NOT NULL CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(fecha) = fecha),
    categoria_id    INTEGER NOT NULL REFERENCES categoria_gasto(id),
    descripcion     TEXT    NOT NULL CHECK (trim(descripcion) <> ''),
    monto           INTEGER NOT NULL CHECK (monto > 0),   -- unidad mínima de la moneda base
    medio_pago      TEXT    NOT NULL CHECK (medio_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA')),
    caja_id         INTEGER REFERENCES caja(id),
    turno_id        INTEGER REFERENCES turno(id),
    documento       TEXT,                                 -- boleta o factura del proveedor
    estado          TEXT    NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'REVERSADO')),
    reversado_por   INTEGER REFERENCES usuario(id),
    reversado_en    INTEGER,
    motivo_reverso  TEXT,
    usuario_id      INTEGER NOT NULL REFERENCES usuario(id),
    registrado_en   INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    CHECK ((medio_pago = 'EFECTIVO'  AND caja_id IS NOT NULL AND turno_id IS NOT NULL) OR
           (medio_pago <> 'EFECTIVO' AND caja_id IS NULL     AND turno_id IS NULL)),
    CHECK ((estado = 'VIGENTE'   AND reversado_en IS NULL     AND reversado_por IS NULL AND motivo_reverso IS NULL) OR
           (estado = 'REVERSADO' AND reversado_en IS NOT NULL AND reversado_por IS NOT NULL
                                 AND motivo_reverso IS NOT NULL AND trim(motivo_reverso) <> ''))
) STRICT;
CREATE INDEX ix_gasto_fecha ON gasto (fecha);

-- Libro de movimientos de caja: cada entrada (+) o salida (−) de dinero
-- físico. Solo inserción.
CREATE TABLE movimiento_caja (
    id             INTEGER NOT NULL PRIMARY KEY,
    caja_id        INTEGER NOT NULL REFERENCES caja(id),
    turno_id       INTEGER REFERENCES turno(id),
    moneda_codigo  TEXT    NOT NULL REFERENCES moneda(codigo),
    tipo           TEXT    NOT NULL CHECK (tipo IN ('OPERACION', 'REVERSO', 'INGRESO', 'RETIRO', 'GASTO', 'AJUSTE')),
    monto          INTEGER NOT NULL CHECK (monto <> 0),   -- unidad mínima
    saldo_post     INTEGER NOT NULL,
    operacion_id   INTEGER REFERENCES operacion(id),
    gasto_id       INTEGER REFERENCES gasto(id),
    usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
    descripcion    TEXT,
    creado_en      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    CHECK (tipo <> 'OPERACION' OR operacion_id IS NOT NULL),
    CHECK (tipo <> 'GASTO'     OR gasto_id IS NOT NULL),
    CHECK (tipo <> 'REVERSO'   OR operacion_id IS NOT NULL OR gasto_id IS NOT NULL),
    CHECK (tipo NOT IN ('INGRESO', 'RETIRO', 'AJUSTE') OR (descripcion IS NOT NULL AND trim(descripcion) <> '')),
    CHECK (tipo <> 'INGRESO' OR monto > 0),
    CHECK (tipo NOT IN ('RETIRO', 'GASTO') OR monto < 0)
) STRICT;
CREATE INDEX ix_movimiento_caja ON movimiento_caja (caja_id, moneda_codigo, creado_en);


-- =====================================================================
-- 6. AUDITORÍA (RF-15)
-- =====================================================================

-- La escribe la app en la misma transacción que el cambio. El usuario es
-- obligatorio, el reverso exige motivo y los datos no incluyen
-- credenciales. Solo inserción.
CREATE TABLE auditoria (
    id             INTEGER NOT NULL PRIMARY KEY,
    tabla          TEXT    NOT NULL,
    registro_id    TEXT    NOT NULL,
    accion         TEXT    NOT NULL CHECK (accion IN ('CREAR', 'EDITAR', 'ELIMINAR', 'CONFIRMAR', 'REVERSAR',
                                                      'AUTORIZAR', 'PUBLICAR', 'ABRIR', 'CERRAR',
                                                      'GENERAR', 'EXPORTAR', 'IMPORTAR')),
    motivo         TEXT,
    datos_antes    TEXT    CHECK (datos_antes   IS NULL OR json_valid(datos_antes)),
    datos_despues  TEXT    CHECK (datos_despues IS NULL OR json_valid(datos_despues)),
    usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
    registrado_en  INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    CHECK (accion <> 'REVERSAR' OR (motivo IS NOT NULL AND trim(motivo) <> ''))
) STRICT;
CREATE INDEX ix_auditoria_registro ON auditoria (tabla, registro_id);
CREATE INDEX ix_auditoria_fecha    ON auditoria (registrado_en);


-- =====================================================================
-- 7. TRIGGERS DE PROTECCIÓN
--    Solo invariantes: la lógica de negocio está en la app.
-- =====================================================================

-- --- operacion: ciclo BORRADOR → CONFIRMADA → REVERSADA (RF-07) -----

-- Lo que registra el sistema nace como borrador; solo la importación del
-- histórico inserta operaciones ya confirmadas.
CREATE TRIGGER operacion_nace_borrador BEFORE INSERT ON operacion
WHEN NEW.origen = 'SISTEMA' AND NEW.estado <> 'BORRADOR'
BEGIN
    SELECT RAISE(ABORT, 'Una operación nueva debe nacer como BORRADOR');
END;

CREATE TRIGGER operacion_no_moneda_base BEFORE INSERT ON operacion
WHEN NEW.moneda_codigo = (SELECT moneda_base FROM casa WHERE id = 1)
BEGIN
    SELECT RAISE(ABORT, 'No se puede comprar ni vender la moneda base');
END;

CREATE TRIGGER operacion_no_moneda_base_al_editar BEFORE UPDATE OF moneda_codigo ON operacion
WHEN NEW.moneda_codigo = (SELECT moneda_base FROM casa WHERE id = 1)
BEGIN
    SELECT RAISE(ABORT, 'No se puede comprar ni vender la moneda base');
END;

CREATE TRIGGER operacion_turno_valido BEFORE INSERT ON operacion
WHEN NEW.origen = 'SISTEMA' AND NOT EXISTS (
    SELECT 1 FROM turno t
     WHERE t.id = NEW.turno_id AND t.estado = 'ABIERTO'
       AND t.caja_id = NEW.caja_id AND t.usuario_id = NEW.usuario_id)
BEGIN
    SELECT RAISE(ABORT, 'La operación requiere un turno abierto del mismo usuario en esa caja');
END;

CREATE TRIGGER operacion_turno_valido_al_confirmar BEFORE UPDATE OF estado ON operacion
WHEN NEW.estado = 'CONFIRMADA' AND OLD.estado = 'BORRADOR' AND NEW.origen = 'SISTEMA' AND NOT EXISTS (
    SELECT 1 FROM turno t
     WHERE t.id = NEW.turno_id AND t.estado = 'ABIERTO'
       AND t.caja_id = NEW.caja_id AND t.usuario_id = NEW.usuario_id)
BEGIN
    SELECT RAISE(ABORT, 'La operación requiere un turno abierto del mismo usuario en esa caja');
END;

-- Dónde, quién y de dónde viene una operación no cambia nunca
CREATE TRIGGER operacion_origen_inmutable BEFORE UPDATE OF
    id, caja_id, turno_id, usuario_id, origen, lote_migracion_id, registrada_en
ON operacion
BEGIN
    SELECT RAISE(ABORT, 'No se puede cambiar la caja, el turno, el cajero ni el origen de una operación');
END;

CREATE TRIGGER operacion_transicion_valida BEFORE UPDATE OF estado ON operacion
WHEN NOT (OLD.estado = NEW.estado
       OR (OLD.estado = 'BORRADOR'   AND NEW.estado = 'CONFIRMADA')
       OR (OLD.estado = 'CONFIRMADA' AND NEW.estado = 'REVERSADA'))
BEGIN
    SELECT RAISE(ABORT, 'Transición de estado no permitida: BORRADOR → CONFIRMADA → REVERSADA');
END;

CREATE TRIGGER operacion_no_borrar BEFORE DELETE ON operacion
WHEN OLD.estado <> 'BORRADOR'
BEGIN
    SELECT RAISE(ABORT, 'Una operación confirmada no se elimina: se reversa');
END;

CREATE TRIGGER operacion_reversada_inmutable BEFORE UPDATE ON operacion
WHEN OLD.estado = 'REVERSADA'
BEGIN
    SELECT RAISE(ABORT, 'Una operación reversada no se puede modificar');
END;

-- Una confirmada solo puede pasar a REVERSADA. Lista: todas las columnas
-- menos estado, reversada_*, motivo_reverso y las de operacion_origen_inmutable.
-- Si se agrega una columna a operacion, agregarla aquí.
CREATE TRIGGER operacion_confirmada_inmutable BEFORE UPDATE OF
    cliente_id, tipo, moneda_codigo, monto_divisa, medio_pago, tasa_aplicada_e6,
    monto_base, tasa_referencia_e6, cotizacion_id, regla_spread_id, es_preferencial,
    autorizado_por, autorizado_en, margen_bruto, margen_realizado, equivalente_usd,
    categoria_cliente_id, proposito, tipo_dte, folio_dte, confirmada_por, confirmada_en, registro_diferido,
    realizada_en, observacion
ON operacion
WHEN OLD.estado = 'CONFIRMADA'
BEGIN
    SELECT RAISE(ABORT, 'Una operación confirmada no se modifica: solo se reversa');
END;

-- --- cotizacion: solo se puede cerrar su vigencia, una vez ---------

CREATE TRIGGER cotizacion_no_borrar BEFORE DELETE ON cotizacion
BEGIN
    SELECT RAISE(ABORT, 'Las cotizaciones son historial: no se eliminan');
END;

CREATE TRIGGER cotizacion_campos_inmutables BEFORE UPDATE OF
    id, sucursal_id, moneda_codigo, tasa_referencia_id, regla_spread_id,
    precio_compra_e6, precio_venta_e6, vigente_desde, publicada_por
ON cotizacion
BEGIN
    SELECT RAISE(ABORT, 'Una cotización publicada no se modifica: se publica una nueva');
END;

CREATE TRIGGER cotizacion_cerrada_inmutable BEFORE UPDATE ON cotizacion
WHEN OLD.vigente_hasta IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Una cotización cerrada no se modifica');
END;

-- --- regla_spread: solo se puede cerrar su vigencia ---------------

CREATE TRIGGER regla_spread_no_borrar BEFORE DELETE ON regla_spread
BEGIN
    SELECT RAISE(ABORT, 'Las reglas de spread son historial: no se eliminan');
END;

CREATE TRIGGER regla_spread_campos_inmutables BEFORE UPDATE OF
    id, sucursal_id, moneda_codigo, tipo_margen, margen_compra_e6, margen_venta_e6,
    monto_desde, monto_hasta, vigente_desde, prioridad, creada_por
ON regla_spread
BEGIN
    SELECT RAISE(ABORT, 'Una regla de spread no se modifica: se cierra y se crea otra');
END;

CREATE TRIGGER regla_spread_cerrada_inmutable BEFORE UPDATE ON regla_spread
WHEN OLD.vigente_hasta IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Una regla de spread cerrada no se modifica');
END;

-- --- turno: no se cierra con borradores; cerrado no se toca --------

CREATE TRIGGER turno_no_borrar BEFORE DELETE ON turno
BEGIN
    SELECT RAISE(ABORT, 'Los turnos no se eliminan');
END;

CREATE TRIGGER turno_cerrado_inmutable BEFORE UPDATE ON turno
WHEN OLD.estado = 'CERRADO'
BEGIN
    SELECT RAISE(ABORT, 'Un turno cerrado no se puede modificar');
END;

CREATE TRIGGER turno_no_cerrar_con_borradores BEFORE UPDATE OF estado ON turno
WHEN NEW.estado = 'CERRADO' AND EXISTS (
    SELECT 1 FROM operacion WHERE turno_id = NEW.id AND estado = 'BORRADOR')
BEGIN
    SELECT RAISE(ABORT, 'El turno tiene operaciones en borrador: confírmelas o elimínelas antes de cerrar');
END;

-- --- gasto: nace vigente; solo puede reversarse --------------------

CREATE TRIGGER gasto_nace_vigente BEFORE INSERT ON gasto
WHEN NEW.estado <> 'VIGENTE'
BEGIN
    SELECT RAISE(ABORT, 'Un gasto nuevo debe estar VIGENTE');
END;

CREATE TRIGGER gasto_turno_valido BEFORE INSERT ON gasto
WHEN NEW.medio_pago = 'EFECTIVO' AND NOT EXISTS (
    SELECT 1 FROM turno t
     WHERE t.id = NEW.turno_id AND t.estado = 'ABIERTO'
       AND t.caja_id = NEW.caja_id AND t.usuario_id = NEW.usuario_id)
BEGIN
    SELECT RAISE(ABORT, 'Un gasto en efectivo requiere un turno abierto del mismo usuario en esa caja');
END;

CREATE TRIGGER gasto_no_borrar BEFORE DELETE ON gasto
BEGIN
    SELECT RAISE(ABORT, 'Los gastos no se eliminan: se reversan');
END;

CREATE TRIGGER gasto_reversado_inmutable BEFORE UPDATE ON gasto
WHEN OLD.estado = 'REVERSADO'
BEGIN
    SELECT RAISE(ABORT, 'Un gasto reversado no se puede modificar');
END;

CREATE TRIGGER gasto_campos_inmutables BEFORE UPDATE OF
    id, fecha, categoria_id, descripcion, monto, medio_pago, caja_id, turno_id,
    documento, usuario_id, registrado_en
ON gasto
BEGIN
    SELECT RAISE(ABORT, 'Un gasto no se modifica: se reversa y se registra de nuevo');
END;

-- --- libro de caja: coherente con lo que registra ------------------

-- Un borrador nunca mueve la caja
CREATE TRIGGER movimiento_de_operacion_confirmada BEFORE INSERT ON movimiento_caja
WHEN NEW.tipo = 'OPERACION'
 AND (SELECT estado FROM operacion WHERE id = NEW.operacion_id) <> 'CONFIRMADA'
BEGIN
    SELECT RAISE(ABORT, 'Solo una operación CONFIRMADA mueve la caja');
END;

CREATE TRIGGER movimiento_de_reverso BEFORE INSERT ON movimiento_caja
WHEN NEW.tipo = 'REVERSO' AND (
       (NEW.operacion_id IS NOT NULL AND (SELECT estado FROM operacion WHERE id = NEW.operacion_id) <> 'REVERSADA')
    OR (NEW.gasto_id IS NOT NULL AND (SELECT estado FROM gasto WHERE id = NEW.gasto_id) <> 'REVERSADO'))
BEGIN
    SELECT RAISE(ABORT, 'Un movimiento de reverso requiere la operación o el gasto ya reversado');
END;

-- --- reporte_roe: generado no cambia; solo se registra su envío, una vez

CREATE TRIGGER reporte_roe_no_borrar BEFORE DELETE ON reporte_roe
BEGIN
    SELECT RAISE(ABORT, 'Los reportes ROE generados no se eliminan');
END;

CREATE TRIGGER reporte_roe_campos_inmutables BEFORE UPDATE OF
    id, anio, trimestre, umbral_usd, cantidad_operaciones, generado_por, generado_en
ON reporte_roe
BEGIN
    SELECT RAISE(ABORT, 'Un reporte ROE generado no se modifica: se genera uno nuevo');
END;

CREATE TRIGGER reporte_roe_enviado_una_vez BEFORE UPDATE ON reporte_roe
WHEN OLD.enviado_en IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'El reporte ROE ya está marcado como enviado');
END;

-- --- tablas de solo inserción --------------------------------------

CREATE TRIGGER reporte_roe_operacion_no_modificar BEFORE UPDATE ON reporte_roe_operacion
BEGIN
    SELECT RAISE(ABORT, 'reporte_roe_operacion es de solo inserción');
END;
CREATE TRIGGER reporte_roe_operacion_no_borrar BEFORE DELETE ON reporte_roe_operacion
BEGIN
    SELECT RAISE(ABORT, 'reporte_roe_operacion es de solo inserción');
END;

CREATE TRIGGER lote_migracion_rechazo_no_modificar BEFORE UPDATE ON lote_migracion_rechazo
BEGIN
    SELECT RAISE(ABORT, 'lote_migracion_rechazo es de solo inserción');
END;
CREATE TRIGGER lote_migracion_rechazo_no_borrar BEFORE DELETE ON lote_migracion_rechazo
BEGIN
    SELECT RAISE(ABORT, 'lote_migracion_rechazo es de solo inserción');
END;

CREATE TRIGGER movimiento_caja_no_modificar BEFORE UPDATE ON movimiento_caja
BEGIN
    SELECT RAISE(ABORT, 'movimiento_caja es de solo inserción');
END;
CREATE TRIGGER movimiento_caja_no_borrar BEFORE DELETE ON movimiento_caja
BEGIN
    SELECT RAISE(ABORT, 'movimiento_caja es de solo inserción');
END;

CREATE TRIGGER auditoria_no_modificar BEFORE UPDATE ON auditoria
BEGIN
    SELECT RAISE(ABORT, 'auditoria es de solo inserción');
END;
CREATE TRIGGER auditoria_no_borrar BEFORE DELETE ON auditoria
BEGIN
    SELECT RAISE(ABORT, 'auditoria es de solo inserción');
END;

CREATE TRIGGER arqueo_no_modificar BEFORE UPDATE ON arqueo
BEGIN
    SELECT RAISE(ABORT, 'arqueo es de solo inserción');
END;
CREATE TRIGGER arqueo_no_borrar BEFORE DELETE ON arqueo
BEGIN
    SELECT RAISE(ABORT, 'arqueo es de solo inserción');
END;

CREATE TRIGGER tasa_referencia_no_modificar BEFORE UPDATE ON tasa_referencia
BEGIN
    SELECT RAISE(ABORT, 'tasa_referencia es historial: solo inserción');
END;
CREATE TRIGGER tasa_referencia_no_borrar BEFORE DELETE ON tasa_referencia
BEGIN
    SELECT RAISE(ABORT, 'tasa_referencia es historial: solo inserción');
END;


-- =====================================================================
-- 8. DATOS DE REFERENCIA
--    Catálogos y configuración por defecto: valen en producción. Los
--    valores de los parámetros deben validarse con el mandante. Los datos
--    de EJEMPLO (casa, cajas, usuarios, tasas) van en db/semillas/.
-- =====================================================================

INSERT INTO moneda (codigo, nombre, simbolo, decimales) VALUES
    ('CLP', 'Peso chileno',          '$',   0),
    ('USD', 'Dólar estadounidense',  'US$', 2),
    ('EUR', 'Euro',                  '€',   2),
    ('BRL', 'Real brasileño',        'R$',  2),
    ('ARS', 'Peso argentino',        'AR$', 2);

INSERT INTO parametro (clave, valor, tipo_dato, descripcion) VALUES
    ('zona_horaria',                       'America/Coyhaique', 'TEXTO',    'Zona horaria de los cortes diarios. Aysén usa UTC-3 todo el año desde 2025'),
    ('umbral_ficha_cliente_usd',           '5000',              'ENTERO',   'Equivalente en USD desde el cual la operación exige ficha de cliente completa y propósito (RF-17)'),
    ('umbral_roe_usd',                     '10000',             'ENTERO',   'Equivalente en USD sobre el cual una operación en efectivo va al ROE (RF-19)'),
    ('permitir_saldo_negativo',            'false',             'BOOLEANO', 'Si es false, no se puede entregar dinero que la caja no tiene'),
    ('vigencia_cotizacion_minutos',        '720',               'ENTERO',   'Minutos que una pizarra es válida antes de exigir publicar una nueva'),
    ('reverso_requiere_supervisor',        'true',              'BOOLEANO', 'Si los reversos requieren rol SUPERVISOR o ADMIN'),
    ('desviacion_maxima_preferencial_pct', '5',                 'DECIMAL',  'Desviación máxima de una tasa preferencial respecto de la pizarra, en %'),
    ('folio_obligatorio_al_confirmar',     'true',              'BOOLEANO', 'Si una operación exige el folio del DTE para confirmarse (RF-20)'),
    ('sesion_inactividad_minutos',         '15',                'ENTERO',   'Minutos sin actividad tras los cuales se cierra la sesión (RF-14)');

INSERT INTO categoria_gasto (nombre) VALUES
    ('Arriendo'),
    ('Remuneraciones'),
    ('Servicios básicos'),
    ('Comisiones bancarias'),
    ('Transporte de valores'),
    ('Insumos y oficina'),
    ('Otros');
