// Montos y tasas para mostrar y escribir.
//
// El front NO calcula dinero: precios, montos y márgenes los calcula la API
// (por ejemplo, POST /api/operaciones/previsualizar). Aquí solo se traduce
// entre lo que ve el cajero y el texto de dígitos que viaja en el JSON:
//
//   API "15025" (US$, unidad mínima, 2 decimales)  ↔  pantalla "150,25"
//
// Siempre con texto o bigint: un number pierde precisión en montos grandes.
// El formato es el chileno (punto de miles, coma decimal), igual que los
// mensajes de la API (apps/api/src/dominio/dinero.ts).

/** "15025" con 2 decimales → "150,25"; "-1000" con 0 → "-1.000". */
export function formatearMonto(monto: string | bigint, decimales: number): string {
  const valor = BigInt(monto);
  const negativo = valor < 0n;
  const digitos = (negativo ? -valor : valor).toString().padStart(decimales + 1, "0");
  const enteros = digitos.slice(0, digitos.length - decimales);
  const fraccion = decimales > 0 ? digitos.slice(digitos.length - decimales) : "";
  const conMiles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (negativo ? "-" : "") + conMiles + (fraccion ? `,${fraccion}` : "");
}

/** Con el símbolo de la moneda: "US$ 150,25", "$ 95.410", "-$ 1.000". */
export function formatearConSimbolo(monto: string | bigint, decimales: number, simbolo: string): string {
  const texto = formatearMonto(monto, decimales);
  return texto.startsWith("-") ? `-${simbolo} ${texto.slice(1)}` : `${simbolo} ${texto}`;
}

/**
 * Tasa ×10^6 → texto, sin redondear y con al menos `decimalesMinimos`:
 * "954100000" con 2 → "954,10"; "712500" con 4 → "0,7125".
 */
export function formatearTasa(tasaE6: string | bigint, decimalesMinimos: number): string {
  const [enteros = "0", fraccion = ""] = formatearMonto(tasaE6, 6).split(",");
  let recortada = fraccion;
  while (recortada.length > decimalesMinimos && recortada.endsWith("0")) recortada = recortada.slice(0, -1);
  return recortada ? `${enteros},${recortada}` : enteros;
}

/** Porcentaje ×10^6 → "1,5 %"; "30000000" → "30 %". */
export function formatearPorcentaje(pctE6: string | bigint): string {
  return `${formatearTasa(pctE6, 0)} %`;
}

// Punto de miles opcional y coma decimal: "1500", "1.500", "1.500,25", "0,5"
const FORMATO_MONTO = /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;

/**
 * Lo que escribe el cajero → texto de dígitos para la API, o null si no es
 * un monto válido. Nunca redondea: más decimales que la moneda es un error.
 *
 *   "150,25" con 2 → "15025"   "95.410" con 0 → "95410"   "1,234" con 2 → null
 */
export function leerMonto(texto: string, decimales: number): string | null {
  const limpio = texto.replace(/\s/g, "");
  if (!FORMATO_MONTO.test(limpio)) return null;
  const [enteros = "", fraccion = ""] = limpio.replace(/\./g, "").split(",");
  if (fraccion.length > decimales) return null;
  return (enteros + fraccion.padEnd(decimales, "0")).replace(/^0+(?=\d)/, "");
}

/**
 * Como leerMonto, pero con signo: un ajuste de caja puede restar.
 * "-1.000" con 0 → "-1000"; "250" con 0 → "250".
 */
export function leerMontoConSigno(texto: string, decimales: number): string | null {
  const limpio = texto.replace(/\s/g, "");
  const negativo = limpio.startsWith("-");
  const valor = leerMonto(negativo ? limpio.slice(1) : limpio, decimales);
  if (valor === null) return null;
  return negativo && valor !== "0" ? `-${valor}` : valor;
}

/** Una tasa es un monto con 6 decimales: "954,10" → "954100000". */
export function leerTasa(texto: string): string | null {
  return leerMonto(texto, 6);
}
