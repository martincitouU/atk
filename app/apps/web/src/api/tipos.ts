// Lo que responde la API, tal como llega en el JSON (docs/api.md).
//
// Dos conversiones respecto de la base:
//   - bigint (montos, tasas ×10^6) → texto de dígitos: "15025". Tipo Monto.
//   - Date → texto ISO 8601: "2026-11-08T18:30:00.000Z". Tipo Instante.
// Los nombres de campos son los de la API: no se traducen ni se renombran.

import type {
  AccionAuditoria,
  EstadoCuentaCliente,
  EstadoGasto,
  EstadoOperacion,
  MedioPago,
  Rol,
  TipoDocumento,
  TipoMargen,
  TipoOperacion,
} from "@atk/shared";

export type { AccionAuditoria, EstadoCuentaCliente, EstadoGasto, EstadoOperacion, MedioPago, Rol, TipoDocumento, TipoMargen, TipoOperacion };

/** Texto de dígitos en la unidad mínima de su moneda, o ×10^6 si es tasa (*E6). */
export type Monto = string;
/** Fecha y hora ISO 8601. */
export type Instante = string;
/** Fecha sin hora en la zona de la casa: "AAAA-MM-DD". */
export type Dia = string;

// ---- Sesión -------------------------------------------------------------

export type Turno = {
  id: number;
  cajaId: number;
  usuarioId: number;
  estado: "ABIERTO" | "CERRADO";
  abiertoEn: Instante;
  cerradoEn: Instante | null;
  cerradoPor: number | null;
  observacion: string | null;
};

export type UsuarioYo = { id: number; nombre: string; email: string; rol: Rol; sucursalId: number | null };

export type CuentaYo = {
  nombre: string;
  rut: string;
  estado: EstadoCuentaCliente;
  motivoRechazo: string | null;
  creadaEn: Instante;
};

/** GET /api/yo */
export type Yo = { tipo: "personal"; usuario: UsuarioYo; turnoAbierto: Turno | null } | { tipo: "cliente"; cuenta: CuentaYo };

// ---- Catálogo y pizarra ---------------------------------------------------

export type Casa = {
  id: number;
  rut: string;
  razonSocial: string;
  nombreFantasia: string | null;
  monedaBase: string;
  creadaEn: Instante;
};

export type Divisa = {
  codigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
  decimalesTasa: number;
  montoMinimo: Monto;
  ordenPizarra: number;
};

export type Sucursal = { id: number; nombre: string; direccion: string | null; comuna: string | null; activa: boolean };
export type Caja = { id: number; sucursalId: number; nombre: string; activa: boolean };
export type CategoriaGasto = { id: number; nombre: string; activa: boolean };
export type CategoriaCliente = { id: number; nombre: string; descuentoMargenPctE6: Monto; activa: boolean };

export type Parametros = {
  zonaHoraria: string;
  /** Dólares enteros: "5000" = US$ 5.000 */
  umbralFichaClienteUsd: Monto;
  umbralRoeUsd: Monto;
  permitirSaldoNegativo: boolean;
  vigenciaCotizacionMinutos: number;
  reversoRequiereSupervisor: boolean;
  desviacionMaximaPreferencialPctE6: Monto;
  folioObligatorioAlConfirmar: boolean;
  sesionInactividadMinutos: number;
};

/** GET /api/catalogo */
export type Catalogo = {
  casa: Casa | null;
  monedaBase: { codigo: string; decimales: number } | null;
  divisas: Divisa[];
  sucursales: Sucursal[];
  cajas: Caja[];
  categoriasGasto: CategoriaGasto[];
  categoriasCliente: CategoriaCliente[];
  parametros: Parametros;
};

/** Una fila de GET /api/pizarra */
export type FilaPizarra = {
  monedaCodigo: string;
  nombre: string;
  simbolo: string;
  decimales: number;
  decimalesTasa: number;
  montoMinimo: Monto;
  compraE6: Monto | null;
  ventaE6: Monto | null;
  referenciaE6: Monto | null;
  tipoMargen: TipoMargen | null;
  margenCompraE6: Monto | null;
  margenVentaE6: Monto | null;
  vigenteDesde: Instante | null;
  vencida: boolean;
};

// ---- Operaciones ----------------------------------------------------------

export type Operacion = {
  id: number;
  cajaId: number;
  turnoId: number | null;
  usuarioId: number;
  clienteId: number | null;
  tipo: TipoOperacion;
  monedaCodigo: string;
  montoDivisa: Monto;
  medioPago: MedioPago;
  tasaAplicadaE6: Monto;
  montoBase: Monto;
  tasaReferenciaE6: Monto | null;
  cotizacionId: number | null;
  reglaSpreadId: number | null;
  esPreferencial: boolean;
  categoriaClienteId: number | null;
  autorizadoPor: number | null;
  autorizadoEn: Instante | null;
  margenBruto: Monto | null;
  margenRealizado: Monto | null;
  equivalenteUsd: Monto | null;
  proposito: string | null;
  tipoDte: number | null;
  folioDte: number | null;
  estado: EstadoOperacion;
  confirmadaPor: number | null;
  confirmadaEn: Instante | null;
  reversadaPor: number | null;
  reversadaEn: Instante | null;
  motivoReverso: string | null;
  origen: "SISTEMA" | "MIGRACION";
  loteMigracionId: number | null;
  registroDiferido: boolean;
  realizadaEn: Instante;
  registradaEn: Instante;
  observacion: string | null;
};

