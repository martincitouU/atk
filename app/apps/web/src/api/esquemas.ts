// Lo que responde la API (docs/api.md) y lo que ven las pantallas.
//
// Las ENTRADAS se validan con los esquemas de @atk/shared, los mismos que usa
// la API (strictObject: un campo de más es un 400). Aquí van sus tipos de
// entrada (z.input: montos como texto).
//
// Las RESPUESTAS no están tipadas en @atk/shared: van aquí. Cada esquema lee
// la respuesta tal como llega (z.input) y, donde la pantalla necesita otra
// forma, un transform la arma (z.output). Así la diferencia vive en un solo
// lugar y las pantallas no cambian si la API se ajusta.

import {
  cambiosOperacion,
  entradaCliente,
  entradaGasto,
  entradaIngresoRetiro,
  entradaOperacion,
  entradaPublicacion,
  ESTADOS_GASTO,
  ESTADOS_OPERACION,
  MEDIOS_PAGO,
  ROLES,
  TIPOS_DOCUMENTO,
  TIPOS_MARGEN,
  TIPOS_OPERACION,
} from "@atk/shared";
import { potencia10 } from "@atk/shared/dinero";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Piezas

/** Monto o tasa como texto de dígitos (la API nunca manda number para dinero). */
export const dinero = z.string().regex(/^-?\d+$/, "monto entero en unidad mínima");
export const aBigint = (s: string): bigint => BigInt(dinero.parse(s));
const fecha = z.string(); // ISO 8601
const nulo = <T extends z.ZodType>(t: T) => t.nullable();
const id = z.number().int();

/** Todo error de la API: { error: { codigo, mensaje, detalles? } }. */
export const ErrorApi = z.object({
  error: z.object({
    codigo: z.string(),
    mensaje: z.string(),
    detalles: z.array(z.object({ campo: z.string(), mensaje: z.string() })).optional(),
  }),
});
/** Las 4 rutas de /api/auth/* son de Better Auth: { message, code }. */
export const ErrorAuth = z.object({ code: z.string(), message: z.string().optional() });

export const MedioPago = z.enum(MEDIOS_PAGO);
export const TipoMargen = z.enum(TIPOS_MARGEN);

// ---------------------------------------------------------------------------
// Entradas (tipos de @atk/shared)

export type EntradaOperacion = z.input<typeof entradaOperacion>;
export type CambiosOperacion = z.input<typeof cambiosOperacion>;
export type EntradaCliente = z.input<typeof entradaCliente>;
export type EntradaCotizacion = z.input<typeof entradaPublicacion>;
export type EntradaGasto = z.input<typeof entradaGasto>;
export type EntradaMovimiento = z.input<typeof entradaIngresoRetiro>;
/** POST /api/auth/sign-in/email (Better Auth). */
export const EntradaSesion = z.object({ email: z.string(), password: z.string() });
export type EntradaSesion = z.infer<typeof EntradaSesion>;

// ---------------------------------------------------------------------------
// Respuestas

export const Moneda = z.object({ codigo: z.string(), nombre: z.string(), simbolo: z.string(), decimales: z.number().int() });
export const Divisa = Moneda.extend({ decimalesTasa: z.number().int(), montoMinimo: dinero });

export const FilaPizarra = z.object({
  monedaCodigo: z.string(),
  nombre: z.string(),
  simbolo: z.string(),
  decimales: z.number().int(),
  decimalesTasa: z.number().int(),
  montoMinimo: dinero,
  compraE6: nulo(dinero),
  ventaE6: nulo(dinero),
  referenciaE6: nulo(dinero),
  vigenteDesde: nulo(fecha),
  vencida: z.boolean(),
  // la regla vigente: «Actualizar pizarra» parte de ella
  tipoMargen: nulo(TipoMargen).optional(),
  margenCompraE6: nulo(dinero).optional(),
  margenVentaE6: nulo(dinero).optional(),
  // ponytail: la API no los manda; el «antes 949,00» aparece cuando los mande
  compraAnteriorE6: nulo(dinero).optional(),
  ventaAnteriorE6: nulo(dinero).optional(),
});

export const Operacion = z.object({
  id,
  tipo: z.enum(TIPOS_OPERACION),
  monedaCodigo: z.string(),
  montoDivisa: dinero,
  medioPago: MedioPago,
  tasaAplicadaE6: dinero,
  montoBase: dinero,
  margenBruto: nulo(dinero),
  estado: z.enum(ESTADOS_OPERACION),
  folioDte: nulo(z.number().int()),
  tipoDte: nulo(z.number().int()),
  clienteId: nulo(id),
  motivoReverso: nulo(z.string()),
  realizadaEn: fecha,
  registroDiferido: z.boolean(),
});

/** POST /api/operaciones/previsualizar */
export const Vista = z.object({
  tasaAplicadaE6: dinero,
  montoBase: dinero,
  margenBruto: dinero,
  equivalenteUsd: dinero,
  requiereFicha: z.boolean(),
});

