// Indicador (DESIGN.md › Stat Tile): una cifra grande con su etiqueta.
// "enVivo" la pinta verde sobre fondo verde suave: solo para datos del
// momento (el día en curso), como pide DESIGN.md.

import type { ReactNode } from "react";
import css from "./Indicador.module.css";

type Props = { etiqueta: string; valor: ReactNode; detalle?: ReactNode; enVivo?: boolean };

export function Indicador({ etiqueta, valor, detalle, enVivo }: Props) {
  return (
    <div className={[css.indicador, enVivo && css.enVivo].filter(Boolean).join(" ")}>
      <p className={css.etiqueta}>{etiqueta}</p>
      <p className={`${css.valor} num`}>{valor}</p>
      {detalle && <p className={css.detalle}>{detalle}</p>}
    </div>
  );
}

/** Indicadores en grilla: tantas columnas como quepan. */
export function GrillaIndicadores({ children }: { children: ReactNode }) {
  return <div className={css.grilla}>{children}</div>;
}