/** POST /api/operaciones/previsualizar */
export type Previsualizacion = {
  tasaAplicadaE6: Monto;
  montoBase: Monto;
  tasaReferenciaE6: Monto;
  cotizacionId: number;
  reglaSpreadId: number;
  esPreferencial: boolean;
  categoriaClienteId: number | null;
  margenBruto: Monto;
  equivalenteUsd: Monto;
  realizadaEn: Instante;
  registroDiferido: boolean;
  requiereFicha: boolean;
};

// ---- Turnos y caja --------------------------------------------------------

/** Una fila de GET /api/turnos/abiertos */
export type TurnoAbierto = { turno: Turno; cajaNombre: string; usuarioNombre: string };

/** Una fila de GET /api/saldos */
export type Saldo = {
  cajaId: number;
  cajaNombre: string;
  monedaCodigo: string;
  decimales: number;
  saldo: Monto;
  costoPromedioE6: Monto | null;
  actualizadoEn: Instante;
};

export type TipoMovimiento = "OPERACION" | "REVERSO" | "INGRESO" | "RETIRO" | "GASTO" | "AJUSTE";

/** Una fila de GET /api/turnos/:id/movimientos (libro de caja) */
export type MovimientoCaja = {
  id: number;
  cajaId: number;
  turnoId: number | null;
  monedaCodigo: string;
  tipo: TipoMovimiento;
  monto: Monto;
  saldoPost: Monto;
  operacionId: number | null;
  gastoId: number | null;
  usuarioId: number;
  descripcion: string | null;
  creadoEn: Instante;
};

/** Una fila de GET /api/turnos/:id/arqueo */
export type FilaArqueo = {
  monedaCodigo: string;
  decimales: number;
  saldoSistema: Monto;
  saldoContado: Monto;
  diferencia: Monto;
};

// ---- Clientes y cuentas ---------------------------------------------------

export type Cliente = {
  id: number;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nombre: string;
  nacionalidad: string | null;
  oficio: string | null;
  paisResidencia: string | null;
  domicilio: string | null;
  telefono: string | null;
  email: string | null;
  relacionPermanente: boolean;
  categoriaId: number | null;
  creadoEn: Instante;
  actualizadoEn: Instante;
};

/** GET /api/clientes/:id */
export type FichaCliente = Cliente & { faltantesUaf: string[] };

/** Una fila de GET /api/cuentas-cliente */
export type CuentaCliente = {
  id: number;
  authUserId: string;
  rut: string;
  nombre: string;
  estado: EstadoCuentaCliente;
  clienteId: number | null;
  revisadaPor: number | null;
  revisadaEn: Instante | null;
  motivoRechazo: string | null;
  creadaEn: Instante;
};

/** Una fila de GET /api/mi/operaciones: sin márgenes ni datos internos */
export type OperacionDeCliente = Pick<
  Operacion,
  "id" | "tipo" | "monedaCodigo" | "montoDivisa" | "tasaAplicadaE6" | "montoBase" | "medioPago" | "estado" | "tipoDte" | "folioDte" | "realizadaEn"
>;

/** GET /api/mi/ficha */
export type FichaDeCuenta = Pick<
  Cliente,
  "nombre" | "tipoDocumento" | "numeroDocumento" | "nacionalidad" | "oficio" | "paisResidencia" | "domicilio" | "telefono" | "email"
>;

// ---- Gastos, consultas y usuarios ------------------------------------------

export type Gasto = {
  id: number;
  fecha: Dia;
  categoriaId: number;
  descripcion: string;
  monto: Monto;
  medioPago: MedioPago;
  cajaId: number | null;
  turnoId: number | null;
  documento: string | null;
  estado: EstadoGasto;
  reversadoPor: number | null;
  reversadoEn: Instante | null;
  motivoReverso: string | null;
  usuarioId: number;
  registradoEn: Instante;
};

export type TotalesMoneda = {
  monedaCodigo: string;
  compras: number;
  ventas: number;
  divisaComprada: Monto;
  divisaVendida: Monto;
  basePagada: Monto;
  baseCobrada: Monto;
  margenBruto: Monto;
  margenRealizado: Monto;
};

/** GET /api/resumen */
export type Resumen = {
  fecha: Dia;
  zonaHoraria: string;
  saldos: { porCaja: Saldo[]; totales: { monedaCodigo: string; decimales: number; saldo: Monto }[] };
  operaciones: { confirmadas: number; reversadas: number; porMoneda: TotalesMoneda[]; ultimas: Operacion[] };
  margen: { bruto: Monto; realizado: Monto };
  gastos: { cantidad: number; total: Monto };
  borradoresPendientes: number;
  turnosAbiertos: TurnoAbierto[];
};

/** Una fila de GET /api/auditoria */
export type RegistroAuditoria = {
  id: number;
  tabla: string;
  registroId: string;
  accion: AccionAuditoria;
  motivo: string | null;
  datosAntes: unknown;
  datosDespues: unknown;
  usuarioId: number;
  registradoEn: Instante;
};

/** Una fila de GET /api/usuarios */
export type Usuario = {
  id: number;
  sucursalId: number | null;
  rut: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creadoEn: Instante;
  tieneCuenta: boolean;
};
