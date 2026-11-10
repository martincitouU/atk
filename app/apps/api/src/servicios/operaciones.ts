// Compra y venta de divisas (RF-01, RF-02) con su ciclo (RF-07):
//
//   crearBorrador → editarBorrador / eliminarBorrador → confirmarOperacion
//                                                     → reversarOperacion
//
// Un borrador se puede corregir y no mueve la caja. Al confirmar se
// recalcula todo, se validan folio (RF-20) y ficha UAF (RF-17), y se mueve
// la caja (RF-04). Una confirmada solo se anula con un reverso con motivo.

import { TIPOS_DTE } from "@atk/shared";
import { and, desc, eq, getTableColumns, gte, lt, type SQL } from "drizzle-orm";
import {
  categoriaCliente,
  cliente,
  operacion,
  saldoCaja,
  tasaReferencia,
  turno,
  type MedioPago,
  type Operacion,
  type Turno,
} from "../db/esquema.ts";
import {
  dentroDeDesviacion,
  equivalenteUsd,
  formatearMonto,
  formatearTasa,
  margenBruto,
  margenRealizado,
  montoBaseDe,
  potencia10,
  type TipoOperacion,
} from "../dominio/dinero.ts";
import { fechaLocal, inicioDelDia } from "../dominio/tiempo.ts";
import { auditar } from "./auditoria.ts";
import { aplicarMovimiento } from "./caja.ts";
import { divisaHabilitada, infoMoneda, monedaBase, sucursalDeCaja } from "./catalogo.ts";
import { faltantesFicha, obtenerCliente } from "./clientes.ts";
import {
  enTransaccion,
  ErrorNegocio,
  esSupervisor,
  exigir,
  exigirRol,
  limpiar,
  type Actor,
  type Contexto,
  type Datos,
} from "./contexto.ts";
import { cotizacionEn, precioPara } from "./cotizaciones.ts";
import { leerParametros, type Parametros } from "./parametros.ts";
import { turnoAbiertoDe } from "./turnos.ts";


export type EntradaOperacion = {
  tipo: TipoOperacion;
  monedaCodigo: string;
  /** Unidad mínima de la divisa: US$ 150,25 → 15025n */
  montoDivisa: bigint;
  /** Cómo se pagan los pesos; EFECTIVO por defecto */
  medioPago?: MedioPago;
  clienteId?: number | null;
  /** Propósito de la transacción (RF-17) */
  proposito?: string | null;
  tipoDte?: number | null;
  folioDte?: number | null;
  observacion?: string | null;
  /** Tasa preferencial pedida; distinta de la pizarra requiere autorización */
  tasaSolicitadaE6?: bigint | null;
  /** Fecha y hora reales de una operación ingresada después (RF-21) */
  realizadaEn?: Date | null;
};

type Calculo = {
  tasaAplicadaE6: bigint;
  montoBase: bigint;
  tasaReferenciaE6: bigint;
  cotizacionId: number;
  reglaSpreadId: number;
  esPreferencial: boolean;
  categoriaClienteId: number | null;
  margenBruto: bigint;
  equivalenteUsd: bigint;
  realizadaEn: Date;
  registroDiferido: boolean;
};

/** Categoría de fidelización activa del cliente (RF-18), si tiene. */
function categoriaDe(datos: Datos, clienteId: number | null | undefined) {
  if (clienteId == null) return null;
  return (
    datos
      .select({ id: categoriaCliente.id, descuentoMargenPctE6: categoriaCliente.descuentoMargenPctE6 })
      .from(cliente)
      .innerJoin(categoriaCliente, eq(categoriaCliente.id, cliente.categoriaId))
      .where(and(eq(cliente.id, clienteId), eq(categoriaCliente.activa, true)))
      .get() ?? null
  );
}

/** Equivalente en USD con la referencia del dólar en ese instante (RF-17, RF-19). */
function equivalenteEnUsd(
  datos: Datos,
  p: { monedaCodigo: string; montoDivisa: bigint; montoBase: bigint; decimalesBase: number; sucursalId: number; instante: Date },
): bigint {
  if (p.monedaCodigo === "USD") return p.montoDivisa;
  const usd = infoMoneda(datos, "USD");
  const cot = cotizacionEn(datos, "USD", p.sucursalId, p.instante);
  exigir(cot, "SIN_TASA_USD", "Falta una cotización del USD para calcular los umbrales de la UAF");
  const referencia = datos.select().from(tasaReferencia).where(eq(tasaReferencia.id, cot.tasaReferenciaId)).get();
  exigir(referencia, "SIN_REFERENCIA", "La cotización del USD no tiene tasa de referencia");
  return equivalenteUsd({
    montoBase: p.montoBase,
    decimalesBase: p.decimalesBase,
    tasaUsdE6: referencia.valorE6,
    decimalesUsd: usd.decimales,
  });
}

