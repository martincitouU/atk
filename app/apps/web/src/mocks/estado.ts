// Estado en memoria de los mocks: la semilla del comp y las reglas de los
// servicios del API (apps/api/src/servicios) que la interfaz tiene que ver.
// Los códigos y mensajes de ErrorNegocio están copiados de esos servicios;
// si cambian allá, cambian aquí. Lo que no imita: tramos de spread,
// categorías de cliente, tasas preferenciales y registro diferido.
//
// Por dentro, el dinero es bigint y las fechas Date; hacia afuera, cada
// función pública devuelve lo que manda la API (docs/api.md: montos como
// string, fechas ISO), así tsc comprueba que el mock respeta el contrato.

import {
  aBigint,
  type CatalogoApi,
  type Cliente,
  type ClienteApi,
  type EntradaCliente,
  type EntradaOperacion,
  type FilaArqueo,
  type FilaPizarra,
  type Gasto,
  type Moneda,
  type Operacion,
  type Parametros,
  type ResumenApi,
  type Sesion,
  type Turno,
  type Vista,
  type Yo,
} from "../api/esquemas.ts";
import {
  calcularPrecios,
  equivalenteUsd as equivalenteUsdDe,
  formatearMonto,
  formatearTasa,
  margenBruto as margenBrutoDe,
  montoBaseDe,
  potencia10,
  type TipoOperacion,
} from "@atk/shared/dinero";
import { ErrorNegocio } from "../api/cliente.ts";
import type {
  CambiosUsuario,
  Cierre,
  EntradaCotizacion,
  EntradaGasto,
  EntradaMovimiento,
  EntradaUsuario,
  Movimiento,
  RegistroAuditoria,
  Usuario as UsuarioApi,
} from "../api/esquemas.ts";

type Rol = Sesion["usuario"]["rol"];
type MedioPago = Operacion["medioPago"];
type TipoMargen = "PORCENTAJE" | "MONTO_FIJO";

type Usuario = { id: number; nombre: string; rol: Rol; email: string; clave: string; rut: string; activo: boolean };
type Divisa = Moneda & { decimalesTasa: number; montoMinimo: bigint };

type CotizacionMock = {
  id: number;
  monedaCodigo: string;
  referenciaE6: bigint;
  tipoMargen: TipoMargen;
  margenCompraE6: bigint;
  margenVentaE6: bigint;
  compraE6: bigint;
  ventaE6: bigint;
  vigenteDesde: Date;
  vigenteHasta: Date | null;
};

type OperacionMock = {
  id: number;
  turnoId: number;
  cajaId: number;
  usuarioId: number;
  tipo: TipoOperacion;
  monedaCodigo: string;
  montoDivisa: bigint;
  medioPago: MedioPago;
  clienteId: number | null;
  proposito: string | null;
  tipoDte: number | null;
  folioDte: number | null;
  tasaAplicadaE6: bigint;
  tasaReferenciaE6: bigint;
  montoBase: bigint;
  margenBruto: bigint | null;
  equivalenteUsd: bigint;
  estado: Operacion["estado"];
  motivoReverso: string | null;
  realizadaEn: Date;
};

type TurnoMock = {
  id: number;
  cajaId: number;
  usuarioId: number;
  estado: Turno["estado"];
  abiertoEn: Date;
  cerradoEn: Date | null;
  arqueo: { monedaCodigo: string; saldoSistema: bigint; saldoContado: bigint }[];
};

type MovimientoMock = {
  id: number;
  cajaId: number;
  turnoId: number | null;
  monedaCodigo: string;
  tipo: string;
  monto: bigint;
  saldoPost: bigint;
  operacionId: number | null;
  gastoId: number | null;
  descripcion: string | null;
  creadoEn: Date;
};

type GastoMock = {
  id: number;
  fecha: string;
  categoriaId: number;
  descripcion: string;
  monto: bigint;
  medioPago: MedioPago;
  estado: Gasto["estado"];
  motivoReverso: string | null;
  cajaId: number | null;
  turnoId: number | null;
  usuarioId: number;
};

type ClienteMock = Omit<Cliente, "faltantes">;
type ParametrosMock = Omit<Parametros, "umbralFichaClienteUsd" | "umbralRoeUsd"> & {
  umbralFichaClienteUsd: bigint;
  umbralRoeUsd: bigint;
};

export type Estado = {
  /** El reloj: los tests lo fijan o lo mueven. */
  ahora: () => Date;
  usuarios: Usuario[];
  /** Quién tiene la sesión abierta; null después de salir. */
  sesion: Usuario | null;
  /** La sesión de un cliente en el portal (excluye a `sesion`). */
  sesionCliente: CuentaMock | null;
  parametros: ParametrosMock;
  monedaBase: Moneda;
  /** En el orden de la pizarra: el dígito 1, 2, 3 del teclado. */
  divisas: Divisa[];
  cajas: { id: number; nombre: string }[];
  categoriasGasto: { id: number; nombre: string }[];
  cotizaciones: CotizacionMock[];
  operaciones: OperacionMock[];
  turnos: TurnoMock[];
  /** Saldo de cada moneda en la caja (hay una sola caja). */
  saldos: Map<string, bigint>;
  movimientos: MovimientoMock[];
  gastos: GastoMock[];
  clientes: ClienteMock[];
  /** Las cuentas del portal (cuentas.ts): se verifican en el local con el carnet. */
  cuentas: CuentaMock[];
  /** Unas filas de auditoría de ejemplo (la consulta del admin, RF-15). */
  auditoria: RegistroAuditoria[];
  siguiente: { cotizacion: number; operacion: number; turno: number; movimiento: number; gasto: number; cliente: number };
};

type CuentaMock = {
  id: number;
  nombre: string;
  rut: string;
  email: string;
  clave: string;
  estado: "PENDIENTE" | "VERIFICADA" | "RECHAZADA";
  clienteId: number | null;
  motivoRechazo: string | null;
  creadaEn: Date;
};

// ---------------------------------------------------------------------------
// Ayudantes

function exigir(condicion: unknown, codigo: string, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorNegocio(codigo, mensaje);
}

function limpiar(texto: string | null | undefined): string | null {
  const limpio = texto?.trim() ?? "";
  return limpio === "" ? null : limpio;
}

const iso = (d: Date) => d.toISOString();
const texto = (n: bigint) => n.toString();
const esSupervisor = (u: Usuario) => u.rol === "SUPERVISOR" || u.rol === "ADMIN";

function exigirRol(u: Usuario, roles: readonly Rol[], accion: string): void {
  if (!roles.includes(u.rol)) throw new ErrorNegocio("SIN_PERMISO", `${accion} requiere rol ${roles.join(" o ")}`);
}

