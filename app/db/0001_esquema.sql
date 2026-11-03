-- =====================================================================
--  Sistema de gestión para casas de cambio — Esquema SQLite
--  Port de docs/casa_cambio_schema_postgres.sql (diseño original).
--
--  Convención: COMPRA / VENTA se expresan SIEMPRE desde la perspectiva
--  de la casa de cambio.
--    COMPRA → la casa recibe divisa y entrega moneda base.
--    VENTA  → la casa entrega divisa y recibe moneda base.
--
--  Diferencias con el original:
--    - Una base de datos por casa de cambio: no hay casa_id. Los datos de
--      la casa viven en la tabla "casa" (una sola fila).
--    - Montos: INTEGER en la unidad mínima de su moneda (moneda.decimales).
--        US$ 150,25 → 15025      $ 141.000 → 141000
--    - Tasas, precios, costos y márgenes: INTEGER escalado ×10^6, columnas
--      con sufijo _e6. Una sola escala para todas las monedas.
--        940,50 CLP por USD → 940500000      1,5 % → 1500000
--    - Fechas: INTEGER, milisegundos desde 1970 en UTC. Los cortes diarios
--      en America/Santiago se calculan en la app (SQLite no tiene zonas).
--    - Booleanos: INTEGER 0/1. ENUM → TEXT con CHECK.
--    - La lógica de negocio (precios, caja, costo promedio, anulación,
--      turnos) vive en la app, en TypeScript. Aquí quedan solo las
--      restricciones y los triggers que protegen los datos aunque la app
--      tenga un bug.
--    - La auditoría la escribe la app, en la misma transacción, con el
--      usuario obligatorio y sin datos sensibles.
--
--  La app debe abrir cada conexión con:
--    PRAGMA foreign_keys = ON;      (SQLite no lo guarda en el archivo)
--    PRAGMA journal_mode = WAL;
--    PRAGMA busy_timeout = 5000;
--  y hacer las escrituras con BEGIN IMMEDIATE.
--
--  Organización:
--    1. Catálogo y configuración     4. Operación y caja
--    2. Usuarios                     5. Auditoría
--    3. Precios y spread             6. Triggers de protección
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
-- 2. USUARIOS
-- =====================================================================