/** Precio, montos y márgenes de una operación (RF-03), sin escribir nada. */
function calcular(datos: Datos, ctx: Contexto, parametros: Parametros, e: EntradaOperacion, elTurno: Turno): Calculo {
  const ahora = ctx.ahora();
  const sucursalId = sucursalDeCaja(datos, elTurno.cajaId);
  const divisa = divisaHabilitada(datos, e.monedaCodigo);
  const { decimales: decimalesDivisa } = infoMoneda(datos, e.monedaCodigo);
  const base = monedaBase(datos);

  exigir(e.montoDivisa > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
  exigir(
    e.montoDivisa >= divisa.montoMinimo,
    "BAJO_MINIMO",
    `El monto mínimo de ${e.monedaCodigo} es ${formatearMonto(divisa.montoMinimo, decimalesDivisa)}`,
  );

  // RF-21: una operación diferida conserva su hora real y el precio de esa hora
  let realizadaEn = ahora;
  const registroDiferido = Boolean(e.realizadaEn);
  if (e.realizadaEn) {
    const inicioDelTurno = inicioDelDia(fechaLocal(elTurno.abiertoEn, parametros.zonaHoraria), parametros.zonaHoraria);
    exigir(e.realizadaEn.getTime() < ahora.getTime(), "DIFERIDO_FUTURO", "La hora real de una operación diferida debe ser anterior a ahora");
    exigir(
      e.realizadaEn.getTime() >= inicioDelTurno.getTime(),
      "DIFERIDO_FUERA_DE_TURNO",
      "Una operación diferida debe ser del mismo día en que se abrió el turno",
    );
    realizadaEn = e.realizadaEn;
  }

  // RF-18: la categoría del cliente baja el margen sola; una tasa manual la reemplaza
  const categoria = e.tasaSolicitadaE6 == null ? categoriaDe(datos, e.clienteId) : null;
  const precio = precioPara(datos, {
    monedaCodigo: e.monedaCodigo,
    sucursalId,
    tipo: e.tipo,
    montoDivisa: e.montoDivisa,
    instante: realizadaEn,
    vigenciaMinutos: registroDiferido ? null : parametros.vigenciaCotizacionMinutos,
    descuentoMargenPctE6: categoria?.descuentoMargenPctE6 ?? null,
  });

  let tasaAplicadaE6 = precio.tasaE6;
  let esPreferencial = false;
  if (e.tasaSolicitadaE6 != null && e.tasaSolicitadaE6 !== precio.tasaE6) {
    exigir(e.tasaSolicitadaE6 > 0n, "TASA_INVALIDA", "La tasa debe ser mayor que cero");
    exigir(
      dentroDeDesviacion(e.tasaSolicitadaE6, precio.tasaE6, parametros.desviacionMaximaPreferencialPctE6),
      "DESVIACION_EXCESIVA",
      `La tasa pedida se aleja más de ${formatearTasa(parametros.desviacionMaximaPreferencialPctE6, 0)} % ` +
        `de la pizarra (${formatearTasa(precio.tasaE6, divisa.decimalesTasa)})`,
    );
    tasaAplicadaE6 = e.tasaSolicitadaE6;
    esPreferencial = true;
  }

  const montoBase = montoBaseDe({
    tipo: e.tipo,
    montoDivisa: e.montoDivisa,
    decimalesDivisa,
    tasaE6: tasaAplicadaE6,
    decimalesBase: base.decimales,
  });
  exigir(montoBase > 0n, "MONTO_INVALIDO", "El monto es demasiado bajo para esta divisa");

  return {
    tasaAplicadaE6,
    montoBase,
    tasaReferenciaE6: precio.tasaReferenciaE6,
    cotizacionId: precio.cotizacionId,
    reglaSpreadId: precio.reglaSpreadId,
    esPreferencial,
    categoriaClienteId: categoria?.id ?? null,
    margenBruto: margenBruto({
      tipo: e.tipo,
      montoDivisa: e.montoDivisa,
      decimalesDivisa,
      montoBase,
      tasaReferenciaE6: precio.tasaReferenciaE6,
      decimalesBase: base.decimales,
    }),
    equivalenteUsd: equivalenteEnUsd(datos, {
      monedaCodigo: e.monedaCodigo,
      montoDivisa: e.montoDivisa,
      montoBase,
      decimalesBase: base.decimales,
      sucursalId,
      instante: realizadaEn,
    }),
    realizadaEn,
    registroDiferido,
  };
}

/** Datos que no dependen del precio: cliente, documento tributario. */
function validarDatos(datos: Datos, e: EntradaOperacion, salvoId?: number): void {
  if (e.clienteId != null) exigir(obtenerCliente(datos, e.clienteId), "CLIENTE_NO_EXISTE", `El cliente ${e.clienteId} no existe`);
  const tieneTipo = e.tipoDte != null;
  const tieneFolio = e.folioDte != null;
  exigir(tieneTipo === tieneFolio, "DTE_INCOMPLETO", "Indique el tipo de documento tributario y su folio, o ninguno");
  if (e.tipoDte != null && e.folioDte != null) {
    exigir(
      (TIPOS_DTE as readonly number[]).includes(e.tipoDte),
      "DTE_INVALIDO",
      "El documento tributario debe ser boleta exenta (41) o factura exenta (34)",
    );
    exigir(Number.isSafeInteger(e.folioDte) && e.folioDte > 0, "DTE_INVALIDO", "El folio debe ser un número entero positivo");
    const repetido = datos
      .select({ id: operacion.id })
      .from(operacion)
      .where(and(eq(operacion.tipoDte, e.tipoDte), eq(operacion.folioDte, e.folioDte)))
      .get();
    exigir(!repetido || repetido.id === salvoId, "FOLIO_DUPLICADO", `El folio ${e.folioDte} ya está asociado a la operación ${repetido?.id}`);
  }
}

/** Requisitos UAF (RF-17): ficha completa y propósito desde el umbral o con relación permanente. */
function requiereFicha(datos: Datos, parametros: Parametros, equivalente: bigint, clienteId: number | null | undefined): boolean {
  const { decimales } = infoMoneda(datos, "USD");
  const umbral = parametros.umbralFichaClienteUsd * potencia10(decimales);
  const elCliente = clienteId != null ? obtenerCliente(datos, clienteId) : null;
  return equivalente >= umbral || Boolean(elCliente?.relacionPermanente);
}

function validarFicha(datos: Datos, parametros: Parametros, op: Operacion, equivalente: bigint): void {
  if (!requiereFicha(datos, parametros, equivalente, op.clienteId)) return;
  const elCliente = op.clienteId != null ? obtenerCliente(datos, op.clienteId) : null;
  exigir(
    elCliente,
    "FALTA_CLIENTE",
    `Las operaciones desde US$ ${formatearMonto(parametros.umbralFichaClienteUsd, 0)} exigen identificar al cliente (UAF)`,
  );
  const faltan = faltantesFicha(elCliente);
  exigir(faltan.length === 0, "FICHA_INCOMPLETA", `La ficha del cliente está incompleta: falta ${faltan.join(", ")}`);
  exigir(limpiar(op.proposito), "FALTA_PROPOSITO", "Indique el propósito de la transacción (UAF)");
}

function obtenerOperacion(datos: Datos, id: number): Operacion {
  const op = datos.select().from(operacion).where(eq(operacion.id, id)).get();
  exigir(op, "OPERACION_NO_EXISTE", `La operación ${id} no existe`);
  return op;
}

function exigirBorradorPropio(op: Operacion, actor: Actor, accion: string): void {
  exigir(
    op.estado === "BORRADOR",
    "NO_ES_BORRADOR",
    op.estado === "CONFIRMADA"
      ? "La operación ya está confirmada: no se modifica ni se elimina, solo se reversa"
      : "La operación está reversada y no se puede modificar",
  );
  exigir(op.usuarioId === actor.id, "NO_ES_PROPIA", `Solo quien registró la operación puede ${accion}`);
}

function camposDe(e: EntradaOperacion, calculo: Calculo, actor: Actor, ahora: Date) {
  // Un supervisor o admin que registra una tasa preferencial la autoriza al registrarla
  const autoriza = calculo.esPreferencial && esSupervisor(actor);
  return {
    tipo: e.tipo,
    monedaCodigo: e.monedaCodigo,
    montoDivisa: e.montoDivisa,
    medioPago: e.medioPago ?? "EFECTIVO",
    clienteId: e.clienteId ?? null,
    proposito: limpiar(e.proposito),
    tipoDte: e.tipoDte ?? null,
    folioDte: e.folioDte ?? null,
    observacion: limpiar(e.observacion),
    ...calculo,
    margenRealizado: null,
    autorizadoPor: autoriza ? actor.id : null,
    autorizadoEn: autoriza ? ahora : null,
  };
}

/** Vista previa para la pantalla: el cálculo y si exigirá ficha, sin guardar nada. */
export function previsualizarOperacion(ctx: Contexto, actor: Actor, entrada: EntradaOperacion) {
  const datos = ctx.db;
  const parametros = leerParametros(datos);
  const elTurno = turnoAbiertoDe(datos, actor.id);
  exigir(elTurno, "SIN_TURNO", "Abra un turno antes de registrar operaciones");
  const calculo = calcular(datos, ctx, parametros, entrada, elTurno);
  return { ...calculo, requiereFicha: requiereFicha(datos, parametros, calculo.equivalenteUsd, entrada.clienteId) };
}

/** Registra una operación como borrador (RF-01, RF-02). */
export function crearBorrador(ctx: Contexto, actor: Actor, entrada: EntradaOperacion): Operacion {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const elTurno = turnoAbiertoDe(tx, actor.id);
    exigir(elTurno, "SIN_TURNO", "Abra un turno antes de registrar operaciones");
    validarDatos(tx, entrada);
    const ahora = ctx.ahora();
    const calculo = calcular(tx, ctx, parametros, entrada, elTurno);

    const nueva = tx
      .insert(operacion)
      .values({
        cajaId: elTurno.cajaId,
        turnoId: elTurno.id,
        usuarioId: actor.id,
        registradaEn: ahora,
        ...camposDe(entrada, calculo, actor, ahora),
      })
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "operacion", registroId: nueva.id, accion: "CREAR", usuarioId: actor.id, despues: nueva });
    return nueva;
  });
}

