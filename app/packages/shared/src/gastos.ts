// Gastos operacionales con fecha y categoría (RF-05).

import { z } from "zod";
import { fechaLocal, id, monto } from "./basicos.ts";
import { ESTADOS_GASTO, MEDIOS_PAGO } from "./constantes.ts";

export const entradaGasto = z.strictObject({
  /** Hoy si no se indica */
  fecha: fechaLocal.optional(),
  categoriaId: id,
  descripcion: z.string().trim().min(1, "Describa el gasto").max(300),
  /** En la moneda base (pesos), unidad mínima */
  monto,
  medioPago: z.enum(MEDIOS_PAGO),
  /** Boleta o factura del proveedor */
  documento: z.string().max(60).nullish(),
});

export const filtrosGastos = z.strictObject({
  desde: fechaLocal.optional(),
  hasta: fechaLocal.optional(),
  estado: z.enum(ESTADOS_GASTO).optional(),
});
