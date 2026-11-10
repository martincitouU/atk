// Diálogo modal sobre el <dialog> nativo del navegador: ya trae el foco
// atrapado adentro, Escape para cerrar y el fondo inerte.
//
//   <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Reversar">
//     ...contenido...
//   </Dialogo>

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import css from "./Dialogo.module.css";

type Props = {
  abierto: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  descripcion?: ReactNode;
  /** Botones al pie (la acción principal, a la derecha) */
  acciones?: ReactNode;
  children?: ReactNode;
};

export function Dialogo({ abierto, alCerrar, titulo, descripcion, acciones, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (abierto && !dialogo.open) {
      // showModal y close no existen en el entorno de los tests (jsdom)
      if (typeof dialogo.showModal === "function") dialogo.showModal();
      else dialogo.setAttribute("open", "");
    } else if (!abierto && dialogo.open) {
      if (typeof dialogo.close === "function") dialogo.close();
      else dialogo.removeAttribute("open");
    }
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className={css.dialogo}
      aria-labelledby={idTitulo}
      onClose={alCerrar}
      // Un clic fuera del contenido (en el velo) también cierra
      onClick={(evento) => evento.target === ref.current && alCerrar()}
    >
      <div className={css.contenido}>
        <header className={css.encabezado}>
          <div>
            <h2 id={idTitulo} className={css.titulo}>
              {titulo}
            </h2>
            {descripcion && <p className={css.descripcion}>{descripcion}</p>}
          </div>
          <button type="button" className={css.cerrar} onClick={alCerrar} aria-label="Cerrar">
            <X size={20} aria-hidden />
          </button>
        </header>
        {abierto && children}
        {acciones && <footer className={css.pie}>{acciones}</footer>}
      </div>
    </dialog>
  );
}