/**
 * Corrige un borrador (RF-07): se recalcula todo con la pizarra vigente.
 * Si tenía una tasa preferencial autorizada, la autorización se pierde.
 */
export function editarBorrador(ctx: Contexto, actor: Actor, id: number, cambios: Partial<EntradaOperacion>): Operacion {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const actual = obtenerOperacion(tx, id);
    exigirBorradorPropio(actual, actor, "editarla");
    const elTurno = tx.select().from(turno).where(eq(turno.id, actual.turnoId ?? -1)).get();
    exigir(elTurno?.estado === "ABIERTO", "TURNO_CERRADO", "El turno de esta operación ya está cerrado");

    const valor = <K extends keyof EntradaOperacion>(campo: K, siNo: EntradaOperacion[K]) =>
      campo in cambios ? cambios[campo] : siNo;
    const entrada: EntradaOperacion = {
      tipo: cambios.tipo ?? actual.tipo,
      monedaCodigo: cambios.monedaCodigo ?? actual.monedaCodigo,
      montoDivisa: cambios.montoDivisa ?? actual.montoDivisa,
      medioPago: cambios.medioPago ?? actual.medioPago,
      clienteId: valor("clienteId", actual.clienteId),
      proposito: valor("proposito", actual.proposito),
      tipoDte: valor("tipoDte", actual.tipoDte),
      folioDte: valor("folioDte", actual.folioDte),
      observacion: valor("observacion", actual.observacion),
      tasaSolicitadaE6: valor("tasaSolicitadaE6", actual.esPreferencial ? actual.tasaAplicadaE6 : null),
      realizadaEn: valor("realizadaEn", actual.registroDiferido ? actual.realizadaEn : null),
    };
    validarDatos(tx, entrada, id);
    const ahora = ctx.ahora();
    const calculo = calcular(tx, ctx, parametros, entrada, elTurno);
    const campos = camposDe(entrada, calculo, actor, ahora);

    // La autorización de una tasa preferencial vale para el precio y el monto
    // que vio el supervisor. Si la edición no los cambia (por ejemplo, solo
    // agrega el folio de la boleta al confirmar), se conserva; si los cambia,
    // hay que autorizar de nuevo.
    const mismoPrecio =
      calculo.esPreferencial &&
      calculo.tasaAplicadaE6 === actual.tasaAplicadaE6 &&
      entrada.montoDivisa === actual.montoDivisa &&
      entrada.tipo === actual.tipo &&
      entrada.monedaCodigo === actual.monedaCodigo;
    if (mismoPrecio && campos.autorizadoPor === null && actual.autorizadoPor !== null) {
      campos.autorizadoPor = actual.autorizadoPor;
      campos.autorizadoEn = actual.autorizadoEn;
    }

    const editada = tx
      .update(operacion)
      .set(campos)
      .where(eq(operacion.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "operacion", registroId: id, accion: "EDITAR", usuarioId: actor.id, antes: actual, despues: editada });
    return editada;
  });
}

