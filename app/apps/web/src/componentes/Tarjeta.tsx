// Tarjeta de DESIGN.md: superficie blanca, borde casi invisible, radio 20px.
// "elevada" agrega la única sombra permitida (para widgets como el de operar).

import type { ReactNode } from "react";
import css from "./Tarjeta.module.css";

type Props = {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  /** Botones o enlaces a la derecha del título */
  acciones?: ReactNode;
  elevada?: boolean;
  /** Sin relleno interior: para tablas que llegan al borde */
  sinRelleno?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Tarjeta({ titulo, descripcion, acciones, elevada, sinRelleno, className, children }: Props) {
  const clases = [css.tarjeta, elevada && css.elevada, sinRelleno && css.sinRelleno, className].filter(Boolean).join(" ");
  return (
    <section className={clases}>
      {(titulo || acciones) && (
        <header className={css.encabezado}>
          <div>
            {titulo && <h2 className={css.titulo}>{titulo}</h2>}
            {descripcion && <p className={css.descripcion}>{descripcion}</p>}
          </div>
          {acciones && <div className={css.acciones}>{acciones}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
