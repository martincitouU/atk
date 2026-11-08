#!/usr/bin/env bash
# Carga el esquema y la semilla en una base temporal y comprueba que las
# restricciones y los triggers de protección funcionan.
# Uso: app/db/probar.sh   (necesita sqlite3 >= 3.42)
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
DB="$TMP/prueba.db"
trap 'rm -rf "$TMP"' EXIT

OK=0
FALLAS=0
AHORA="CAST(unixepoch('subsec') * 1000 AS INTEGER)"

# Cada llamada es una conexión nueva; las FKs se activan por conexión.
# Si una llamada con BEGIN falla, la conexión se cierra y se deshace todo.
ejecutar() { sqlite3 -bail "$DB" "PRAGMA foreign_keys = ON; $1" 2>&1; }

bien() { echo "  ✅ $1"; OK=$((OK + 1)); }
mal()  { echo "  ❌ $1"; echo "     → $2"; FALLAS=$((FALLAS + 1)); }

debe_funcionar() {
    local out
    if out=$(ejecutar "$2"); then bien "$1"; else mal "$1" "$out"; fi
}

# $3: texto que debe aparecer en el error
debe_fallar() {
    local out
    if out=$(ejecutar "$2"); then
        mal "$1" "se aceptó y debía rechazarse"
    elif [[ $out == *"$3"* ]]; then
        bien "$1"
    else
        mal "$1" "falló por otro motivo: $out"
    fi
}

debe_dar() {
    local out
    out=$(ejecutar "$2")
    if [[ $out == "$3" ]]; then bien "$1"; else mal "$1" "esperaba '$3', obtuvo '$out'"; fi
}

# Borrador en el turno 1 a 954,10 → $ 95.410 por US$ 100,00
# Uso: operacion <caja> <usuario> <tipo> <moneda> <monto_divisa>
operacion() {
    echo "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo,
          monto_divisa, tasa_aplicada_e6, monto_base)
          VALUES ($1, 1, $2, '$3', '$4', $5, 954100000, 95410);"
}
BORRADOR="$(operacion 1 3 VENTA USD 10000)"
CONFIRMAR="estado = 'CONFIRMADA', confirmada_por = 3, confirmada_en = $AHORA"

echo "Carga"
if out=$( { echo "PRAGMA foreign_keys = ON;"; cat "$DIR/migraciones/0001_esquema.sql" "$DIR/semillas/ejemplo.sql"; } \
          | sqlite3 -bail "$DB" 2>&1 ); then
    bien "esquema y semilla se cargan"
else
    mal "esquema y semilla se cargan" "$out"
    echo "No tiene sentido seguir sin el esquema."
    exit 1
fi
debe_dar "integridad del archivo" "PRAGMA integrity_check;" "ok"
debe_dar "sin FKs rotas en la semilla" "PRAGMA foreign_key_check;" ""
debe_dar "tablas de Better Auth" \
    "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name IN ('user', 'session', 'account', 'verification');" "4"
debe_dar "datos de referencia: monedas, parámetros y categorías" \
    "SELECT (SELECT count(*) FROM moneda) || ' ' || (SELECT count(*) FROM parametro) || ' ' || (SELECT count(*) FROM categoria_gasto);" \
    "5 9 7"
debe_dar "zona horaria de Coyhaique" "SELECT valor FROM parametro WHERE clave = 'zona_horaria';" "America/Coyhaique"
debe_dar "pizarra USD de la semilla" \
    "SELECT precio_compra_e6 || ' ' || precio_venta_e6 FROM cotizacion WHERE moneda_codigo = 'USD';" \
    "925900000 954100000"

echo "Tipos y CHECK"
debe_fallar "monto con decimales (STRICT)" \
    "$(operacion 1 3 VENTA USD 100.5)" "cannot store REAL value in INTEGER column"
debe_fallar "texto en un monto (STRICT)" \
    "$(operacion 1 3 VENTA USD "'cien'")" "cannot store TEXT value in INTEGER column"
debe_fallar "rol inexistente" \
    "INSERT INTO usuario (rut, nombre, email, rol) VALUES ('1-9', 'X', 'x@x.cl', 'DIOS');" "CHECK constraint failed"
