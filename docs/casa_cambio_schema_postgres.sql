-- =====================================================================
--  Sistema de gestión para casas de cambio — Esquema multidivisa
--  Proyectos TICs 2 · PostgreSQL 14+
--
--  Monedas operadas: USD, EUR, BRL, ARS contra la moneda base (CLP).
--  Convención: COMPRA / VENTA se expresan SIEMPRE desde la perspectiva
--  de la casa de cambio.
--    COMPRA → la casa recibe divisa y entrega moneda base.
--    VENTA  → la casa entrega divisa y recibe moneda base.
--
--  Organización del script:
--    1. Tipos                 5. Funciones de operación (caja, turnos)
--    2. Catálogo y config.    6. Triggers
--    3. Precios y spread      7. Vistas de reporte
--    4. Operación y caja      8. Datos semilla (valores DE EJEMPLO)
-- =====================================================================

DROP SCHEMA IF EXISTS cambio CASCADE;
CREATE SCHEMA cambio;
SET search_path TO cambio, public;

-- =====================================================================
-- 1. TIPOS
-- =====================================================================
CREATE TYPE tipo_operacion   AS ENUM ('COMPRA', 'VENTA');
CREATE TYPE estado_operacion AS ENUM ('VIGENTE', 'ANULADA');
CREATE TYPE origen_registro  AS ENUM ('SISTEMA', 'MIGRACION');
CREATE TYPE tipo_margen      AS ENUM ('PORCENTAJE', 'MONTO_FIJO');
CREATE TYPE rol_usuario      AS ENUM ('ADMIN', 'SUPERVISOR', 'CAJERO');
CREATE TYPE estado_turno     AS ENUM ('ABIERTO', 'CERRADO');
CREATE TYPE tipo_movimiento  AS ENUM ('OPERACION', 'ANULACION', 'INGRESO', 'RETIRO', 'AJUSTE');
CREATE TYPE tipo_dato_param  AS ENUM ('ENTERO', 'DECIMAL', 'TEXTO', 'BOOLEANO');
CREATE TYPE tipo_documento   AS ENUM ('RUT', 'PASAPORTE', 'DNI', 'OTRO');

-- =====================================================================
-- 2. CATÁLOGO Y CONFIGURACIÓN (lo que hace al producto "configurable")
-- =====================================================================

-- Catálogo global de monedas (ISO 4217)
CREATE TABLE moneda (
    codigo     CHAR(3)     PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),
    nombre     VARCHAR(50) NOT NULL,
    simbolo    VARCHAR(5)  NOT NULL,
    decimales  SMALLINT    NOT NULL CHECK (decimales BETWEEN 0 AND 4)  -- decimales del monto
);

