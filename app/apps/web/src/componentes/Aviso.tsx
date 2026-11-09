// Aviso en banda: información, algo que pide atención, un error o una
// confirmación. Siempre con texto: el color solo acompaña.

import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import css from "./Aviso.module.css";

type Tono = "info" | "atencion" | "error" | "exito";

const ICONOS = { info: Info, atencion: TriangleAlert, error: CircleAlert, exito: CircleCheck };

export function Aviso({ tono = "info", titulo, children, acciones }: { tono?: Tono; titulo?: ReactNode; children?: ReactNode; acciones?: ReactNode }) {
  const Icono = ICONOS[tono];
  return (
    // Los errores se anuncian solos en un lector de pantalla
    <div className={`${css.aviso} ${css[tono]}`} role={tono === "error" ? "alert" : "status"}>
      <Icono className={css.icono} size={18} aria-hidden />
      <div className={css.cuerpo}>
        {titulo && <p className={css.titulo}>{titulo}</p>}
        {children && <div className={css.texto}>{children}</div>}
      </div>
      {acciones && <div className={css.acciones}>{acciones}</div>}
    </div>
  );
}
