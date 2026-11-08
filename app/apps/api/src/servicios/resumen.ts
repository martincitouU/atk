// Resumen de la jornada para consultar desde el teléfono (RF-16): saldos
// por divisa, operaciones y margen del día.

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { gasto, operacion } from "../db/esquema.ts";
import { fechaLocal, rangoDelDia, validarFecha } from "../dominio/tiempo.ts";
import { saldos } from "./caja.ts";
import { ErrorNegocio, exigirRol, type Actor, type Contexto } from "./contexto.ts";
import { leerParametros } from "./parametros.ts";
import { turnosAbiertos } from "./turnos.ts";

type TotalesMoneda = {
  monedaCodigo: string;
  compras: number;
  ventas: number;
  divisaComprada: bigint;
  divisaVendida: bigint;
  basePagada: bigint;
  baseCobrada: bigint;
  margenBruto: bigint;
  margenRealizado: bigint;
};

export function resumenJornada(ctx: Contexto, actor: Actor, fecha?: string) {
  exigirRol(actor, ["SUPERVISOR", "ADMIN"], "Ver el resumen de la jornada");
  const { zonaHoraria } = leerParametros(ctx.db);
  const dia = fecha ?? fechaLocal(ctx.ahora(), zonaHoraria);
  try {
    validarFecha(dia);
  } catch (error) {
    throw new ErrorNegocio("FECHA_INVALIDA", (error as Error).message);
  }
  const { desde, hasta } = rangoDelDia(dia, zonaHoraria);

  // Saldos actuales: por caja y el total de cada moneda
  const porCaja = saldos(ctx.db);
  const totalPorMoneda = new Map<string, { monedaCodigo: string; decimales: number; saldo: bigint }>();
  for (const s of porCaja) {
    const total = totalPorMoneda.get(s.monedaCodigo) ?? { monedaCodigo: s.monedaCodigo, decimales: s.decimales, saldo: 0n };
    total.saldo += s.saldo;
    totalPorMoneda.set(s.monedaCodigo, total);
  }

  const operaciones = ctx.db
    .select()
    .from(operacion)
    .where(
      and(
        gte(operacion.realizadaEn, desde),
        lt(operacion.realizadaEn, hasta),
        inArray(operacion.estado, ["CONFIRMADA", "REVERSADA"]),
      ),
    )
    .orderBy(desc(operacion.realizadaEn), desc(operacion.id))
    .all();

  // Totales del día: solo lo confirmado (lo reversado no cuenta)
  const porMoneda = new Map<string, TotalesMoneda>();
  let margenBruto = 0n;
  let margenRealizado = 0n;
  for (const op of operaciones.filter((o) => o.estado === "CONFIRMADA")) {
    const t = porMoneda.get(op.monedaCodigo) ?? {
      monedaCodigo: op.monedaCodigo,
      compras: 0,
      ventas: 0,
      divisaComprada: 0n,
      divisaVendida: 0n,
      basePagada: 0n,
      baseCobrada: 0n,
      margenBruto: 0n,
      margenRealizado: 0n,
    };
    if (op.tipo === "COMPRA") {
      t.compras += 1;
      t.divisaComprada += op.montoDivisa;
      t.basePagada += op.montoBase;
    } else {
      t.ventas += 1;
      t.divisaVendida += op.montoDivisa;
      t.baseCobrada += op.montoBase;
    }
    t.margenBruto += op.margenBruto ?? 0n;
    t.margenRealizado += op.margenRealizado ?? 0n;
    margenBruto += op.margenBruto ?? 0n;
    margenRealizado += op.margenRealizado ?? 0n;
    porMoneda.set(op.monedaCodigo, t);
  }

  const gastosDelDia = ctx.db
    .select()
    .from(gasto)
    .where(and(eq(gasto.fecha, dia), eq(gasto.estado, "VIGENTE")))
    .all();
  const borradores = ctx.db.select({ id: operacion.id }).from(operacion).where(eq(operacion.estado, "BORRADOR")).all();

  return {
    fecha: dia,
    zonaHoraria,
    saldos: { porCaja, totales: [...totalPorMoneda.values()] },
    operaciones: {
      confirmadas: operaciones.filter((o) => o.estado === "CONFIRMADA").length,
      reversadas: operaciones.filter((o) => o.estado === "REVERSADA").length,
      porMoneda: [...porMoneda.values()],
      ultimas: operaciones.slice(0, 50),
    },
    margen: { bruto: margenBruto, realizado: margenRealizado },
    gastos: { cantidad: gastosDelDia.length, total: gastosDelDia.reduce((suma, g) => suma + g.monto, 0n) },
    borradoresPendientes: borradores.length,
    turnosAbiertos: turnosAbiertos(ctx.db),
  };
}
