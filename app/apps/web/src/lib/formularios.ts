// Ayudas para los formularios (react-hook-form): llevar los errores de la
// API a su campo y validar los montos que escribe el cajero.

import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ErrorApi, mensajeDe } from "../api/cliente.ts";
import { leerMonto, leerMontoConSigno } from "./montos.ts";

type Opciones<T extends FieldValues> = {
  /** Errores de negocio que corresponden a un campo: { CORREO_EN_USO: "email" } */
  porCodigo?: Record<string, Path<T>>;
  /** Campos que la API llama distinto que el formulario: { montoDivisa: "monto" } */
  nombres?: Record<string, Path<T>>;
};

/**
 * Lleva un error de la API al formulario. Lo que la API rechazó de un campo
 * aparece junto a ese campo; lo demás vuelve como mensaje para el aviso
 * general (null si ya quedó todo junto a sus campos).
 */
export function errorEnFormulario<T extends FieldValues>(
  error: unknown,
  marcar: UseFormSetError<T>,
  campos: readonly Path<T>[],
  { porCodigo = {}, nombres = {} }: Opciones<T> = {},
): string | null {
  if (!(error instanceof ErrorApi)) return mensajeDe(error);

  const delCodigo = porCodigo[error.codigo];
  if (delCodigo) {
    marcar(delCodigo, { message: error.message });
    return null;
  }

  let marcados = 0;
  for (const detalle of error.detalles) {
    const campo = nombres[detalle.campo] ?? campos.find((c) => c === detalle.campo);
    if (!campo) continue;
    marcar(campo, { message: detalle.mensaje });
    marcados += 1;
  }
  return marcados > 0 && marcados === error.detalles.length ? null : error.message;
}

/** Qué se espera en un campo de monto, para el mensaje de error. */
export const MENSAJE_MONTO = (decimales: number) =>
  decimales === 0 ? "Escribe un monto sin decimales, por ejemplo 15.000" : `Escribe un monto con hasta ${decimales} decimales después de la coma`;

/**
 * Regla de react-hook-form para un monto escrito como se ve ("150,25").
 * Nunca redondea: más decimales que la moneda es un error.
 */
export function reglaMonto(decimales: number, { opcional = false, conSigno = false, mayorQueCero = true } = {}) {
  return (texto: string | undefined) => {
    const limpio = (texto ?? "").trim();
    if (limpio === "") return opcional || "Escribe el monto";
    const valor = conSigno ? leerMontoConSigno(limpio, decimales) : leerMonto(limpio, decimales);
    if (valor === null) return MENSAJE_MONTO(decimales);
    if (mayorQueCero && BigInt(valor) <= 0n) return "El monto debe ser mayor que cero";
    if (conSigno && BigInt(valor) === 0n) return "El ajuste no puede ser cero";
    return true;
  };
}
