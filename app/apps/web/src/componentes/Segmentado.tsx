// Selector de una opción entre pocas (Venta | Compra). Por dentro son
// radios de verdad: se usan con el teclado (flechas) sin código extra.

import { useId } from "react";
import css from "./Segmentado.module.css";

type Props<T extends string> = {
  /** Qué se elige; lo leen los lectores de pantalla */
  etiqueta: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  alCambiar: (valor: T) => void;
  anchoCompleto?: boolean;
};

export function Segmentado<T extends string>({ etiqueta, opciones, valor, alCambiar, anchoCompleto }: Props<T>) {
  const nombre = useId();
  return (
    <fieldset className={[css.segmentado, anchoCompleto && css.anchoCompleto].filter(Boolean).join(" ")}>
      <legend className="solo-lectores">{etiqueta}</legend>
      {opciones.map((opcion) => (
        <label key={opcion.valor} className={css.opcion}>
          <input
            type="radio"
            name={nombre}
            value={opcion.valor}
            checked={valor === opcion.valor}
            onChange={() => alCambiar(opcion.valor)}
          />
          <span>{opcion.texto}</span>
        </label>
      ))}
    </fieldset>
  );
}
