// Ritmo vertical de una vista y grillas de columnas comunes.

import type { ReactNode } from "react";
import css from "./Pagina.module.css";

/** El cuerpo de una vista: secciones separadas con el mismo espacio. */
export function Pagina({ children, angosta }: { children: ReactNode; /** Formularios: ancho de lectura */ angosta?: boolean }) {
  return <div className={[css.pagina, angosta && css.angosta].filter(Boolean).join(" ")}>{children}</div>;
}

/** Dos columnas (principal y lateral) que bajan a una en pantallas angostas. */
export function Columnas({ children, lateral }: { children: ReactNode; lateral: ReactNode }) {
  return (
    <div className={css.columnas}>
      <div className={css.principal}>{children}</div>
      <aside className={css.lateral}>{lateral}</aside>
    </div>
  );
}

/** Tarjetas del mismo ancho en grilla. */
export function Grilla({ children, minimo = 280 }: { children: ReactNode; minimo?: number }) {
  return (
    <div className={css.grilla} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(${minimo}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}

/** Lista de pares "dato: valor" (detalle de una operación, ficha de cliente). */
export function Datos({ filas }: { filas: { etiqueta: string; valor: ReactNode }[] }) {
  return (
    <dl className={css.datos}>
      {filas.map((f) => (
        <div key={f.etiqueta} className={css.dato}>
          <dt>{f.etiqueta}</dt>
          <dd>{f.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
