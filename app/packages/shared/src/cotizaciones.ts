// Panel central de tipos de cambio (RF-08).

import { z } from "zod";
import { codigoMoneda, escalaE6, idEnTexto } from "./basicos.ts";
import { TIPOS_MARGEN } from "./constantes.ts";

export const entradaPublicacion = z.strictObject({
  monedaCodigo: codigoMoneda,
  referenciaE6: escalaE6,
  tipoMargen: z.enum(TIPOS_MARGEN).optional(),
  margenCompraE6: escalaE6,
  margenVentaE6: escalaE6,
});

export const filtrosPizarra = z.strictObject({
  sucursalId: idEnTexto.optional(),
});

export type EntradaPublicacionJson = z.input<typeof entradaPublicacion>;
