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

# Cada llamada es una conexión nueva; las FKs se activan por conexión
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

# Operación en el turno 1 a 954,10 → $ 95.410 por US$ 100,00
# Uso: operacion <caja> <usuario> <tipo> <moneda> <monto_divisa>
operacion() {
    echo "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo,
          monto_divisa, tasa_aplicada_e6, monto_base)
          VALUES ($1, 1, $2, '$3', '$4', $5, 954100000, 95410);"
}
VENTA="$(operacion 1 3 VENTA USD 10000)"

echo "Carga"
if out=$( { echo "PRAGMA foreign_keys = ON;"; cat "$DIR/0001_esquema.sql" "$DIR/0002_semilla_ejemplo.sql"; } \
          | sqlite3 -bail "$DB" 2>&1 ); then
    bien "esquema y semilla se cargan"
else
    mal "esquema y semilla se cargan" "$out"
    echo "No tiene sentido seguir sin el esquema."
    exit 1
fi
debe_dar "integridad del archivo" "PRAGMA integrity_check;" "ok"
debe_dar "sin FKs rotas en la semilla" "PRAGMA foreign_key_check;" ""
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
debe_fallar "precio de venta menor que el de compra" \
    "UPDATE cotizacion SET vigente_hasta = $AHORA WHERE moneda_codigo = 'EUR';
     INSERT INTO cotizacion (moneda_codigo, tasa_referencia_id, regla_spread_id, precio_compra_e6, precio_venta_e6)
     VALUES ('EUR', 2, 3, 1000000000, 900000000);" "CHECK constraint failed"
debe_fallar "margen porcentual de compra de 100 %" \
    "INSERT INTO regla_spread (moneda_codigo, margen_compra_e6, margen_venta_e6) VALUES ('USD', 100000000, 0);" \
    "CHECK constraint failed"

echo "Turnos"
debe_funcionar "abrir turno del cajero en la caja 1" \
    "INSERT INTO turno (caja_id, usuario_id) VALUES (1, 3);"
debe_fallar "segundo turno abierto en la misma caja" \
    "INSERT INTO turno (caja_id, usuario_id) VALUES (1, 2);" "UNIQUE constraint failed"

echo "Operaciones"
debe_funcionar "venta válida" "$VENTA"
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
debe_fallar "cliente inexistente" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, cliente_id, tipo, moneda_codigo,
       monto_divisa, tasa_aplicada_e6, monto_base)
     VALUES (1, 1, 3, 999, 'VENTA', 'USD', 10000, 954100000, 95410);" "FOREIGN KEY constraint failed"
debe_fallar "nacer anulada" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo, monto_divisa,
       tasa_aplicada_e6, monto_base, estado, anulada_por, anulada_en, motivo_anulacion)
     VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 954100000, 95410, 'ANULADA', 2, $AHORA, 'x');" "debe estar VIGENTE"
debe_fallar "preferencial sin autorización" \
    "INSERT INTO operacion (caja_id, turno_id, usuario_id, tipo, moneda_codigo,
       monto_divisa, tasa_aplicada_e6, monto_base, es_preferencial)
     VALUES (1, 1, 3, 'VENTA', 'USD', 10000, 950000000, 95000, 1);" "CHECK constraint failed"
debe_fallar "borrar una operación" "DELETE FROM operacion WHERE id = 1;" "no se eliminan"
debe_fallar "cambiar el monto" "UPDATE operacion SET monto_base = 1 WHERE id = 1;" "Solo se puede anular"
debe_funcionar "editar la observación" "UPDATE operacion SET observacion = 'Cliente frecuente' WHERE id = 1;"
debe_fallar "anular sin motivo" \
    "UPDATE operacion SET estado = 'ANULADA', anulada_por = 2, anulada_en = $AHORA, motivo_anulacion = '  ' WHERE id = 1;" \
    "CHECK constraint failed"
debe_funcionar "anular con motivo" \
    "UPDATE operacion SET estado = 'ANULADA', anulada_por = 2, anulada_en = $AHORA,
     motivo_anulacion = 'Error de digitación' WHERE id = 1;"
debe_fallar "modificar una anulada" "UPDATE operacion SET observacion = 'x' WHERE id = 1;" "anulada no se puede"

