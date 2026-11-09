import { ShieldX } from "lucide-react";
import { EnlaceBoton } from "../componentes/Boton.tsx";
import css from "./Mensaje.module.css";

/** Una sección que el rol de la persona no puede ver. */
export function SinPermiso() {
  return (
    <div className={css.mensaje}>
      <span className={css.icono}>
        <ShieldX size={24} aria-hidden />
      </span>
      <h1 className={css.titulo}>No tienes acceso a esta sección</h1>
      <p className={css.texto}>Pídele a un administrador que revise tu rol si crees que deberías verla.</p>
      <EnlaceBoton to="/">Volver al inicio</EnlaceBoton>
    </div>
  );
}