export function eliminarBorrador(ctx: Contexto, actor: Actor, id: number): void {
  enTransaccion(ctx, (tx) => {
    const actual = obtenerOperacion(tx, id);
    exigirBorradorPropio(actual, actor, "eliminarla");
    tx.delete(operacion).where(eq(operacion.id, id)).run();
    auditar(tx, ctx, { tabla: "operacion", registroId: id, accion: "ELIMINAR", usuarioId: actor.id, antes: actual });
  });
}

/** Un supervisor o admin autoriza la tasa preferencial de un borrador (también desde el teléfono). */
export function autorizarTasa(ctx: Contexto, actor: Actor, id: number): Operacion {
  exigirRol(actor, ["SUPERVISOR", "ADMIN"], "Autorizar una tasa preferencial");
  return enTransaccion(ctx, (tx) => {
    const actual = obtenerOperacion(tx, id);
    exigir(actual.estado === "BORRADOR", "NO_ES_BORRADOR", "Solo se autoriza la tasa de un borrador");
    exigir(actual.esPreferencial, "NO_ES_PREFERENCIAL", "La operación usa la tasa de pizarra: no necesita autorización");
    exigir(actual.autorizadoPor === null, "YA_AUTORIZADA", "La tasa de esta operación ya está autorizada");
    const autorizada = tx
      .update(operacion)
      .set({ autorizadoPor: actor.id, autorizadoEn: ctx.ahora() })
      .where(eq(operacion.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "operacion", registroId: id, accion: "AUTORIZAR", usuarioId: actor.id, antes: actual, despues: autorizada });
    return autorizada;
  });
}

