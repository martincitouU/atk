// Piezas con que se arman los esquemas de cada tema.
//
// Los montos y tasas viajan en JSON como texto de dígitos ("15025") porque
// JSON no tiene enteros grandes y un number perdería precisión. Al validar
// se convierten a bigint, que es lo que reciben los servicios.

import { z } from "zod";

/** Entero no negativo como texto → bigint. Si es mayor que cero lo decide el servicio. */
export const entero = z
  .string()
  .regex(/^[0-9]{1,30}$/, "Debe ser un número entero sin puntos ni comas")
  .transform((texto) => BigInt(texto));

/** Monto en la unidad mínima de su moneda (US$ 150,25 → "15025"). */
export const monto = entero;

/** Tasa, precio o margen con escala ×10^6 (958,50 → "958500000"). */
export const escalaE6 = entero;

/** Id de una fila, en el cuerpo JSON. */
export const id = z.number().int().positive();

/** Id que llega como texto en la URL (/operaciones/7). */
export const idEnTexto = z.coerce.number().int().positive();

/** Código ISO 4217 de una moneda. */
export const codigoMoneda = z.string().regex(/^[A-Z]{3}$/, "Código de moneda de tres letras, por ejemplo USD");

/** Fecha y hora con zona (ISO 8601) → Date. */
export const instante = z.iso.datetime({ offset: true }).transform((texto) => new Date(texto));

/** Texto libre opcional; el servicio quita espacios y convierte "" en null. */
export const textoOpcional = z.string().max(500).nullish();
