// Valores fijos que comparten la base, la API y el front. Los CHECK de la
// migración aceptan exactamente estos valores; db/esquema.ts los usa para
// tipar las columnas.

export const ROLES = ["ADMIN", "SUPERVISOR", "CAJERO"] as const;
export const TIPOS_OPERACION = ["COMPRA", "VENTA"] as const;
export const MEDIOS_PAGO = ["EFECTIVO", "TRANSFERENCIA", "TARJETA"] as const;
export const ESTADOS_OPERACION = ["BORRADOR", "CONFIRMADA", "REVERSADA"] as const;
export const TIPOS_MARGEN = ["PORCENTAJE", "MONTO_FIJO"] as const;
/** 34 factura exenta, 41 boleta exenta */
export const TIPOS_DTE = [34, 41] as const;

export type Rol = (typeof ROLES)[number];
export type TipoOperacion = (typeof TIPOS_OPERACION)[number];
export type MedioPago = (typeof MEDIOS_PAGO)[number];
export type EstadoOperacion = (typeof ESTADOS_OPERACION)[number];
