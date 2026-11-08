// Espejo en Drizzle de db/migraciones/*.sql, para consultar con tipos.
//
// La fuente de verdad es el SQL: los CHECK, índices y triggers viven solo
// allá. Aquí van columnas, tipos, NOT NULL, defaults y claves. Si cambia
// una migración, se actualiza este archivo; test/esquema.test.ts compara
// ambos contra una base real y falla si no coinciden.
//
// Las tablas de Better Auth (user, session, account, verification) no están
// aquí: las maneja Better Auth con su propia conexión.
//
// Unidades: dinero() en unidad mínima de su moneda; columnas *E6 ×10^6.

import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { AHORA_MS, booleano, dinero, entero, fecha, idAutomatico } from "./tipos.ts";

export const ROLES = ["ADMIN", "SUPERVISOR", "CAJERO"] as const;
export const TIPOS_OPERACION = ["COMPRA", "VENTA"] as const;
export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as const;
export const ESTADOS_OPERACION = ["BORRADOR", "CONFIRMADA", "REVERSADA"] as const;
export const TIPOS_MOVIMIENTO = ["OPERACION", "REVERSO", "INGRESO", "RETIRO", "GASTO", "AJUSTE"] as const;
export const ACCIONES_AUDITORIA = [
  "CREAR", "EDITAR", "ELIMINAR", "CONFIRMAR", "REVERSAR", "AUTORIZAR", "PUBLICAR", "ABRIR", "CERRAR",
  "GENERAR", "EXPORTAR", "IMPORTAR",
] as const;
export const TIPOS_DOCUMENTO = ["RUT", "PASAPORTE", "DNI", "OTRO"] as const;

// ---------------------------------------------------------------------
// 1. Catálogo y configuración
// ---------------------------------------------------------------------

export const moneda = sqliteTable("moneda", {
  codigo: text("codigo").primaryKey(),
  nombre: text("nombre").notNull(),
  simbolo: text("simbolo").notNull(),
  decimales: entero("decimales").notNull(),
});

export const casa = sqliteTable("casa", {
  id: entero("id").primaryKey(),
  rut: text("rut").notNull(),
  razonSocial: text("razon_social").notNull(),
  nombreFantasia: text("nombre_fantasia"),
  monedaBase: text("moneda_base").notNull().references(() => moneda.codigo),
  creadaEn: fecha("creada_en").notNull().default(AHORA_MS),
});

export const casaMoneda = sqliteTable("casa_moneda", {
  monedaCodigo: text("moneda_codigo").primaryKey().references(() => moneda.codigo),
  activa: booleano("activa").notNull().default(true),
  decimalesTasa: entero("decimales_tasa").notNull().default(2),
  montoMinimo: dinero("monto_minimo").notNull().default(0n),
  ordenPizarra: entero("orden_pizarra").notNull().default(0),
});

export const sucursal = sqliteTable("sucursal", {
  id: idAutomatico(),
  nombre: text("nombre").notNull(),
  direccion: text("direccion"),
  comuna: text("comuna"),
  activa: booleano("activa").notNull().default(true),
});

export const caja = sqliteTable("caja", {
  id: idAutomatico(),
  sucursalId: entero("sucursal_id").notNull().references(() => sucursal.id),
  nombre: text("nombre").notNull(),
  activa: booleano("activa").notNull().default(true),
});

// ---------------------------------------------------------------------
// 2. Usuarios
// ---------------------------------------------------------------------

export const usuario = sqliteTable("usuario", {
  id: idAutomatico(),
  authUserId: text("auth_user_id"),
  sucursalId: entero("sucursal_id").references(() => sucursal.id),
  rut: text("rut").notNull(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull(),
  rol: text("rol", { enum: ROLES }).notNull(),
  activo: booleano("activo").notNull().default(true),
  creadoEn: fecha("creado_en").notNull().default(AHORA_MS),
});

export const parametro = sqliteTable("parametro", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
  tipoDato: text("tipo_dato", { enum: ["ENTERO", "DECIMAL", "TEXTO", "BOOLEANO"] }).notNull(),
  descripcion: text("descripcion"),
  actualizadoPor: entero("actualizado_por").references(() => usuario.id),
  actualizadoEn: fecha("actualizado_en").notNull().default(AHORA_MS),
});

