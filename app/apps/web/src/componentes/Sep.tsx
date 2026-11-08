import { Fragment, type ReactNode } from "react";

/**
 * El «·» entre dos datos de una misma línea: `Turno abierto<Sep />Caja 1`,
 * sin espacios alrededor en quien lo usa.
 *
 * El «·» de Overpass viene marcado como acento (GDEF, clase 3) y el navegador
 * le da ancho cero: escrito como texto, el punto se pega a la palabra que
 * sigue («Turno abierto ·Caja 1»). Aquí el punto es el de Overpass Mono, que
 * está centrado en su celda (base.css, `.sep`), entre un espacio duro (la
 * línea no se corta antes del punto) y uno normal, del mismo ancho en
 * Overpass: el mismo aire a cada lado. Los espacios quedan fuera del elemento
 * oculto para que el lector de pantalla no junte las palabras.
 */
export function Sep() {
  return (
    <>
      {" "}
      <span className="sep" aria-hidden="true">
        ·
      </span>{" "}
    </>
  );
}

/** Un texto armado con « · » (un mensaje, una lista), con cada separador como <Sep />. */
export function separar(texto: string): ReactNode {
  return texto.split(" · ").map((parte, i) => (
    <Fragment key={i}>
      {i > 0 && <Sep />}
      {parte}
    </Fragment>
  ));
}
