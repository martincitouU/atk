import { useEffect, useState } from "react";

/**
 * El valor, pero recién cuando deja de cambiar por `ms` milisegundos. Así
 * el cálculo de una operación se pide al terminar de escribir, no con cada
 * tecla. Recibe texto (por ejemplo, JSON): dos objetos iguales con distinta
 * identidad harían que nunca se quede quieto.
 */
export function useDemorado(valor: string, ms = 300): string {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const espera = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(espera);
  }, [valor, ms]);
  return demorado;
}
