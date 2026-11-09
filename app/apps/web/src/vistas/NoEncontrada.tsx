import { Compass } from "lucide-react";
import { EnlaceBoton } from "../componentes/Boton.tsx";
import css from "./Mensaje.module.css";

/** Una dirección que no existe en la app. */
export function NoEncontrada() {
  return (
    <div className={`${css.mensaje} ${css.pantallaCompleta}`}>
      <span className={css.icono}>
        <Compass size={24} aria-hidden />
      </span>
      <h1 className={css.titulo}>Esta página no existe</h1>
      <p className={css.texto}>Revisa la dirección o vuelve al inicio.</p>
      <EnlaceBoton to="/">Ir al inicio</EnlaceBoton>
    </div>
  );
}
