// Consultas del supervisor y del administrador (RF-15, RF-16).

import { z } from "zod";
import { fechaLocal, idEnTexto, instante } from "./basicos.ts";
import { ACCIONES_AUDITORIA } from "./constantes.ts";

export const filtrosAuditoria = z.strictObject({
  desde: instante.optional(),
  hasta: instante.optional(),
  tabla: z.string().max(60).optional(),
  registroId: z.string().max(60).optional(),
  usuarioId: idEnTexto.optional(),
  accion: z.enum(ACCIONES_AUDITORIA).optional(),
  limite: z.coerce.number().int().min(1).max(1000).optional(),
});

/** Día del resumen; hoy si no se indica. */
export const filtrosResumen = z.strictObject({ fecha: fechaLocal.optional() });
