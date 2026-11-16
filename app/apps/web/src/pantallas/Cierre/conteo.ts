// El conteo de la caja al cerrar: lo que se escribe por denominación (o como
// un total) y lo que suma, siempre con bigint en la unidad mínima de cada
// moneda. Puro: lo prueban los tests sin montar la pantalla.

import { formatearMonto, leerDecimal } from "@atk/shared/dinero";

/** Por billete (cantidad × denominación, más las monedas sueltas) o un total escrito de una vez. */
export type ModoConteo = "billetes" | "total";

export type Conteo = {
  modo: ModoConteo;
  /** Denominación (unidad mínima, como string) → la cantidad escrita (solo dígitos). */
  cantidades: Record<string, string>;
  /** Monedas y sueltos: un monto escrito («1.250» o «3,75»). */
  sueltos: string;
  /** El total, en el modo «total». */
  total: string;
};

export const conteoVacio = (): Conteo => ({ modo: "billetes", cantidades: {}, sueltos: "", total: "" });

export type Lectura = { estado: "sin-contar" } | { estado: "invalido" } | { estado: "contado"; monto: bigint };

/**
 * Un monto escrito a mano, en unidad mínima. Los puntos son de miles y la
 * coma es decimal (convención chilena, como en la pizarra). Null si no es un
 * número, si trae más decimales que la moneda o si es negativo.
 */
export function leerMonto(texto: string, decimales: number): bigint | null {
  try {
    const valor = leerDecimal(texto.replaceAll(".", ""), decimales);
    return valor < 0n ? null : valor;
  } catch {
    return null;
  }
}

/** Lo que vale una fila: cantidad × denominación; sin cantidad, null. */
export function subtotal(cantidad: string, denominacion: bigint): bigint | null {
  return /^\d+$/.test(cantidad) ? BigInt(cantidad) * denominacion : null;
}

/**
 * Cuánto se contó de una moneda. Está «sin contar» mientras no se escribe
 * nada (un 0 escrito sí cuenta: es una caja vacía declarada).
 */
export function leerConteo(c: Conteo, denominaciones: readonly bigint[], decimales: number): Lectura {
  if (c.modo === "total") {
    if (!c.total.trim()) return { estado: "sin-contar" };
    const monto = leerMonto(c.total, decimales);
    return monto === null ? { estado: "invalido" } : { estado: "contado", monto };
  }
  let tocado = false;
  let suma = 0n;
  for (const d of denominaciones) {
    const cantidad = c.cantidades[d.toString()] ?? "";
    if (!cantidad) continue;
    const parcial = subtotal(cantidad, d);
    if (parcial === null) return { estado: "invalido" };
    tocado = true;
    suma += parcial;
  }
  if (c.sueltos.trim()) {
    const sueltos = leerMonto(c.sueltos, decimales);
    if (sueltos === null) return { estado: "invalido" };
    tocado = true;
    suma += sueltos;
  }
  return tocado ? { estado: "contado", monto: suma } : { estado: "sin-contar" };
}

/** Un billete sin decimales vacíos: 10000n con 2 decimales → "100"; 20000n con 0 → "20.000". */
export function billete(denominacion: bigint, decimales: number): string {
  return formatearMonto(denominacion, decimales).replace(/,0+$/, "");
}
