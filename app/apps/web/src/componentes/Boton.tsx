// Botones de DESIGN.md. Cuatro variantes, de más a menos fuerte:
//
//   primario   Relleno magenta. La acción principal: MÁXIMO UNO por vista.
//   suave      Rosa suave con texto magenta. Una acción importante más.
//   secundario Gris claro. Acciones comunes (es la variante por defecto).
//   texto      Sin fondo. Acciones menores, enlaces "Ver todo →".
//
// <Boton> es un <button>; <EnlaceBoton> navega (un <Link>) con el mismo aspecto.

import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import css from "./Boton.module.css";

export type VarianteBoton = "primario" | "suave" | "secundario" | "texto";

type Estilo = {
  variante?: VarianteBoton;
  tamano?: "normal" | "chico";
  anchoCompleto?: boolean;
  /** Ícono a la izquierda del texto (de lucide-react) */
  icono?: ReactNode;
};

function clases({ variante = "secundario", tamano = "normal", anchoCompleto }: Estilo, extra?: string) {
  return [css.boton, css[variante], tamano === "chico" && css.chico, anchoCompleto && css.anchoCompleto, extra]
    .filter(Boolean)
    .join(" ");
}

type PropsBoton = Estilo &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** Muestra un indicador y desactiva el botón mientras se espera la respuesta */
    cargando?: boolean;
  };

export function Boton({ variante, tamano, anchoCompleto, icono, cargando, className, type = "button", disabled, children, ...props }: PropsBoton) {
  return (
    <button
      type={type}
      className={clases({ variante, tamano, anchoCompleto }, className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando ? <LoaderCircle className={css.girando} aria-hidden size={18} /> : icono}
      {children}
    </button>
  );
}

export function EnlaceBoton({ variante, tamano, anchoCompleto, icono, className, children, ...props }: Estilo & LinkProps) {
  return (
    <Link className={clases({ variante, tamano, anchoCompleto }, className)} {...props}>
      {icono}
      {children}
    </Link>
  );
}