export const Turno = z.object({ id, cajaId: id, estado: z.enum(["ABIERTO", "CERRADO"]), abiertoEn: fecha, cerradoEn: nulo(fecha) });
export const SaldoMoneda = z.object({ monedaCodigo: z.string(), decimales: z.number().int(), saldo: dinero });
export const FilaArqueo = z.object({
  monedaCodigo: z.string(),
  decimales: z.number().int(),
  saldoSistema: dinero,
  saldoContado: dinero,
  diferencia: dinero,
});
/** POST /api/turnos/:id/cerrar */
export const Cierre = z.object({ turno: Turno, arqueo: z.array(FilaArqueo) });

/** POST /api/caja/movimientos */
export const Movimiento = z.object({
  id,
  monedaCodigo: z.string(),
  tipo: z.string(),
  monto: dinero,
  saldoPost: dinero,
  descripcion: nulo(z.string()),
  creadoEn: fecha,
});

/** POST /api/cotizaciones responde la cotización publicada; la pantalla relee la pizarra. */
export const Cotizacion = z.object({ monedaCodigo: z.string() });

export const CategoriaGasto = z.object({ id, nombre: z.string() });
export const Gasto = z.object({
  id,
  fecha: z.string(),
  categoriaId: id,
  descripcion: z.string(),
  monto: dinero,
  medioPago: MedioPago,
  estado: z.enum(ESTADOS_GASTO),
  motivoReverso: nulo(z.string()),
});

/**
 * Lo que le falta a una ficha para la UAF. Repite faltantesFicha
 * (apps/api/src/servicios/clientes.ts): la búsqueda de la API no trae
 * `faltantesUaf` y la lista los necesita.
 * ponytail: copia de una regla del servicio; se va si la búsqueda los manda.
 */
function faltantesDe(c: { nacionalidad: string | null; oficio: string | null; paisResidencia: string | null; domicilio: string | null; telefono: string | null; email: string | null }): string[] {
  const faltan: string[] = [];
  if (!c.nacionalidad) faltan.push("nacionalidad");
  if (!c.oficio) faltan.push("oficio o profesión");
  if (!c.paisResidencia) faltan.push("país de residencia");
  if (!c.domicilio) faltan.push("domicilio");
  if (!c.telefono && !c.email) faltan.push("contacto (teléfono o email)");
  return faltan;
}

/** GET /api/clientes y /api/clientes/:id (solo el detalle trae `faltantesUaf`). */
export const Cliente = z
  .object({
    id,
    tipoDocumento: z.enum(TIPOS_DOCUMENTO),
    numeroDocumento: z.string(),
    nombre: z.string(),
    nacionalidad: nulo(z.string()),
    oficio: nulo(z.string()),
    paisResidencia: nulo(z.string()),
    domicilio: nulo(z.string()),
    telefono: nulo(z.string()),
    email: nulo(z.string()),
    relacionPermanente: z.boolean(),
    categoriaId: nulo(id),
    faltantesUaf: z.array(z.string()).optional(),
  })
  .transform(({ faltantesUaf, ...c }) => ({ ...c, faltantes: faltantesUaf ?? faltantesDe(c) }));

export const Parametros = z.object({
  zonaHoraria: z.string(),
  umbralFichaClienteUsd: dinero,
  umbralRoeUsd: dinero,
  permitirSaldoNegativo: z.boolean(),
  vigenciaCotizacionMinutos: z.number().int(),
  reversoRequiereSupervisor: z.boolean(),
  folioObligatorioAlConfirmar: z.boolean(),
  sesionInactividadMinutos: z.number().int(),
});

/**
 * Billetes por moneda, en unidades enteras de la moneda. No hay tabla de
 * denominaciones: el Cierre cuenta billete por billete y envía el total.
 * ponytail: lista fija del front; se va si la API agrega la tabla.
 */
const BILLETES: Record<string, number[]> = {
  USD: [100, 50, 20, 10, 5, 1],
  ARS: [20000, 10000, 2000, 1000, 500],
  EUR: [200, 100, 50, 20, 10, 5],
  BRL: [200, 100, 50, 20, 10, 5],
  CLP: [20000, 10000, 5000, 2000, 1000],
};

/** Nombre y símbolo de la moneda base: /api/catalogo trae solo su código y decimales. */
const MONEDAS_BASE: Record<string, { nombre: string; simbolo: string }> = { CLP: { nombre: "Peso chileno", simbolo: "$" } };

/** GET /api/catalogo, pedido una vez al entrar. */
export const Catalogo = z
  .object({
    monedaBase: nulo(z.object({ codigo: z.string(), decimales: z.number().int() })),
    divisas: z.array(Divisa),
    cajas: z.array(z.object({ id, nombre: z.string() })),
    categoriasGasto: z.array(CategoriaGasto),
    parametros: Parametros,
  })
  .transform(({ monedaBase, ...c }) => {
    const base = monedaBase ?? { codigo: "CLP", decimales: 0 };
    const baseCompleta = { ...base, ...(MONEDAS_BASE[base.codigo] ?? { nombre: base.codigo, simbolo: "$" }) };
    const denominaciones = Object.fromEntries(
      [baseCompleta, ...c.divisas].map((m) => [m.codigo, (BILLETES[m.codigo] ?? []).map((b) => (BigInt(b) * potencia10(m.decimales)).toString())]),
    );
    return { ...c, monedaBase: baseCompleta, denominaciones };
  });