/**
 * Mueve la caja por una operación (RF-04): la divisa siempre (es efectivo),
 * los pesos solo si se pagan en efectivo. sentido = REVERSO hace lo inverso.
 */
function moverCaja(tx: Datos, ctx: Contexto, parametros: Parametros, op: Operacion, sentido: "OPERACION" | "REVERSO", usuarioId: number) {
  const signo = sentido === "OPERACION" ? 1n : -1n;
  const descripcion = `${sentido === "OPERACION" ? "" : "Reverso de "}${op.tipo === "COMPRA" ? "compra" : "venta"} ${op.id}`;
  const comun = { cajaId: op.cajaId, turnoId: op.turnoId, tipo: sentido, operacionId: op.id, usuarioId, descripcion };

  // La casa recibe la divisa en una compra y la entrega en una venta. El
  // lote comprado entra (o sale, si se reversa) a su tasa; vender no cambia el costo.
  aplicarMovimiento(tx, ctx, parametros, {
    ...comun,
    monedaCodigo: op.monedaCodigo,
    monto: signo * (op.tipo === "COMPRA" ? op.montoDivisa : -op.montoDivisa),
    costoLoteE6: op.tipo === "COMPRA" ? op.tasaAplicadaE6 : null,
  });
  if (op.medioPago === "EFECTIVO") {
    aplicarMovimiento(tx, ctx, parametros, {
      ...comun,
      monedaCodigo: monedaBase(tx).codigo,
      monto: signo * (op.tipo === "COMPRA" ? -op.montoBase : op.montoBase),
    });
  }
}