debe_fallar "usuario vinculado a una cuenta de Better Auth inexistente" \
    "INSERT INTO usuario (auth_user_id, rut, nombre, email, rol) VALUES ('no-existe', '1-9', 'X', 'x@x.cl', 'CAJERO');" \
    "FOREIGN KEY constraint failed"
debe_fallar "margen porcentual de compra de 100 %" \
    "INSERT INTO regla_spread (moneda_codigo, margen_compra_e6, margen_venta_e6) VALUES ('USD', 100000000, 0);" \
    "CHECK constraint failed"
debe_fallar "nacionalidad que no es ISO de 2 letras" \
    "INSERT INTO cliente (tipo_documento, numero_documento, nombre, nacionalidad) VALUES ('DNI', '1', 'X', 'Chile');" \
    "CHECK constraint failed"

echo "Turnos"
debe_funcionar "abrir turno del cajero en la caja 1" \
    "INSERT INTO turno (caja_id, usuario_id) VALUES (1, 3);"
debe_fallar "segundo turno abierto en la misma caja" \
    "INSERT INTO turno (caja_id, usuario_id) VALUES (1, 2);" "UNIQUE constraint failed"

echo "Operaciones: borrador (RF-07)"
debe_funcionar "registrar un borrador (operación 1)" "$BORRADOR"
debe_dar "nace como BORRADOR y en efectivo" \
    "SELECT estado || ' ' || medio_pago FROM operacion WHERE id = 1;" "BORRADOR EFECTIVO"
debe_fallar "tipo de operación inválido" \
    "$(operacion 1 3 REGALO USD 10000)" "CHECK constraint failed"
debe_fallar "operar en el turno de otro usuario" \
    "$(operacion 1 2 VENTA USD 10000)" "turno abierto del mismo usuario"
debe_fallar "operar en otra caja con ese turno" \
    "$(operacion 2 3 VENTA USD 10000)" "turno abierto del mismo usuario"
debe_fallar "comprar la moneda base" \
    "$(operacion 1 3 COMPRA CLP 10000)" "moneda base"
debe_fallar "divisa no habilitada (JPY)" \
    "$(operacion 1 3 VENTA JPY 10000)" "FOREIGN KEY constraint failed"
debe_fallar "medio de pago inválido" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6,
       monto_base, medio_pago) VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 954100000, 95410, 'CHEQUE');" \
    "CHECK constraint failed"
debe_fallar "nacer confirmada" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6,
       monto_base, estado, confirmada_por, confirmada_en)
     VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 954100000, 95410, 'CONFIRMADA', 3, $AHORA);" "nacer como BORRADOR"
debe_funcionar "editar el monto de un borrador" \
    "UPDATE operacion SET monto_divisa = 20000, monto_base = 190820 WHERE id = 1;"
debe_fallar "cambiar la caja de un borrador" \
    "UPDATE operacion SET caja_id = 2 WHERE id = 1;" "No se puede cambiar la caja"
debe_funcionar "eliminar un borrador" \
    "BEGIN; $BORRADOR DELETE FROM operacion WHERE id = last_insert_rowid(); COMMIT;"
debe_fallar "pasar de BORRADOR a REVERSADA" \
    "UPDATE operacion SET estado = 'REVERSADA', confirmada_por = 3, confirmada_en = $AHORA,
       reversada_por = 2, reversada_en = $AHORA, motivo_reverso = 'x' WHERE id = 1;" "Transición de estado"
debe_fallar "confirmar sin indicar quién" \
    "UPDATE operacion SET estado = 'CONFIRMADA' WHERE id = 1;" "CHECK constraint failed"
debe_fallar "confirmar una preferencial sin autorización" \
    "BEGIN; $BORRADOR UPDATE operacion SET es_preferencial = 1 WHERE id = last_insert_rowid();
     UPDATE operacion SET $CONFIRMAR WHERE id = last_insert_rowid(); COMMIT;" "CHECK constraint failed"
debe_fallar "tipo de DTE sin folio" \
    "UPDATE operacion SET tipo_dte = 41 WHERE id = 1;" "CHECK constraint failed"
debe_fallar "registro diferido con fecha futura" \
    "UPDATE operacion SET registro_diferido = 1, realizada_en = registrada_en + 60000 WHERE id = 1;" \
    "CHECK constraint failed"