/** GET /api/resumen (supervisor y admin). La pantalla lo lee aplanado. */
export const Resumen = z
  .object({
    fecha: z.string(),
    saldos: z.object({ totales: z.array(SaldoMoneda) }),
    operaciones: z.object({
      confirmadas: z.number().int(),
      reversadas: z.number().int(),
      porMoneda: z.array(z.object({ monedaCodigo: z.string(), compras: z.number().int(), ventas: z.number().int(), margenBruto: dinero })),
      ultimas: z.array(Operacion),
    }),
    margen: z.object({ bruto: dinero }),
    gastos: z.object({ total: dinero }),
    borradoresPendientes: z.number().int(),
  })
  .transform((r) => ({
    fecha: r.fecha,
    saldos: r.saldos.totales,
    porMoneda: r.operaciones.porMoneda,
    confirmadas: r.operaciones.confirmadas,
    reversadas: r.operaciones.reversadas,
    margenBruto: r.margen.bruto,
    gastosTotal: r.gastos.total,
    borradoresPendientes: r.borradoresPendientes,
    ultimas: r.operaciones.ultimas,
  }));

/** GET /api/yo: lo primero que se pide al cargar. */
export const Yo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("personal"),
    usuario: z.object({ id, nombre: z.string(), email: z.string(), rol: z.enum(ROLES), sucursalId: nulo(id) }),
    turnoAbierto: nulo(Turno),
  }),
  z.object({
    tipo: z.literal("cliente"),
    cuenta: z.object({ nombre: z.string(), rut: z.string(), estado: z.string(), motivoRechazo: nulo(z.string()), creadaEn: fecha }),
  }),
]);

/** Quién está y su turno: lo que usan el riel y las pantallas del personal. */
export const Sesion = z.object({ usuario: z.object({ id, nombre: z.string(), rol: z.enum(ROLES) }), turno: nulo(Turno) });

// ---------------------------------------------------------------------------
// Rutas (docs/api.md)

export const RUTAS = {
  yo: "/api/yo",
  entrar: "/api/auth/sign-in/email",
  salir: "/api/auth/sign-out",
  pizarra: "/api/pizarra",
  cotizaciones: "/api/cotizaciones",
  previsualizar: "/api/operaciones/previsualizar",
  operaciones: "/api/operaciones",
  operacion: (id: number) => `/api/operaciones/${id}`,
  confirmar: (id: number) => `/api/operaciones/${id}/confirmar`,
  reversar: (id: number) => `/api/operaciones/${id}/reversar`,
  turnos: "/api/turnos",
  cerrarTurno: (id: number) => `/api/turnos/${id}/cerrar`,
  arqueo: (id: number) => `/api/turnos/${id}/arqueo`,
  movimientos: "/api/caja/movimientos",
  gastos: "/api/gastos",
  reversarGasto: (id: number) => `/api/gastos/${id}/reversar`,
  clientes: "/api/clientes",
  cliente: (id: number) => `/api/clientes/${id}`,
  resumen: "/api/resumen",
  catalogo: "/api/catalogo",
} as const;

// ---------------------------------------------------------------------------
// Tipos: z.output es lo que ve la pantalla; z.input, lo que manda la API (los mocks)

export type Moneda = z.infer<typeof Moneda>;
export type Divisa = z.infer<typeof Divisa>;
export type FilaPizarra = z.infer<typeof FilaPizarra>;
export type Operacion = z.infer<typeof Operacion>;
export type Vista = z.infer<typeof Vista>;
export type Turno = z.infer<typeof Turno>;
export type SaldoMoneda = z.infer<typeof SaldoMoneda>;
export type FilaArqueo = z.infer<typeof FilaArqueo>;
export type Cierre = z.infer<typeof Cierre>;
export type Movimiento = z.infer<typeof Movimiento>;
export type CategoriaGasto = z.infer<typeof CategoriaGasto>;
export type Gasto = z.infer<typeof Gasto>;
export type Cliente = z.output<typeof Cliente>;
export type ClienteApi = z.input<typeof Cliente>;
export type Parametros = z.infer<typeof Parametros>;
export type Catalogo = z.output<typeof Catalogo>;
export type CatalogoApi = z.input<typeof Catalogo>;
export type Resumen = z.output<typeof Resumen>;
export type ResumenApi = z.input<typeof Resumen>;
export type Yo = z.infer<typeof Yo>;
export type Sesion = z.infer<typeof Sesion>;
export type ErrorApi = z.infer<typeof ErrorApi>;
