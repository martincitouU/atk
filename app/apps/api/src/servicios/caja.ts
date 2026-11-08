// Saldos y libro de caja (RF-04, RF-05). Todo lo que entra o sale de una
// caja pasa por aplicarMovimiento: actualiza el saldo, el costo promedio y
// deja el movimiento en el libro, en la misma transacción.

import { and, asc, eq } from "drizzle-orm";
import { caja, moneda, movimientoCaja, saldoCaja, tasaReferencia, type TIPOS_MOVIMIENTO } from "../db/esquema.ts";
import { costoPromedio, formatearMonto } from "../dominio/dinero.ts";
import { auditar } from "./auditoria.ts";
import { infoMoneda, monedaBase, sucursalDeCaja } from "./catalogo.ts";
import { enTransaccion, exigir, exigirRol, limpiar, type Actor, type Contexto, type Datos } from "./contexto.ts";
import { cotizacionEn } from "./cotizaciones.ts";
import { leerParametros, type Parametros } from "./parametros.ts";
import { turnoAbiertoDe } from "./turnos.ts";

export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export type Movimiento = {
  cajaId: number;
  turnoId: number | null;
  monedaCodigo: string;
  tipo: TipoMovimiento;
  /** + entra a la caja, − sale; unidad mínima de la moneda */
  monto: bigint;
  /** Costo del lote que entra (o sale, si se reversa una compra); null no cambia el costo promedio */
  costoLoteE6?: bigint | null;
  operacionId?: number | null;
  gastoId?: number | null;
  usuarioId: number;
  descripcion?: string | null;
};

export function aplicarMovimiento(tx: Datos, ctx: Contexto, parametros: Parametros, m: Movimiento) {
  const deEstaCaja = and(eq(saldoCaja.cajaId, m.cajaId), eq(saldoCaja.monedaCodigo, m.monedaCodigo));
  tx.insert(saldoCaja).values({ cajaId: m.cajaId, monedaCodigo: m.monedaCodigo }).onConflictDoNothing().run();
  const actual = tx.select().from(saldoCaja).where(deEstaCaja).get();
  exigir(actual, "SALDO_NO_EXISTE", "No se pudo leer el saldo de la caja");

  const nuevoSaldo = actual.saldo + m.monto;
  if (nuevoSaldo < 0n && !parametros.permitirSaldoNegativo) {
    const { decimales } = infoMoneda(tx, m.monedaCodigo);
    exigir(
      false,
      "SALDO_INSUFICIENTE",
      `Saldo insuficiente de ${m.monedaCodigo} en la caja: hay ${formatearMonto(actual.saldo, decimales)} y se necesitan ${formatearMonto(-m.monto, decimales)}`,
    );
  }

  const costo =
    m.costoLoteE6 != null
      ? costoPromedio({ saldo: actual.saldo, costoE6: actual.costoPromedioE6, cantidad: m.monto, costoLoteE6: m.costoLoteE6 })
      : actual.costoPromedioE6;
  const ahora = ctx.ahora();
  tx.update(saldoCaja).set({ saldo: nuevoSaldo, costoPromedioE6: costo, actualizadoEn: ahora }).where(deEstaCaja).run();

  return tx
    .insert(movimientoCaja)
    .values({
      cajaId: m.cajaId,
      turnoId: m.turnoId,
      monedaCodigo: m.monedaCodigo,
      tipo: m.tipo,
      monto: m.monto,
      saldoPost: nuevoSaldo,
      operacionId: m.operacionId ?? null,
      gastoId: m.gastoId ?? null,
      usuarioId: m.usuarioId,
      descripcion: m.descripcion ?? null,
      creadoEn: ahora,
    })
    .returning()
    .get();
}

/** Saldo de cada moneda en una caja, o en todas (RF-04, RF-16). */
export function saldos(datos: Datos, cajaId?: number) {
  return datos
    .select({
      cajaId: saldoCaja.cajaId,
      cajaNombre: caja.nombre,
      monedaCodigo: saldoCaja.monedaCodigo,
      decimales: moneda.decimales,
      saldo: saldoCaja.saldo,
      costoPromedioE6: saldoCaja.costoPromedioE6,
      actualizadoEn: saldoCaja.actualizadoEn,
    })
    .from(saldoCaja)
    .innerJoin(caja, eq(caja.id, saldoCaja.cajaId))
    .innerJoin(moneda, eq(moneda.codigo, saldoCaja.monedaCodigo))
    .where(cajaId === undefined ? undefined : eq(saldoCaja.cajaId, cajaId))
    .orderBy(asc(caja.nombre), asc(saldoCaja.monedaCodigo))
    .all();
}

