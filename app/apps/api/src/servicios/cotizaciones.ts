// Tipos de cambio y spread (RF-08): la tasa de referencia y los márgenes
// generan la pizarra, y el precio vigente se aplica solo al registrar.

import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { casaMoneda, cotizacion, moneda, reglaSpread, tasaReferencia, type ReglaSpread } from "../db/esquema.ts";
import { calcularPrecios, reglaConDescuento, type TipoOperacion } from "../dominio/dinero.ts";
import { auditar } from "./auditoria.ts";
import { divisaHabilitada } from "./catalogo.ts";
import { enTransaccion, ErrorNegocio, exigir, exigirRol, type Actor, type Contexto, type Datos } from "./contexto.ts";
import { leerParametros } from "./parametros.ts";

/** La de la sucursal, si existe; si no, la general. */
const deSucursalOGeneral = (sucursalId: number | null) =>
  sucursalId === null ? isNull(cotizacion.sucursalId) : or(isNull(cotizacion.sucursalId), eq(cotizacion.sucursalId, sucursalId));

/** Cotización vigente de una divisa en un instante (también uno pasado, para el registro diferido). */
export function cotizacionEn(datos: Datos, monedaCodigo: string, sucursalId: number | null, instante: Date) {
  const filas = datos
    .select()
    .from(cotizacion)
    .where(
      and(
        eq(cotizacion.monedaCodigo, monedaCodigo),
        lte(cotizacion.vigenteDesde, instante),
        or(isNull(cotizacion.vigenteHasta), gt(cotizacion.vigenteHasta, instante)),
        deSucursalOGeneral(sucursalId),
      ),
    )
    .all();
  return filas.find((c) => c.sucursalId !== null) ?? filas[0] ?? null;
}

const compararBigint = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Regla de spread para un monto en un instante: la de la sucursal gana a la
 * general; luego la de mayor prioridad; luego el tramo más alto que aplica.
 */
export function reglaEn(
  datos: Datos,
  monedaCodigo: string,
  sucursalId: number | null,
  montoDivisa: bigint,
  instante: Date,
): ReglaSpread | null {
  const filas = datos
    .select()
    .from(reglaSpread)
    .where(
      and(
        eq(reglaSpread.monedaCodigo, monedaCodigo),
        lte(reglaSpread.vigenteDesde, instante),
        or(isNull(reglaSpread.vigenteHasta), gt(reglaSpread.vigenteHasta, instante)),
        lte(reglaSpread.montoDesde, montoDivisa),
        or(isNull(reglaSpread.montoHasta), gt(reglaSpread.montoHasta, montoDivisa)),
        sucursalId === null
          ? isNull(reglaSpread.sucursalId)
          : or(isNull(reglaSpread.sucursalId), eq(reglaSpread.sucursalId, sucursalId)),
      ),
    )
    .all();
  filas.sort(
    (a, b) =>
      Number(a.sucursalId === null) - Number(b.sucursalId === null) ||
      b.prioridad - a.prioridad ||
      compararBigint(b.montoDesde, a.montoDesde),
  );
  return filas[0] ?? null;
}

export type PrecioOperacion = {
  cotizacionId: number;
  reglaSpreadId: number;
  tasaReferenciaE6: bigint;
  /** Precio de pizarra para el tipo pedido: compra o venta */
  tasaE6: bigint;
  vigenteDesde: Date;
};

/**
 * Precio que corresponde a una operación (RF-08). En el tramo base se cobra
 * exactamente el precio publicado; en otro tramo (por ejemplo, mayorista)
 * se calcula sobre la misma tasa de referencia de esa pizarra.
 */