echo "Operaciones: confirmada y reverso (RF-07)"
debe_funcionar "confirmar con folio (operación 1)" \
    "UPDATE operacion SET $CONFIRMAR, tipo_dte = 41, folio_dte = 1001 WHERE id = 1;"
debe_fallar "folio repetido" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6,
       monto_base, tipo_dte, folio_dte) VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 954100000, 95410, 41, 1001);" \
    "UNIQUE constraint failed"
debe_fallar "cambiar el monto de una confirmada" \
    "UPDATE operacion SET monto_base = 1 WHERE id = 1;" "confirmada no se modifica"
debe_fallar "cambiar la observación de una confirmada" \
    "UPDATE operacion SET observacion = 'x' WHERE id = 1;" "confirmada no se modifica"
debe_fallar "borrar una confirmada" "DELETE FROM operacion WHERE id = 1;" "no se elimina: se reversa"
debe_fallar "volver a BORRADOR" \
    "UPDATE operacion SET estado = 'BORRADOR', confirmada_por = NULL, confirmada_en = NULL WHERE id = 1;" \
    "confirmada no se modifica"
debe_fallar "reversar sin motivo" \
    "UPDATE operacion SET estado = 'REVERSADA', reversada_por = 2, reversada_en = $AHORA,
       motivo_reverso = '  ' WHERE id = 1;" "CHECK constraint failed"
debe_funcionar "reversar con motivo" \
    "UPDATE operacion SET estado = 'REVERSADA', reversada_por = 2, reversada_en = $AHORA,
       motivo_reverso = 'Error de digitación' WHERE id = 1;"
debe_fallar "modificar una reversada" \
    "UPDATE operacion SET motivo_reverso = 'otro' WHERE id = 1;" "reversada no se puede"

echo "Libro de caja"
debe_fallar "un borrador no mueve la caja" \
    "BEGIN; $BORRADOR
     INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post, operacion_id, usuario_id)
     VALUES (1, 1, 'USD', 'OPERACION', -10000, -10000, last_insert_rowid(), 3); COMMIT;" \
    "Solo una operación CONFIRMADA"
debe_fallar "movimiento de operación sin operación" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id)
     VALUES (1, 'USD', 'OPERACION', 100, 100, 3);" "CHECK constraint failed"
debe_funcionar "movimiento de reverso de la operación reversada" \
    "INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post, operacion_id, usuario_id)
     VALUES (1, 1, 'USD', 'REVERSO', 20000, 20000, 1, 2);"
debe_fallar "movimiento de reverso de una operación no reversada" \
    "BEGIN; $BORRADOR UPDATE operacion SET $CONFIRMAR WHERE id = last_insert_rowid();
     INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post, operacion_id, usuario_id)
     VALUES (1, 1, 'USD', 'REVERSO', 100, 100, last_insert_rowid(), 2); COMMIT;" "ya reversado"
debe_fallar "ingreso sin motivo" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id)
     VALUES (1, 'CLP', 'INGRESO', 500000, 500000, 3);" "CHECK constraint failed"
debe_fallar "ingreso negativo" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id, descripcion)
     VALUES (1, 'CLP', 'INGRESO', -5, -5, 3, 'x');" "CHECK constraint failed"
debe_fallar "retiro positivo" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id, descripcion)
     VALUES (1, 'CLP', 'RETIRO', 5, 5, 3, 'x');" "CHECK constraint failed"
debe_fallar "movimiento de monto cero" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id, descripcion)
     VALUES (1, 'CLP', 'AJUSTE', 0, 0, 3, 'x');" "CHECK constraint failed"
debe_funcionar "registrar el fondo inicial" \
    "INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post, usuario_id, descripcion)
     VALUES (1, 1, 'CLP', 'INGRESO', 500000, 500000, 3, 'Fondo inicial');"
debe_fallar "modificar un movimiento" "UPDATE movimiento_caja SET monto = 1;" "solo inserción"
debe_fallar "borrar un movimiento" "DELETE FROM movimiento_caja;" "solo inserción"