// ---------------------------------------------------------------------
// 3. Precios: tasa de referencia → regla de spread → cotización
// ---------------------------------------------------------------------

export const tasaReferencia = sqliteTable("tasa_referencia", {
  id: idAutomatico(),
  monedaCodigo: text("moneda_codigo").notNull().references(() => casaMoneda.monedaCodigo),
  valorE6: dinero("valor_e6").notNull(),
  fuente: text("fuente").notNull().default("MANUAL"),
  registradaPor: entero("registrada_por").references(() => usuario.id),
  obtenidaEn: fecha("obtenida_en").notNull().default(AHORA_MS),
});

export const reglaSpread = sqliteTable("regla_spread", {
  id: idAutomatico(),
  sucursalId: entero("sucursal_id").references(() => sucursal.id),
  monedaCodigo: text("moneda_codigo").notNull().references(() => casaMoneda.monedaCodigo),
  tipoMargen: text("tipo_margen", { enum: ["PORCENTAJE", "MONTO_FIJO"] }).notNull().default("PORCENTAJE"),
  margenCompraE6: dinero("margen_compra_e6").notNull(),
  margenVentaE6: dinero("margen_venta_e6").notNull(),
  montoDesde: dinero("monto_desde").notNull().default(0n),
  montoHasta: dinero("monto_hasta"),
  vigenteDesde: fecha("vigente_desde").notNull().default(AHORA_MS),
  vigenteHasta: fecha("vigente_hasta"),
  prioridad: entero("prioridad").notNull().default(0),
  creadaPor: entero("creada_por").references(() => usuario.id),
});

export const cotizacion = sqliteTable("cotizacion", {
  id: idAutomatico(),
  sucursalId: entero("sucursal_id").references(() => sucursal.id),
  monedaCodigo: text("moneda_codigo").notNull().references(() => casaMoneda.monedaCodigo),
  tasaReferenciaId: entero("tasa_referencia_id").notNull().references(() => tasaReferencia.id),
  reglaSpreadId: entero("regla_spread_id").notNull().references(() => reglaSpread.id),
  precioCompraE6: dinero("precio_compra_e6").notNull(),
  precioVentaE6: dinero("precio_venta_e6").notNull(),
  vigenteDesde: fecha("vigente_desde").notNull().default(AHORA_MS),
  vigenteHasta: fecha("vigente_hasta"),
  publicadaPor: entero("publicada_por").references(() => usuario.id),
});

// ---------------------------------------------------------------------
// 4. Clientes, turnos y operación
// ---------------------------------------------------------------------

export const categoriaCliente = sqliteTable("categoria_cliente", {
  id: idAutomatico(),
  nombre: text("nombre").notNull(),
  descuentoMargenPctE6: dinero("descuento_margen_pct_e6").notNull(),
  activa: booleano("activa").notNull().default(true),
});

export const cliente = sqliteTable("cliente", {
  id: idAutomatico(),
  tipoDocumento: text("tipo_documento", { enum: TIPOS_DOCUMENTO }).notNull(),
  numeroDocumento: text("numero_documento").notNull(),
  nombre: text("nombre").notNull(),
  nacionalidad: text("nacionalidad"),
  oficio: text("oficio"),
  paisResidencia: text("pais_residencia"),
  domicilio: text("domicilio"),
  telefono: text("telefono"),
  email: text("email"),
  relacionPermanente: booleano("relacion_permanente").notNull().default(false),
  categoriaId: entero("categoria_id").references(() => categoriaCliente.id),
  creadoEn: fecha("creado_en").notNull().default(AHORA_MS),
  actualizadoEn: fecha("actualizado_en").notNull().default(AHORA_MS),
});

