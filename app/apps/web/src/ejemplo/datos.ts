// DATOS DE EJEMPLO DEL ESQUELETO (fase F1). Se borran en F2, cuando las
// vistas lean la API de verdad.
//
// Tienen exactamente la forma de las respuestas de la API (api/tipos.ts) y
// los valores de la semilla de desarrollo (db/semillas/ejemplo.sql), así las
// vistas no cambian al conectarlas. Los montos son coherentes entre sí, pero
// están escritos a mano: el front nunca calcula dinero.

import type {
  Catalogo,
  CuentaCliente,
  FichaCliente,
  FichaDeCuenta,
  FilaArqueo,
  FilaPizarra,
  Gasto,
  MovimientoCaja,
  Operacion,
  OperacionDeCliente,
  Previsualizacion,
  RegistroAuditoria,
  Resumen,
  Saldo,
  Turno,
  TurnoAbierto,
  Usuario,
  Yo,
} from "../api/tipos.ts";
import { hoy } from "../lib/fechas.ts";

/** Hace `minutos` minutos, en ISO. */
const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();

// ---- Catálogo -------------------------------------------------------------

export const catalogo: Catalogo = {
  casa: {
    id: 1,
    rut: "76123456-0",
    razonSocial: "Casa de Cambio Demo SpA",
    nombreFantasia: "Cambios Demo",
    monedaBase: "CLP",
    creadaEn: hace(60 * 24 * 30),
  },
  monedaBase: { codigo: "CLP", decimales: 0 },
  divisas: [
    { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", decimales: 2, decimalesTasa: 2, montoMinimo: "100", ordenPizarra: 1 },
    { codigo: "EUR", nombre: "Euro", simbolo: "€", decimales: 2, decimalesTasa: 2, montoMinimo: "500", ordenPizarra: 2 },
    { codigo: "BRL", nombre: "Real brasileño", simbolo: "R$", decimales: 2, decimalesTasa: 2, montoMinimo: "1000", ordenPizarra: 3 },
    { codigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, montoMinimo: "100000", ordenPizarra: 4 },
  ],
  sucursales: [{ id: 1, nombre: "Casa Matriz", direccion: "Dirección de ejemplo 123", comuna: "Coyhaique", activa: true }],
  cajas: [
    { id: 1, sucursalId: 1, nombre: "Caja 1", activa: true },
    { id: 2, sucursalId: 1, nombre: "Caja 2", activa: true },
  ],
  categoriasGasto: [
    { id: 1, nombre: "Arriendo", activa: true },
    { id: 2, nombre: "Remuneraciones", activa: true },
    { id: 3, nombre: "Servicios básicos", activa: true },
    { id: 4, nombre: "Comisiones bancarias", activa: true },
    { id: 5, nombre: "Transporte de valores", activa: true },
    { id: 6, nombre: "Insumos y oficina", activa: true },
    { id: 7, nombre: "Otros", activa: true },
  ],
  categoriasCliente: [{ id: 1, nombre: "Frecuente", descuentoMargenPctE6: "30000000", activa: true }],
  parametros: {
    zonaHoraria: "America/Coyhaique",
    umbralFichaClienteUsd: "5000",
    umbralRoeUsd: "10000",
    permitirSaldoNegativo: false,
    vigenciaCotizacionMinutos: 720,
    reversoRequiereSupervisor: true,
    desviacionMaximaPreferencialPctE6: "5000000",
    folioObligatorioAlConfirmar: true,
    sesionInactividadMinutos: 15,
  },
};

/** Nombre de cada usuario (la API entrega solo ids; ver nota en F2). */
export const nombresUsuarios: Record<number, string> = { 1: "Administrador", 2: "Supervisor", 3: "Cajero", 4: "Cajera 2" };

// ---- Sesiones para entrar sin API -------------------------------------------

const turnoCajero: Turno = {
  id: 5,
  cajaId: 1,
  usuarioId: 3,
  estado: "ABIERTO",
  abiertoEn: hace(185),
  cerradoEn: null,
  cerradoPor: null,
  observacion: null,
};

export const sesiones = {
  cajero: { tipo: "personal", usuario: { id: 3, nombre: "Cajero", email: "cajero@demo.cl", rol: "CAJERO", sucursalId: 1 }, turnoAbierto: turnoCajero },
  supervisor: { tipo: "personal", usuario: { id: 2, nombre: "Supervisor", email: "supervisor@demo.cl", rol: "SUPERVISOR", sucursalId: 1 }, turnoAbierto: null },
  admin: { tipo: "personal", usuario: { id: 1, nombre: "Administrador", email: "admin@demo.cl", rol: "ADMIN", sucursalId: null }, turnoAbierto: null },
  clientePendiente: {
    tipo: "cliente",
    cuenta: { nombre: "Ana Pérez", rut: "15555567-K", estado: "PENDIENTE", motivoRechazo: null, creadaEn: hace(60 * 26) },
  },
  clienteVerificado: {
    tipo: "cliente",
    cuenta: { nombre: "Cliente Incompleto de Prueba", rut: "12345678-5", estado: "VERIFICADA", motivoRechazo: null, creadaEn: hace(60 * 24 * 12) },
  },
} satisfies Record<string, Yo>;

export type SesionEjemplo = keyof typeof sesiones;

// ---- Pizarra ----------------------------------------------------------------

const publicada = hace(95);

export const pizarra: FilaPizarra[] = [
  {
    monedaCodigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", decimales: 2, decimalesTasa: 2, montoMinimo: "100",
    compraE6: "925900000", ventaE6: "954100000", referenciaE6: "940000000",
    tipoMargen: "PORCENTAJE", margenCompraE6: "1500000", margenVentaE6: "1500000", vigenteDesde: publicada, vencida: false,
  },
  {
    monedaCodigo: "EUR", nombre: "Euro", simbolo: "€", decimales: 2, decimalesTasa: 2, montoMinimo: "500",
    compraE6: "999600000", ventaE6: "1040400000", referenciaE6: "1020000000",
    tipoMargen: "PORCENTAJE", margenCompraE6: "2000000", margenVentaE6: "2000000", vigenteDesde: publicada, vencida: false,
  },
  {
    monedaCodigo: "BRL", nombre: "Real brasileño", simbolo: "R$", decimales: 2, decimalesTasa: 2, montoMinimo: "1000",
    compraE6: "164900000", ventaE6: "175100000", referenciaE6: "170000000",
    tipoMargen: "PORCENTAJE", margenCompraE6: "3000000", margenVentaE6: "3000000", vigenteDesde: publicada, vencida: false,
  },
  {
    monedaCodigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, montoMinimo: "100000",
    compraE6: "712500", ventaE6: "787500", referenciaE6: "750000",
    tipoMargen: "PORCENTAJE", margenCompraE6: "5000000", margenVentaE6: "5000000", vigenteDesde: hace(60 * 14), vencida: true,
  },
];

// ---- Operaciones -------------------------------------------------------------

/** Una operación con los campos que no cambian entre los ejemplos. */
function operacion(o: Partial<Operacion> & Pick<Operacion, "id" | "tipo" | "monedaCodigo" | "montoDivisa" | "tasaAplicadaE6" | "montoBase" | "estado" | "realizadaEn">): Operacion {
  return {
    cajaId: 1, turnoId: 5, usuarioId: 3, clienteId: null, medioPago: "EFECTIVO", tasaReferenciaE6: null,
    cotizacionId: null, reglaSpreadId: null, esPreferencial: false, categoriaClienteId: null, autorizadoPor: null,
    autorizadoEn: null, margenBruto: null, margenRealizado: null, equivalenteUsd: null, proposito: null,
    tipoDte: 41, folioDte: 1000 + o.id, confirmadaPor: o.estado === "BORRADOR" ? null : 3,
    confirmadaEn: o.estado === "BORRADOR" ? null : o.realizadaEn, reversadaPor: null, reversadaEn: null,
    motivoReverso: null, origen: "SISTEMA", loteMigracionId: null, registroDiferido: false,
    registradaEn: o.realizadaEn, observacion: null,
    ...o,
  };
}

export const operaciones: Operacion[] = [
  operacion({
    id: 16, tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "600000", tasaAplicadaE6: "949400000", montoBase: "5696400",
    tasaReferenciaE6: "940000000", estado: "BORRADOR", realizadaEn: hace(4), clienteId: 1, proposito: "Viaje familiar",
    margenBruto: "56400", equivalenteUsd: "600000", reglaSpreadId: 2,
  }),
  operacion({
    id: 15, tipo: "COMPRA", monedaCodigo: "ARS", montoDivisa: "5000000", tasaAplicadaE6: "712500", montoBase: "35625",
    tasaReferenciaE6: "750000", estado: "REVERSADA", realizadaEn: hace(38), margenBruto: "1875", equivalenteUsd: "3790",
    reversadaPor: 2, reversadaEn: hace(30), motivoReverso: "Se ingresó un monto equivocado",
  }),
  operacion({
    id: 14, tipo: "VENTA", monedaCodigo: "BRL", montoDivisa: "100000", tasaAplicadaE6: "175100000", montoBase: "175100",
    tasaReferenciaE6: "170000000", estado: "CONFIRMADA", realizadaEn: hace(52), margenBruto: "5100", margenRealizado: "7100",
    equivalenteUsd: "18627", medioPago: "TARJETA",
  }),
  operacion({
    id: 13, tipo: "COMPRA", monedaCodigo: "EUR", montoDivisa: "20000", tasaAplicadaE6: "999600000", montoBase: "199920",
    tasaReferenciaE6: "1020000000", estado: "CONFIRMADA", realizadaEn: hace(97), margenBruto: "4080", equivalenteUsd: "21268",
  }),
  operacion({
    id: 12, tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "50000", tasaAplicadaE6: "954100000", montoBase: "477050",
    tasaReferenciaE6: "940000000", estado: "CONFIRMADA", realizadaEn: hace(128), margenBruto: "7050", margenRealizado: "11300",
    equivalenteUsd: "50000", clienteId: 2,
  }),
  operacion({
    id: 11, tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: "30000", tasaAplicadaE6: "925900000", montoBase: "277770",
    tasaReferenciaE6: "940000000", estado: "CONFIRMADA", realizadaEn: hace(171), margenBruto: "4230", equivalenteUsd: "30000",
    medioPago: "TRANSFERENCIA",
  }),
];

/** Lo que respondería previsualizar para "Venta de US$ 500,00" (la operación 12). */
export const previsualizacion: Previsualizacion = {
  tasaAplicadaE6: "954100000",
  montoBase: "477050",
  tasaReferenciaE6: "940000000",
  cotizacionId: 1,
  reglaSpreadId: 1,
  esPreferencial: false,
  categoriaClienteId: null,
  margenBruto: "7050",
  equivalenteUsd: "50000",
  realizadaEn: hace(0),
  registroDiferido: false,
  requiereFicha: false,
};

// ---- Caja ------------------------------------------------------------------------

export const saldos: Saldo[] = [
  { cajaId: 1, cajaNombre: "Caja 1", monedaCodigo: "ARS", decimales: 2, saldo: "25000000", costoPromedioE6: "731000", actualizadoEn: hace(38) },
  { cajaId: 1, cajaNombre: "Caja 1", monedaCodigo: "BRL", decimales: 2, saldo: "300000", costoPromedioE6: "168000000", actualizadoEn: hace(52) },
  { cajaId: 1, cajaNombre: "Caja 1", monedaCodigo: "CLP", decimales: 0, saldo: "2350000", costoPromedioE6: null, actualizadoEn: hace(52) },
  { cajaId: 1, cajaNombre: "Caja 1", monedaCodigo: "EUR", decimales: 2, saldo: "115000", costoPromedioE6: "1004000000", actualizadoEn: hace(97) },
  { cajaId: 1, cajaNombre: "Caja 1", monedaCodigo: "USD", decimales: 2, saldo: "420000", costoPromedioE6: "931500000", actualizadoEn: hace(128) },
  { cajaId: 2, cajaNombre: "Caja 2", monedaCodigo: "CLP", decimales: 0, saldo: "800000", costoPromedioE6: null, actualizadoEn: hace(240) },
  { cajaId: 2, cajaNombre: "Caja 2", monedaCodigo: "USD", decimales: 2, saldo: "100000", costoPromedioE6: "935000000", actualizadoEn: hace(240) },
];

export const movimientos: MovimientoCaja[] = [
  { id: 41, cajaId: 1, turnoId: 5, monedaCodigo: "CLP", tipo: "INGRESO", monto: "2000000", saldoPost: "2000000", operacionId: null, gastoId: null, usuarioId: 3, descripcion: "Fondo inicial", creadoEn: hace(184) },
  { id: 42, cajaId: 1, turnoId: 5, monedaCodigo: "USD", tipo: "INGRESO", monto: "400000", saldoPost: "400000", operacionId: null, gastoId: null, usuarioId: 3, descripcion: "Fondo inicial", creadoEn: hace(183) },
  { id: 43, cajaId: 1, turnoId: 5, monedaCodigo: "USD", tipo: "OPERACION", monto: "30000", saldoPost: "430000", operacionId: 11, gastoId: null, usuarioId: 3, descripcion: "Compra 11", creadoEn: hace(171) },
  { id: 44, cajaId: 1, turnoId: 5, monedaCodigo: "USD", tipo: "OPERACION", monto: "-50000", saldoPost: "380000", operacionId: 12, gastoId: null, usuarioId: 3, descripcion: "Venta 12", creadoEn: hace(128) },
  { id: 45, cajaId: 1, turnoId: 5, monedaCodigo: "CLP", tipo: "OPERACION", monto: "477050", saldoPost: "2477050", operacionId: 12, gastoId: null, usuarioId: 3, descripcion: "Venta 12", creadoEn: hace(128) },
  { id: 46, cajaId: 1, turnoId: 5, monedaCodigo: "CLP", tipo: "GASTO", monto: "-12990", saldoPost: "2464060", operacionId: null, gastoId: 3, usuarioId: 3, descripcion: "Rollos de papel para boletas", creadoEn: hace(60) },
];

export const turnosAbiertos: TurnoAbierto[] = [
  { turno: turnoCajero, cajaNombre: "Caja 1", usuarioNombre: "Cajero" },
  {
    turno: { id: 6, cajaId: 2, usuarioId: 4, estado: "ABIERTO", abiertoEn: hace(240), cerradoEn: null, cerradoPor: null, observacion: null },
    cajaNombre: "Caja 2",
    usuarioNombre: "Cajera 2",
  },
];

/** Cómo quedaría el arqueo al cerrar con un conteo de ejemplo. */
export const arqueo: FilaArqueo[] = [
  { monedaCodigo: "CLP", decimales: 0, saldoSistema: "2350000", saldoContado: "2349000", diferencia: "-1000" },
  { monedaCodigo: "USD", decimales: 2, saldoSistema: "420000", saldoContado: "420000", diferencia: "0" },
];

// ---- Clientes y cuentas -------------------------------------------------------------

export const clientes: FichaCliente[] = [
  {
    id: 1, tipoDocumento: "PASAPORTE", numeroDocumento: "AR1234567", nombre: "Cliente Completo de Prueba",
    nacionalidad: "AR", oficio: "Comerciante", paisResidencia: "AR", domicilio: "Calle Falsa 123, Comodoro Rivadavia",
    telefono: "+54 9 297 000 0000", email: "completo@ejemplo.com", relacionPermanente: false, categoriaId: 1,
    creadoEn: hace(60 * 24 * 40), actualizadoEn: hace(60 * 24 * 3), faltantesUaf: [],
  },
  {
    id: 2, tipoDocumento: "RUT", numeroDocumento: "12345678-5", nombre: "Cliente Incompleto de Prueba",
    nacionalidad: "CL", oficio: null, paisResidencia: null, domicilio: null, telefono: null, email: null,
    relacionPermanente: false, categoriaId: null, creadoEn: hace(60 * 24 * 20), actualizadoEn: hace(60 * 24 * 20),
    faltantesUaf: ["oficio o profesión", "país de residencia", "domicilio", "contacto (teléfono o email)"],
  },
];

export const cuentasCliente: CuentaCliente[] = [
  { id: 3, authUserId: "x", rut: "15555567-K", nombre: "Ana Pérez", estado: "PENDIENTE", clienteId: null, revisadaPor: null, revisadaEn: null, motivoRechazo: null, creadaEn: hace(60 * 26) },
  { id: 4, authUserId: "x", rut: "9876543-3", nombre: "Pedro Soto", estado: "PENDIENTE", clienteId: null, revisadaPor: null, revisadaEn: null, motivoRechazo: null, creadaEn: hace(45) },
  { id: 2, authUserId: "x", rut: "12345678-5", nombre: "Cliente Incompleto de Prueba", estado: "VERIFICADA", clienteId: 2, revisadaPor: 3, revisadaEn: hace(60 * 24 * 11), motivoRechazo: null, creadaEn: hace(60 * 24 * 12) },
  { id: 1, authUserId: "x", rut: "11111111-1", nombre: "Registro dudoso", estado: "RECHAZADA", clienteId: null, revisadaPor: 2, revisadaEn: hace(60 * 24 * 14), motivoRechazo: "El carnet no coincide con el RUT registrado", creadaEn: hace(60 * 24 * 15) },
];

/** Lo que ve el cliente verificado en su portal. */
export const misOperaciones: OperacionDeCliente[] = operaciones
  .filter((o) => o.clienteId === 2 && o.estado !== "BORRADOR")
  .map(({ id, tipo, monedaCodigo, montoDivisa, tasaAplicadaE6, montoBase, medioPago, estado, tipoDte, folioDte, realizadaEn }) => ({
    id, tipo, monedaCodigo, montoDivisa, tasaAplicadaE6, montoBase, medioPago, estado, tipoDte, folioDte, realizadaEn,
  }));

export const miFicha: FichaDeCuenta = {
  nombre: "Cliente Incompleto de Prueba", tipoDocumento: "RUT", numeroDocumento: "12345678-5", nacionalidad: "CL",
  oficio: null, paisResidencia: null, domicilio: null, telefono: null, email: null,
};

// ---- Gastos, resumen, auditoría y usuarios ---------------------------------------------

export const gastos: Gasto[] = [
  { id: 3, fecha: hoy(), categoriaId: 6, descripcion: "Rollos de papel para boletas", monto: "12990", medioPago: "EFECTIVO", cajaId: 1, turnoId: 5, documento: "Boleta 88123", estado: "VIGENTE", reversadoPor: null, reversadoEn: null, motivoReverso: null, usuarioId: 3, registradoEn: hace(60) },
  { id: 2, fecha: hoy(), categoriaId: 5, descripcion: "Retiro de valores semanal", monto: "85000", medioPago: "TRANSFERENCIA", cajaId: null, turnoId: null, documento: "Factura 5521", estado: "VIGENTE", reversadoPor: null, reversadoEn: null, motivoReverso: null, usuarioId: 1, registradoEn: hace(150) },
  { id: 1, fecha: hoy(), categoriaId: 7, descripcion: "Café para la oficina", monto: "4500", medioPago: "EFECTIVO", cajaId: 1, turnoId: 5, documento: null, estado: "REVERSADO", reversadoPor: 2, reversadoEn: hace(170), motivoReverso: "Se registró dos veces", usuarioId: 3, registradoEn: hace(175) },
];

export const resumen: Resumen = {
  fecha: hoy(),
  zonaHoraria: "America/Coyhaique",
  saldos: {
    porCaja: saldos,
    totales: [
      { monedaCodigo: "CLP", decimales: 0, saldo: "3150000" },
      { monedaCodigo: "USD", decimales: 2, saldo: "520000" },
      { monedaCodigo: "EUR", decimales: 2, saldo: "115000" },
      { monedaCodigo: "BRL", decimales: 2, saldo: "300000" },
      { monedaCodigo: "ARS", decimales: 2, saldo: "25000000" },
    ],
  },
  operaciones: {
    confirmadas: 4,
    reversadas: 1,
    porMoneda: [
      { monedaCodigo: "USD", compras: 1, ventas: 1, divisaComprada: "30000", divisaVendida: "50000", basePagada: "277770", baseCobrada: "477050", margenBruto: "11280", margenRealizado: "11300" },
      { monedaCodigo: "EUR", compras: 1, ventas: 0, divisaComprada: "20000", divisaVendida: "0", basePagada: "199920", baseCobrada: "0", margenBruto: "4080", margenRealizado: "0" },
      { monedaCodigo: "BRL", compras: 0, ventas: 1, divisaComprada: "0", divisaVendida: "100000", basePagada: "0", baseCobrada: "175100", margenBruto: "5100", margenRealizado: "7100" },
    ],
    ultimas: operaciones.filter((o) => o.estado !== "BORRADOR"),
  },
  margen: { bruto: "20460", realizado: "18400" },
  gastos: { cantidad: 2, total: "97990" },
  borradoresPendientes: 1,
  turnosAbiertos,
};

export const auditoria: RegistroAuditoria[] = [
  { id: 98, tabla: "operacion", registroId: "16", accion: "CREAR", motivo: null, datosAntes: null, datosDespues: { estado: "BORRADOR", montoDivisa: "600000" }, usuarioId: 3, registradoEn: hace(4) },
  { id: 97, tabla: "operacion", registroId: "15", accion: "REVERSAR", motivo: "Se ingresó un monto equivocado", datosAntes: { estado: "CONFIRMADA" }, datosDespues: { estado: "REVERSADA" }, usuarioId: 2, registradoEn: hace(30) },
  { id: 96, tabla: "operacion", registroId: "14", accion: "CONFIRMAR", motivo: null, datosAntes: { estado: "BORRADOR" }, datosDespues: { estado: "CONFIRMADA", tasaAplicadaE6: "175100000" }, usuarioId: 3, registradoEn: hace(52) },
  { id: 95, tabla: "cotizacion", registroId: "9", accion: "PUBLICAR", motivo: null, datosAntes: null, datosDespues: { monedaCodigo: "USD", compraE6: "925900000", ventaE6: "954100000" }, usuarioId: 1, registradoEn: hace(95) },
  { id: 94, tabla: "turno", registroId: "5", accion: "ABRIR", motivo: null, datosAntes: null, datosDespues: { cajaId: 1 }, usuarioId: 3, registradoEn: hace(185) },
];

export const usuarios: Usuario[] = [
  { id: 1, sucursalId: null, rut: "11111111-1", nombre: "Administrador", email: "admin@demo.cl", rol: "ADMIN", activo: true, creadoEn: hace(60 * 24 * 30), tieneCuenta: true },
  { id: 4, sucursalId: 1, rut: "44444444-4", nombre: "Cajera 2", email: "cajera2@demo.cl", rol: "CAJERO", activo: true, creadoEn: hace(60 * 24 * 30), tieneCuenta: true },
  { id: 3, sucursalId: 1, rut: "33333333-3", nombre: "Cajero", email: "cajero@demo.cl", rol: "CAJERO", activo: true, creadoEn: hace(60 * 24 * 30), tieneCuenta: true },
  { id: 5, sucursalId: 1, rut: "55555555-5", nombre: "Ex cajero", email: "excajero@demo.cl", rol: "CAJERO", activo: false, creadoEn: hace(60 * 24 * 90), tieneCuenta: true },
  { id: 2, sucursalId: 1, rut: "22222222-2", nombre: "Supervisor", email: "supervisor@demo.cl", rol: "SUPERVISOR", activo: true, creadoEn: hace(60 * 24 * 30), tieneCuenta: true },
];
