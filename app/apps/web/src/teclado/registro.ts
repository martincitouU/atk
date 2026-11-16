// El registro con teclado: un reductor puro. Recibe el borrador y una tecla
// (el `key` del evento) y devuelve el borrador siguiente, más la acción que
// la pantalla debe hacer (confirmar, dejar borrador o limpiar).
//
//   C / V        el tipo; el dígito que sigue (1..n) elige la divisa
//   ↑ / ↓        la divisa anterior o siguiente, en cualquier momento
//   0–9 y ,      el monto (una sola coma); Backspace borra
//   Enter        confirmar (solo con un monto distinto de cero)
//   B            dejar borrador (ídem)
//   Esc          limpiar: conserva el tipo y la divisa
//
// El folio y el medio de pago se escriben en sus campos: el reductor no los
// toca, salvo Esc, que los limpia.

import { leerDecimal } from "@atk/shared/dinero";

export type Tipo = "COMPRA" | "VENTA";
export type MedioPago = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA";

export type Borrador = {
  tipo: Tipo;
  moneda: string;
  /** Lo escrito, sin miles: dígitos y a lo más una coma ("450,25"). */
  monto: string;
  medioPago: MedioPago;
  folio: string;
  /** Recién se pulsó C o V: el próximo dígito entre 1 y n elige la divisa. */
  esperaDivisa: boolean;
};

export type Accion = "CONFIRMAR" | "BORRADOR" | "LIMPIAR";

/** El borrador vacío del registro. */
export const borradorVacio = (moneda: string, tipo: Tipo = "COMPRA"): Borrador => ({
  tipo,
  moneda,
  monto: "",
  medioPago: "EFECTIVO",
  folio: "",
  esperaDivisa: false,
});

/** Hay un monto que se puede enviar: algún dígito distinto de cero. */
const hayMonto = (monto: string) => /[1-9]/.test(monto);

/** Agrega un dígito al monto, sin ceros a la izquierda ("0" + "7" → "7"). */
function agregarDigito(monto: string, digito: string): string {
  return monto === "0" ? digito : monto + digito;
}

export function teclear(b: Borrador, tecla: string, divisas: readonly string[]): { borrador: Borrador; accion?: Accion } {
  const t = tecla.length === 1 ? tecla.toLowerCase() : tecla;

  if (/^\d$/.test(t)) {
    if (b.esperaDivisa) {
      const elegida = divisas[Number(t) - 1];
      if (Number(t) >= 1 && elegida !== undefined) return { borrador: { ...b, moneda: elegida, esperaDivisa: false } };
    }
    return { borrador: { ...b, monto: agregarDigito(b.monto, t), esperaDivisa: false } };
  }

  switch (t) {
    case "c":
    case "v":
      return { borrador: { ...b, tipo: t === "c" ? "COMPRA" : "VENTA", esperaDivisa: true } };

    case "ArrowDown":
    case "ArrowUp": {
      if (divisas.length === 0) return { borrador: b };
      const actual = Math.max(0, divisas.indexOf(b.moneda));
      const paso = t === "ArrowDown" ? 1 : -1;
      const moneda = divisas[(actual + paso + divisas.length) % divisas.length] ?? b.moneda;
      return { borrador: { ...b, moneda, esperaDivisa: false } };
    }

    case ",":
      if (b.monto.includes(",")) return { borrador: { ...b, esperaDivisa: false } };
      return { borrador: { ...b, monto: (b.monto || "0") + ",", esperaDivisa: false } };

    case "Backspace":
      return { borrador: { ...b, monto: b.monto.slice(0, -1), esperaDivisa: false } };

    case "Enter":
      return hayMonto(b.monto) ? { borrador: b, accion: "CONFIRMAR" } : { borrador: b };

    case "b":
      return hayMonto(b.monto) ? { borrador: b, accion: "BORRADOR" } : { borrador: b };

    case "Escape":
      return { borrador: borradorVacio(b.moneda, b.tipo), accion: "LIMPIAR" };

    default:
      return { borrador: b };
  }
}

/**
 * El monto en unidad mínima de la divisa, o null si lo escrito no es un
 * número válido con esos decimales, o si es cero.
 */
export function montoMinimo(b: Pick<Borrador, "monto">, decimales: number): bigint | null {
  try {
    const valor = leerDecimal(b.monto, decimales);
    return valor > 0n ? valor : null;
  } catch {
    return null;
  }
}

/** Lo escrito, con los miles agrupados para leerlo: "150000" → "150.000"; "1200,5" → "1.200,5". */
export function verMonto(monto: string): string {
  const [enteros = "", ...resto] = monto.split(",");
  const agrupados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto.length > 0 ? `${agrupados},${resto.join("")}` : agrupados;
}

/**
 * Lo que dejó el campo del monto tras una edición nativa (pegar, teclado del
 * teléfono): solo dígitos y la primera coma; los puntos de miles se ignoran.
 */
export function limpiarMonto(texto: string): string {
  const soloValidos = texto.replace(/[^\d,]/g, "");
  const coma = soloValidos.indexOf(",");
  const limpio = coma === -1 ? soloValidos : soloValidos.slice(0, coma + 1) + soloValidos.slice(coma + 1).replace(/,/g, "");
  return limpio.replace(/^0+(?=\d)/, "");
}