echo "Gastos (RF-05)"
GASTO="INSERT INTO gasto (fecha, categoria_id, descripcion, monto, medio_pago, caja_id, turno_id, usuario_id)"
debe_funcionar "gasto en efectivo de la caja" \
    "$GASTO VALUES ('2026-11-03', 6, 'Resma de papel', 5000, 'EFECTIVO', 1, 1, 3);"
debe_fallar "gasto en efectivo fuera del turno propio" \
    "$GASTO VALUES ('2026-11-03', 6, 'x', 5000, 'EFECTIVO', 1, 1, 2);" "requiere un turno abierto"
debe_fallar "transferencia asociada a una caja" \
    "$GASTO VALUES ('2026-11-03', 1, 'Arriendo', 900000, 'TRANSFERENCIA', 1, 1, 1);" "CHECK constraint failed"
debe_fallar "fecha que no existe" \
    "$GASTO VALUES ('2026-02-30', 1, 'Arriendo', 900000, 'TRANSFERENCIA', NULL, NULL, 1);" "CHECK constraint failed"
debe_fallar "gasto sin descripción" \
    "$GASTO VALUES ('2026-11-03', 1, '  ', 900000, 'TRANSFERENCIA', NULL, NULL, 1);" "CHECK constraint failed"
debe_fallar "movimiento de gasto sin gasto" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id)
     VALUES (1, 'CLP', 'GASTO', -5000, 495000, 3);" "CHECK constraint failed"
debe_fallar "cambiar el monto de un gasto" "UPDATE gasto SET monto = 1 WHERE id = 1;" "no se modifica"
debe_fallar "borrar un gasto" "DELETE FROM gasto WHERE id = 1;" "no se eliminan"
debe_fallar "reversar un gasto sin motivo" \
    "UPDATE gasto SET estado = 'REVERSADO', reversado_por = 2, reversado_en = $AHORA WHERE id = 1;" \
    "CHECK constraint failed"
debe_funcionar "reversar un gasto con motivo" \
    "UPDATE gasto SET estado = 'REVERSADO', reversado_por = 2, reversado_en = $AHORA,
       motivo_reverso = 'Se pagó con fondos personales' WHERE id = 1;"
debe_fallar "modificar un gasto reversado" \
    "UPDATE gasto SET motivo_reverso = 'otro' WHERE id = 1;" "reversado no se puede"

echo "Auditoría (RF-15)"
AUDITORIA="INSERT INTO auditoria (tabla, registro_id, accion, motivo, datos_despues, usuario_id)"
debe_funcionar "registrar auditoría" \
    "$AUDITORIA VALUES ('operacion', '1', 'CONFIRMAR', NULL, '{\"monto_base\":\"95410\"}', 3);"
debe_fallar "auditoría sin usuario" \
    "INSERT INTO auditoria (tabla, registro_id, accion) VALUES ('operacion', '1', 'CREAR');" "NOT NULL constraint failed"
debe_fallar "acción desconocida" \
    "$AUDITORIA VALUES ('operacion', '1', 'BORRAR_TODO', NULL, NULL, 1);" "CHECK constraint failed"
debe_fallar "reverso sin motivo en la auditoría" \
    "$AUDITORIA VALUES ('operacion', '1', 'REVERSAR', NULL, NULL, 2);" "CHECK constraint failed"
debe_fallar "auditoría con JSON inválido" \
    "$AUDITORIA VALUES ('x', '1', 'EDITAR', NULL, '{roto', 1);" "CHECK constraint failed"
debe_fallar "modificar la auditoría" "UPDATE auditoria SET usuario_id = 2;" "solo inserción"
debe_fallar "borrar la auditoría" "DELETE FROM auditoria;" "solo inserción"

echo "Pizarra y spread (RF-08)"
debe_fallar "dos cotizaciones vigentes de USD" \
    "INSERT INTO cotizacion (moneda_codigo, tasa_referencia_id, regla_spread_id, precio_compra_e6, precio_venta_e6)
     VALUES ('USD', 1, 1, 925900000, 954100000);" "UNIQUE constraint failed"
debe_fallar "cambiar un precio publicado" \
    "UPDATE cotizacion SET precio_venta_e6 = 1 WHERE moneda_codigo = 'USD';" "no se modifica"