/**
 * Confirma un borrador (RF-07). Se recalcula con la pizarra vigente: si
 * cambió desde el borrador, no se confirma (el cliente vería un precio y
 * pagaría otro). Exige folio (RF-20) y ficha UAF cuando corresponde (RF-17),
 * y mueve la caja (RF-04).
 */
export function confirmarOperacion(ctx: Contexto, actor: Actor, id: number): Operacion {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const op = obtenerOperacion(tx, id);
    exigirBorradorPropio(op, actor, "confirmarla");
    const ahora = ctx.ahora();
    const realizadaEn = op.registroDiferido ? op.realizadaEn : ahora;
    const sucursalId = sucursalDeCaja(tx, op.cajaId);
    const { decimalesTasa } = divisaHabilitada(tx, op.monedaCodigo);
    const categoria = op.esPreferencial ? null : categoriaDe(tx, op.clienteId);

    const precio = precioPara(tx, {
      monedaCodigo: op.monedaCodigo,
      sucursalId,
      tipo: op.tipo,
      montoDivisa: op.montoDivisa,
      instante: realizadaEn,
      vigenciaMinutos: op.registroDiferido ? null : parametros.vigenciaCotizacionMinutos,
      descuentoMargenPctE6: categoria?.descuentoMargenPctE6 ?? null,
    });
    if (op.esPreferencial) {
      exigir(op.autorizadoPor !== null, "FALTA_AUTORIZACION", "La tasa preferencial necesita la autorización de un supervisor");
    } else {
      exigir(
        precio.tasaE6 === op.tasaAplicadaE6,
        "PIZARRA_CAMBIO",
        `La pizarra de ${op.monedaCodigo} cambió desde que se registró el borrador ` +
          `(${formatearTasa(op.tasaAplicadaE6, decimalesTasa)} → ${formatearTasa(precio.tasaE6, decimalesTasa)}): ` +
          "edítelo para recalcular",
      );
    }

    if (parametros.folioObligatorioAlConfirmar) {
      exigir(op.tipoDte !== null && op.folioDte !== null, "FALTA_FOLIO", "Ingrese el tipo y folio del documento tributario antes de confirmar");
    }

    const { decimales: decimalesDivisa } = infoMoneda(tx, op.monedaCodigo);
    const base = monedaBase(tx);
    const equivalente = equivalenteEnUsd(tx, {
      monedaCodigo: op.monedaCodigo,
      montoDivisa: op.montoDivisa,
      montoBase: op.montoBase,
      decimalesBase: base.decimales,
      sucursalId,
      instante: realizadaEn,
    });
    validarFicha(tx, parametros, op, equivalente);

    // Margen realizado: con el costo del stock antes de entregar la divisa
    const stock = tx
      .select()
      .from(saldoCaja)
      .where(and(eq(saldoCaja.cajaId, op.cajaId), eq(saldoCaja.monedaCodigo, op.monedaCodigo)))
      .get();
    const realizado =
      op.tipo === "VENTA" && stock?.costoPromedioE6 != null
        ? margenRealizado({
            montoDivisa: op.montoDivisa,
            decimalesDivisa,
            montoBase: op.montoBase,
            costoPromedioE6: stock.costoPromedioE6,
            decimalesBase: base.decimales,
          })
        : null;

    const confirmada = tx
      .update(operacion)
      .set({
        estado: "CONFIRMADA",
        confirmadaPor: actor.id,
        confirmadaEn: ahora,
        realizadaEn,
        tasaReferenciaE6: precio.tasaReferenciaE6,
        cotizacionId: precio.cotizacionId,
        reglaSpreadId: precio.reglaSpreadId,
        categoriaClienteId: categoria?.id ?? null,
        margenBruto: margenBruto({
          tipo: op.tipo,
          montoDivisa: op.montoDivisa,
          decimalesDivisa,
          montoBase: op.montoBase,
          tasaReferenciaE6: precio.tasaReferenciaE6,
          decimalesBase: base.decimales,
        }),
        margenRealizado: realizado,
        equivalenteUsd: equivalente,
      })
      .where(eq(operacion.id, id))
      .returning()
      .get();

    moverCaja(tx, ctx, parametros, confirmada, "OPERACION", actor.id);
    auditar(tx, ctx, { tabla: "operacion", registroId: id, accion: "CONFIRMAR", usuarioId: actor.id, antes: op, despues: confirmada });
    return confirmada;
  });
}