export const turno = sqliteTable("turno", {
  id: idAutomatico(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  estado: text("estado", { enum: ["ABIERTO", "CERRADO"] }).notNull().default("ABIERTO"),
  abiertoEn: fecha("abierto_en").notNull().default(AHORA_MS),
  cerradoEn: fecha("cerrado_en"),
  cerradoPor: entero("cerrado_por").references(() => usuario.id),
  observacion: text("observacion"),
});

export const saldoCaja = sqliteTable(
  "saldo_caja",
  {
    cajaId: entero("caja_id").notNull().references(() => caja.id),
    monedaCodigo: text("moneda_codigo").notNull().references(() => moneda.codigo),
    saldo: dinero("saldo").notNull().default(0n),
    costoPromedioE6: dinero("costo_promedio_e6"),
    actualizadoEn: fecha("actualizado_en").notNull().default(AHORA_MS),
  },
  (t) => [primaryKey({ columns: [t.cajaId, t.monedaCodigo] })],
);

export const arqueo = sqliteTable("arqueo", {
  id: idAutomatico(),
  turnoId: entero("turno_id").notNull().references(() => turno.id),
  monedaCodigo: text("moneda_codigo").notNull().references(() => moneda.codigo),
  saldoSistema: dinero("saldo_sistema").notNull(),
  saldoContado: dinero("saldo_contado").notNull(),
  // Columna generada en el SQL: se lee, nunca se escribe
  diferencia: dinero("diferencia").generatedAlwaysAs(sql`saldo_contado - saldo_sistema`, { mode: "stored" }),
  registradoEn: fecha("registrado_en").notNull().default(AHORA_MS),
});

export const loteMigracion = sqliteTable("lote_migracion", {
  id: idAutomatico(),
  archivoOrigen: text("archivo_origen").notNull(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  filasLeidas: entero("filas_leidas").notNull().default(0),
  filasImportadas: entero("filas_importadas").notNull().default(0),
  filasRechazadas: entero("filas_rechazadas").notNull().default(0),
  importadoPor: entero("importado_por").notNull().references(() => usuario.id),
  importadoEn: fecha("importado_en").notNull().default(AHORA_MS),
  observaciones: text("observaciones"),
});

export const loteMigracionRechazo = sqliteTable("lote_migracion_rechazo", {
  id: idAutomatico(),
  loteMigracionId: entero("lote_migracion_id").notNull().references(() => loteMigracion.id),
  fila: entero("fila").notNull(),
  causa: text("causa").notNull(),
  datos: text("datos", { mode: "json" }),
});

export const operacion = sqliteTable("operacion", {
  id: idAutomatico(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  turnoId: entero("turno_id").references(() => turno.id),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  clienteId: entero("cliente_id").references(() => cliente.id),
  tipo: text("tipo", { enum: TIPOS_OPERACION }).notNull(),
  monedaCodigo: text("moneda_codigo").notNull().references(() => casaMoneda.monedaCodigo),
  montoDivisa: dinero("monto_divisa").notNull(),
  medioPago: text("medio_pago", { enum: MEDIOS_PAGO }).notNull().default("EFECTIVO"),
  tasaAplicadaE6: dinero("tasa_aplicada_e6").notNull(),
  montoBase: dinero("monto_base").notNull(),
  tasaReferenciaE6: dinero("tasa_referencia_e6"),
  cotizacionId: entero("cotizacion_id").references(() => cotizacion.id),
  reglaSpreadId: entero("regla_spread_id").references(() => reglaSpread.id),
  esPreferencial: booleano("es_preferencial").notNull().default(false),
  categoriaClienteId: entero("categoria_cliente_id").references(() => categoriaCliente.id),
  autorizadoPor: entero("autorizado_por").references(() => usuario.id),
  autorizadoEn: fecha("autorizado_en"),
  margenBruto: dinero("margen_bruto"),
  margenRealizado: dinero("margen_realizado"),
  equivalenteUsd: dinero("equivalente_usd"),
  proposito: text("proposito"),
  tipoDte: entero("tipo_dte"),
  folioDte: entero("folio_dte"),
  estado: text("estado", { enum: ESTADOS_OPERACION }).notNull().default("BORRADOR"),
  confirmadaPor: entero("confirmada_por").references(() => usuario.id),
  confirmadaEn: fecha("confirmada_en"),
  reversadaPor: entero("reversada_por").references(() => usuario.id),
  reversadaEn: fecha("reversada_en"),
  motivoReverso: text("motivo_reverso"),
  origen: text("origen", { enum: ["SISTEMA", "MIGRACION"] }).notNull().default("SISTEMA"),
  loteMigracionId: entero("lote_migracion_id").references(() => loteMigracion.id),
  registroDiferido: booleano("registro_diferido").notNull().default(false),
  realizadaEn: fecha("realizada_en").notNull().default(AHORA_MS),
  registradaEn: fecha("registrada_en").notNull().default(AHORA_MS),
  observacion: text("observacion"),
});

export const reporteRoe = sqliteTable("reporte_roe", {
  id: idAutomatico(),
  anio: entero("anio").notNull(),
  trimestre: entero("trimestre").notNull(),
  umbralUsd: dinero("umbral_usd").notNull(),
  cantidadOperaciones: entero("cantidad_operaciones").notNull(),
  // Columna generada en el SQL: sin operaciones es un reporte negativo
  esNegativo: booleano("es_negativo").generatedAlwaysAs(sql`cantidad_operaciones = 0`, { mode: "stored" }),
  generadoPor: entero("generado_por").notNull().references(() => usuario.id),
  generadoEn: fecha("generado_en").notNull().default(AHORA_MS),
  enviadoPor: entero("enviado_por").references(() => usuario.id),
  enviadoEn: fecha("enviado_en"),
});

export const reporteRoeOperacion = sqliteTable(
  "reporte_roe_operacion",
  {
    reporteRoeId: entero("reporte_roe_id").notNull().references(() => reporteRoe.id),
    operacionId: entero("operacion_id").notNull().references(() => operacion.id),
  },
  (t) => [primaryKey({ columns: [t.reporteRoeId, t.operacionId] })],
);

// ---------------------------------------------------------------------
// 5. Gastos y libro de caja
// ---------------------------------------------------------------------

export const categoriaGasto = sqliteTable("categoria_gasto", {
  id: idAutomatico(),
  nombre: text("nombre").notNull(),
  activa: booleano("activa").notNull().default(true),
});

export const gasto = sqliteTable("gasto", {
  id: idAutomatico(),
  fecha: text("fecha").notNull(), // YYYY-MM-DD en la zona horaria de la casa
  categoriaId: entero("categoria_id").notNull().references(() => categoriaGasto.id),
  descripcion: text("descripcion").notNull(),
  monto: dinero("monto").notNull(),
  medioPago: text("medio_pago", { enum: MEDIOS_PAGO }).notNull(),
  cajaId: entero("caja_id").references(() => caja.id),
  turnoId: entero("turno_id").references(() => turno.id),
  documento: text("documento"),
  estado: text("estado", { enum: ["VIGENTE", "REVERSADO"] }).notNull().default("VIGENTE"),
  reversadoPor: entero("reversado_por").references(() => usuario.id),
  reversadoEn: fecha("reversado_en"),
  motivoReverso: text("motivo_reverso"),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  registradoEn: fecha("registrado_en").notNull().default(AHORA_MS),
});

export const movimientoCaja = sqliteTable("movimiento_caja", {
  id: idAutomatico(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  turnoId: entero("turno_id").references(() => turno.id),
  monedaCodigo: text("moneda_codigo").notNull().references(() => moneda.codigo),
  tipo: text("tipo", { enum: TIPOS_MOVIMIENTO }).notNull(),
  monto: dinero("monto").notNull(),
  saldoPost: dinero("saldo_post").notNull(),
  operacionId: entero("operacion_id").references(() => operacion.id),
  gastoId: entero("gasto_id").references(() => gasto.id),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  descripcion: text("descripcion"),
  creadoEn: fecha("creado_en").notNull().default(AHORA_MS),
});

// ---------------------------------------------------------------------
// 6. Auditoría
// ---------------------------------------------------------------------

export const auditoria = sqliteTable("auditoria", {
  id: idAutomatico(),
  tabla: text("tabla").notNull(),
  registroId: text("registro_id").notNull(),
  accion: text("accion", { enum: ACCIONES_AUDITORIA }).notNull(),
  motivo: text("motivo"),
  datosAntes: text("datos_antes", { mode: "json" }),
  datosDespues: text("datos_despues", { mode: "json" }),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  registradoEn: fecha("registrado_en").notNull().default(AHORA_MS),
});

export type Operacion = typeof operacion.$inferSelect;
export type Cliente = typeof cliente.$inferSelect;
export type Turno = typeof turno.$inferSelect;
export type Gasto = typeof gasto.$inferSelect;
export type Cotizacion = typeof cotizacion.$inferSelect;
export type ReglaSpread = typeof reglaSpread.$inferSelect;
export type Rol = (typeof ROLES)[number];
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];
export type MedioPago = (typeof MEDIOS_PAGO)[number];