debe_funcionar "cerrar la vigencia de la cotización" \
    "UPDATE cotizacion SET vigente_hasta = $AHORA WHERE moneda_codigo = 'USD' AND vigente_hasta IS NULL;"
debe_fallar "reabrir una cotización cerrada" \
    "UPDATE cotizacion SET vigente_hasta = NULL WHERE moneda_codigo = 'USD';" "cerrada no se modifica"
debe_fallar "precio de venta menor que el de compra" \
    "INSERT INTO cotizacion (moneda_codigo, tasa_referencia_id, regla_spread_id, precio_compra_e6, precio_venta_e6)
     VALUES ('USD', 1, 1, 1000000000, 900000000);" "CHECK constraint failed"
debe_fallar "modificar una tasa de referencia" "UPDATE tasa_referencia SET valor_e6 = 1;" "solo inserción"
debe_fallar "cambiar el margen de una regla" \
    "UPDATE regla_spread SET margen_venta_e6 = 1 WHERE id = 3;" "se cierra y se crea otra"
debe_funcionar "cerrar la vigencia de una regla" \
    "UPDATE regla_spread SET vigente_hasta = $AHORA WHERE id = 3;"
debe_fallar "modificar una regla cerrada" \
    "UPDATE regla_spread SET vigente_hasta = NULL WHERE id = 3;" "cerrada no se modifica"
debe_fallar "borrar una regla" "DELETE FROM regla_spread WHERE id = 4;" "no se eliminan"

echo "Fidelización (RF-18)"
debe_fallar "categoría sin descuento" \
    "INSERT INTO categoria_cliente (nombre, descuento_margen_pct_e6) VALUES ('Nada', 0);" "CHECK constraint failed"
debe_fallar "categoría con descuento mayor a 100 %" \
    "INSERT INTO categoria_cliente (nombre, descuento_margen_pct_e6) VALUES ('Mucho', 100000001);" "CHECK constraint failed"
debe_fallar "cliente con una categoría inexistente" \
    "UPDATE cliente SET categoria_id = 99 WHERE id = 1;" "FOREIGN KEY constraint failed"
debe_funcionar "asignar la categoría Frecuente a un cliente" "UPDATE cliente SET categoria_id = 1 WHERE id = 1;"
debe_fallar "tasa manual y tasa de categoría a la vez" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6,
       monto_base, es_preferencial, categoria_cliente_id) VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 950000000, 95000, 1, 1);" \
    "CHECK constraint failed"
debe_fallar "cambiar la categoría de una confirmada" \
    "BEGIN; INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6,
       monto_base, categoria_cliente_id) VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 949870000, 94987, 1);
     UPDATE operacion SET $CONFIRMAR WHERE id = last_insert_rowid();
     UPDATE operacion SET categoria_cliente_id = NULL WHERE id = last_insert_rowid(); COMMIT;" "confirmada no se modifica"

echo "Carga del histórico (RF-13)"
debe_fallar "lote sin caja asignada" \
    "INSERT INTO lote_migracion (archivo_origen, importado_por) VALUES ('historico.xlsx', 1);" "NOT NULL constraint failed"
debe_funcionar "crear un lote asignado a la caja 1" \
    "INSERT INTO lote_migracion (archivo_origen, caja_id, importado_por) VALUES ('historico-2024.xlsx', 1, 1);"
debe_funcionar "importar una operación histórica ya confirmada" \
    "INSERT INTO operacion (caja_id, usuario_id, tipo, moneda_codigo, monto_divisa, tasa_aplicada_e6, monto_base,
       origen, lote_migracion_id, estado, confirmada_por, confirmada_en, realizada_en)
     VALUES (1, 1, 'COMPRA', 'USD', 50000, 880000000, 440000, 'MIGRACION', 1, 'CONFIRMADA', 1, $AHORA, 1704067200000);"
RECHAZO="INSERT INTO lote_migracion_rechazo (lote_migracion_id, fila, causa, datos)"
debe_funcionar "registrar una fila rechazada con su causa" \
    "$RECHAZO VALUES (1, 7, 'La fecha 31/02/2024 no existe', '{\"fecha\":\"31/02/2024\",\"monto\":\"100\"}');"
