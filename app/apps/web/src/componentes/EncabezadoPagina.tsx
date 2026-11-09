// Título de cada vista (DESIGN.md › Section Heading), con su descripción,
// sus acciones a la derecha y, si corresponde, un enlace para volver.

import { ArrowLeft } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import css from "./EncabezadoPagina.module.css";

/** El título de la pestaña del navegador: lo primero que lee un lector de pantalla. */
export function useTituloPestana(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} · Casa de cambio`;
  }, [titulo]);
}

type Props = {
  titulo: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  volver?: { a: string; texto: string };
};

export function EncabezadoPagina({ titulo, descripcion, acciones, volver }: Props) {
  useTituloPestana(typeof titulo === "string" ? titulo : "Casa de cambio");
  return (
    <header className={css.encabezado}>
      <div className={css.textos}>
        {volver && (
          <Link to={volver.a} className={css.volver}>
            <ArrowLeft size={16} aria-hidden />
            {volver.texto}
          </Link>
        )}
        <h1 className={css.titulo}>{titulo}</h1>
        {descripcion && <p className={css.descripcion}>{descripcion}</p>}
      </div>
      {acciones && <div className={css.acciones}>{acciones}</div>}
    </header>
  );
}
