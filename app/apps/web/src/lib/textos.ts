// Cómo se muestra cada valor fijo de la API (roles, estados, medios de pago)
// y con qué tono de etiqueta. Un solo lugar: todas las vistas dicen lo mismo.

import type { Tono } from "../componentes/Etiqueta.tsx";
import type {
  AccionAuditoria,
  EstadoCuentaCliente,
  EstadoGasto,
  EstadoOperacion,
  MedioPago,
  Rol,
  TipoDocumento,
  TipoMovimiento,
  TipoOperacion,
} from "../api/tipos.ts";

export const ROL: Record<Rol, string> = { ADMIN: "Admin", SUPERVISOR: "Supervisor", CAJERO: "Cajero" };

/** La pizarra está escrita desde la casa: "Compra" es cuando la casa compra la divisa. */
export const TIPO_OPERACION: Record<TipoOperacion, string> = { VENTA: "Venta", COMPRA: "Compra" };

export const MEDIO_PAGO: Record<MedioPago, string> = { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta" };

export const TIPO_DOCUMENTO: Record<TipoDocumento, string> = { RUT: "RUT", PASAPORTE: "Pasaporte", DNI: "DNI", OTRO: "Otro" };

export const TIPO_DTE: Record<number, string> = { 41: "Boleta exenta", 34: "Factura exenta" };

export const TIPO_MOVIMIENTO: Record<TipoMovimiento, string> = {
  OPERACION: "Operación",
  REVERSO: "Reverso",
  INGRESO: "Ingreso",
  RETIRO: "Retiro",
  GASTO: "Gasto",
  AJUSTE: "Ajuste",
};

export const ESTADO_OPERACION: Record<EstadoOperacion, { texto: string; tono: Tono }> = {
  BORRADOR: { texto: "Borrador", tono: "atencion" },
  CONFIRMADA: { texto: "Confirmada", tono: "fuerte" },
  REVERSADA: { texto: "Reversada", tono: "error" },
};

export const ESTADO_CUENTA: Record<EstadoCuentaCliente, { texto: string; tono: Tono }> = {
  PENDIENTE: { texto: "Pendiente", tono: "atencion" },
  VERIFICADA: { texto: "Verificada", tono: "fuerte" },
  RECHAZADA: { texto: "Rechazada", tono: "error" },
};

export const ESTADO_GASTO: Record<EstadoGasto, { texto: string; tono: Tono }> = {
  VIGENTE: { texto: "Vigente", tono: "neutro" },
  REVERSADO: { texto: "Reversado", tono: "error" },
};

export const ACCION_AUDITORIA: Record<AccionAuditoria, string> = {
  CREAR: "Crear",
  EDITAR: "Editar",
  ELIMINAR: "Eliminar",
  CONFIRMAR: "Confirmar",
  REVERSAR: "Reversar",
  AUTORIZAR: "Autorizar",
  PUBLICAR: "Publicar",
  ABRIR: "Abrir",
  CERRAR: "Cerrar",
  GENERAR: "Generar",
  EXPORTAR: "Exportar",
  IMPORTAR: "Importar",
};

/** Qué registra cada fila de la auditoría (su columna `tabla`), en palabras. */
export const TABLA_AUDITADA: Record<string, string> = {
  operacion: "Operación",
  movimiento_caja: "Movimiento de caja",
  turno: "Turno",
  gasto: "Gasto",
  cotizacion: "Cotización",
  cliente: "Cliente",
  cuenta_cliente: "Cuenta del portal",
  usuario: "Usuario",
  categoria_cliente: "Categoría de cliente",
  casa: "Configuración de la casa",
};