debe_fallar "la misma fila rechazada dos veces" "$RECHAZO VALUES (1, 7, 'otra', NULL);" "UNIQUE constraint failed"
debe_fallar "rechazo sin causa" "$RECHAZO VALUES (1, 8, ' ', NULL);" "CHECK constraint failed"
debe_fallar "fila cero" "$RECHAZO VALUES (1, 0, 'x', NULL);" "CHECK constraint failed"
debe_fallar "modificar un rechazo" "UPDATE lote_migracion_rechazo SET causa = 'otra';" "solo inserción"
debe_fallar "borrar un rechazo" "DELETE FROM lote_migracion_rechazo;" "solo inserción"

echo "Reporte de Operaciones en Efectivo (RF-19)"
ROE="INSERT INTO reporte_roe (anio, trimestre, umbral_usd, cantidad_operaciones, generado_por)"
debe_funcionar "generar un reporte sin operaciones" "$ROE VALUES (2026, 3, 10000, 0, 1);"
debe_dar "sin operaciones es un reporte negativo" "SELECT es_negativo FROM reporte_roe WHERE id = 1;" "1"
debe_fallar "trimestre que no existe" "$ROE VALUES (2026, 5, 10000, 0, 1);" "CHECK constraint failed"
debe_fallar "cambiar un reporte generado" \
    "UPDATE reporte_roe SET cantidad_operaciones = 3 WHERE id = 1;" "no se modifica"
debe_fallar "marcar el envío sin indicar quién" \
    "UPDATE reporte_roe SET enviado_en = $AHORA WHERE id = 1;" "CHECK constraint failed"
debe_funcionar "registrar el envío" "UPDATE reporte_roe SET enviado_en = $AHORA, enviado_por = 1 WHERE id = 1;"
debe_fallar "registrar el envío dos veces" \
    "UPDATE reporte_roe SET enviado_en = $AHORA, enviado_por = 2 WHERE id = 1;" "ya está marcado como enviado"
debe_fallar "borrar un reporte" "DELETE FROM reporte_roe;" "no se eliminan"
debe_funcionar "asociar una operación a un reporte" \
    "$ROE VALUES (2026, 4, 10000, 1, 1); INSERT INTO reporte_roe_operacion VALUES (last_insert_rowid(), 1);"
debe_fallar "quitar una operación de un reporte" "DELETE FROM reporte_roe_operacion;" "solo inserción"
debe_funcionar "auditar una exportación" \
    "$AUDITORIA VALUES ('operacion', 'periodo-2026-10', 'EXPORTAR', NULL, NULL, 1);"

echo "Arqueo y cierre (RF-06)"
debe_funcionar "registrar arqueo" \
    "INSERT INTO arqueo (turno_id, moneda_codigo, saldo_sistema, saldo_contado) VALUES (1, 'USD', 10000, 9900);"
debe_dar "la diferencia se calcula sola" \
    "SELECT diferencia FROM arqueo WHERE turno_id = 1 AND moneda_codigo = 'USD';" "-100"
debe_fallar "modificar un arqueo" "UPDATE arqueo SET saldo_contado = 10000;" "solo inserción"
debe_fallar "cerrar el turno con borradores pendientes" \
    "BEGIN; $BORRADOR
     UPDATE turno SET estado = 'CERRADO', cerrado_en = $AHORA, cerrado_por = 3 WHERE id = 1; COMMIT;" \
    "borrador"
debe_fallar "cerrar turno sin indicar quién" \
    "UPDATE turno SET estado = 'CERRADO', cerrado_en = $AHORA WHERE id = 1;" "CHECK constraint failed"
debe_funcionar "cerrar turno" \
    "UPDATE turno SET estado = 'CERRADO', cerrado_en = $AHORA, cerrado_por = 3 WHERE id = 1;"
debe_fallar "modificar un turno cerrado" "UPDATE turno SET observacion = 'x' WHERE id = 1;" "cerrado no se puede"
debe_fallar "operar con el turno cerrado" "$BORRADOR" "turno abierto del mismo usuario"
debe_fallar "borrar un turno" "DELETE FROM turno WHERE id = 1;" "no se eliminan"

echo
echo "Resultado: $OK correctas, $FALLAS fallidas"
[[ $FALLAS -eq 0 ]]
