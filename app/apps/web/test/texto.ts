import type { MatcherFunction } from "@testing-library/react";

/**
 * Busca un texto aunque lo corte un <Sep /> («Turno abierto · Caja 1»): getByText
 * solo mira el texto propio de cada elemento. Coincide el elemento más interno
 * cuyo textContent, con los espacios normalizados (el separador lleva un
 * espacio duro), es el texto o cumple la expresión.
 */
export function texto(esperado: string | RegExp): MatcherFunction {
  const coincide = (el: Element) => {
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof esperado === "string" ? t === esperado : esperado.test(t);
  };
  return (_contenido, el) => el !== null && coincide(el) && !Array.from(el.children).some(coincide);
}
