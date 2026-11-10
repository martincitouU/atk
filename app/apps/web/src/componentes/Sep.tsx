import { Fragment, type ReactNode } from "react";

/**
 * El «·» entre dos datos de una misma línea: `Turno abierto<Sep />Caja 1`,
 * sin espacios alrededor en quien lo usa.
 *
 * El punto es el de la fuente mono, centrado en su celda (base.css, `.sep`);
 * nació porque el «·» de Overpass, la fuente anterior, tenía ancho cero y se
 * pegaba a la palabra siguiente. Va entre un espacio duro (la línea no se
 * corta antes del punto) y uno normal: el mismo aire a cada lado. Los espacios quedan fuera del elemento
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
