// Tabla de datos. Se escribe con <thead>, <tbody>, <tr>, <th> y <td> de
// siempre; este componente solo pone el estilo y el desplazamiento lateral
// en pantallas angostas (la tabla se desliza dentro de su marco, no la página).
//
// Columnas de montos: <th className="num"> y <td className="num">, alineadas
// a la derecha y con cifras del mismo ancho.

import type { ReactNode } from "react";
import css from "./Tabla.module.css";

export function Tabla({ children, etiqueta }: { children: ReactNode; /** Para lectores de pantalla */ etiqueta: string }) {
  return (
    <div className={css.marco} role="region" aria-label={etiqueta} tabIndex={0}>
      <table className={css.tabla}>{children}</table>
    </div>
  );
}