/** Fecha local "AAAA-MM-DD" de un instante en la zona de la casa. */
export function fechaLocal(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

function validarFecha(fecha: string): void {
  const [a, m, d] = fecha.split("-").map(Number);
  const real = new Date(Date.UTC(a ?? NaN, (m ?? NaN) - 1, d ?? NaN));
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && !Number.isNaN(real.getTime()) && real.toISOString().slice(0, 10) === fecha;
  exigir(valida, "FECHA_INVALIDA", `"${fecha}" no es una fecha válida (AAAA-MM-DD)`);
}

const hoy = (e: Estado) => fechaLocal(e.ahora(), e.parametros.zonaHoraria);
const delDia = (e: Estado, instante: Date, dia: string) => fechaLocal(instante, e.parametros.zonaHoraria) === dia;

function usuarioActual(e: Estado): Usuario {
  exigir(e.sesion, "SIN_SESION", "Inicie sesión para continuar");
  return e.sesion;
}

function infoMoneda(e: Estado, codigo: string): Moneda {
  const moneda = codigo === e.monedaBase.codigo ? e.monedaBase : e.divisas.find((d) => d.codigo === codigo);
  exigir(moneda, "MONEDA_DESCONOCIDA", `La moneda ${codigo} no existe en el catálogo`);
  return moneda;
}

function divisaHabilitada(e: Estado, codigo: string): Divisa {
  const divisa = e.divisas.find((d) => d.codigo === codigo);
  exigir(divisa, "MONEDA_NO_HABILITADA", `La divisa ${codigo} no está habilitada en esta casa de cambio`);
  return divisa;
}

const turnoAbiertoDe = (e: Estado, usuarioId: number) =>
  e.turnos.find((t) => t.usuarioId === usuarioId && t.estado === "ABIERTO") ?? null;

const cotizacionVigente = (e: Estado, codigo: string) =>
  e.cotizaciones.find((c) => c.monedaCodigo === codigo && c.vigenteHasta === null) ?? null;

/**
 * La última cotización reemplazada: para el «cambió hace… · antes…» de la
 * pizarra. Propuesto a Martín: pizarra() de la API todavía no manda
 * compraAnteriorE6/ventaAnteriorE6; con la API real, la tasa no se enciende.
 */
function cotizacionAnterior(e: Estado, codigo: string): CotizacionMock | null {
  const viejas = e.cotizaciones.filter((c) => c.monedaCodigo === codigo && c.vigenteHasta !== null);
  return viejas.at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Vistas: del estado interno al tipo del contrato

function aOperacion(op: OperacionMock): Operacion {
  return {
    id: op.id,
    tipo: op.tipo,
    monedaCodigo: op.monedaCodigo,
    montoDivisa: texto(op.montoDivisa),
    medioPago: op.medioPago,
    tasaAplicadaE6: texto(op.tasaAplicadaE6),
    montoBase: texto(op.montoBase),
    margenBruto: op.margenBruto === null ? null : texto(op.margenBruto),
    estado: op.estado,
    folioDte: op.folioDte,
    tipoDte: op.tipoDte,
    clienteId: op.clienteId,
    motivoReverso: op.motivoReverso,
    realizadaEn: iso(op.realizadaEn),
    registroDiferido: false,
  };
}

const aTurno = (t: TurnoMock): Turno => ({
  id: t.id,
  cajaId: t.cajaId,
  estado: t.estado,
  abiertoEn: iso(t.abiertoEn),
  cerradoEn: t.cerradoEn ? iso(t.cerradoEn) : null,
});

const aGasto = (g: GastoMock): Gasto => ({
  id: g.id,
  fecha: g.fecha,
  categoriaId: g.categoriaId,
  descripcion: g.descripcion,
  monto: texto(g.monto),
  medioPago: g.medioPago,
  estado: g.estado,
  motivoReverso: g.motivoReverso,
});

/** Lo que le falta a una ficha para la UAF (faltantesFicha de clientes.ts). */
function faltantesFicha(c: ClienteMock): string[] {
  const faltan: string[] = [];
  if (!c.nacionalidad) faltan.push("nacionalidad");
  if (!c.oficio) faltan.push("oficio o profesión");
  if (!c.paisResidencia) faltan.push("país de residencia");
  if (!c.domicilio) faltan.push("domicilio");
  if (!c.telefono && !c.email) faltan.push("contacto (teléfono o email)");
  return faltan;
}

/** La ficha como la manda la API: el detalle trae `faltantesUaf`; la búsqueda, no. */
const aCliente = (c: ClienteMock): ClienteApi => ({ ...c, faltantesUaf: faltantesFicha(c) });
const enLista = (c: ClienteMock): ClienteApi => ({ ...c });

function aFilaPizarra(e: Estado, d: Divisa): FilaPizarra {
  const cot = cotizacionVigente(e, d.codigo);
  const antes = cotizacionAnterior(e, d.codigo);
  const edadMinutos = cot ? (e.ahora().getTime() - cot.vigenteDesde.getTime()) / 60_000 : Infinity;
  return {
    monedaCodigo: d.codigo,
    nombre: d.nombre,
    simbolo: d.simbolo,
    decimales: d.decimales,
    decimalesTasa: d.decimalesTasa,
    montoMinimo: texto(d.montoMinimo),
    compraE6: cot ? texto(cot.compraE6) : null,
    ventaE6: cot ? texto(cot.ventaE6) : null,
    referenciaE6: cot ? texto(cot.referenciaE6) : null,
    vigenteDesde: cot ? iso(cot.vigenteDesde) : null,
    vencida: edadMinutos > e.parametros.vigenciaCotizacionMinutos,
    tipoMargen: cot ? cot.tipoMargen : null,
    margenCompraE6: cot ? texto(cot.margenCompraE6) : null,
    margenVentaE6: cot ? texto(cot.margenVentaE6) : null,
    compraAnteriorE6: antes ? texto(antes.compraE6) : null,
    ventaAnteriorE6: antes ? texto(antes.ventaE6) : null,
  };
}

// ---------------------------------------------------------------------------
// Caja (caja.ts): todo lo que entra o sale pasa por aquí

type NuevoMovimiento = Omit<MovimientoMock, "id" | "saldoPost" | "creadoEn" | "operacionId" | "gastoId"> & {
  operacionId?: number | null;
  gastoId?: number | null;
};

/**
 * Aplica varios movimientos de una vez: primero comprueba todos los saldos y
 * después escribe, como la transacción del servicio (todo o nada).
 */
function aplicarMovimientos(e: Estado, nuevos: NuevoMovimiento[]): MovimientoMock[] {
  const saldos = new Map(e.saldos);
  for (const m of nuevos) {
    const actual = saldos.get(m.monedaCodigo) ?? 0n;
    const nuevoSaldo = actual + m.monto;
    if (nuevoSaldo < 0n && !e.parametros.permitirSaldoNegativo) {
      const { decimales } = infoMoneda(e, m.monedaCodigo);
      throw new ErrorNegocio(
        "SALDO_INSUFICIENTE",
        `Saldo insuficiente de ${m.monedaCodigo} en la caja: hay ${formatearMonto(actual, decimales)} y se necesitan ${formatearMonto(-m.monto, decimales)}`,
      );
    }
    saldos.set(m.monedaCodigo, nuevoSaldo);
  }
  const creadoEn = e.ahora();
  const corrido = new Map(e.saldos);
  const hechos = nuevos.map((m) => {
    const saldoPost = (corrido.get(m.monedaCodigo) ?? 0n) + m.monto;
    corrido.set(m.monedaCodigo, saldoPost);
    return { operacionId: null, gastoId: null, ...m, id: e.siguiente.movimiento++, saldoPost, creadoEn };
  });
  e.saldos = saldos;
  e.movimientos.push(...hechos);
  return hechos;
}

/**
 * La caja por una operación (moverCaja de operaciones.ts): la divisa siempre
 * (es efectivo), los pesos solo si se pagan en efectivo. REVERSO, al revés.
 */
function moverCaja(e: Estado, op: OperacionMock, sentido: "OPERACION" | "REVERSO"): void {
  const signo = sentido === "OPERACION" ? 1n : -1n;
  const descripcion = `${sentido === "OPERACION" ? "" : "Reverso de "}${op.tipo === "COMPRA" ? "compra" : "venta"} ${op.id}`;
  const comun = { cajaId: op.cajaId, turnoId: op.turnoId, tipo: sentido, operacionId: op.id, descripcion };
  const movimientos: NuevoMovimiento[] = [
    { ...comun, monedaCodigo: op.monedaCodigo, monto: signo * (op.tipo === "COMPRA" ? op.montoDivisa : -op.montoDivisa) },
  ];
  if (op.medioPago === "EFECTIVO") {
    movimientos.push({ ...comun, monedaCodigo: e.monedaBase.codigo, monto: signo * (op.tipo === "COMPRA" ? -op.montoBase : op.montoBase) });
  }
  aplicarMovimientos(e, movimientos);
}

// ---------------------------------------------------------------------------
// Pizarra y cotizaciones (cotizaciones.ts)

export function pizarra(e: Estado): FilaPizarra[] {
  usuarioActual(e);
  return e.divisas.map((d) => aFilaPizarra(e, d));
}

/** Publica referencia y márgenes del tramo base; devuelve la fila nueva de la pizarra. */
export function publicarCotizacion(e: Estado, entrada: EntradaCotizacion): FilaPizarra {
  exigirRol(usuarioActual(e), ["ADMIN"], "Publicar tipos de cambio");
  const divisa = divisaHabilitada(e, entrada.monedaCodigo);
  const referenciaE6 = aBigint(entrada.referenciaE6);
  const margenCompraE6 = aBigint(entrada.margenCompraE6);
  const margenVentaE6 = aBigint(entrada.margenVentaE6);
  const tipoMargen = entrada.tipoMargen ?? "PORCENTAJE";
  exigir(referenciaE6 > 0n, "REFERENCIA_INVALIDA", "La tasa de referencia debe ser mayor que cero");
  exigir(margenCompraE6 >= 0n && margenVentaE6 >= 0n, "MARGEN_INVALIDO", "Los márgenes no pueden ser negativos");
  exigir(tipoMargen !== "PORCENTAJE" || margenCompraE6 < 100_000_000n, "MARGEN_INVALIDO", "El margen de compra debe ser menor que 100 %");

  let precios: { compraE6: bigint; ventaE6: bigint };
  try {
    precios = calcularPrecios(referenciaE6, { tipoMargen, margenCompraE6, margenVentaE6 }, divisa.decimalesTasa);
  } catch (error) {
    throw new ErrorNegocio("MARGEN_INVALIDO", (error as Error).message);
  }

  const ahora = e.ahora();
  const actual = cotizacionVigente(e, divisa.codigo);
  if (actual) actual.vigenteHasta = ahora;
  e.cotizaciones.push({
    id: e.siguiente.cotizacion++,
    monedaCodigo: divisa.codigo,
    referenciaE6,
    tipoMargen,
    margenCompraE6,
    margenVentaE6,
    ...precios,
    vigenteDesde: ahora,
    vigenteHasta: null,
  });
  return aFilaPizarra(e, divisa);
}

/** Precio vigente para un tipo de operación (precioPara, sin tramos ni categorías). */
function precioPara(e: Estado, codigo: string, tipo: TipoOperacion) {
  const cot = cotizacionVigente(e, codigo);
  exigir(cot, "SIN_COTIZACION", `No hay una cotización de ${codigo} publicada para ese momento`);
  const vigencia = e.parametros.vigenciaCotizacionMinutos;
  const edadMinutos = (e.ahora().getTime() - cot.vigenteDesde.getTime()) / 60_000;
  exigir(
    edadMinutos <= vigencia,
    "COTIZACION_VENCIDA",
    `La cotización de ${codigo} tiene más de ${vigencia} minutos: publique una nueva antes de operar`,
  );
  return { tasaE6: tipo === "COMPRA" ? cot.compraE6 : cot.ventaE6, referenciaE6: cot.referenciaE6 };
}

// ---------------------------------------------------------------------------
// Operaciones (operaciones.ts)

const TIPOS_DTE: readonly number[] = [34, 41];

type Datos = {
  tipo: TipoOperacion;
  monedaCodigo: string;
  montoDivisa: bigint;
  medioPago: MedioPago;
  clienteId: number | null;
  proposito: string | null;
  tipoDte: number | null;
  folioDte: number | null;
};

const datosDe = (entrada: EntradaOperacion): Datos => ({
  tipo: entrada.tipo,
  monedaCodigo: entrada.monedaCodigo,
  montoDivisa: aBigint(entrada.montoDivisa),
  medioPago: entrada.medioPago ?? "EFECTIVO",
  clienteId: entrada.clienteId ?? null,
  proposito: limpiar(entrada.proposito),
  tipoDte: entrada.tipoDte ?? null,
  folioDte: entrada.folioDte ?? null,
});

/** Equivalente en USD con la referencia del dólar (RF-17). */
function equivalenteEnUsd(e: Estado, codigo: string, montoDivisa: bigint, montoBase: bigint): bigint {
  if (codigo === "USD") return montoDivisa;
  const usd = divisaHabilitada(e, "USD");
  const cot = cotizacionVigente(e, "USD");
  exigir(cot, "SIN_TASA_USD", "Falta una cotización del USD para calcular los umbrales de la UAF");
  return equivalenteUsdDe({ montoBase, decimalesBase: e.monedaBase.decimales, tasaUsdE6: cot.referenciaE6, decimalesUsd: usd.decimales });
}

/** Precio, montos y márgenes (calcular de operaciones.ts), sin escribir nada. */
function calcular(e: Estado, d: Datos) {
  const divisa = divisaHabilitada(e, d.monedaCodigo);
  exigir(d.montoDivisa > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
  exigir(
    d.montoDivisa >= divisa.montoMinimo,
    "BAJO_MINIMO",
    `El monto mínimo de ${d.monedaCodigo} es ${formatearMonto(divisa.montoMinimo, divisa.decimales)}`,
  );
  const precio = precioPara(e, d.monedaCodigo, d.tipo);
  const decimalesBase = e.monedaBase.decimales;
  const montoBase = montoBaseDe({ tipo: d.tipo, montoDivisa: d.montoDivisa, decimalesDivisa: divisa.decimales, tasaE6: precio.tasaE6, decimalesBase });
  exigir(montoBase > 0n, "MONTO_INVALIDO", "El monto es demasiado bajo para esta divisa");
  return {
    tasaAplicadaE6: precio.tasaE6,
    tasaReferenciaE6: precio.referenciaE6,
    montoBase,
    margenBruto: margenBrutoDe({
      tipo: d.tipo,
      montoDivisa: d.montoDivisa,
      decimalesDivisa: divisa.decimales,
      montoBase,
      tasaReferenciaE6: precio.referenciaE6,
      decimalesBase,
    }),
    equivalenteUsd: equivalenteEnUsd(e, d.monedaCodigo, d.montoDivisa, montoBase),
  };
}

/** Cliente y documento tributario (validarDatos). */
function validarDatos(e: Estado, d: Datos, salvoId?: number): void {
  if (d.clienteId !== null) {
    exigir(e.clientes.some((c) => c.id === d.clienteId), "CLIENTE_NO_EXISTE", `El cliente ${d.clienteId} no existe`);
  }
  exigir((d.tipoDte !== null) === (d.folioDte !== null), "DTE_INCOMPLETO", "Indique el tipo de documento tributario y su folio, o ninguno");
  if (d.tipoDte !== null && d.folioDte !== null) {
    exigir(TIPOS_DTE.includes(d.tipoDte), "DTE_INVALIDO", "El documento tributario debe ser boleta exenta (41) o factura exenta (34)");
    exigir(Number.isSafeInteger(d.folioDte) && d.folioDte > 0, "DTE_INVALIDO", "El folio debe ser un número entero positivo");
    const repetido = e.operaciones.find((o) => o.tipoDte === d.tipoDte && o.folioDte === d.folioDte);
    exigir(!repetido || repetido.id === salvoId, "FOLIO_DUPLICADO", `El folio ${d.folioDte} ya está asociado a la operación ${repetido?.id}`);
  }
}

function requiereFicha(e: Estado, equivalente: bigint, clienteId: number | null): boolean {
  const umbral = e.parametros.umbralFichaClienteUsd * potencia10(divisaHabilitada(e, "USD").decimales);
  const cliente = clienteId !== null ? e.clientes.find((c) => c.id === clienteId) : undefined;
  return equivalente >= umbral || Boolean(cliente?.relacionPermanente);
}

function validarFicha(e: Estado, op: OperacionMock, equivalente: bigint): void {
  if (!requiereFicha(e, equivalente, op.clienteId)) return;
  const cliente = e.clientes.find((c) => c.id === op.clienteId);
  exigir(
    cliente,
    "FALTA_CLIENTE",
    `Las operaciones desde US$ ${formatearMonto(e.parametros.umbralFichaClienteUsd, 0)} exigen identificar al cliente (UAF)`,
  );
  const faltan = faltantesFicha(cliente);
  exigir(faltan.length === 0, "FICHA_INCOMPLETA", `La ficha del cliente está incompleta: falta ${faltan.join(", ")}`);
  exigir(op.proposito, "FALTA_PROPOSITO", "Indique el propósito de la transacción (UAF)");
}

function obtenerOperacion(e: Estado, id: number): OperacionMock {
  const op = e.operaciones.find((o) => o.id === id);
  exigir(op, "OPERACION_NO_EXISTE", `La operación ${id} no existe`);
  return op;
}

function exigirBorradorPropio(op: OperacionMock, u: Usuario, accion: string): void {
  exigir(
    op.estado === "BORRADOR",
    "NO_ES_BORRADOR",
    op.estado === "CONFIRMADA"
      ? "La operación ya está confirmada: no se modifica ni se elimina, solo se reversa"
      : "La operación está reversada y no se puede modificar",
  );
  exigir(op.usuarioId === u.id, "NO_ES_PROPIA", `Solo quien registró la operación puede ${accion}`);
}

/** El libro de un día (por defecto, hoy): todas las operaciones, de la más reciente a la más antigua. */
export function libroDelDia(e: Estado, fecha?: string): Operacion[] {
  usuarioActual(e);
  const dia = fecha ?? hoy(e);
  validarFecha(dia);
  return e.operaciones
    .filter((o) => delDia(e, o.realizadaEn, dia))
    .sort((a, b) => b.realizadaEn.getTime() - a.realizadaEn.getTime() || b.id - a.id)
    .map(aOperacion);
}

/** Vista previa: el cálculo y si exigirá ficha, sin guardar nada. */
export function previsualizar(e: Estado, entrada: EntradaOperacion): Vista {
  const u = usuarioActual(e);
  exigir(turnoAbiertoDe(e, u.id), "SIN_TURNO", "Abra un turno antes de registrar operaciones");
  const d = datosDe(entrada);
  const c = calcular(e, d);
  return {
    tasaAplicadaE6: texto(c.tasaAplicadaE6),
    montoBase: texto(c.montoBase),
    margenBruto: texto(c.margenBruto),
    equivalenteUsd: texto(c.equivalenteUsd),
    requiereFicha: requiereFicha(e, c.equivalenteUsd, d.clienteId),
  };
}

/** Registra un borrador (RF-01, RF-02): no mueve la caja. */
export function crearOperacion(e: Estado, entrada: EntradaOperacion): Operacion {
  const u = usuarioActual(e);
  const turno = turnoAbiertoDe(e, u.id);
  exigir(turno, "SIN_TURNO", "Abra un turno antes de registrar operaciones");
  const d = datosDe(entrada);
  validarDatos(e, d);
  const nueva: OperacionMock = {
    id: e.siguiente.operacion,
    turnoId: turno.id,
    cajaId: turno.cajaId,
    usuarioId: u.id,
    ...d,
    ...calcular(e, d),
    estado: "BORRADOR",
    motivoReverso: null,
    realizadaEn: e.ahora(),
  };
  e.siguiente.operacion++;
  e.operaciones.push(nueva);
  return aOperacion(nueva);
}

/** Corrige un borrador (RF-07): se recalcula con la pizarra vigente. */
export function editarBorrador(e: Estado, id: number, cambios: Partial<EntradaOperacion>): Operacion {
  const u = usuarioActual(e);
  const actual = obtenerOperacion(e, id);
  exigirBorradorPropio(actual, u, "editarla");
  const turno = e.turnos.find((t) => t.id === actual.turnoId);
  exigir(turno?.estado === "ABIERTO", "TURNO_CERRADO", "El turno de esta operación ya está cerrado");
  const d: Datos = {
    tipo: cambios.tipo ?? actual.tipo,
    monedaCodigo: cambios.monedaCodigo ?? actual.monedaCodigo,
    montoDivisa: cambios.montoDivisa !== undefined ? aBigint(cambios.montoDivisa) : actual.montoDivisa,
    medioPago: cambios.medioPago ?? actual.medioPago,
    clienteId: "clienteId" in cambios ? (cambios.clienteId ?? null) : actual.clienteId,
    proposito: "proposito" in cambios ? limpiar(cambios.proposito) : actual.proposito,
    tipoDte: "tipoDte" in cambios ? (cambios.tipoDte ?? null) : actual.tipoDte,
    folioDte: "folioDte" in cambios ? (cambios.folioDte ?? null) : actual.folioDte,
  };
  validarDatos(e, d, id);
  Object.assign(actual, d, calcular(e, d), { realizadaEn: e.ahora() });
  return aOperacion(actual);
}

export function eliminarBorrador(e: Estado, id: number): void {
  const actual = obtenerOperacion(e, id);
  exigirBorradorPropio(actual, usuarioActual(e), "eliminarla");
  e.operaciones = e.operaciones.filter((o) => o.id !== id);
}

/**
 * Confirma un borrador (RF-07): recalcula con la pizarra vigente y, si cambió,
 * no confirma; exige folio (RF-20) y ficha (RF-17), y mueve la caja (RF-04).
 */
export function confirmar(e: Estado, id: number): Operacion {
  const u = usuarioActual(e);
  const op = obtenerOperacion(e, id);
  exigirBorradorPropio(op, u, "confirmarla");
  const { decimalesTasa, decimales } = divisaHabilitada(e, op.monedaCodigo);
  const precio = precioPara(e, op.monedaCodigo, op.tipo);
  exigir(
    precio.tasaE6 === op.tasaAplicadaE6,
    "PIZARRA_CAMBIO",
    `La pizarra de ${op.monedaCodigo} cambió desde que se registró el borrador ` +
      `(${formatearTasa(op.tasaAplicadaE6, decimalesTasa)} → ${formatearTasa(precio.tasaE6, decimalesTasa)}): ` +
      "edítelo para recalcular",
  );
  if (e.parametros.folioObligatorioAlConfirmar) {
    exigir(op.tipoDte !== null && op.folioDte !== null, "FALTA_FOLIO", "Ingrese el tipo y folio del documento tributario antes de confirmar");
  }
  const equivalente = equivalenteEnUsd(e, op.monedaCodigo, op.montoDivisa, op.montoBase);
  validarFicha(e, op, equivalente);

  const confirmada: OperacionMock = {
    ...op,
    estado: "CONFIRMADA",
    realizadaEn: e.ahora(),
    tasaReferenciaE6: precio.referenciaE6,
    margenBruto: margenBrutoDe({
      tipo: op.tipo,
      montoDivisa: op.montoDivisa,
      decimalesDivisa: decimales,
      montoBase: op.montoBase,
      tasaReferenciaE6: precio.referenciaE6,
      decimalesBase: e.monedaBase.decimales,
    }),
    equivalenteUsd: equivalente,
  };
  moverCaja(e, confirmada, "OPERACION"); // si falta saldo, lanza antes de cambiar nada
  Object.assign(op, confirmada);
  return aOperacion(op);
}

/** Anula una confirmada con motivo (RF-07), mientras su turno siga abierto. */
export function reversar(e: Estado, id: number, motivo: string | undefined): Operacion {
  const u = usuarioActual(e);
  const motivoLimpio = limpiar(motivo);
  exigir(motivoLimpio, "FALTA_MOTIVO", "El reverso requiere un motivo");
  const op = obtenerOperacion(e, id);
  if (e.parametros.reversoRequiereSupervisor) {
    exigirRol(u, ["SUPERVISOR", "ADMIN"], "Reversar una operación");
  } else {
    exigir(esSupervisor(u) || op.usuarioId === u.id, "NO_ES_PROPIA", "Solo puede reversar sus propias operaciones");
  }
  if (op.estado !== "CONFIRMADA") {
    throw new ErrorNegocio("NO_REVERSABLE", op.estado === "BORRADOR" ? "Un borrador no se reversa: se elimina" : "La operación ya está reversada");
  }
  const turno = e.turnos.find((t) => t.id === op.turnoId);
  exigir(turno?.estado === "ABIERTO", "TURNO_CERRADO", "Solo se reversan operaciones de un turno abierto");
  const reversada: OperacionMock = { ...op, estado: "REVERSADA", motivoReverso: motivoLimpio };
  moverCaja(e, reversada, "REVERSO");
  Object.assign(op, reversada);
  return aOperacion(op);
}

// ---------------------------------------------------------------------------
// Turnos y caja (turnos.ts, caja.ts)

export function abrirTurno(e: Estado, cajaId: number): Turno {
  const u = usuarioActual(e);
  const caja = e.cajas.find((c) => c.id === cajaId);
  exigir(caja, "CAJA_NO_DISPONIBLE", `La caja ${cajaId} no existe o está inactiva`);
  exigir(!turnoAbiertoDe(e, u.id), "YA_TIENE_TURNO", "Ya tiene un turno abierto: ciérrelo antes de abrir otro");
  const ocupada = e.turnos.find((t) => t.cajaId === cajaId && t.estado === "ABIERTO");
  const deQuien = e.usuarios.find((x) => x.id === ocupada?.usuarioId)?.nombre;
  exigir(!ocupada, "CAJA_OCUPADA", `La caja ${caja.nombre} ya tiene un turno abierto de ${deQuien}`);
  const nuevo: TurnoMock = { id: e.siguiente.turno++, cajaId, usuarioId: u.id, estado: "ABIERTO", abiertoEn: e.ahora(), cerradoEn: null, arqueo: [] };
  e.turnos.push(nuevo);
  return aTurno(nuevo);
}

export function arqueoDeTurno(e: Estado, turnoId: number): FilaArqueo[] {
  usuarioActual(e);
  const turno = e.turnos.find((t) => t.id === turnoId);
  return (turno?.arqueo ?? []).map((a) => ({
    monedaCodigo: a.monedaCodigo,
    decimales: infoMoneda(e, a.monedaCodigo).decimales,
    saldoSistema: texto(a.saldoSistema),
    saldoContado: texto(a.saldoContado),
    diferencia: texto(a.saldoContado - a.saldoSistema),
  }));
}

/** Cierra el turno con el conteo de cada moneda (RF-06). Toda moneda con saldo debe contarse. */
export function cerrarTurno(e: Estado, turnoId: number, conteoTexto: Record<string, string>): Cierre {
  const u = usuarioActual(e);
  const turno = e.turnos.find((t) => t.id === turnoId);
  exigir(turno, "TURNO_NO_EXISTE", `El turno ${turnoId} no existe`);
  exigir(turno.estado === "ABIERTO", "TURNO_CERRADO", "El turno ya está cerrado");
  exigir(turno.usuarioId === u.id || esSupervisor(u), "SIN_PERMISO", "Solo quien abrió el turno, un supervisor o un administrador puede cerrarlo");
  const borradores = e.operaciones.filter((o) => o.turnoId === turnoId && o.estado === "BORRADOR").length;
  exigir(
    borradores === 0,
    "BORRADORES_PENDIENTES",
    `El turno tiene ${borradores} operación(es) en borrador: confírmelas o elimínelas antes de cerrar`,
  );

  const conteo = new Map(Object.entries(conteoTexto).map(([codigo, monto]) => [codigo, aBigint(monto)] as const));
  for (const codigo of conteo.keys()) infoMoneda(e, codigo);
  const sinContar = [...e.saldos].filter(([codigo, saldo]) => saldo !== 0n && !conteo.has(codigo)).map(([codigo]) => codigo).sort();
  exigir(sinContar.length === 0, "FALTA_CONTEO", `Falta el conteo de: ${sinContar.join(", ")}`);
  const negativos = [...conteo].filter(([, contado]) => contado < 0n).map(([codigo]) => codigo);
  exigir(negativos.length === 0, "CONTEO_INVALIDO", `El conteo no puede ser negativo: ${negativos.join(", ")}`);

  const monedas = [...new Set([...e.saldos.keys(), ...conteo.keys()])].sort();
  turno.arqueo = monedas.map((codigo) => ({
    monedaCodigo: codigo,
    saldoSistema: e.saldos.get(codigo) ?? 0n,
    saldoContado: conteo.get(codigo) ?? 0n,
  }));
  turno.estado = "CERRADO";
  turno.cerradoEn = e.ahora();
  return { turno: aTurno(turno), arqueo: arqueoDeTurno(e, turnoId) };
}

/** Ingreso o retiro de la caja del propio turno, con motivo (RF-05). */
export function moverDinero(e: Estado, entrada: EntradaMovimiento): Movimiento {
  const u = usuarioActual(e);
  const motivo = limpiar(entrada.motivo);
  exigir(motivo, "FALTA_MOTIVO", `Indique el motivo del ${entrada.tipo === "INGRESO" ? "ingreso" : "retiro"}`);
  const monto = aBigint(entrada.monto);
  exigir(monto > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
  const turno = turnoAbiertoDe(e, u.id);
  exigir(turno, "SIN_TURNO", "Abra un turno para mover dinero de la caja");
  infoMoneda(e, entrada.monedaCodigo);
  const [m] = aplicarMovimientos(e, [
    {
      cajaId: turno.cajaId,
      turnoId: turno.id,
      monedaCodigo: entrada.monedaCodigo,
      tipo: entrada.tipo,
      monto: entrada.tipo === "INGRESO" ? monto : -monto,
      descripcion: motivo,
    },
  ]);
  if (!m) throw new Error("aplicarMovimientos no devolvió el movimiento");
  return {
    id: m.id,
    monedaCodigo: m.monedaCodigo,
    tipo: m.tipo,
    monto: texto(m.monto),
    saldoPost: texto(m.saldoPost),
    descripcion: m.descripcion,
    creadoEn: iso(m.creadoEn),
  };
}

// ---------------------------------------------------------------------------
// Gastos (gastos.ts)

export function categoriasDeGasto(e: Estado) {
  usuarioActual(e);
  return [...e.categoriasGasto].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Gastos entre dos fechas locales, ambas incluidas; sin filtros, todos. */
export function listarGastos(e: Estado, filtros: { desde?: string | undefined; hasta?: string | undefined } = {}): Gasto[] {
  usuarioActual(e);
  return e.gastos
    .filter((g) => (!filtros.desde || g.fecha >= filtros.desde) && (!filtros.hasta || g.fecha <= filtros.hasta))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id)
    .map(aGasto);
}

/** Un gasto en efectivo sale de la caja del turno; de otra forma, lo registra el administrador. */
export function registrarGasto(e: Estado, entrada: EntradaGasto): Gasto {
  const u = usuarioActual(e);
  const dia = hoy(e);
  const fecha = entrada.fecha ?? dia;
  validarFecha(fecha);
  exigir(fecha <= dia, "FECHA_FUTURA", "La fecha del gasto no puede ser futura");
  const descripcion = limpiar(entrada.descripcion);
  exigir(descripcion, "FALTA_DESCRIPCION", "Describa el gasto");
  const monto = aBigint(entrada.monto);
  exigir(monto > 0n, "MONTO_INVALIDO", "El monto debe ser mayor que cero");
  exigir(e.categoriasGasto.some((c) => c.id === entrada.categoriaId), "CATEGORIA_INVALIDA", "La categoría de gasto no existe o está inactiva");

  let turno: TurnoMock | null = null;
  if (entrada.medioPago === "EFECTIVO") {
    turno = turnoAbiertoDe(e, u.id);
    exigir(turno, "SIN_TURNO", "Un gasto en efectivo sale de la caja: abra un turno");
  } else {
    exigirRol(u, ["ADMIN"], "Registrar un gasto pagado por transferencia o tarjeta");
  }

  const id = e.siguiente.gasto;
  if (turno) {
    aplicarMovimientos(e, [
      { cajaId: turno.cajaId, turnoId: turno.id, monedaCodigo: e.monedaBase.codigo, tipo: "GASTO", monto: -monto, gastoId: id, descripcion: `Gasto: ${descripcion}` },
    ]);
  }
  const nuevo: GastoMock = {
    id,
    fecha,
    categoriaId: entrada.categoriaId,
    descripcion,
    monto,
    medioPago: entrada.medioPago,
    estado: "VIGENTE",
    motivoReverso: null,
    cajaId: turno?.cajaId ?? null,
    turnoId: turno?.id ?? null,
    usuarioId: u.id,
  };
  e.siguiente.gasto++;
  e.gastos.push(nuevo);
  return aGasto(nuevo);
}

/** Anula un gasto con motivo; si fue en efectivo, el dinero vuelve a la caja. */
export function reversarGasto(e: Estado, id: number, motivo: string | undefined): Gasto {
  const u = usuarioActual(e);
  const motivoLimpio = limpiar(motivo);
  exigir(motivoLimpio, "FALTA_MOTIVO", "El reverso requiere un motivo");
  const gasto = e.gastos.find((g) => g.id === id);
  exigir(gasto, "GASTO_NO_EXISTE", `El gasto ${id} no existe`);
  if (e.parametros.reversoRequiereSupervisor) {
    exigirRol(u, ["SUPERVISOR", "ADMIN"], "Reversar un gasto");
  } else {
    exigir(esSupervisor(u) || gasto.usuarioId === u.id, "NO_ES_PROPIO", "Solo puede reversar sus propios gastos");
  }
  exigir(gasto.estado === "VIGENTE", "NO_REVERSABLE", "El gasto ya está reversado");
  if (gasto.medioPago === "EFECTIVO") {
    const turno = e.turnos.find((t) => t.id === gasto.turnoId);
    exigir(turno?.estado === "ABIERTO", "TURNO_CERRADO", "Solo se reversan gastos en efectivo de un turno abierto");
    aplicarMovimientos(e, [
      { cajaId: turno.cajaId, turnoId: turno.id, monedaCodigo: e.monedaBase.codigo, tipo: "REVERSO", monto: gasto.monto, gastoId: id, descripcion: `Reverso del gasto ${id}` },
    ]);
  }
  gasto.estado = "REVERSADO";
  gasto.motivoReverso = motivoLimpio;
  return aGasto(gasto);
}

// ---------------------------------------------------------------------------
// Clientes (clientes.ts)

/** RUT chileno con dígito verificador correcto ("12.345.678-5" o "12345678-5"). */
function rutValido(rut: string): boolean {
  const limpio = rut.replace(/\./g, "").trim().toUpperCase();
  const partes = /^(\d{1,8})-([\dK])$/.exec(limpio);
  if (!partes) return false;
  const [, cuerpo = "", dv] = partes;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return dv === (resto === 11 ? "0" : resto === 10 ? "K" : String(resto));
}

function normalizarCliente(entrada: EntradaCliente): Omit<ClienteMock, "id"> {
  const nombre = limpiar(entrada.nombre);
  exigir(nombre, "DATO_FALTANTE", "Indique el nombre del cliente");
  let numeroDocumento = limpiar(entrada.numeroDocumento)?.toUpperCase();
  exigir(numeroDocumento, "DATO_FALTANTE", "Indique el número de documento");
  if (entrada.tipoDocumento === "RUT") {
    exigir(rutValido(numeroDocumento), "RUT_INVALIDO", `El RUT ${numeroDocumento} no es válido`);
    numeroDocumento = numeroDocumento.replace(/\./g, "");
  }
  const pais = (valor: string | null | undefined, campo: string) => {
    const codigo = limpiar(valor)?.toUpperCase() ?? null;
    exigir(codigo === null || /^[A-Z]{2}$/.test(codigo), "PAIS_INVALIDO", `${campo}: use el código ISO de 2 letras (por ejemplo CL, AR)`);
    return codigo;
  };
  return {
    tipoDocumento: entrada.tipoDocumento,
    numeroDocumento,
    nombre,
    nacionalidad: pais(entrada.nacionalidad, "Nacionalidad"),
    oficio: limpiar(entrada.oficio),
    paisResidencia: pais(entrada.paisResidencia, "País de residencia"),
    domicilio: limpiar(entrada.domicilio),
    telefono: limpiar(entrada.telefono),
    email: limpiar(entrada.email),
    relacionPermanente: entrada.relacionPermanente ?? false,
    categoriaId: entrada.categoriaId ?? null,
  };
}

/** Busca por nombre o documento, sin distinguir mayúsculas; sin texto, todos (hasta 20). */
export function buscarClientes(e: Estado, q = ""): ClienteApi[] {
  usuarioActual(e);
  const buscado = q.trim().replace(/[%_]/g, "").toLowerCase();
  return e.clientes
    .filter((c) => c.nombre.toLowerCase().includes(buscado) || c.numeroDocumento.toLowerCase().includes(buscado))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, 20)
    .map(enLista);
}

/** Un cliente por su id, con lo que le falta a su ficha. */
export function clientePorId(e: Estado, id: number): ClienteApi {
  usuarioActual(e);
  const cliente = e.clientes.find((c) => c.id === id);
  exigir(cliente, "CLIENTE_NO_EXISTE", `El cliente ${id} no existe`);
  return aCliente(cliente);
}

/** Crea un cliente, o edita el `id` si viene. */
export function guardarCliente(e: Estado, entrada: EntradaCliente, id?: number): ClienteApi {
  usuarioActual(e);
  const actual = id === undefined ? undefined : e.clientes.find((c) => c.id === id);
  if (id !== undefined) exigir(actual, "CLIENTE_NO_EXISTE", `El cliente ${id} no existe`);
  const datos = normalizarCliente(entrada);
  const existente = e.clientes.find((c) => c.tipoDocumento === datos.tipoDocumento && c.numeroDocumento === datos.numeroDocumento);
  if (existente && existente.id !== id) {
    throw new ErrorNegocio("CLIENTE_DUPLICADO", `Ya existe un cliente con ${datos.tipoDocumento} ${datos.numeroDocumento}: ${existente.nombre}`);
  }
  // El mock tiene una sola categoría de fidelización, «Frecuente» (id 1), como la semilla del API
  exigir(datos.categoriaId === null || datos.categoriaId === 1, "CATEGORIA_INVALIDA", "La categoría de cliente no existe o está inactiva");
  if (actual) {
    Object.assign(actual, datos);
    return aCliente(actual);
  }
  const nuevo: ClienteMock = { id: e.siguiente.cliente++, ...datos };
  e.clientes.push(nuevo);
  return aCliente(nuevo);
}

// ---------------------------------------------------------------------------
// Resumen de la jornada (resumen.ts), con la forma de GET /api/resumen

export function resumen(e: Estado, fecha?: string): ResumenApi {
  exigirRol(usuarioActual(e), ["SUPERVISOR", "ADMIN"], "Ver el resumen de la jornada");
  const dia = fecha ?? hoy(e);
  validarFecha(dia);
  const operaciones = e.operaciones
    .filter((o) => o.estado !== "BORRADOR" && delDia(e, o.realizadaEn, dia))
    .sort((a, b) => b.realizadaEn.getTime() - a.realizadaEn.getTime() || b.id - a.id);
  const confirmadas = operaciones.filter((o) => o.estado === "CONFIRMADA");

  const porMoneda = new Map<string, { compras: number; ventas: number; margen: bigint }>();
  let margenBruto = 0n;
  for (const op of confirmadas) {
    const t = porMoneda.get(op.monedaCodigo) ?? { compras: 0, ventas: 0, margen: 0n };
    if (op.tipo === "COMPRA") t.compras += 1;
    else t.ventas += 1;
    t.margen += op.margenBruto ?? 0n;
    margenBruto += op.margenBruto ?? 0n;
    porMoneda.set(op.monedaCodigo, t);
  }

  return {
    fecha: dia,
    saldos: {
      totales: [...e.saldos.keys()].sort().map((codigo) => ({
        monedaCodigo: codigo,
        decimales: infoMoneda(e, codigo).decimales,
        saldo: texto(e.saldos.get(codigo) ?? 0n),
      })),
    },
    operaciones: {
      confirmadas: confirmadas.length,
      reversadas: operaciones.length - confirmadas.length,
      porMoneda: [...porMoneda].map(([monedaCodigo, t]) => ({ monedaCodigo, compras: t.compras, ventas: t.ventas, margenBruto: texto(t.margen) })),
      ultimas: operaciones.slice(0, 50).map(aOperacion),
    },
    margen: { bruto: texto(margenBruto) },
    gastos: { total: texto(e.gastos.filter((g) => g.fecha === dia && g.estado === "VIGENTE").reduce((suma, g) => suma + g.monto, 0n)) },
    borradoresPendientes: e.operaciones.filter((o) => o.estado === "BORRADOR").length,
  };
}

/** GET /api/saldos?cajaId=: el mock tiene una sola caja, así que es el saldo de la casa. */
export function saldos(e: Estado, cajaId?: number) {
  usuarioActual(e);
  const caja = e.cajas[0];
  if (!caja || (cajaId !== undefined && cajaId !== caja.id)) return [];
  return [...e.saldos.keys()].sort().map((codigo) => ({
    cajaId: caja.id,
    cajaNombre: caja.nombre,
    monedaCodigo: codigo,
    decimales: infoMoneda(e, codigo).decimales,
    saldo: texto(e.saldos.get(codigo) ?? 0n),
  }));
}

// ---------------------------------------------------------------------------
// Cuentas del portal (cuentas.ts): los códigos y mensajes, copiados del servicio

const aCuenta = ({ email: _email, clave: _clave, ...c }: CuentaMock) => ({ ...c, creadaEn: iso(c.creadaEn) });

export function listarCuentas(e: Estado, estado?: string) {
  usuarioActual(e);
  return e.cuentas.filter((c) => !estado || c.estado === estado).map(aCuenta);
}

function cuentaPendiente(e: Estado, id: number): CuentaMock {
  const cuenta = e.cuentas.find((c) => c.id === id);
  exigir(cuenta, "CUENTA_NO_EXISTE", `La cuenta ${id} no existe`);
  exigir(cuenta.estado === "PENDIENTE", "CUENTA_YA_REVISADA", `La cuenta ya fue ${cuenta.estado === "VERIFICADA" ? "verificada" : "rechazada"}`);
  return cuenta;
}

export function verificarCuenta(e: Estado, id: number) {
  usuarioActual(e);
  const cuenta = cuentaPendiente(e, id);
  const ficha = e.clientes.find((c) => c.tipoDocumento === "RUT" && c.numeroDocumento === cuenta.rut);
  exigir(ficha, "SIN_FICHA", `No hay ficha de cliente con RUT ${cuenta.rut}: regístrela antes de verificar la cuenta`);
  exigir(!e.cuentas.some((c) => c.clienteId === ficha.id), "FICHA_CON_CUENTA", `El cliente con RUT ${cuenta.rut} ya tiene una cuenta verificada`);
  Object.assign(cuenta, { estado: "VERIFICADA", clienteId: ficha.id });
  return aCuenta(cuenta);
}

export function rechazarCuenta(e: Estado, id: number, motivo: string) {
  usuarioActual(e);
  const elMotivo = limpiar(motivo);
  exigir(elMotivo, "FALTA_MOTIVO", "Indique el motivo del rechazo");
  const cuenta = cuentaPendiente(e, id);
  Object.assign(cuenta, { estado: "RECHAZADA", motivoRechazo: elMotivo });
  return aCuenta(cuenta);
}

// ---------------------------------------------------------------------------
// El portal (cuentas.ts): registro y lo que ve el cliente, solo lo suyo

/** POST /api/registro: la entrada ya validada por registroCliente (@atk/shared). */
export function registrarCliente(e: Estado, entrada: { nombre: string; rut: string; email: string; contrasena: string }) {
  const email = entrada.email.trim().toLowerCase();
  exigir(!e.cuentas.some((c) => c.email === email) && !e.usuarios.some((u) => u.email === email), "CORREO_EN_USO", "Ya existe una cuenta con ese correo");
  const cuenta: CuentaMock = {
    id: Math.max(0, ...e.cuentas.map((c) => c.id)) + 1,
    nombre: entrada.nombre.trim(),
    rut: entrada.rut.replace(/\./g, "").trim().toUpperCase(),
    email,
    clave: entrada.contrasena,
    estado: "PENDIENTE",
    clienteId: null,
    motivoRechazo: null,
    creadaEn: e.ahora(),
  };
  e.cuentas.push(cuenta);
  return { nombre: cuenta.nombre, rut: cuenta.rut, estado: cuenta.estado, mensaje: "Cuenta creada. Para ver sus operaciones, acérquese al local con su carnet para verificarla." };
}

function fichaVerificada(e: Estado): number {
  const cuenta = e.sesionCliente;
  exigir(cuenta, "SIN_SESION", "Inicie sesión para continuar");
  exigir(
    cuenta.estado === "VERIFICADA" && cuenta.clienteId !== null,
    "CUENTA_NO_VERIFICADA",
    cuenta.estado === "RECHAZADA"
      ? "Su cuenta fue rechazada. Acérquese al local si cree que es un error."
      : "Su cuenta aún no está verificada. Acérquese al local con su carnet para activarla.",
  );
  return cuenta.clienteId;
}

/** GET /api/mi/operaciones: confirmadas y reversadas, sin márgenes ni quién atendió. */
export function misOperaciones(e: Estado) {
  const clienteId = fichaVerificada(e);
  return e.operaciones
    .filter((o) => o.clienteId === clienteId && o.estado !== "BORRADOR")
    .sort((a, b) => b.realizadaEn.getTime() - a.realizadaEn.getTime() || b.id - a.id)
    .map((o) => {
      const op = aOperacion(o);
      return {
        id: op.id,
        tipo: op.tipo,
        monedaCodigo: op.monedaCodigo,
        montoDivisa: op.montoDivisa,
        tasaAplicadaE6: op.tasaAplicadaE6,
        montoBase: op.montoBase,
        medioPago: op.medioPago,
        estado: op.estado,
        tipoDte: op.tipoDte,
        folioDte: op.folioDte,
        realizadaEn: op.realizadaEn,
      };
    });
}

/** GET /api/mi/ficha */
export function miFicha(e: Estado) {
  const clienteId = fichaVerificada(e);
  const c = e.clientes.find((x) => x.id === clienteId);
  exigir(c, "CLIENTE_NO_EXISTE", `El cliente ${clienteId} no existe`);
  const { nombre, tipoDocumento, numeroDocumento, nacionalidad, oficio, paisResidencia, domicilio, telefono, email } = c;
  return { nombre, tipoDocumento, numeroDocumento, nacionalidad, oficio, paisResidencia, domicilio, telefono, email };
}

// ---------------------------------------------------------------------------
// Usuarios del personal (usuarios.ts) y auditoría (auditoria.ts), solo ADMIN

const aUsuarioApi = ({ clave: _clave, ...u }: Usuario): UsuarioApi => ({ ...u, sucursalId: null, tieneCuenta: true });

function usuarioPorId(e: Estado, id: number): Usuario {
  const u = e.usuarios.find((x) => x.id === id);
  exigir(u, "USUARIO_NO_EXISTE", `El usuario ${id} no existe`);
  return u;
}

export function listarUsuarios(e: Estado): UsuarioApi[] {
  exigirRol(usuarioActual(e), ["ADMIN"], "Ver los usuarios");
  return [...e.usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map(aUsuarioApi);
}

/** La entrada ya validada por entradaUsuario (@atk/shared): el RUT y el correo, normalizados aquí como allá. */
export function crearUsuario(e: Estado, entrada: EntradaUsuario): UsuarioApi {
  exigirRol(usuarioActual(e), ["ADMIN"], "Crear usuarios");
  const rut = entrada.rut.replace(/\./g, "").trim().toUpperCase();
  const email = entrada.email.trim().toLowerCase();
  exigir(!e.usuarios.some((u) => u.rut === rut || u.email === email), "USUARIO_DUPLICADO", "Ya existe un usuario con ese RUT o correo");
  const id = Math.max(...e.usuarios.map((u) => u.id)) + 1;
  const nuevo: Usuario = { id, nombre: entrada.nombre.trim(), rol: entrada.rol, email, clave: entrada.contrasena, rut, activo: true };
  e.usuarios.push(nuevo);
  return aUsuarioApi(nuevo);
}

export function editarUsuario(e: Estado, id: number, cambios: CambiosUsuario): UsuarioApi {
  const actor = usuarioActual(e);
  exigirRol(actor, ["ADMIN"], "Editar usuarios");
  exigir(
    id !== actor.id || ((cambios.rol === undefined || cambios.rol === "ADMIN") && cambios.activo !== false),
    "SIN_PERMISO",
    "No puede quitarse el rol de administrador ni desactivarse a sí mismo",
  );
  const nombre = cambios.nombre === undefined ? undefined : limpiar(cambios.nombre);
  exigir(nombre !== null, "DATO_FALTANTE", "Indique el nombre");
  const u = usuarioPorId(e, id);
  if (nombre !== undefined) u.nombre = nombre;
  if (cambios.rol !== undefined) u.rol = cambios.rol;
  if (cambios.activo !== undefined) u.activo = cambios.activo;
  return aUsuarioApi(u);
}

export function restablecerContrasena(e: Estado, id: number, contrasena: string): void {
  exigirRol(usuarioActual(e), ["ADMIN"], "Restablecer contraseñas");
  usuarioPorId(e, id).clave = contrasena;
}

/** POST /api/auth/change-password: el código de error de Better Auth, o null si se cambió. */
export function cambiarContrasena(e: Estado, actual: string, nueva: string): "INVALID_PASSWORD" | "PASSWORD_TOO_SHORT" | null {
  const u = usuarioPorId(e, usuarioActual(e).id);
  if (u.clave !== actual) return "INVALID_PASSWORD";
  if (nueva.length < 10) return "PASSWORD_TOO_SHORT";
  u.clave = nueva;
  return null;
}

type FiltrosAuditoriaMock = { desde?: string | undefined; hasta?: string | undefined; tabla?: string | undefined; accion?: string | undefined; usuarioId?: string | undefined };

export function consultarAuditoria(e: Estado, f: FiltrosAuditoriaMock): RegistroAuditoria[] {
  exigirRol(usuarioActual(e), ["ADMIN"], "Consultar la auditoría");
  const desde = f.desde ? new Date(f.desde).getTime() : -Infinity;
  const hasta = f.hasta ? new Date(f.hasta).getTime() : Infinity;
  return e.auditoria
    .filter((a) => new Date(a.registradoEn).getTime() >= desde && new Date(a.registradoEn).getTime() < hasta)
    .filter((a) => (!f.tabla || a.tabla === f.tabla) && (!f.accion || a.accion === f.accion) && (!f.usuarioId || String(a.usuarioId) === f.usuarioId))
    .sort((a, b) => b.id - a.id);
}

// ---------------------------------------------------------------------------
// Catálogo, parámetros y sesión

/** GET /api/catalogo: la moneda base viene solo con código y decimales, y los parámetros adentro. */
export function catalogo(e: Estado): CatalogoApi {
  usuarioActual(e);
  return {
    monedaBase: { codigo: e.monedaBase.codigo, decimales: e.monedaBase.decimales },
    divisas: e.divisas.map((d) => ({ ...d, montoMinimo: texto(d.montoMinimo) })),
    cajas: e.cajas,
    categoriasGasto: categoriasDeGasto(e),
    parametros: parametros(e),
  };
}

export function parametros(e: Estado): Parametros {
  usuarioActual(e);
  const p = e.parametros;
  return { ...p, umbralFichaClienteUsd: texto(p.umbralFichaClienteUsd), umbralRoeUsd: texto(p.umbralRoeUsd) };
}

/** GET /api/yo: el personal o, en el portal, el cliente. */
export function yo(e: Estado): Yo {
  const c = e.sesionCliente;
  if (c) return { tipo: "cliente", cuenta: { nombre: c.nombre, rut: c.rut, estado: c.estado, motivoRechazo: c.motivoRechazo, creadaEn: iso(c.creadaEn) } };
  const u = usuarioActual(e);
  const turno = turnoAbiertoDe(e, u.id);
  return { tipo: "personal", usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sucursalId: null }, turnoAbierto: turno ? aTurno(turno) : null };
}

/** Better Auth en pequeño: correo y contraseña de un usuario de ejemplo. */
export function entrar(e: Estado, email: string, clave: string): Yo {
  const correo = email.trim().toLowerCase();
  const u = e.usuarios.find((x) => x.email === correo && x.clave === clave);
  const c = u ? undefined : e.cuentas.find((x) => x.email === correo && x.clave === clave);
  exigir(u ?? c, "CREDENCIALES", "Correo o contraseña incorrectos");
  e.sesion = u ?? null;
  e.sesionCliente = c ?? null;
  return yo(e);
}

export function salir(e: Estado): void {
  e.sesion = null;
  e.sesionCliente = null;
}

// ---------------------------------------------------------------------------
// La semilla: los datos de ejemplo del comp (.impeccable/mocks/decision/src/assigned.html)

const ROLANDO: Usuario = { id: 1, nombre: "Rolando del Río", rol: "ADMIN", email: "rolando@atk.cl", clave: "ventanilla", rut: "12873465-1", activo: true };

const E6 = 1_000_000n;

/**
 * Un estado nuevo con la semilla. La jornada se arma hacia atrás desde la
 * hora de creación: a las 10:44 (la hora del comp) queda idéntica al comp;
 * a otra hora, las mismas distancias (turno abierto hace 1 h 42 min, la
 * pizarra del USD cambió hace 2 min, etc.).
 */
export function crearEstado(ahora: () => Date = () => new Date()): Estado {
  const e: Estado = {
    ahora,
    usuarios: [ROLANDO],
    sesion: ROLANDO,
    sesionCliente: null,
    parametros: {
      zonaHoraria: "America/Coyhaique",
      umbralFichaClienteUsd: 5000n,
      umbralRoeUsd: 10000n,
      permitirSaldoNegativo: false,
      vigenciaCotizacionMinutos: 720,
      reversoRequiereSupervisor: true,
      folioObligatorioAlConfirmar: true,
      sesionInactividadMinutos: 15,
    },
    monedaBase: { codigo: "CLP", nombre: "Peso chileno", simbolo: "$", decimales: 0 },
    divisas: [
      { codigo: "USD", nombre: "Dólar", simbolo: "US$", decimales: 2, decimalesTasa: 2, montoMinimo: 100n },
      { codigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, montoMinimo: 100000n },
      { codigo: "EUR", nombre: "Euro", simbolo: "€", decimales: 2, decimalesTasa: 2, montoMinimo: 500n },
    ],
    cajas: [{ id: 1, nombre: "Caja 1" }],
    categoriasGasto: [
      "Arriendo",
      "Remuneraciones",
      "Servicios básicos",
      "Comisiones bancarias",
      "Transporte de valores",
      "Insumos y oficina",
      "Otros",
    ].map((nombre, i) => ({ id: i + 1, nombre })),
    cotizaciones: [],
    operaciones: [],
    turnos: [],
    saldos: new Map(),
    movimientos: [],
    gastos: [],
    clientes: [],
    cuentas: [],
    auditoria: [],
    siguiente: { cotizacion: 1, operacion: 1, turno: 1, movimiento: 1, gasto: 1, cliente: 1 },
  };
  sembrar(e);
  return e;
}

/** La jornada del comp, con las mismas funciones que usan los handlers: así la semilla cumple las reglas. */
function sembrar(e: Estado): void {
  const reloj = e.ahora;
  const creacion = reloj().getTime();
  /** Corre `accion` con el reloj `minutos` antes de la creación. */
  const hace = <T>(minutos: number, accion: () => T): T => {
    e.ahora = () => new Date(creacion - minutos * 60_000);
    return accion();
  };
  // Referencia y margen fijo (en pesos) de cada divisa: compra = ref − m, venta = ref + m
  const publicar = (monedaCodigo: string, referenciaE6: bigint, margenE6: bigint) =>
    publicarCotizacion(e, { monedaCodigo, referenciaE6: texto(referenciaE6), tipoMargen: "MONTO_FIJO", margenCompraE6: texto(margenE6), margenVentaE6: texto(margenE6) });
  const operar = (entrada: EntradaOperacion) => confirmar(e, crearOperacion(e, entrada).id);

  try {
    hace(104, () => {
      publicar("USD", 942n * E6, 7n * E6); // 935,00 / 949,00
      publicar("ARS", 665_000n, 45_000n); // 0,6200 / 0,7100
      publicar("EUR", 1032n * E6, 14n * E6); // 1.018,00 / 1.046,00
    });
    hace(102, () => {
      abrirTurno(e, 1);
      // El fondo inicial, para que la caja en pesos termine en $3.482.150 como en el comp
      for (const [monedaCodigo, monto] of [["CLP", "4378240"], ["USD", "200000"], ["ARS", "35000000"], ["EUR", "150000"]] as const) {
        moverDinero(e, { tipo: "INGRESO", monedaCodigo, monto, motivo: "Fondo inicial" });
      }
    });
    hace(84, () =>
      registrarGasto(e, { categoriaId: 6, descripcion: "Resma de papel y tinta para la impresora de boletas", monto: "18990", medioPago: "EFECTIVO" }),
    );
    hace(64, () => crearOperacion(e, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: "8000" })); // el borrador
    hace(47, () => operar({ tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: "5000", tipoDte: 41, folioDte: 18230 }));
    // El comp muestra la reversada sin folio: solo aquí se confirma sin exigirlo
    const reversada = hace(46, () => {
      e.parametros.folioObligatorioAlConfirmar = false;
      try {
        return operar({ tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: "50000" });
      } finally {
        e.parametros.folioObligatorioAlConfirmar = true;
      }
    });
    hace(43, () => reversar(e, reversada.id, "Monto mal digitado"));
    hace(29, () => operar({ tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: "120000", tipoDte: 41, folioDte: 18231 }));
    hace(13, () => operar({ tipo: "COMPRA", monedaCodigo: "ARS", montoDivisa: "15000000", tipoDte: 41, folioDte: 18232 }));
    hace(2, () => {
      publicar("USD", 943_500_000n, 8_500_000n); // 935,00 / 952,00: cambió hace 2 min, antes 949,00
      operar({ tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "30000", tipoDte: 41, folioDte: 18233 });
    });

    // Cuatro clientes de ejemplo; el último, con la ficha incompleta
    const ficha = { nacionalidad: null, oficio: null, paisResidencia: null, domicilio: null, telefono: null, email: null, relacionPermanente: false };
    for (const c of [
      { ...ficha, tipoDocumento: "RUT", numeroDocumento: "11.111.111-1", nombre: "Mariela Contreras Vidal", nacionalidad: "CL", oficio: "Comerciante", paisResidencia: "CL", domicilio: "Baquedano 512, Coyhaique", telefono: "+56 9 8123 4567", relacionPermanente: true },
      { ...ficha, tipoDocumento: "PASAPORTE", numeroDocumento: "AAB123456", nombre: "Julián Ferreyra", nacionalidad: "AR", oficio: "Guía de turismo", paisResidencia: "AR", domicilio: "Av. Rivadavia 1450, Comodoro Rivadavia", email: "jferreyra@ejemplo.com" },
      { ...ficha, tipoDocumento: "PASAPORTE", numeroDocumento: "C4R7T2K91", nombre: "Hannah Weber", nacionalidad: "DE", oficio: "Ingeniera", paisResidencia: "DE", domicilio: "Lindenstraße 8, Leipzig", email: "hannah.weber@ejemplo.com" },
      { ...ficha, tipoDocumento: "RUT", numeroDocumento: "22.222.222-2", nombre: "Pedro Soto Muñoz", nacionalidad: "CL" },
    ] satisfies EntradaCliente[]) {
      guardarCliente(e, c);
    }

    // Dos cuentas del portal por verificar: Mariela ya tiene ficha; Ana, no
    hace(30, () => {
      e.cuentas.push(
        { id: 1, nombre: "Mariela Contreras Vidal", rut: "11111111-1", email: "mariela@ejemplo.com", clave: "portal-demo-2026", estado: "PENDIENTE", clienteId: null, motivoRechazo: null, creadaEn: e.ahora() },
        { id: 2, nombre: "Ana Ruiz Toledo", rut: "12345678-5", email: "ana@ejemplo.com", clave: "portal-demo-2026", estado: "PENDIENTE", clienteId: null, motivoRechazo: null, creadaEn: e.ahora() },
      );
    });

    // La auditoría de ejemplo: lo que dejó la jornada (un gasto, la reversa con su motivo y una publicación)
    const fila = (minutos: number, tabla: string, registroId: number, accion: string, motivo: string | null, antes: unknown, despues: unknown) =>
      hace(minutos, () =>
        e.auditoria.push({ id: e.auditoria.length + 1, tabla, registroId: String(registroId), accion, motivo, datosAntes: antes, datosDespues: despues, usuarioId: 1, registradoEn: iso(e.ahora()) }),
      );
    fila(84, "gasto", 1, "CREAR", null, null, { monto: "18990", descripcion: "Resma de papel y tinta para la impresora de boletas" });
    fila(43, "operacion", reversada.id, "REVERSAR", "Monto mal digitado", { estado: "CONFIRMADA" }, { estado: "REVERSADA" });
    fila(2, "cotizacion", 4, "PUBLICAR", null, null, { monedaCodigo: "USD", referenciaE6: "943500000" });
  } finally {
    e.ahora = reloj;
  }
}