/**
 * Ingreso (fondo inicial, reposición) o retiro de dinero de la caja del
 * propio turno, con motivo (RF-05). Una divisa que ingresa necesita un
 * costo para el costo promedio: si no se indica, se usa la referencia vigente.
 */
export function registrarIngresoORetiro(
  ctx: Contexto,
  actor: Actor,
  entrada: { tipo: "INGRESO" | "RETIRO"; monedaCodigo: string; monto: bigint; motivo: string; costoE6?: bigint | null },
) {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const motivo = limpiar(entrada.motivo);
    exigir(motivo, "FALTA_MOTIVO", `Indique el motivo del ${entrada.tipo === "INGRESO" ? "ingreso" : "retiro"}`);
    exigir(entrada.monto > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
    const turnoActual = turnoAbiertoDe(tx, actor.id);
    exigir(turnoActual, "SIN_TURNO", "Abra un turno para mover dinero de la caja");
    infoMoneda(tx, entrada.monedaCodigo);

    let costoLoteE6: bigint | null = null;
    if (entrada.tipo === "INGRESO" && entrada.monedaCodigo !== monedaBase(tx).codigo) {
      costoLoteE6 = entrada.costoE6 ?? referenciaVigente(tx, entrada.monedaCodigo, sucursalDeCaja(tx, turnoActual.cajaId), ctx.ahora());
    }

    const movimiento = aplicarMovimiento(tx, ctx, parametros, {
      cajaId: turnoActual.cajaId,
      turnoId: turnoActual.id,
      monedaCodigo: entrada.monedaCodigo,
      tipo: entrada.tipo,
      monto: entrada.tipo === "INGRESO" ? entrada.monto : -entrada.monto,
      costoLoteE6,
      usuarioId: actor.id,
      descripcion: motivo,
    });
    auditar(tx, ctx, {
      tabla: "movimiento_caja",
      registroId: movimiento.id,
      accion: "CREAR",
      usuarioId: actor.id,
      motivo,
      despues: movimiento,
    });
    return movimiento;
  });
}

function referenciaVigente(tx: Datos, monedaCodigo: string, sucursalId: number, instante: Date): bigint {
  const cot = cotizacionEn(tx, monedaCodigo, sucursalId, instante);
  exigir(cot, "SIN_COTIZACION", `No hay cotización de ${monedaCodigo}: indique el costo de la divisa que ingresa`);
  const referencia = tx.select().from(tasaReferencia).where(eq(tasaReferencia.id, cot.tasaReferenciaId)).get();
  exigir(referencia, "SIN_REFERENCIA", "La cotización no tiene tasa de referencia");
  return referencia.valorE6;
}

/**
 * Ajuste de caja con motivo, para alinear el saldo del sistema con el
 * conteo físico después de un arqueo (RF-06). Solo supervisor o admin.
 */
export function ajustarCaja(
  ctx: Contexto,
  actor: Actor,
  entrada: { cajaId: number; monedaCodigo: string; monto: bigint; motivo: string; turnoId?: number | null },
) {
  exigirRol(actor, ["SUPERVISOR", "ADMIN"], "Ajustar la caja");
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const motivo = limpiar(entrada.motivo);
    exigir(motivo, "FALTA_MOTIVO", "Indique el motivo del ajuste");
    exigir(entrada.monto !== 0n, "MONTO_INVALIDO", "El ajuste no puede ser cero");
    sucursalDeCaja(tx, entrada.cajaId);
    infoMoneda(tx, entrada.monedaCodigo);

    const movimiento = aplicarMovimiento(tx, ctx, { ...parametros, permitirSaldoNegativo: true }, {
      cajaId: entrada.cajaId,
      turnoId: entrada.turnoId ?? null,
      monedaCodigo: entrada.monedaCodigo,
      tipo: "AJUSTE",
      monto: entrada.monto,
      usuarioId: actor.id,
      descripcion: motivo,
    });
    auditar(tx, ctx, {
      tabla: "movimiento_caja",
      registroId: movimiento.id,
      accion: "CREAR",
      usuarioId: actor.id,
      motivo,
      despues: movimiento,
    });
    return movimiento;
  });
}

/** Libro de caja de un turno, en orden. */
export function movimientosDeTurno(datos: Datos, turnoId: number) {
  return datos.select().from(movimientoCaja).where(eq(movimientoCaja.turnoId, turnoId)).orderBy(asc(movimientoCaja.id)).all();
}