export function precioPara(
  datos: Datos,
  p: {
    monedaCodigo: string;
    sucursalId: number | null;
    tipo: TipoOperacion;
    montoDivisa: bigint;
    instante: Date;
    /** Minutos de validez de la pizarra; null para no exigirla (registro diferido) */
    vigenciaMinutos: number | null;
    /** Descuento de margen de la categoría del cliente (RF-18); null sin categoría */
    descuentoMargenPctE6?: bigint | null;
  },
): PrecioOperacion {
  const cot = cotizacionEn(datos, p.monedaCodigo, p.sucursalId, p.instante);
  exigir(cot, "SIN_COTIZACION", `No hay una cotización de ${p.monedaCodigo} publicada para ese momento`);
  if (p.vigenciaMinutos !== null) {
    const edadMinutos = (p.instante.getTime() - cot.vigenteDesde.getTime()) / 60_000;
    exigir(
      edadMinutos <= p.vigenciaMinutos,
      "COTIZACION_VENCIDA",
      `La cotización de ${p.monedaCodigo} tiene más de ${p.vigenciaMinutos} minutos: publique una nueva antes de operar`,
    );
  }

  const regla = reglaEn(datos, p.monedaCodigo, p.sucursalId, p.montoDivisa, p.instante);
  exigir(regla, "SIN_REGLA", `No hay una regla de spread de ${p.monedaCodigo} para ese monto`);
  const referencia = datos.select().from(tasaReferencia).where(eq(tasaReferencia.id, cot.tasaReferenciaId)).get();
  exigir(referencia, "SIN_REFERENCIA", "La cotización no tiene tasa de referencia");

  let compraE6 = cot.precioCompraE6;
  let ventaE6 = cot.precioVentaE6;
  if (p.descuentoMargenPctE6 != null || regla.id !== cot.reglaSpreadId) {
    // Otro tramo o un cliente con categoría: se calcula sobre la misma referencia
    const { decimalesTasa } = divisaHabilitada(datos, p.monedaCodigo);
    const aplicada = p.descuentoMargenPctE6 != null ? reglaConDescuento(regla, p.descuentoMargenPctE6) : regla;
    ({ compraE6, ventaE6 } = calcularPrecios(referencia.valorE6, aplicada, decimalesTasa));
  }

  return {
    cotizacionId: cot.id,
    reglaSpreadId: regla.id,
    tasaReferenciaE6: referencia.valorE6,
    tasaE6: p.tipo === "COMPRA" ? compraE6 : ventaE6,
    vigenteDesde: cot.vigenteDesde,
  };
}

/** Regla del tramo base (general, desde 0) vigente: la que muestra la pizarra. */
function reglaBaseEn(datos: Datos, monedaCodigo: string, instante: Date): ReglaSpread | null {
  const filas = datos
    .select()
    .from(reglaSpread)
    .where(
      and(
        eq(reglaSpread.monedaCodigo, monedaCodigo),
        isNull(reglaSpread.sucursalId),
        eq(reglaSpread.montoDesde, 0n),
        lte(reglaSpread.vigenteDesde, instante),
        or(isNull(reglaSpread.vigenteHasta), gt(reglaSpread.vigenteHasta, instante)),
      ),
    )
    .all();
  filas.sort((a, b) => b.prioridad - a.prioridad);
  return filas[0] ?? null;
}

export type EntradaPublicacion = {
  monedaCodigo: string;
  referenciaE6: bigint;
  tipoMargen?: "PORCENTAJE" | "MONTO_FIJO";
  margenCompraE6: bigint;
  margenVentaE6: bigint;
};

/**
 * Panel central de tipos de cambio (RF-08): registra la tasa de referencia
 * y los márgenes del tramo base, y publica la nueva pizarra. Si el margen
 * cambió, la regla anterior se cierra y se crea otra (las operaciones ya
 * registradas conservan la suya).
 */
