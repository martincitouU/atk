// Pestañas que navegan entre secciones de una vista (Caja: Turno | Gastos).
// Cada pestaña es un enlace: la sección queda en la URL y se puede recargar.

import { NavLink } from "react-router";
import css from "./Pestanas.module.css";

export function Pestanas({ etiqueta, pestanas }: { etiqueta: string; pestanas: { a: string; texto: string; fin?: boolean }[] }) {
  return (
    <nav aria-label={etiqueta} className={css.pestanas}>
      {pestanas.map((p) => (
        <NavLink key={p.a} to={p.a} end={p.fin} className={({ isActive }) => (isActive ? `${css.pestana} ${css.activa}` : css.pestana)}>
          {p.texto}
        </NavLink>
      ))}
    </nav>
  );
}
