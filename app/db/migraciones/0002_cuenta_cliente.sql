-- =====================================================================
-- 0002: cuentas de clientes para el portal (solo lectura de lo propio).
--
-- Un cliente se registra solo con su RUT, pero no ve nada hasta que un
-- cajero verifica su carnet en el local y enlaza la cuenta con su ficha
-- (cliente). Si bastara con escribir un RUT, cualquiera podría ver las
-- operaciones de otra persona.
--
--   PENDIENTE ──verificar (cajero, enlaza cliente)──▶ VERIFICADA
--       └──────rechazar (cajero, con motivo)────────▶ RECHAZADA
--
-- El correo y la contraseña viven en Better Auth ("user", "account").
-- =====================================================================

CREATE TABLE cuenta_cliente (
    id              INTEGER NOT NULL PRIMARY KEY,
    -- Si se borra la cuenta de Better Auth, se borra esta fila
    auth_user_id    TEXT    NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    -- RUT declarado al registrarse, sin puntos y con guion: 12345678-5
    rut             TEXT    NOT NULL CHECK (rut GLOB '[1-9]*-[0-9K]' AND rut NOT GLOB '*[^0-9K-]*'),
    nombre          TEXT    NOT NULL CHECK (trim(nombre) <> ''),
    estado          TEXT    NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'VERIFICADA', 'RECHAZADA')),
    -- Ficha del cliente, enlazada al verificar
    cliente_id      INTEGER REFERENCES cliente(id),
    revisada_por    INTEGER REFERENCES usuario(id),
    revisada_en     INTEGER,
    motivo_rechazo  TEXT,
    creada_en       INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    -- Cada estado trae exactamente sus datos
    CHECK ((estado = 'PENDIENTE') = (revisada_por IS NULL AND revisada_en IS NULL)),
    CHECK ((estado = 'VERIFICADA') = (cliente_id IS NOT NULL)),
    CHECK ((estado = 'RECHAZADA') = (motivo_rechazo IS NOT NULL AND trim(motivo_rechazo) <> ''))
) STRICT;

-- Una ficha tiene a lo más una cuenta verificada. Varias cuentas pendientes
-- pueden declarar el mismo RUT: así nadie bloquea al dueño real
-- registrándose primero con su RUT; el cajero rechaza la falsa.
CREATE UNIQUE INDEX ux_cuenta_cliente_cliente ON cuenta_cliente (cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX ix_cuenta_cliente_estado ON cuenta_cliente (estado, creada_en);

CREATE TRIGGER cuenta_cliente_nace_pendiente BEFORE INSERT ON cuenta_cliente
WHEN NEW.estado <> 'PENDIENTE'
BEGIN
    SELECT RAISE(ABORT, 'Una cuenta de cliente nueva debe nacer PENDIENTE');
END;

-- Una vez revisada, la decisión no cambia (queda como evidencia)
CREATE TRIGGER cuenta_cliente_revisada_inmutable BEFORE UPDATE ON cuenta_cliente
WHEN OLD.estado <> 'PENDIENTE'
BEGIN
    SELECT RAISE(ABORT, 'Una cuenta de cliente ya revisada no se modifica');
END;

CREATE TRIGGER cuenta_cliente_identidad_fija BEFORE UPDATE ON cuenta_cliente
WHEN NEW.auth_user_id IS NOT OLD.auth_user_id OR NEW.rut IS NOT OLD.rut OR NEW.creada_en IS NOT OLD.creada_en
BEGIN
    SELECT RAISE(ABORT, 'La cuenta, el RUT y la fecha de registro no se modifican');
END;

-- Solo se enlaza con la ficha del mismo RUT: el cajero no puede darle a
-- una persona acceso a las operaciones de otra
CREATE TRIGGER cuenta_cliente_mismo_rut BEFORE UPDATE OF estado, cliente_id ON cuenta_cliente
WHEN NEW.estado = 'VERIFICADA' AND NOT EXISTS (
    SELECT 1 FROM cliente c
     WHERE c.id = NEW.cliente_id AND c.tipo_documento = 'RUT' AND c.numero_documento = NEW.rut)
BEGIN
    SELECT RAISE(ABORT, 'La ficha del cliente debe tener el mismo RUT que la cuenta');
END;

CREATE TRIGGER cuenta_cliente_no_se_borra BEFORE DELETE ON cuenta_cliente
WHEN (SELECT COUNT(*) FROM "user" WHERE id = OLD.auth_user_id) > 0
BEGIN
    SELECT RAISE(ABORT, 'Las cuentas de cliente no se eliminan: se rechazan');
END;
