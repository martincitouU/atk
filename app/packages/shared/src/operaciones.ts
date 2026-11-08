// Lo que el front envía para registrar y gestionar operaciones (RF-01, 02, 07, 20, 21).

import { z } from "zod";
import { codigoMoneda, escalaE6, id, idEnTexto, instante, monto, textoOpcional } from "./basicos.ts";
import { ESTADOS_OPERACION, MEDIOS_PAGO, TIPOS_DTE, TIPOS_OPERACION } from "./constantes.ts";

const campos = {
  tipo: z.enum(TIPOS_OPERACION),
  monedaCodigo: codigoMoneda,
  montoDivisa: monto,
  medioPago: z.enum(MEDIOS_PAGO).optional(),
  clienteId: id.nullish(),
  proposito: textoOpcional,
  tipoDte: z.union(TIPOS_DTE.map((t) => z.literal(t))).nullish(),
  folioDte: z.number().int().positive().nullish(),
  observacion: textoOpcional,
  /** Tasa preferencial pedida; si difiere de la pizarra, requiere autorización */
  tasaSolicitadaE6: escalaE6.nullish(),
  /** Fecha y hora reales de una operación ingresada después (RF-21) */
  realizadaEn: instante.nullish(),
};

/** Crear un borrador o previsualizarlo. strictObject rechaza campos desconocidos (errores de tipeo). */
export const entradaOperacion = z.strictObject(campos);

/** Editar un borrador: solo los campos que cambian. */
export const cambiosOperacion = z.strictObject(campos).partial();

export const entradaReverso = z.strictObject({
  motivo: z.string().trim().min(1, "Indique el motivo del reverso").max(500),
});

/** Filtros de la lista, que llegan como texto en la URL (?estado=CONFIRMADA). */
export const filtrosOperaciones = z.strictObject({
  turnoId: idEnTexto.optional(),
  cajaId: idEnTexto.optional(),
  usuarioId: idEnTexto.optional(),
  estado: z.enum(ESTADOS_OPERACION).optional(),
  monedaCodigo: codigoMoneda.optional(),
  desde: instante.optional(),
  hasta: instante.optional(),
  limite: z.coerce.number().int().min(1).max(1000).optional(),
});

export type EntradaOperacionJson = z.input<typeof entradaOperacion>;
export type EntradaOperacion = z.output<typeof entradaOperacion>;