export function publicarCotizacion(ctx: Contexto, actor: Actor, entrada: EntradaPublicacion) {
  exigirRol(actor, ["ADMIN"], "Publicar tipos de cambio");
  return enTransaccion(ctx, (tx) => {
    const ahora = ctx.ahora();
    const { decimalesTasa } = divisaHabilitada(tx, entrada.monedaCodigo);
    const tipoMargen = entrada.tipoMargen ?? "PORCENTAJE";
    exigir(entrada.referenciaE6 > 0n, "REFERENCIA_INVALIDA", "La tasa de referencia debe ser mayor que cero");
    exigir(entrada.margenCompraE6 >= 0n && entrada.margenVentaE6 >= 0n, "MARGEN_INVALIDO", "Los márgenes no pueden ser negativos");
    exigir(
      tipoMargen !== "PORCENTAJE" || entrada.margenCompraE6 < 100_000_000n,
      "MARGEN_INVALIDO",
      "El margen de compra debe ser menor que 100 %",
    );

    let precios: { compraE6: bigint; ventaE6: bigint };
    try {
      precios = calcularPrecios(entrada.referenciaE6, { ...entrada, tipoMargen }, decimalesTasa);
    } catch (error) {
      throw new ErrorNegocio("MARGEN_INVALIDO", (error as Error).message);
    }

    const base = reglaBaseEn(tx, entrada.monedaCodigo, ahora);
    const mismaRegla =
      base !== null &&
      base.tipoMargen === tipoMargen &&
      base.margenCompraE6 === entrada.margenCompraE6 &&
      base.margenVentaE6 === entrada.margenVentaE6;
    let reglaId: number;
    if (mismaRegla) {
      reglaId = base.id;
    } else {
      if (base) tx.update(reglaSpread).set({ vigenteHasta: ahora }).where(eq(reglaSpread.id, base.id)).run();
      reglaId = tx
        .insert(reglaSpread)
        .values({
          monedaCodigo: entrada.monedaCodigo,
          tipoMargen,
          margenCompraE6: entrada.margenCompraE6,
          margenVentaE6: entrada.margenVentaE6,
          montoDesde: 0n,
          montoHasta: base?.montoHasta ?? null,
          prioridad: base?.prioridad ?? 0,
          vigenteDesde: ahora,
          creadaPor: actor.id,
        })
        .returning({ id: reglaSpread.id })
        .get().id;
    }

    const tasa = tx
      .insert(tasaReferencia)
      .values({ monedaCodigo: entrada.monedaCodigo, valorE6: entrada.referenciaE6, registradaPor: actor.id, obtenidaEn: ahora })
      .returning({ id: tasaReferencia.id })
      .get();

    tx.update(cotizacion)
      .set({ vigenteHasta: ahora })
      .where(and(eq(cotizacion.monedaCodigo, entrada.monedaCodigo), isNull(cotizacion.sucursalId), isNull(cotizacion.vigenteHasta)))
      .run();
    const nueva = tx
      .insert(cotizacion)
      .values({
        monedaCodigo: entrada.monedaCodigo,
        tasaReferenciaId: tasa.id,
        reglaSpreadId: reglaId,
        precioCompraE6: precios.compraE6,
        precioVentaE6: precios.ventaE6,
        vigenteDesde: ahora,
        publicadaPor: actor.id,
      })
      .returning()
      .get();

    auditar(tx, ctx, {
      tabla: "cotizacion",
      registroId: nueva.id,
      accion: "PUBLICAR",
      usuarioId: actor.id,
      despues: { ...nueva, referenciaE6: entrada.referenciaE6, tipoMargen, margenCompraE6: entrada.margenCompraE6, margenVentaE6: entrada.margenVentaE6 },
    });
    return nueva;
  });
}

/** Pizarra vigente: una fila por divisa habilitada, en el orden configurado. */
export function pizarra(ctx: Contexto, sucursalId: number | null = null) {
  const ahora = ctx.ahora();
  const { vigenciaCotizacionMinutos } = leerParametros(ctx.db);
  const divisas = ctx.db
    .select({ cm: casaMoneda, m: moneda })
    .from(casaMoneda)
    .innerJoin(moneda, eq(moneda.codigo, casaMoneda.monedaCodigo))
    .where(eq(casaMoneda.activa, true))
    .orderBy(asc(casaMoneda.ordenPizarra), asc(casaMoneda.monedaCodigo))
    .all();

  return divisas.map(({ cm, m }) => {
    const cot = cotizacionEn(ctx.db, m.codigo, sucursalId, ahora);
    const referencia = cot ? ctx.db.select().from(tasaReferencia).where(eq(tasaReferencia.id, cot.tasaReferenciaId)).get() : undefined;
    const regla = cot ? ctx.db.select().from(reglaSpread).where(eq(reglaSpread.id, cot.reglaSpreadId)).get() : undefined;
    return {
      monedaCodigo: m.codigo,
      nombre: m.nombre,
      simbolo: m.simbolo,
      decimales: m.decimales,
      decimalesTasa: cm.decimalesTasa,
      montoMinimo: cm.montoMinimo,
      compraE6: cot?.precioCompraE6 ?? null,
      ventaE6: cot?.precioVentaE6 ?? null,
      referenciaE6: referencia?.valorE6 ?? null,
      tipoMargen: regla?.tipoMargen ?? null,
      margenCompraE6: regla?.margenCompraE6 ?? null,
      margenVentaE6: regla?.margenVentaE6 ?? null,
      vigenteDesde: cot?.vigenteDesde ?? null,
      vencida: cot ? (ahora.getTime() - cot.vigenteDesde.getTime()) / 60_000 > vigenciaCotizacionMinutos : true,
    };
  });
}
