// Turnos, saldos y movimientos de caja (RF-04, RF-05, RF-06).

import { z } from "zod";
import { codigoMoneda, enteroConSigno, escalaE6, id, idEnTexto, monto } from "./basicos.ts";

const motivo = z.string().trim().min(1, "Indique el motivo").max(500);

export const entradaAbrirTurno = z.strictObject({ cajaId: id });

/** Conteo físico al cerrar: { "CLP": "1250000", "USD": "45000" } en unidad mínima. */
export const entradaCerrarTurno = z.strictObject({
  conteo: z.record(codigoMoneda, monto),
});

/** Ingreso (fondo inicial, reposición) o retiro de la caja del propio turno. */
export const entradaIngresoRetiro = z.strictObject({
  tipo: z.enum(["INGRESO", "RETIRO"]),
  monedaCodigo: codigoMoneda,
  monto,
  motivo,
  /** Costo de la divisa que ingresa; si no se indica, la referencia vigente */
  costoE6: escalaE6.nullish(),
});

/** Ajuste tras un arqueo (solo supervisor o admin). Positivo suma, negativo resta. */
export const entradaAjusteCaja = z.strictObject({
  cajaId: id,
  monedaCodigo: codigoMoneda,
  monto: enteroConSigno,
  motivo,
  turnoId: id.nullish(),
});

export const filtrosSaldos = z.strictObject({ cajaId: idEnTexto.optional() });
