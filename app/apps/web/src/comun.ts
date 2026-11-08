// Lo que comparten las pantallas (la Ventanilla, el Cierre, la Jornada):
// formatos de hora, de fecha y de montos, nombres de divisa y la regla de qué
// elemento con foco «es un campo».

import { aBigint, type FilaPizarra } from "./api/esquemas.ts";
import { formatearMonto, formatearTasa } from "@atk/shared/dinero";
import { useEffect, useState } from "react";

/** La zona de la casa mientras no llegan los parámetros (CLAUDE.md: Coyhaique, no Santiago). */
export const ZONA_CASA = "America/Coyhaique";

/** ¿Hay datos de ejemplo en pantalla? Los mocks corren solo con VITE_MOCKS=1. */
export const DATOS_DE_EJEMPLO = import.meta.env.VITE_MOCKS === "1";

const horas = new Map<string, Intl.DateTimeFormat>();

/** "HH:MM" de un instante ISO en la zona de la casa. */
export function hora(iso: string, zona: string = ZONA_CASA): string {
  let formato = horas.get(zona);
  if (!formato) {
    formato = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zona });
    horas.set(zona, formato);
  }
  return formato.format(new Date(iso));
}

/** Pesos con su signo: 428400n → "$428.400"; un negativo, "−$1.000". */
export function pesos(monto: bigint, decimales = 0): string {
  return monto < 0n ? `−$${formatearMonto(-monto, decimales)}` : `$${formatearMonto(monto, decimales)}`;
}

/** Una tasa E6 del contrato (string) con los decimales de su divisa; sin tasa, una raya. */
export function tasa(e6: string | null | undefined, decimalesTasa: number): string {
  return e6 == null ? "—" : formatearTasa(aBigint(e6), decimalesTasa);
}

/**
 * Un monto en unidad mínima con el símbolo de su moneda: "US$ 450,00",
 * "$3.482.150" (el peso va pegado, como en pesos()); un negativo, "−US$ 2.450,00".
 */
export function conSimbolo(monto: bigint, moneda: { simbolo: string; decimales: number }): string {
  const cifra = formatearMonto(monto < 0n ? -monto : monto, moneda.decimales);
  const texto = moneda.simbolo === "$" ? `$${cifra}` : `${moneda.simbolo} ${cifra}`;
  return monto < 0n ? `−${texto}` : texto;
}

const fechas = new Map<string, Intl.DateTimeFormat>();

/** La fecha local "AAAA-MM-DD" de un instante en la zona de la casa (el «hoy» de la casa, no el del navegador). */
export function fechaEn(instante: Date, zona: string = ZONA_CASA): string {
  let formato = fechas.get(zona);
  if (!formato) {
    formato = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zona });
    fechas.set(zona, formato);
  }
  return formato.format(instante);
}

const diaDeSemana = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** "2026-11-08" → «Domingo 8 de noviembre» (la fecha es de calendario: se lee en UTC para que no se corra). */
export function diaLargo(fecha: string): string {
  const texto = diaDeSemana.format(new Date(`${fecha}T12:00:00Z`)).replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El monto de la divisa con su símbolo: "US$ 450,00". */
export function montoDivisa(monto: string, fila: Pick<FilaPizarra, "simbolo" | "decimales"> | undefined): string {
  const texto = formatearMonto(aBigint(monto), fila?.decimales ?? 2);
  return fila ? `${fila.simbolo} ${texto}` : texto;
}

/** El rótulo del monto: «Monto en dólares». */
const PLURALES: Record<string, string> = { USD: "dólares", ARS: "pesos argentinos", EUR: "euros" };
export const montoEn = (codigo: string) => `Monto en ${PLURALES[codigo] ?? codigo}`;

export const TIPO = { COMPRA: "Compra", VENTA: "Venta" } as const;

/**
 * Un campo donde se escribe: los atajos de una letra no actúan ahí (salvo en
 * el del monto, que el registro trata aparte).
 */
export function esCampoDeTexto(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["radio", "checkbox", "button", "submit", "reset", "range", "color", "file"].includes(el.type);
}

/** Un control que Enter o Espacio ya activan por su cuenta. */
export function esActivable(el: Element | null): boolean {
  return el instanceof HTMLElement && el.closest("button, a[href], [role='button'], summary") !== null;
}

/** Un reloj que avanza cada `cadaMs` (para el «cambió hace N min»). */
export function useAhora(cadaMs = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}