echo "Libro de caja y auditoría"
debe_funcionar "registrar un movimiento" \
    "INSERT INTO movimiento_caja (caja_id, turno_id, moneda_codigo, tipo, monto, saldo_post, usuario_id)
     VALUES (1, 1, 'CLP', 'INGRESO', 500000, 500000, 3);"
debe_fallar "movimiento de monto cero" \
    "INSERT INTO movimiento_caja (caja_id, moneda_codigo, tipo, monto, saldo_post, usuario_id)
     VALUES (1, 'CLP', 'AJUSTE', 0, 0, 3);" "CHECK constraint failed"
debe_fallar "modificar un movimiento" "UPDATE movimiento_caja SET monto = 1;" "solo inserción"
debe_fallar "borrar un movimiento" "DELETE FROM movimiento_caja;" "solo inserción"
debe_funcionar "registrar auditoría" \
    "INSERT INTO auditoria (tabla, registro_id, accion, datos_despues, usuario_id)
     VALUES ('parametro', 'zona_horaria', 'UPDATE', '{\"valor\":\"America/Santiago\"}', 1);"
debe_fallar "auditoría sin usuario" \
    "INSERT INTO auditoria (tabla, registro_id, accion) VALUES ('parametro', 'x', 'UPDATE');" "NOT NULL constraint failed"
debe_fallar "auditoría con JSON inválido" \
    "INSERT INTO auditoria (tabla, registro_id, accion, datos_despues, usuario_id) VALUES ('x', '1', 'UPDATE', '{roto', 1);" \
    "CHECK constraint failed"
debe_fallar "modificar la auditoría" "UPDATE auditoria SET usuario_id = 2;" "solo inserción"
debe_fallar "borrar la auditoría" "DELETE FROM auditoria;" "solo inserción"

echo "Pizarra"
debe_fallar "dos cotizaciones vigentes de USD" \
    "INSERT INTO cotizacion (moneda_codigo, tasa_referencia_id, regla_spread_id, precio_compra_e6, precio_venta_e6)
     VALUES ('USD', 1, 1, 925900000, 954100000);" "UNIQUE constraint failed"
debe_fallar "cambiar un precio publicado" \
    "UPDATE cotizacion SET precio_venta_e6 = 1 WHERE moneda_codigo = 'USD';" "no se modifica"
debe_funcionar "cerrar la vigencia" \
    "UPDATE cotizacion SET vigente_hasta = $AHORA WHERE moneda_codigo = 'USD' AND vigente_hasta IS NULL;"
debe_fallar "reabrir una cotización cerrada" \
    "UPDATE cotizacion SET vigente_hasta = NULL WHERE moneda_codigo = 'USD';" "cerrada no se modifica"
debe_fallar "modificar una tasa de referencia" "UPDATE tasa_referencia SET valor_e6 = 1;" "solo inserción"

echo "Arqueo y cierre"
debe_funcionar "registrar arqueo" \
    "INSERT INTO arqueo (turno_id, moneda_codigo, saldo_sistema, saldo_contado) VALUES (1, 'USD', 10000, 9900);"
debe_dar "la diferencia se calcula sola" \
    "SELECT diferencia FROM arqueo WHERE turno_id = 1 AND moneda_codigo = 'USD';" "-100"
debe_fallar "modificar un arqueo" "UPDATE arqueo SET saldo_contado = 10000;" "solo inserción"
debe_fallar "cerrar turno sin indicar quién" \
    "UPDATE turno SET estado = 'CERRADO', cerrado_en = $AHORA WHERE id = 1;" "CHECK constraint failed"
debe_funcionar "cerrar turno" \
    "UPDATE turno SET estado = 'CERRADO', cerrado_en = $AHORA, cerrado_por = 2 WHERE id = 1;"
debe_fallar "modificar un turno cerrado" "UPDATE turno SET observacion = 'x' WHERE id = 1;" "cerrado no se puede"
debe_fallar "operar con el turno cerrado" "$VENTA" "turno abierto del mismo usuario"
debe_fallar "borrar un turno" "DELETE FROM turno WHERE id = 1;" "no se eliminan"

echo
echo "Resultado: $OK correctas, $FALLAS fallidas"
[[ $FALLAS -eq 0 ]]
