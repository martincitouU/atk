// Estados de espera y vacíos, iguales en todas las vistas.

import { Inbox, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import css from "./Estados.module.css";

/** Mientras llega la respuesta de la API. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className={css.cargando} role="status">
      <LoaderCircle className={css.girando} size={20} aria-hidden />
      {texto}
    </div>
  );
}

/** Una lista sin resultados: qué pasa y, si se puede, qué hacer. */
export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className={css.vacio}>
      <span className={css.iconoVacio}>
        <Inbox size={22} aria-hidden />
      </span>
      <p className={css.tituloVacio}>{titulo}</p>
      {children && <p className={css.textoVacio}>{children}</p>}
      {accion}
    </div>
  );
}