-- Cada cliente del software (una casa de cambio)
CREATE TABLE casa_cambio (
    id               SERIAL       PRIMARY KEY,
    rut              VARCHAR(12)  NOT NULL UNIQUE,
    razon_social     VARCHAR(150) NOT NULL,
    nombre_fantasia  VARCHAR(100),
    moneda_base      CHAR(3)      NOT NULL DEFAULT 'CLP' REFERENCES moneda(codigo),
    activa           BOOLEAN      NOT NULL DEFAULT TRUE,
    creada_en        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Monedas que cada casa opera y cómo las cotiza
CREATE TABLE casa_moneda (
    casa_id         INT           NOT NULL REFERENCES casa_cambio(id),
    moneda_codigo   CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    activa          BOOLEAN       NOT NULL DEFAULT TRUE,
    decimales_tasa  SMALLINT      NOT NULL DEFAULT 2 CHECK (decimales_tasa BETWEEN 0 AND 6),
    monto_minimo    NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (monto_minimo >= 0),
    orden_pizarra   SMALLINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (casa_id, moneda_codigo)
);

CREATE TABLE sucursal (
    id         SERIAL       PRIMARY KEY,
    casa_id    INT          NOT NULL REFERENCES casa_cambio(id),
    nombre     VARCHAR(100) NOT NULL,
    direccion  VARCHAR(200),
    comuna     VARCHAR(80),
    activa     BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (casa_id, nombre)
);

CREATE TABLE caja (
    id           SERIAL      PRIMARY KEY,
    sucursal_id  INT         NOT NULL REFERENCES sucursal(id),
    nombre       VARCHAR(50) NOT NULL,
    activa       BOOLEAN     NOT NULL DEFAULT TRUE,
    UNIQUE (sucursal_id, nombre)
);

CREATE TABLE usuario (
    id             SERIAL       PRIMARY KEY,
    casa_id        INT          NOT NULL REFERENCES casa_cambio(id),
    sucursal_id    INT          REFERENCES sucursal(id),       -- NULL = todas las sucursales
    rut            VARCHAR(12)  NOT NULL,
    nombre         VARCHAR(120) NOT NULL,
    email          VARCHAR(150) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    rol            rol_usuario  NOT NULL,
    activo         BOOLEAN      NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (casa_id, rut)
);

-- Parámetros del rubro (clave-valor tipado, uno por casa)
CREATE TABLE parametro (
    casa_id          INT             NOT NULL REFERENCES casa_cambio(id),
    clave            VARCHAR(60)     NOT NULL,
    valor            TEXT            NOT NULL,
    tipo_dato        tipo_dato_param NOT NULL,
    descripcion      TEXT,
    actualizado_por  INT             REFERENCES usuario(id),
    actualizado_en   TIMESTAMPTZ     NOT NULL DEFAULT now(),
    PRIMARY KEY (casa_id, clave)
);

-- =====================================================================
-- 3. PRECIOS: TASA DE REFERENCIA → REGLA DE SPREAD → COTIZACIÓN
-- =====================================================================

-- Valor de mercado ("medio") de 1 unidad de divisa en moneda base
CREATE TABLE tasa_referencia (
    id             BIGSERIAL     PRIMARY KEY,
    casa_id        INT           NOT NULL REFERENCES casa_cambio(id),
    moneda_codigo  CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    valor_base     NUMERIC(20,6) NOT NULL CHECK (valor_base > 0),
    fuente         VARCHAR(50)   NOT NULL DEFAULT 'MANUAL',   -- MANUAL, API, BANCO_CENTRAL...
    registrada_por INT           REFERENCES usuario(id),
    obtenida_en    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Regla de margen: cuánto se descuenta (compra) y se recarga (venta)
-- sobre la tasa de referencia. Admite tramos por monto y vigencia.
CREATE TABLE regla_spread (
    id             SERIAL        PRIMARY KEY,
    casa_id        INT           NOT NULL REFERENCES casa_cambio(id),
    sucursal_id    INT           REFERENCES sucursal(id),     -- NULL = regla general
    moneda_codigo  CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    tipo_margen    tipo_margen   NOT NULL DEFAULT 'PORCENTAJE',
    margen_compra  NUMERIC(12,6) NOT NULL CHECK (margen_compra >= 0),
    margen_venta   NUMERIC(12,6) NOT NULL CHECK (margen_venta  >= 0),
    monto_desde    NUMERIC(20,4) NOT NULL DEFAULT 0,          -- tramo en unidades de divisa
    monto_hasta    NUMERIC(20,4),                             -- NULL = sin tope
    vigente_desde  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    vigente_hasta  TIMESTAMPTZ,
    prioridad      SMALLINT      NOT NULL DEFAULT 0,
    activa         BOOLEAN       NOT NULL DEFAULT TRUE,
    creada_por     INT           REFERENCES usuario(id),
    CHECK (monto_hasta IS NULL OR monto_hasta > monto_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde),
    CHECK (tipo_margen <> 'PORCENTAJE' OR (margen_compra < 100))
);

-- Precio publicado en pizarra (historial completo; vigente_hasta NULL = actual)
CREATE TABLE cotizacion (
    id                  BIGSERIAL     PRIMARY KEY,
    casa_id             INT           NOT NULL REFERENCES casa_cambio(id),
    sucursal_id         INT           REFERENCES sucursal(id), -- NULL = todas
    moneda_codigo       CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    tasa_referencia_id  BIGINT        NOT NULL REFERENCES tasa_referencia(id),
    regla_spread_id     INT           NOT NULL REFERENCES regla_spread(id),
    precio_compra       NUMERIC(20,6) NOT NULL CHECK (precio_compra > 0),
    precio_venta        NUMERIC(20,6) NOT NULL,
    vigente_desde       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    vigente_hasta       TIMESTAMPTZ,
    publicada_por       INT           REFERENCES usuario(id),
    CHECK (precio_venta >= precio_compra)
);
CREATE UNIQUE INDEX ux_cotizacion_vigente
    ON cotizacion (casa_id, COALESCE(sucursal_id, 0), moneda_codigo)
    WHERE vigente_hasta IS NULL;

-- =====================================================================
-- 4. OPERACIÓN Y CAJA
-- =====================================================================

CREATE TABLE cliente (
    id                SERIAL         PRIMARY KEY,
    casa_id           INT            NOT NULL REFERENCES casa_cambio(id),
    tipo_documento    tipo_documento NOT NULL,
    numero_documento  VARCHAR(30)    NOT NULL,
    nombre            VARCHAR(150)   NOT NULL,
    nacionalidad      CHAR(2),                                -- ISO 3166-1 alfa-2
    telefono          VARCHAR(30),
    email             VARCHAR(150),
    creado_en         TIMESTAMPTZ    NOT NULL DEFAULT now(),
    UNIQUE (casa_id, tipo_documento, numero_documento)
);

CREATE TABLE turno (
    id           SERIAL       PRIMARY KEY,
    caja_id      INT          NOT NULL REFERENCES caja(id),
    usuario_id   INT          NOT NULL REFERENCES usuario(id),
    estado       estado_turno NOT NULL DEFAULT 'ABIERTO',
    abierto_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cerrado_en   TIMESTAMPTZ,
    cerrado_por  INT          REFERENCES usuario(id),
    observacion  TEXT,
    CHECK ((estado = 'ABIERTO' AND cerrado_en IS NULL) OR
           (estado = 'CERRADO' AND cerrado_en IS NOT NULL))
);
CREATE UNIQUE INDEX ux_turno_abierto ON turno (caja_id) WHERE estado = 'ABIERTO';

-- Saldo actual por caja y moneda (incluye la moneda base) + costo promedio
CREATE TABLE saldo_caja (
    caja_id         INT           NOT NULL REFERENCES caja(id),
    moneda_codigo   CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    saldo           NUMERIC(20,4) NOT NULL DEFAULT 0,
    costo_promedio  NUMERIC(20,6),          -- costo ponderado en moneda base (solo divisas)
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (caja_id, moneda_codigo)
);

-- Conteo físico al cerrar turno vs. saldo del sistema
CREATE TABLE arqueo (
    id              SERIAL        PRIMARY KEY,
    turno_id        INT           NOT NULL REFERENCES turno(id),
    moneda_codigo   CHAR(3)       NOT NULL REFERENCES moneda(codigo),
    saldo_sistema   NUMERIC(20,4) NOT NULL,
    saldo_contado   NUMERIC(20,4) NOT NULL,
    diferencia      NUMERIC(20,4) GENERATED ALWAYS AS (saldo_contado - saldo_sistema) STORED,
    registrado_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (turno_id, moneda_codigo)
);

-- Importación de historial (papel / Excel)
CREATE TABLE lote_migracion (
    id               SERIAL       PRIMARY KEY,
    casa_id          INT          NOT NULL REFERENCES casa_cambio(id),
    archivo_origen   VARCHAR(255) NOT NULL,
    filas_leidas     INT          NOT NULL DEFAULT 0,
    filas_importadas INT          NOT NULL DEFAULT 0,
    filas_rechazadas INT          NOT NULL DEFAULT 0,
    importado_por    INT          NOT NULL REFERENCES usuario(id),
    importado_en     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    observaciones    TEXT
);

CREATE TABLE operacion (
    id                 BIGSERIAL        PRIMARY KEY,
    caja_id            INT              NOT NULL REFERENCES caja(id),
    turno_id           INT              REFERENCES turno(id),
    usuario_id         INT              NOT NULL REFERENCES usuario(id),
    cliente_id         INT              REFERENCES cliente(id),
    tipo               tipo_operacion   NOT NULL,
    moneda_codigo      CHAR(3)          NOT NULL REFERENCES moneda(codigo),
    monto_divisa       NUMERIC(20,4)    NOT NULL CHECK (monto_divisa > 0),
    tasa_aplicada      NUMERIC(20,6)    NOT NULL CHECK (tasa_aplicada > 0),
    monto_base         NUMERIC(20,4)    NOT NULL,             -- monto en moneda base (CLP)
    tasa_referencia    NUMERIC(20,6),                         -- snapshot al momento de operar
    cotizacion_id      BIGINT           REFERENCES cotizacion(id),
    regla_spread_id    INT              REFERENCES regla_spread(id),
    es_preferencial    BOOLEAN          NOT NULL DEFAULT FALSE,
    autorizado_por     INT              REFERENCES usuario(id),
    margen_bruto       NUMERIC(20,4),   -- vs. tasa de referencia
    margen_realizado   NUMERIC(20,4),   -- solo ventas: vs. costo promedio del stock
    estado             estado_operacion NOT NULL DEFAULT 'VIGENTE',
    anulada_por        INT              REFERENCES usuario(id),
    anulada_en         TIMESTAMPTZ,
    motivo_anulacion   TEXT,
    origen             origen_registro  NOT NULL DEFAULT 'SISTEMA',
    lote_migracion_id  INT              REFERENCES lote_migracion(id),
    realizada_en       TIMESTAMPTZ      NOT NULL DEFAULT now(),
    observacion        TEXT,
    CHECK ((estado = 'VIGENTE' AND anulada_en IS NULL) OR
           (estado = 'ANULADA' AND anulada_en IS NOT NULL
                               AND anulada_por IS NOT NULL
                               AND motivo_anulacion IS NOT NULL)),
    CHECK ((origen = 'SISTEMA'   AND turno_id IS NOT NULL) OR
           (origen = 'MIGRACION' AND lote_migracion_id IS NOT NULL)),
    CHECK (NOT es_preferencial OR autorizado_por IS NOT NULL)
);
CREATE INDEX ix_operacion_caja_fecha   ON operacion (caja_id, realizada_en);
CREATE INDEX ix_operacion_moneda_fecha ON operacion (moneda_codigo, realizada_en);
CREATE INDEX ix_operacion_cliente      ON operacion (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX ix_operacion_turno        ON operacion (turno_id);

-- Libro de movimientos de caja (cada entrada/salida de dinero)
CREATE TABLE movimiento_caja (
    id             BIGSERIAL       PRIMARY KEY,
    caja_id        INT             NOT NULL REFERENCES caja(id),
    turno_id       INT             REFERENCES turno(id),
    moneda_codigo  CHAR(3)         NOT NULL REFERENCES moneda(codigo),
    tipo           tipo_movimiento NOT NULL,
    monto          NUMERIC(20,4)   NOT NULL CHECK (monto <> 0),  -- + entra, − sale
    saldo_post     NUMERIC(20,4)   NOT NULL,
    operacion_id   BIGINT          REFERENCES operacion(id),
    usuario_id     INT             NOT NULL REFERENCES usuario(id),
    descripcion    TEXT,
    creado_en      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX ix_movimiento_caja ON movimiento_caja (caja_id, moneda_codigo, creado_en);

CREATE TABLE auditoria (
    id             BIGSERIAL   PRIMARY KEY,
    tabla          VARCHAR(60) NOT NULL,
    accion         VARCHAR(10) NOT NULL,
    datos_antes    JSONB,
    datos_despues  JSONB,
    usuario_id     INT,         -- tomado de SET app.usuario_id en la sesión
    registrado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 5. FUNCIONES DE NEGOCIO
-- =====================================================================

CREATE FUNCTION fn_parametro(p_casa INT, p_clave TEXT, p_defecto TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT valor FROM parametro
                      WHERE casa_id = p_casa AND clave = p_clave), p_defecto);
$$;

-- Regla aplicable: la de sucursal gana a la general; luego prioridad; luego tramo más alto
CREATE FUNCTION fn_regla_vigente(p_casa INT, p_sucursal INT, p_moneda CHAR(3),
                                 p_monto NUMERIC DEFAULT 0,
                                 p_momento TIMESTAMPTZ DEFAULT now())
RETURNS regla_spread LANGUAGE sql STABLE AS $$
    SELECT r.* FROM regla_spread r
     WHERE r.casa_id = p_casa AND r.moneda_codigo = p_moneda AND r.activa
       AND (r.sucursal_id IS NULL OR r.sucursal_id = p_sucursal)
       AND p_momento >= r.vigente_desde
       AND (r.vigente_hasta IS NULL OR p_momento < r.vigente_hasta)
       AND p_monto >= r.monto_desde
       AND (r.monto_hasta IS NULL OR p_monto < r.monto_hasta)
     ORDER BY (r.sucursal_id IS NULL), r.prioridad DESC, r.monto_desde DESC
     LIMIT 1;
$$;

-- REGLA DE CÁLCULO DE PRECIOS
--   PORCENTAJE : compra = ref × (1 − mc/100)   venta = ref × (1 + mv/100)
--   MONTO_FIJO : compra = ref − mc             venta = ref + mv
--   Redondeo a favor de la casa: compra hacia abajo, venta hacia arriba.
CREATE FUNCTION fn_calcular_precios(p_regla_id INT, p_valor_ref NUMERIC, p_decimales INT DEFAULT 2,
                                    OUT precio_compra NUMERIC, OUT precio_venta NUMERIC)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    r regla_spread;
    f NUMERIC := power(10::NUMERIC, p_decimales);
BEGIN
    SELECT * INTO r FROM regla_spread WHERE id = p_regla_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La regla de spread % no existe', p_regla_id;
    END IF;

    IF r.tipo_margen = 'PORCENTAJE' THEN
        precio_compra := p_valor_ref * (1 - r.margen_compra / 100);
        precio_venta  := p_valor_ref * (1 + r.margen_venta  / 100);
    ELSE
        precio_compra := p_valor_ref - r.margen_compra;
        precio_venta  := p_valor_ref + r.margen_venta;
    END IF;

    precio_compra := floor(precio_compra * f) / f;
    precio_venta  := ceil (precio_venta  * f) / f;

    IF precio_compra <= 0 THEN
        RAISE EXCEPTION 'La regla % genera un precio de compra no positivo', p_regla_id;
    END IF;
END $$;

CREATE FUNCTION fn_cotizacion_vigente(p_casa INT, p_sucursal INT, p_moneda CHAR(3))
RETURNS cotizacion LANGUAGE sql STABLE AS $$
    SELECT c.* FROM cotizacion c
     WHERE c.casa_id = p_casa AND c.moneda_codigo = p_moneda
       AND c.vigente_hasta IS NULL
       AND (c.sucursal_id IS NULL OR c.sucursal_id = p_sucursal)
     ORDER BY (c.sucursal_id IS NULL)
     LIMIT 1;
$$;

-- Registra una tasa de referencia y publica la nueva pizarra para esa moneda
CREATE FUNCTION fn_publicar_cotizacion(p_casa INT, p_sucursal INT, p_moneda CHAR(3),
                                       p_valor_ref NUMERIC, p_usuario INT,
                                       p_fuente VARCHAR DEFAULT 'MANUAL')
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    v_tasa_id   BIGINT;
    v_regla     regla_spread;
    v_dec       SMALLINT;
    v_compra    NUMERIC;
    v_venta     NUMERIC;
    v_id        BIGINT;
BEGIN
    SELECT decimales_tasa INTO v_dec FROM casa_moneda
     WHERE casa_id = p_casa AND moneda_codigo = p_moneda AND activa;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La moneda % no está habilitada para la casa %', p_moneda, p_casa;
    END IF;

    v_regla := fn_regla_vigente(p_casa, p_sucursal, p_moneda, 0);
    IF v_regla.id IS NULL THEN
        RAISE EXCEPTION 'No hay regla de spread vigente para % (tramo base)', p_moneda;
    END IF;

    INSERT INTO tasa_referencia (casa_id, moneda_codigo, valor_base, fuente, registrada_por)
    VALUES (p_casa, p_moneda, p_valor_ref, p_fuente, p_usuario)
    RETURNING id INTO v_tasa_id;

    SELECT * INTO v_compra, v_venta FROM fn_calcular_precios(v_regla.id, p_valor_ref, v_dec);

    UPDATE cotizacion SET vigente_hasta = now()
     WHERE casa_id = p_casa AND moneda_codigo = p_moneda
       AND sucursal_id IS NOT DISTINCT FROM p_sucursal
       AND vigente_hasta IS NULL;

    INSERT INTO cotizacion (casa_id, sucursal_id, moneda_codigo, tasa_referencia_id,
                            regla_spread_id, precio_compra, precio_venta, publicada_por)
    VALUES (p_casa, p_sucursal, p_moneda, v_tasa_id, v_regla.id, v_compra, v_venta, p_usuario)
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Aplica un movimiento a la caja, valida stock y actualiza el costo promedio.
--   p_costo_unit: con monto > 0 incorpora un lote a ese costo;
--                 con monto < 0 retira un lote a ese costo (reversa de compra);
--                 NULL deja el costo promedio igual.
CREATE FUNCTION fn_aplicar_movimiento(p_caja INT, p_turno INT, p_moneda CHAR(3),
                                      p_tipo tipo_movimiento, p_monto NUMERIC,
                                      p_costo_unit NUMERIC, p_operacion BIGINT,
                                      p_usuario INT, p_descripcion TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_saldo     NUMERIC;
    v_costo     NUMERIC;
    v_casa      INT;
    v_permitir  BOOLEAN;
BEGIN
    INSERT INTO saldo_caja (caja_id, moneda_codigo) VALUES (p_caja, p_moneda)
    ON CONFLICT DO NOTHING;

    SELECT saldo, costo_promedio INTO v_saldo, v_costo
      FROM saldo_caja WHERE caja_id = p_caja AND moneda_codigo = p_moneda
       FOR UPDATE;

    SELECT s.casa_id INTO v_casa
      FROM caja c JOIN sucursal s ON s.id = c.sucursal_id WHERE c.id = p_caja;
    v_permitir := fn_parametro(v_casa, 'permitir_saldo_negativo', 'false')::BOOLEAN;

    IF v_saldo + p_monto < 0 AND NOT v_permitir THEN
        RAISE EXCEPTION 'Saldo insuficiente de % en caja %: disponible %, requerido %',
                        p_moneda, p_caja, v_saldo, -p_monto;
    END IF;

    IF p_costo_unit IS NOT NULL THEN
        IF p_monto > 0 THEN
            v_costo := (GREATEST(v_saldo, 0) * COALESCE(v_costo, 0) + p_monto * p_costo_unit)
                       / (GREATEST(v_saldo, 0) + p_monto);
        ELSIF v_saldo + p_monto > 0 THEN
            v_costo := (v_saldo * v_costo + p_monto * p_costo_unit) / (v_saldo + p_monto);
        END IF;
    END IF;

    UPDATE saldo_caja
       SET saldo = saldo + p_monto, costo_promedio = v_costo, actualizado_en = now()
     WHERE caja_id = p_caja AND moneda_codigo = p_moneda;

    INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post,
                                 operacion_id, usuario_id, descripcion)
    VALUES (p_caja, p_turno, p_moneda, p_tipo, p_monto, v_saldo + p_monto,
            p_operacion, p_usuario, p_descripcion);
END $$;

CREATE FUNCTION fn_abrir_turno(p_caja INT, p_usuario INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_id INT;
BEGIN
    INSERT INTO turno (caja_id, usuario_id) VALUES (p_caja, p_usuario) RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'La caja % ya tiene un turno abierto', p_caja;
END $$;

-- p_conteo: {"CLP": 1500000, "USD": 820, ...}  (monedas no informadas se cuentan como 0)
CREATE FUNCTION fn_cerrar_turno(p_turno INT, p_usuario INT, p_conteo JSONB)
RETURNS TABLE (moneda CHAR(3), saldo_sistema NUMERIC, saldo_contado NUMERIC, diferencia NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE v_turno turno;
BEGIN
    SELECT * INTO v_turno FROM turno WHERE id = p_turno FOR UPDATE;
    IF NOT FOUND OR v_turno.estado <> 'ABIERTO' THEN
        RAISE EXCEPTION 'El turno % no existe o ya está cerrado', p_turno;
    END IF;

    INSERT INTO arqueo (turno_id, moneda_codigo, saldo_sistema, saldo_contado)
    SELECT p_turno, m.codigo, COALESCE(s.saldo, 0), COALESCE((p_conteo ->> m.codigo)::NUMERIC, 0)
      FROM moneda m
      LEFT JOIN saldo_caja s ON s.caja_id = v_turno.caja_id AND s.moneda_codigo = m.codigo
     WHERE s.saldo IS NOT NULL OR p_conteo ? m.codigo;

    UPDATE turno SET estado = 'CERRADO', cerrado_en = now(), cerrado_por = p_usuario
     WHERE id = p_turno;

    RETURN QUERY
        SELECT a.moneda_codigo, a.saldo_sistema, a.saldo_contado, a.diferencia
          FROM arqueo a WHERE a.turno_id = p_turno ORDER BY a.moneda_codigo;
END $$;

-- Anulación: no se borra nada; se marca y se generan movimientos inversos
CREATE FUNCTION fn_anular_operacion(p_operacion BIGINT, p_usuario INT, p_motivo TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    o       operacion;
    v_casa  INT;
    v_base  CHAR(3);
    v_rol   rol_usuario;
BEGIN
    SELECT * INTO o FROM operacion WHERE id = p_operacion FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La operación % no existe', p_operacion; END IF;
    IF o.estado = 'ANULADA' THEN RAISE EXCEPTION 'La operación % ya está anulada', p_operacion; END IF;
    IF COALESCE(trim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Debe indicar motivo de anulación'; END IF;

    SELECT s.casa_id, cc.moneda_base INTO v_casa, v_base
      FROM caja c JOIN sucursal s ON s.id = c.sucursal_id
      JOIN casa_cambio cc ON cc.id = s.casa_id WHERE c.id = o.caja_id;

    SELECT rol INTO v_rol FROM usuario WHERE id = p_usuario AND activo;
    IF fn_parametro(v_casa, 'anulacion_requiere_supervisor', 'true')::BOOLEAN
       AND (v_rol IS NULL OR v_rol = 'CAJERO') THEN
        RAISE EXCEPTION 'La anulación requiere rol SUPERVISOR o ADMIN';
    END IF;

    IF o.origen = 'SISTEMA' AND
       NOT EXISTS (SELECT 1 FROM turno WHERE id = o.turno_id AND estado = 'ABIERTO') THEN
        RAISE EXCEPTION 'Solo se pueden anular operaciones de un turno abierto';
    END IF;

    UPDATE operacion
       SET estado = 'ANULADA', anulada_por = p_usuario, anulada_en = now(), motivo_anulacion = p_motivo
     WHERE id = p_operacion;

    IF o.origen = 'SISTEMA' THEN
        IF o.tipo = 'COMPRA' THEN
            PERFORM fn_aplicar_movimiento(o.caja_id, o.turno_id, o.moneda_codigo, 'ANULACION',
                    -o.monto_divisa, o.tasa_aplicada, o.id, p_usuario, 'Anulación de compra');
            PERFORM fn_aplicar_movimiento(o.caja_id, o.turno_id, v_base, 'ANULACION',
                     o.monto_base, NULL, o.id, p_usuario, 'Anulación de compra');
        ELSE
            PERFORM fn_aplicar_movimiento(o.caja_id, o.turno_id, o.moneda_codigo, 'ANULACION',
                     o.monto_divisa, NULL, o.id, p_usuario, 'Anulación de venta');
            PERFORM fn_aplicar_movimiento(o.caja_id, o.turno_id, v_base, 'ANULACION',
                    -o.monto_base, NULL, o.id, p_usuario, 'Anulación de venta');
        END IF;
    END IF;
END $$;

-- =====================================================================
-- 6. TRIGGERS
-- =====================================================================

-- Antes de insertar: valida reglas de negocio y calcula tasa, montos y márgenes
CREATE FUNCTION tg_operacion_preparar() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_casa      INT;
    v_sucursal  INT;
    v_base      CHAR(3);
    v_dec_base  SMALLINT;
    v_cm        casa_moneda;
    v_turno     turno;
    v_cot       cotizacion;
    v_regla     regla_spread;
    v_compra    NUMERIC;
    v_venta     NUMERIC;
    v_esperada  NUMERIC;
    v_rol       rol_usuario;
    v_costo     NUMERIC;
    v_umbral    NUMERIC;
    v_vig_min   INT;
BEGIN
    SELECT s.casa_id, s.id, cc.moneda_base INTO v_casa, v_sucursal, v_base
      FROM caja c JOIN sucursal s ON s.id = c.sucursal_id
      JOIN casa_cambio cc ON cc.id = s.casa_id
     WHERE c.id = NEW.caja_id;
    SELECT decimales INTO v_dec_base FROM moneda WHERE codigo = v_base;

    IF NEW.moneda_codigo = v_base THEN
        RAISE EXCEPTION 'No se puede comprar/vender la moneda base (%)', v_base;
    END IF;

    SELECT * INTO v_cm FROM casa_moneda WHERE casa_id = v_casa AND moneda_codigo = NEW.moneda_codigo;
    IF NOT FOUND OR NOT v_cm.activa THEN
        RAISE EXCEPTION 'La moneda % no está habilitada en esta casa de cambio', NEW.moneda_codigo;
    END IF;

    NEW.estado := 'VIGENTE';
    NEW.anulada_en := NULL; NEW.anulada_por := NULL; NEW.motivo_anulacion := NULL;

    IF NEW.origen = 'SISTEMA' THEN
        IF NEW.monto_divisa < v_cm.monto_minimo THEN
            RAISE EXCEPTION 'Monto bajo el mínimo permitido para % (%)', NEW.moneda_codigo, v_cm.monto_minimo;
        END IF;

        SELECT * INTO v_turno FROM turno WHERE id = NEW.turno_id;
        IF NOT FOUND OR v_turno.estado <> 'ABIERTO' OR v_turno.caja_id <> NEW.caja_id THEN
            RAISE EXCEPTION 'La operación requiere un turno abierto en la caja %', NEW.caja_id;
        END IF;
        NEW.realizada_en := now();

        -- Cotización vigente y no vencida
        v_cot := fn_cotizacion_vigente(v_casa, v_sucursal, NEW.moneda_codigo);
        IF v_cot.id IS NULL THEN
            RAISE EXCEPTION 'No hay cotización vigente para %', NEW.moneda_codigo;
        END IF;
        v_vig_min := fn_parametro(v_casa, 'vigencia_cotizacion_minutos', '1440')::INT;
        IF now() - v_cot.vigente_desde > make_interval(mins => v_vig_min) THEN
            RAISE EXCEPTION 'La cotización de % está vencida (más de % min); publique una nueva',
                            NEW.moneda_codigo, v_vig_min;
        END IF;
        NEW.cotizacion_id := v_cot.id;
        SELECT valor_base INTO NEW.tasa_referencia FROM tasa_referencia WHERE id = v_cot.tasa_referencia_id;

        -- Precio según el tramo del monto
        v_regla := fn_regla_vigente(v_casa, v_sucursal, NEW.moneda_codigo, NEW.monto_divisa);
        IF v_regla.id IS NULL THEN
            RAISE EXCEPTION 'No hay regla de spread para % y monto %', NEW.moneda_codigo, NEW.monto_divisa;
        END IF;
        NEW.regla_spread_id := v_regla.id;
        SELECT * INTO v_compra, v_venta
          FROM fn_calcular_precios(v_regla.id, NEW.tasa_referencia, v_cm.decimales_tasa);
        v_esperada := CASE NEW.tipo WHEN 'COMPRA' THEN v_compra ELSE v_venta END;

        IF NEW.tasa_aplicada IS NULL OR NEW.tasa_aplicada = v_esperada THEN
            NEW.tasa_aplicada   := v_esperada;
            NEW.es_preferencial := FALSE;
            NEW.autorizado_por  := NULL;
        ELSE
            NEW.es_preferencial := TRUE;
            SELECT rol INTO v_rol FROM usuario WHERE id = NEW.autorizado_por AND activo;
            IF v_rol IS NULL OR v_rol = 'CAJERO' THEN
                RAISE EXCEPTION 'Tasa % distinta a la de pizarra (%): requiere autorización de SUPERVISOR o ADMIN',
                                NEW.tasa_aplicada, v_esperada;
            END IF;
        END IF;

        -- Margen realizado (ventas): contra costo promedio del stock de la caja
        IF NEW.tipo = 'VENTA' THEN
            SELECT costo_promedio INTO v_costo FROM saldo_caja
             WHERE caja_id = NEW.caja_id AND moneda_codigo = NEW.moneda_codigo FOR UPDATE;
        END IF;
    ELSE
        -- Datos históricos importados: se respetan la fecha y la tasa del registro original
        IF NEW.realizada_en IS NULL OR NEW.tasa_aplicada IS NULL THEN
            RAISE EXCEPTION 'Una operación migrada requiere fecha y tasa aplicada';
        END IF;
    END IF;

    NEW.monto_base := round(NEW.monto_divisa * NEW.tasa_aplicada, v_dec_base);

    IF NEW.tasa_referencia IS NOT NULL THEN
        NEW.margen_bruto := round(NEW.monto_divisa *
            CASE NEW.tipo WHEN 'VENTA' THEN NEW.tasa_aplicada - NEW.tasa_referencia
                          ELSE NEW.tasa_referencia - NEW.tasa_aplicada END, v_dec_base);
    END IF;
    IF v_costo IS NOT NULL THEN
        NEW.margen_realizado := round((NEW.tasa_aplicada - v_costo) * NEW.monto_divisa, v_dec_base);
    END IF;

    -- Identificación obligatoria del cliente sobre el umbral configurado
    v_umbral := fn_parametro(v_casa, 'umbral_identificacion_cliente')::NUMERIC;
    IF NEW.origen = 'SISTEMA' AND v_umbral IS NOT NULL
       AND NEW.monto_base >= v_umbral AND NEW.cliente_id IS NULL THEN
        RAISE EXCEPTION 'Operaciones desde % % requieren identificar al cliente', v_umbral, v_base;
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER operacion_preparar BEFORE INSERT ON operacion
    FOR EACH ROW EXECUTE FUNCTION tg_operacion_preparar();

-- Después de insertar: mueve el dinero en la caja (solo operaciones del sistema)
CREATE FUNCTION tg_operacion_aplicar() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_base CHAR(3);
BEGIN
    IF NEW.origen <> 'SISTEMA' THEN RETURN NULL; END IF;

    SELECT cc.moneda_base INTO v_base
      FROM caja c JOIN sucursal s ON s.id = c.sucursal_id
      JOIN casa_cambio cc ON cc.id = s.casa_id WHERE c.id = NEW.caja_id;

    IF NEW.tipo = 'COMPRA' THEN
        PERFORM fn_aplicar_movimiento(NEW.caja_id, NEW.turno_id, NEW.moneda_codigo, 'OPERACION',
                 NEW.monto_divisa, NEW.tasa_aplicada, NEW.id, NEW.usuario_id, 'Compra de divisa');
        PERFORM fn_aplicar_movimiento(NEW.caja_id, NEW.turno_id, v_base, 'OPERACION',
                -NEW.monto_base, NULL, NEW.id, NEW.usuario_id, 'Pago por compra de divisa');
    ELSE
        PERFORM fn_aplicar_movimiento(NEW.caja_id, NEW.turno_id, NEW.moneda_codigo, 'OPERACION',
                -NEW.monto_divisa, NULL, NEW.id, NEW.usuario_id, 'Venta de divisa');
        PERFORM fn_aplicar_movimiento(NEW.caja_id, NEW.turno_id, v_base, 'OPERACION',
                 NEW.monto_base, NULL, NEW.id, NEW.usuario_id, 'Cobro por venta de divisa');
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER operacion_aplicar AFTER INSERT ON operacion
    FOR EACH ROW EXECUTE FUNCTION tg_operacion_aplicar();

-- Las operaciones son inmutables: solo se permite anularlas
CREATE FUNCTION tg_operacion_inmutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Las operaciones no se eliminan; use fn_anular_operacion()';
    END IF;
    IF OLD.estado = 'ANULADA' THEN
        RAISE EXCEPTION 'Una operación anulada no se puede modificar';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['estado','anulada_por','anulada_en','motivo_anulacion','observacion'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['estado','anulada_por','anulada_en','motivo_anulacion','observacion']) THEN
        RAISE EXCEPTION 'Solo se puede anular una operación u editar su observación';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER operacion_inmutable BEFORE UPDATE OR DELETE ON operacion
    FOR EACH ROW EXECUTE FUNCTION tg_operacion_inmutable();

-- Movimientos de caja: libro de solo inserción
CREATE FUNCTION tg_solo_insercion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es de solo inserción', TG_TABLE_NAME;
END $$;

CREATE TRIGGER movimiento_solo_insercion BEFORE UPDATE OR DELETE ON movimiento_caja
    FOR EACH ROW EXECUTE FUNCTION tg_solo_insercion();

-- Auditoría genérica (el backend hace: SET app.usuario_id = '<id>' por transacción)
CREATE FUNCTION tg_auditoria() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO auditoria (tabla, accion, datos_antes, datos_despues, usuario_id)
    VALUES (TG_TABLE_NAME, TG_OP,
            CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
            CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END,
            NULLIF(current_setting('app.usuario_id', TRUE), '')::INT);
    RETURN NULL;
END $$;

CREATE TRIGGER aud_parametro    AFTER INSERT OR UPDATE OR DELETE ON parametro
    FOR EACH ROW EXECUTE FUNCTION tg_auditoria();
CREATE TRIGGER aud_regla_spread AFTER INSERT OR UPDATE OR DELETE ON regla_spread
    FOR EACH ROW EXECUTE FUNCTION tg_auditoria();
CREATE TRIGGER aud_casa_moneda  AFTER INSERT OR UPDATE OR DELETE ON casa_moneda
    FOR EACH ROW EXECUTE FUNCTION tg_auditoria();
CREATE TRIGGER aud_usuario      AFTER INSERT OR UPDATE OR DELETE ON usuario
    FOR EACH ROW EXECUTE FUNCTION tg_auditoria();
CREATE TRIGGER aud_operacion    AFTER UPDATE ON operacion
    FOR EACH ROW EXECUTE FUNCTION tg_auditoria();

-- =====================================================================
-- 7. VISTAS
-- =====================================================================

-- Pizarra actual con spread
CREATE VIEW v_pizarra AS
SELECT c.casa_id, c.sucursal_id, c.moneda_codigo, m.nombre AS moneda, m.simbolo,
       c.precio_compra, c.precio_venta, t.valor_base AS tasa_referencia,
       c.precio_venta - c.precio_compra AS spread,
       round((c.precio_venta - c.precio_compra) / t.valor_base * 100, 3) AS spread_pct,
       c.vigente_desde, cm.orden_pizarra
  FROM cotizacion c
  JOIN tasa_referencia t ON t.id = c.tasa_referencia_id
  JOIN moneda m          ON m.codigo = c.moneda_codigo
  JOIN casa_moneda cm    ON cm.casa_id = c.casa_id AND cm.moneda_codigo = c.moneda_codigo
 WHERE c.vigente_hasta IS NULL;

-- Resumen diario por sucursal y moneda (operaciones vigentes)
CREATE VIEW v_resumen_diario AS
SELECT s.casa_id, s.id AS sucursal_id, s.nombre AS sucursal,
       (o.realizada_en AT TIME ZONE fn_parametro(s.casa_id, 'zona_horaria', 'America/Santiago'))::DATE AS fecha,
       o.moneda_codigo,
       count(*) FILTER (WHERE o.tipo = 'COMPRA')               AS n_compras,
       COALESCE(sum(o.monto_divisa) FILTER (WHERE o.tipo = 'COMPRA'), 0) AS divisa_comprada,
       COALESCE(sum(o.monto_base)   FILTER (WHERE o.tipo = 'COMPRA'), 0) AS base_pagada,
       count(*) FILTER (WHERE o.tipo = 'VENTA')                AS n_ventas,
       COALESCE(sum(o.monto_divisa) FILTER (WHERE o.tipo = 'VENTA'), 0)  AS divisa_vendida,
       COALESCE(sum(o.monto_base)   FILTER (WHERE o.tipo = 'VENTA'), 0)  AS base_cobrada,
       COALESCE(sum(o.margen_bruto), 0)                        AS margen_bruto,
       COALESCE(sum(o.margen_realizado), 0)                    AS margen_realizado
  FROM operacion o
  JOIN caja c     ON c.id = o.caja_id
  JOIN sucursal s ON s.id = c.sucursal_id
 WHERE o.estado = 'VIGENTE'
 GROUP BY s.casa_id, s.id, s.nombre, 4, o.moneda_codigo;

-- Posición de caja valorizada (a costo y a la última tasa de referencia)
CREATE VIEW v_posicion_caja AS
SELECT s.casa_id, c.sucursal_id, sc.caja_id, c.nombre AS caja, sc.moneda_codigo,
       sc.saldo, sc.costo_promedio,
       round(sc.saldo * sc.costo_promedio, 0)                     AS valor_a_costo,
       tr.valor_base                                              AS tasa_referencia,
       round(sc.saldo * tr.valor_base, 0)                         AS valor_a_mercado,
       round(sc.saldo * (tr.valor_base - sc.costo_promedio), 0)   AS resultado_no_realizado
  FROM saldo_caja sc
  JOIN caja c     ON c.id = sc.caja_id
  JOIN sucursal s ON s.id = c.sucursal_id
  LEFT JOIN LATERAL (
        SELECT t.valor_base FROM tasa_referencia t
         WHERE t.casa_id = s.casa_id AND t.moneda_codigo = sc.moneda_codigo
         ORDER BY t.obtenida_en DESC, t.id DESC LIMIT 1) tr ON TRUE;

-- =====================================================================
-- 8. DATOS SEMILLA
--    Todas las cifras (márgenes, tasas, umbrales) son de EJEMPLO y
--    deben reemplazarse por las validadas con el mandante (OE1).
-- =====================================================================

INSERT INTO moneda (codigo, nombre, simbolo, decimales) VALUES
    ('CLP', 'Peso chileno',          '$',   0),
    ('USD', 'Dólar estadounidense',  'US$', 2),
    ('EUR', 'Euro',                  '€',   2),
    ('BRL', 'Real brasileño',        'R$',  2),
    ('ARS', 'Peso argentino',        'AR$', 2);

INSERT INTO casa_cambio (rut, razon_social, nombre_fantasia)
VALUES ('76123456-7', 'Casa de Cambio Demo SpA', 'Cambios Demo');

INSERT INTO casa_moneda (casa_id, moneda_codigo, decimales_tasa, monto_minimo, orden_pizarra) VALUES
    (1, 'USD', 2,   1, 1),
    (1, 'EUR', 2,   5, 2),
    (1, 'BRL', 2,  10, 3),
    (1, 'ARS', 4, 1000, 4);   -- el ARS cotiza bajo 1 CLP: necesita más decimales

INSERT INTO sucursal (casa_id, nombre, direccion, comuna)
VALUES (1, 'Casa Matriz', 'Dirección de ejemplo 123', 'Santiago');

INSERT INTO caja (sucursal_id, nombre) VALUES (1, 'Caja 1'), (1, 'Caja 2');

-- Hashes de ejemplo: el backend debe generar los reales (bcrypt / argon2)
INSERT INTO usuario (casa_id, rut, nombre, email, password_hash, rol) VALUES
    (1, '11111111-1', 'Administrador', 'admin@demo.cl',      'CAMBIAR', 'ADMIN'),
    (1, '22222222-2', 'Supervisor',    'supervisor@demo.cl', 'CAMBIAR', 'SUPERVISOR'),
    (1, '33333333-3', 'Cajero',        'cajero@demo.cl',     'CAMBIAR', 'CAJERO');

INSERT INTO parametro (casa_id, clave, valor, tipo_dato, descripcion) VALUES
    (1, 'zona_horaria',                  'America/Santiago', 'TEXTO',    'Zona horaria para cortes diarios'),
    (1, 'umbral_identificacion_cliente', '1000000',          'DECIMAL',  'Monto en moneda base desde el cual se exige identificar al cliente (validar con normativa vigente)'),
    (1, 'permitir_saldo_negativo',       'false',            'BOOLEANO', 'Si es false, no se puede vender divisa sin stock en caja'),
    (1, 'vigencia_cotizacion_minutos',   '720',              'ENTERO',   'Minutos que una pizarra es válida antes de exigir republicarla'),
    (1, 'anulacion_requiere_supervisor', 'true',             'BOOLEANO', 'Si las anulaciones requieren rol SUPERVISOR o ADMIN');

INSERT INTO regla_spread (casa_id, moneda_codigo, tipo_margen, margen_compra, margen_venta, monto_desde, monto_hasta) VALUES
    (1, 'USD', 'PORCENTAJE', 1.5, 1.5,    0, 5000),
    (1, 'USD', 'PORCENTAJE', 1.0, 1.0, 5000, NULL),   -- tramo mayorista
    (1, 'EUR', 'PORCENTAJE', 2.0, 2.0,    0, NULL),
    (1, 'BRL', 'PORCENTAJE', 3.0, 3.0,    0, NULL),
    (1, 'ARS', 'PORCENTAJE', 5.0, 5.0,    0, NULL);   -- mayor volatilidad → mayor spread

-- Tasas de referencia de EJEMPLO (no son valores de mercado reales)
SELECT fn_publicar_cotizacion(1, NULL, 'USD', 940.00, 1);
SELECT fn_publicar_cotizacion(1, NULL, 'EUR', 1020.00, 1);
SELECT fn_publicar_cotizacion(1, NULL, 'BRL', 170.00, 1);
SELECT fn_publicar_cotizacion(1, NULL, 'ARS', 0.75, 1);