-- Sin contraseña: el login lo maneja Better Auth (fase 4), que guarda las
-- credenciales en sus propias tablas. Esta tabla se fusionará con la suya.
CREATE TABLE usuario (
    id           INTEGER NOT NULL PRIMARY KEY,
    sucursal_id  INTEGER REFERENCES sucursal(id),   -- NULL = todas las sucursales
    rut          TEXT    NOT NULL UNIQUE,
    nombre       TEXT    NOT NULL,
    email        TEXT    NOT NULL UNIQUE,
    rol          TEXT    NOT NULL CHECK (rol IN ('ADMIN', 'SUPERVISOR', 'CAJERO')),
    activo       INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    creado_en    INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
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
-- 3. PRECIOS: TASA DE REFERENCIA → REGLA DE SPREAD → COTIZACIÓN
-- =====================================================================

-- Valor de mercado ("medio") de 1 unidad de divisa en moneda base. Histórico.
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
    activa            INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
    creada_por        INTEGER REFERENCES usuario(id),
    CHECK (monto_hasta IS NULL OR monto_hasta > monto_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    CHECK (tipo_margen <> 'PORCENTAJE' OR margen_compra_e6 < 100000000)  -- < 100 %
) STRICT;

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


-- =====================================================================
-- 4. OPERACIÓN Y CAJA
-- =====================================================================

CREATE TABLE cliente (
    id                INTEGER NOT NULL PRIMARY KEY,
    tipo_documento    TEXT    NOT NULL CHECK (tipo_documento IN ('RUT', 'PASAPORTE', 'DNI', 'OTRO')),
    numero_documento  TEXT    NOT NULL,
    nombre            TEXT    NOT NULL,
    nacionalidad      TEXT    CHECK (nacionalidad GLOB '[A-Z][A-Z]'),  -- ISO 3166-1 alfa-2
    telefono          TEXT,
    email             TEXT,
    creado_en         INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    UNIQUE (tipo_documento, numero_documento)
) STRICT;

-- El turno es de una persona en una caja (pendiente confirmar con el cliente)
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

-- Conteo físico al cerrar turno vs. saldo del sistema. Solo inserción.
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

-- Importación de historial (papel / Excel)
CREATE TABLE lote_migracion (
    id                INTEGER NOT NULL PRIMARY KEY,
    archivo_origen    TEXT    NOT NULL,
    filas_leidas      INTEGER NOT NULL DEFAULT 0,
    filas_importadas  INTEGER NOT NULL DEFAULT 0,
    filas_rechazadas  INTEGER NOT NULL DEFAULT 0,
    importado_por     INTEGER NOT NULL REFERENCES usuario(id),
    importado_en      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    observaciones     TEXT
) STRICT;

-- Inmutable: solo se puede anular o editar la observación (ver triggers)
CREATE TABLE operacion (
    id                  INTEGER NOT NULL PRIMARY KEY,
    caja_id             INTEGER NOT NULL REFERENCES caja(id),
    turno_id            INTEGER REFERENCES turno(id),
    usuario_id          INTEGER NOT NULL REFERENCES usuario(id),
    cliente_id          INTEGER REFERENCES cliente(id),
    tipo                TEXT    NOT NULL CHECK (tipo IN ('COMPRA', 'VENTA')),
    moneda_codigo       TEXT    NOT NULL REFERENCES casa_moneda(moneda_codigo),
    monto_divisa        INTEGER NOT NULL CHECK (monto_divisa > 0),     -- unidad mínima de la divisa
    tasa_aplicada_e6    INTEGER NOT NULL CHECK (tasa_aplicada_e6 > 0),
    monto_base          INTEGER NOT NULL CHECK (monto_base > 0),       -- unidad mínima de la moneda base
    tasa_referencia_e6  INTEGER,                                       -- snapshot al momento de operar
    cotizacion_id       INTEGER REFERENCES cotizacion(id),
    regla_spread_id     INTEGER REFERENCES regla_spread(id),
    es_preferencial     INTEGER NOT NULL DEFAULT 0 CHECK (es_preferencial IN (0, 1)),
    autorizado_por      INTEGER REFERENCES usuario(id),
    margen_bruto        INTEGER,   -- moneda base, vs. tasa de referencia
    margen_realizado    INTEGER,   -- moneda base, solo ventas: vs. costo promedio del stock
    estado              TEXT    NOT NULL DEFAULT 'VIGENTE' CHECK (estado IN ('VIGENTE', 'ANULADA')),
    anulada_por         INTEGER REFERENCES usuario(id),
    anulada_en          INTEGER,
    motivo_anulacion    TEXT,
    origen              TEXT    NOT NULL DEFAULT 'SISTEMA' CHECK (origen IN ('SISTEMA', 'MIGRACION')),
    lote_migracion_id   INTEGER REFERENCES lote_migracion(id),
    realizada_en        INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    observacion         TEXT,
    CHECK ((estado = 'VIGENTE' AND anulada_en IS NULL AND anulada_por IS NULL AND motivo_anulacion IS NULL) OR
           (estado = 'ANULADA' AND anulada_en IS NOT NULL AND anulada_por IS NOT NULL
                               AND motivo_anulacion IS NOT NULL AND trim(motivo_anulacion) <> '')),
    CHECK ((origen = 'SISTEMA'   AND turno_id IS NOT NULL AND lote_migracion_id IS NULL) OR
           (origen = 'MIGRACION' AND lote_migracion_id IS NOT NULL)),
    CHECK (es_preferencial = 0 OR autorizado_por IS NOT NULL)
) STRICT;
CREATE INDEX ix_operacion_caja_fecha   ON operacion (caja_id, realizada_en);
CREATE INDEX ix_operacion_moneda_fecha ON operacion (moneda_codigo, realizada_en);
CREATE INDEX ix_operacion_cliente      ON operacion (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX ix_operacion_turno        ON operacion (turno_id);

-- Libro de movimientos de caja (cada entrada/salida de dinero). Solo inserción.
CREATE TABLE movimiento_caja (
    id             INTEGER NOT NULL PRIMARY KEY,
    caja_id        INTEGER NOT NULL REFERENCES caja(id),
    turno_id       INTEGER REFERENCES turno(id),
    moneda_codigo  TEXT    NOT NULL REFERENCES moneda(codigo),
    tipo           TEXT    NOT NULL CHECK (tipo IN ('OPERACION', 'ANULACION', 'INGRESO', 'RETIRO', 'AJUSTE')),
    monto          INTEGER NOT NULL CHECK (monto <> 0),   -- + entra, − sale; unidad mínima
    saldo_post     INTEGER NOT NULL,
    operacion_id   INTEGER REFERENCES operacion(id),
    usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
    descripcion    TEXT,
    creado_en      INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;
CREATE INDEX ix_movimiento_caja ON movimiento_caja (caja_id, moneda_codigo, creado_en);


-- =====================================================================
-- 5. AUDITORÍA
-- =====================================================================

-- La escribe la app en la misma transacción que el cambio. El usuario es
-- obligatorio y los datos no incluyen credenciales. Solo inserción.
CREATE TABLE auditoria (
    id             INTEGER NOT NULL PRIMARY KEY,
    tabla          TEXT    NOT NULL,
    registro_id    TEXT    NOT NULL,
    accion         TEXT    NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
    datos_antes    TEXT    CHECK (datos_antes   IS NULL OR json_valid(datos_antes)),
    datos_despues  TEXT    CHECK (datos_despues IS NULL OR json_valid(datos_despues)),
    usuario_id     INTEGER NOT NULL REFERENCES usuario(id),
    registrado_en  INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;
CREATE INDEX ix_auditoria_registro ON auditoria (tabla, registro_id);


-- =====================================================================
-- 6. TRIGGERS DE PROTECCIÓN
--    Solo invariantes: la lógica de negocio está en la app.
-- =====================================================================

-- --- operacion ------------------------------------------------------

CREATE TRIGGER operacion_nace_vigente BEFORE INSERT ON operacion
WHEN NEW.estado <> 'VIGENTE'
BEGIN
    SELECT RAISE(ABORT, 'Una operación nueva debe estar VIGENTE');
END;

CREATE TRIGGER operacion_no_moneda_base BEFORE INSERT ON operacion
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

CREATE TRIGGER operacion_no_borrar BEFORE DELETE ON operacion
BEGIN
    SELECT RAISE(ABORT, 'Las operaciones no se eliminan: se anulan');
END;

CREATE TRIGGER operacion_anulada_inmutable BEFORE UPDATE ON operacion
WHEN OLD.estado = 'ANULADA'
BEGIN
    SELECT RAISE(ABORT, 'Una operación anulada no se puede modificar');
END;

-- Todas las columnas menos estado, anulada_*, motivo_anulacion y observacion.
-- Si se agrega una columna a operacion, agregarla aquí.
CREATE TRIGGER operacion_campos_inmutables BEFORE UPDATE OF
    id, caja_id, turno_id, usuario_id, cliente_id, tipo, moneda_codigo,
    monto_divisa, tasa_aplicada_e6, monto_base, tasa_referencia_e6,
    cotizacion_id, regla_spread_id, es_preferencial, autorizado_por,
    margen_bruto, margen_realizado, origen, lote_migracion_id, realizada_en
ON operacion
BEGIN
    SELECT RAISE(ABORT, 'Solo se puede anular una operación o editar su observación');
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

-- --- turno: cerrado no se toca; nunca se borra ---------------------

CREATE TRIGGER turno_no_borrar BEFORE DELETE ON turno
BEGIN
    SELECT RAISE(ABORT, 'Los turnos no se eliminan');
END;

CREATE TRIGGER turno_cerrado_inmutable BEFORE UPDATE ON turno
WHEN OLD.estado = 'CERRADO'
BEGIN
    SELECT RAISE(ABORT, 'Un turno cerrado no se puede modificar');
END;

-- --- tablas de solo inserción --------------------------------------

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
