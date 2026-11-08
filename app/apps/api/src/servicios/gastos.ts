// Gastos operacionales con fecha y categoría (RF-05). Pagado en efectivo,
// sale de la caja del propio turno; pagado de otra forma no toca la caja
// y lo registra el administrador.

import { and, asc, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { categoriaGasto, gasto, turno, type Gasto, type MedioPago } from "../db/esquema.ts";
import { fechaLocal, validarFecha } from "../dominio/tiempo.ts";
import { auditar } from "./auditoria.ts";
import { aplicarMovimiento } from "./caja.ts";
import { monedaBase } from "./catalogo.ts";
import { enTransaccion, ErrorNegocio, esSupervisor, exigir, exigirRol, limpiar, type Actor, type Contexto, type Datos } from "./contexto.ts";
import { leerParametros } from "./parametros.ts";
import { turnoAbiertoDe } from "./turnos.ts";

export type EntradaGasto = {
  /** Fecha local del gasto (AAAA-MM-DD); hoy si no se indica */
  fecha?: string;
  categoriaId: number;
  descripcion: string;
  /** Unidad mínima de la moneda base */
  monto: bigint;
  medioPago: MedioPago;
  /** Boleta o factura del proveedor */
  documento?: string | null;
};

export function registrarGasto(ctx: Contexto, actor: Actor, entrada: EntradaGasto): Gasto {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const hoy = fechaLocal(ctx.ahora(), parametros.zonaHoraria);
    const fecha = entrada.fecha ?? hoy;
    try {
      validarFecha(fecha);
    } catch (error) {
      throw new ErrorNegocio("FECHA_INVALIDA", (error as Error).message);
    }
    exigir(fecha <= hoy, "FECHA_FUTURA", "La fecha del gasto no puede ser futura");
    const descripcion = limpiar(entrada.descripcion);
    exigir(descripcion, "FALTA_DESCRIPCION", "Describa el gasto");
    exigir(entrada.monto > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
    const categoria = tx.select().from(categoriaGasto).where(eq(categoriaGasto.id, entrada.categoriaId)).get();
    exigir(categoria?.activa, "CATEGORIA_INVALIDA", "La categoría de gasto no existe o está inactiva");

    let elTurno = null;
    if (entrada.medioPago === "EFECTIVO") {
      elTurno = turnoAbiertoDe(tx, actor.id);
      exigir(elTurno, "SIN_TURNO", "Un gasto en efectivo sale de la caja: abra un turno");
    } else {
      exigirRol(actor, ["ADMIN"], "Registrar un gasto pagado por transferencia o tarjeta");
    }

    const nuevo = tx
      .insert(gasto)
      .values({
        fecha,
        categoriaId: entrada.categoriaId,
        descripcion,
        monto: entrada.monto,
        medioPago: entrada.medioPago,
        cajaId: elTurno?.cajaId ?? null,
        turnoId: elTurno?.id ?? null,
        documento: limpiar(entrada.documento),
        usuarioId: actor.id,
        registradoEn: ctx.ahora(),
      })
      .returning()
      .get();

    if (elTurno) {
      aplicarMovimiento(tx, ctx, parametros, {
        cajaId: elTurno.cajaId,
        turnoId: elTurno.id,
        monedaCodigo: monedaBase(tx).codigo,
        tipo: "GASTO",
        monto: -entrada.monto,
        gastoId: nuevo.id,
        usuarioId: actor.id,
        descripcion: `Gasto: ${descripcion}`,
      });
    }
    auditar(tx, ctx, { tabla: "gasto", registroId: nuevo.id, accion: "CREAR", usuarioId: actor.id, despues: nuevo });
    return nuevo;
  });
}

/** Anula un gasto con motivo; si fue en efectivo, el dinero vuelve a la caja. */
export function reversarGasto(ctx: Contexto, actor: Actor, id: number, motivo: string): Gasto {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const motivoLimpio = limpiar(motivo);
    exigir(motivoLimpio, "FALTA_MOTIVO", "El reverso requiere un motivo");
    const actual = tx.select().from(gasto).where(eq(gasto.id, id)).get();
    exigir(actual, "GASTO_NO_EXISTE", `El gasto ${id} no existe`);
    if (parametros.reversoRequiereSupervisor) {
      exigirRol(actor, ["SUPERVISOR", "ADMIN"], "Reversar un gasto");
    } else {
      exigir(esSupervisor(actor) || actual.usuarioId === actor.id, "NO_ES_PROPIO", "Solo puede reversar sus propios gastos");
    }
    exigir(actual.estado === "VIGENTE", "NO_REVERSABLE", "El gasto ya está reversado");
    if (actual.medioPago === "EFECTIVO") {
      const elTurno = tx.select().from(turno).where(eq(turno.id, actual.turnoId ?? -1)).get();
      exigir(elTurno?.estado === "ABIERTO", "TURNO_CERRADO", "Solo se reversan gastos en efectivo de un turno abierto");
    }

    const reversado = tx
      .update(gasto)
      .set({ estado: "REVERSADO", reversadoPor: actor.id, reversadoEn: ctx.ahora(), motivoReverso: motivoLimpio })
      .where(eq(gasto.id, id))
      .returning()
      .get();
    if (actual.medioPago === "EFECTIVO" && actual.cajaId !== null) {
      aplicarMovimiento(tx, ctx, parametros, {
        cajaId: actual.cajaId,
        turnoId: actual.turnoId,
        monedaCodigo: monedaBase(tx).codigo,
        tipo: "REVERSO",
        monto: actual.monto,
        gastoId: id,
        usuarioId: actor.id,
        descripcion: `Reverso del gasto ${id}`,
      });
    }
    auditar(tx, ctx, {
      tabla: "gasto",
      registroId: id,
      accion: "REVERSAR",
      usuarioId: actor.id,
      motivo: motivoLimpio,
      antes: actual,
      despues: reversado,
    });
    return reversado;
  });
}

/** Gastos entre dos fechas locales, ambas incluidas. */
export function listarGastos(datos: Datos, filtros: { desde?: string; hasta?: string; estado?: Gasto["estado"] } = {}): Gasto[] {
  const condiciones: SQL[] = [];
  if (filtros.desde) condiciones.push(gte(gasto.fecha, filtros.desde));
  if (filtros.hasta) condiciones.push(lte(gasto.fecha, filtros.hasta));
  if (filtros.estado) condiciones.push(eq(gasto.estado, filtros.estado));
  return datos
    .select()
    .from(gasto)
    .where(and(...condiciones))
    .orderBy(desc(gasto.fecha), desc(gasto.id))
    .all();
}

export function categoriasDeGasto(datos: Datos) {
  return datos.select().from(categoriaGasto).where(eq(categoriaGasto.activa, true)).orderBy(asc(categoriaGasto.nombre)).all();
}