/**
 * Anula una operación confirmada con un reverso (RF-07): exige motivo, solo
 * mientras su turno sigue abierto, y deja los movimientos inversos en el libro.
 */
export function reversarOperacion(ctx: Contexto, actor: Actor, id: number, motivo: string): Operacion {
  return enTransaccion(ctx, (tx) => {
    const parametros = leerParametros(tx);
    const motivoLimpio = limpiar(motivo);
    exigir(motivoLimpio, "FALTA_MOTIVO", "El reverso requiere un motivo");
    const op = obtenerOperacion(tx, id);
    if (parametros.reversoRequiereSupervisor) {
      exigirRol(actor, ["SUPERVISOR", "ADMIN"], "Reversar una operación");
    } else {
      exigir(esSupervisor(actor) || op.usuarioId === actor.id, "NO_ES_PROPIA", "Solo puede reversar sus propias operaciones");
    }
    if (op.estado !== "CONFIRMADA") {
      throw new ErrorNegocio(
        "NO_REVERSABLE",
        op.estado === "BORRADOR" ? "Un borrador no se reversa: se elimina" : "La operación ya está reversada",
      );
    }
    if (op.origen === "SISTEMA") {
      const elTurno = tx.select().from(turno).where(eq(turno.id, op.turnoId ?? -1)).get();
      exigir(elTurno?.estado === "ABIERTO", "TURNO_CERRADO", "Solo se reversan operaciones de un turno abierto");
    }

    const reversada = tx
      .update(operacion)
      .set({ estado: "REVERSADA", reversadaPor: actor.id, reversadaEn: ctx.ahora(), motivoReverso: motivoLimpio })
      .where(eq(operacion.id, id))
      .returning()
      .get();
    if (op.origen === "SISTEMA") moverCaja(tx, ctx, parametros, reversada, "REVERSO", actor.id);
    auditar(tx, ctx, {
      tabla: "operacion",
      registroId: id,
      accion: "REVERSAR",
      usuarioId: actor.id,
      motivo: motivoLimpio,
      antes: op,
      despues: reversada,
    });
    return reversada;
  });
}

export type FiltrosOperaciones = {
  turnoId?: number;
  cajaId?: number;
  usuarioId?: number;
  estado?: Operacion["estado"];
  monedaCodigo?: string;
  desde?: Date;
  hasta?: Date;
  limite?: number;
};

/** Una operación como se muestra: con el nombre de su cliente (null si es anónima). */
export type OperacionConCliente = Operacion & { clienteNombre: string | null };

function conNombreDeCliente(datos: Datos) {
  return datos
    .select({ ...getTableColumns(operacion), clienteNombre: cliente.nombre })
    .from(operacion)
    .leftJoin(cliente, eq(cliente.id, operacion.clienteId));
}

/** Para mostrar una operación (GET /api/operaciones/:id). */
export function verOperacion(datos: Datos, id: number): OperacionConCliente {
  const op = conNombreDeCliente(datos).where(eq(operacion.id, id)).get();
  exigir(op, "OPERACION_NO_EXISTE", `La operación ${id} no existe`);
  return op;
}

/** Operaciones de lo más reciente a lo más antiguo, filtradas por fecha real (realizada_en). */
export function listarOperaciones(datos: Datos, filtros: FiltrosOperaciones = {}): OperacionConCliente[] {
  const condiciones: SQL[] = [];
  if (filtros.turnoId !== undefined) condiciones.push(eq(operacion.turnoId, filtros.turnoId));
  if (filtros.cajaId !== undefined) condiciones.push(eq(operacion.cajaId, filtros.cajaId));
  if (filtros.usuarioId !== undefined) condiciones.push(eq(operacion.usuarioId, filtros.usuarioId));
  if (filtros.estado) condiciones.push(eq(operacion.estado, filtros.estado));
  if (filtros.monedaCodigo) condiciones.push(eq(operacion.monedaCodigo, filtros.monedaCodigo));
  if (filtros.desde) condiciones.push(gte(operacion.realizadaEn, filtros.desde));
  if (filtros.hasta) condiciones.push(lt(operacion.realizadaEn, filtros.hasta));
  return conNombreDeCliente(datos)
    .where(and(...condiciones))
    .orderBy(desc(operacion.realizadaEn), desc(operacion.id))
    .limit(Math.min(filtros.limite ?? 200, 1000))
    .all();
}
