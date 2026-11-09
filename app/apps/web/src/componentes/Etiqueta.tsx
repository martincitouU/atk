// Etiqueta (pastilla chica) para estados: "Borrador", "Confirmada"...
// El significado de cada estado vive en lib/estados.ts, no en cada vista.

import type { ReactNode } from "react";
import css from "./Etiqueta.module.css";

/**
 * neutro: informativo · fuerte: hecho/firme · atencion: pide una acción ·
 * error: anulado o rechazado · vivo: dato vigente ahora
 */
export type Tono = "neutro" | "fuerte" | "atencion" | "error" | "vivo";

export function Etiqueta({ tono = "neutro", children }: { tono?: Tono; children: ReactNode }) {
  return <span className={`${css.etiqueta} ${css[tono]}`}>{children}</span>;
}
