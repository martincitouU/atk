// Espejo en Drizzle de db/migraciones/*.sql, para consultar con tipos.
//
// La fuente de verdad es el SQL: los CHECK, índices y triggers viven solo
// allá. Aquí van columnas, tipos, NOT NULL, defaults y claves. Si cambia
// una migración, se actualiza este archivo; test/esquema.test.ts compara
// ambos contra una base real y falla si no coinciden.
//
// Unidades: dinero() en unidad mínima de su moneda; columnas *E6 ×10^6.

import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { AHORA_MS, booleano, dinero, entero, fecha, idAutomatico } from "./tipos.ts";

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
  sucursalId: entero("sucursal_id").references(() => sucursal.id),
  rut: text("rut").notNull(),
  nombre: text("nombre").notNull(),
  email: text("email").notNull(),
  rol: text("rol", { enum: ["ADMIN", "SUPERVISOR", "CAJERO"] }).notNull(),
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
  activa: booleano("activa").notNull().default(true),
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
// 4. Operación y caja
// ---------------------------------------------------------------------

export const cliente = sqliteTable("cliente", {
  id: idAutomatico(),
  tipoDocumento: text("tipo_documento", { enum: ["RUT", "PASAPORTE", "DNI", "OTRO"] }).notNull(),
  numeroDocumento: text("numero_documento").notNull(),
  nombre: text("nombre").notNull(),
  nacionalidad: text("nacionalidad"),
  telefono: text("telefono"),
  email: text("email"),
  creadoEn: fecha("creado_en").notNull().default(AHORA_MS),
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
  filasLeidas: entero("filas_leidas").notNull().default(0),
  filasImportadas: entero("filas_importadas").notNull().default(0),
  filasRechazadas: entero("filas_rechazadas").notNull().default(0),
  importadoPor: entero("importado_por").notNull().references(() => usuario.id),
  importadoEn: fecha("importado_en").notNull().default(AHORA_MS),
  observaciones: text("observaciones"),
});

export const operacion = sqliteTable("operacion", {
  id: idAutomatico(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  turnoId: entero("turno_id").references(() => turno.id),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  clienteId: entero("cliente_id").references(() => cliente.id),
  tipo: text("tipo", { enum: ["COMPRA", "VENTA"] }).notNull(),
  monedaCodigo: text("moneda_codigo").notNull().references(() => casaMoneda.monedaCodigo),
  montoDivisa: dinero("monto_divisa").notNull(),
  tasaAplicadaE6: dinero("tasa_aplicada_e6").notNull(),
  montoBase: dinero("monto_base").notNull(),
  tasaReferenciaE6: dinero("tasa_referencia_e6"),
  cotizacionId: entero("cotizacion_id").references(() => cotizacion.id),
  reglaSpreadId: entero("regla_spread_id").references(() => reglaSpread.id),
  esPreferencial: booleano("es_preferencial").notNull().default(false),
  autorizadoPor: entero("autorizado_por").references(() => usuario.id),
  margenBruto: dinero("margen_bruto"),
  margenRealizado: dinero("margen_realizado"),
  estado: text("estado", { enum: ["VIGENTE", "ANULADA"] }).notNull().default("VIGENTE"),
  anuladaPor: entero("anulada_por").references(() => usuario.id),
  anuladaEn: fecha("anulada_en"),
  motivoAnulacion: text("motivo_anulacion"),
  origen: text("origen", { enum: ["SISTEMA", "MIGRACION"] }).notNull().default("SISTEMA"),
  loteMigracionId: entero("lote_migracion_id").references(() => loteMigracion.id),
  realizadaEn: fecha("realizada_en").notNull().default(AHORA_MS),
  observacion: text("observacion"),
});

export const movimientoCaja = sqliteTable("movimiento_caja", {
  id: idAutomatico(),
  cajaId: entero("caja_id").notNull().references(() => caja.id),
  turnoId: entero("turno_id").references(() => turno.id),
  monedaCodigo: text("moneda_codigo").notNull().references(() => moneda.codigo),
  tipo: text("tipo", { enum: ["OPERACION", "ANULACION", "INGRESO", "RETIRO", "AJUSTE"] }).notNull(),
  monto: dinero("monto").notNull(),
  saldoPost: dinero("saldo_post").notNull(),
  operacionId: entero("operacion_id").references(() => operacion.id),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  descripcion: text("descripcion"),
  creadoEn: fecha("creado_en").notNull().default(AHORA_MS),
});

// ---------------------------------------------------------------------
// 5. Auditoría
// ---------------------------------------------------------------------

export const auditoria = sqliteTable("auditoria", {
  id: idAutomatico(),
  tabla: text("tabla").notNull(),
  registroId: text("registro_id").notNull(),
  accion: text("accion", { enum: ["INSERT", "UPDATE", "DELETE"] }).notNull(),
  datosAntes: text("datos_antes", { mode: "json" }),
  datosDespues: text("datos_despues", { mode: "json" }),
  usuarioId: entero("usuario_id").notNull().references(() => usuario.id),
  registradoEn: fecha("registrado_en").notNull().default(AHORA_MS),
});
