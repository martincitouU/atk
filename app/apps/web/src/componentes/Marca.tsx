// Marca de la app: dos círculos que se cruzan (un cambio de divisas) y el
// nombre de la casa. La marca es la de la casa de cambio, no la de DESIGN.md.

import css from "./Marca.module.css";

type Props = {
  nombre: string;
  tamano?: "normal" | "grande";
  /** En teléfonos angostos queda solo el símbolo (el nombre lo sigue leyendo el lector de pantalla) */
  compactaEnMovil?: boolean;
};

export function Marca({ nombre, tamano = "normal", compactaEnMovil }: Props) {
  const clases = [css.marca, tamano === "grande" && css.grande, compactaEnMovil && css.compacta].filter(Boolean).join(" ");
  return (
    <span className={clases}>
      <svg className={css.simbolo} viewBox="0 0 32 32" aria-hidden>
        <circle cx="12" cy="16" r="9" fill="var(--color-magenta)" />
        <circle cx="20" cy="16" r="9" fill="var(--color-electric-violet)" fillOpacity="0.85" />
      </svg>
      <span className={css.nombre}>{nombre}</span>
    </span>
  );
}
