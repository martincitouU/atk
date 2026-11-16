// Cálculos con dinero (RF-03). Todo en bigint: montos en la unidad mínima
// de su moneda, tasas y precios ×10^6 (sufijo E6). Nada aquí usa number
// para dinero ni redondea sin decirlo.
//
// Regla del negocio: se redondea a favor de la casa. Lo que la casa paga,
// hacia abajo; lo que cobra, hacia arriba. Los márgenes y costos (que no se
// cobran) van al más cercano.

export const ESCALA = 1_000_000n; // ×10^6
const CIEN_POR_CIENTO_E6 = 100n * ESCALA;

export type Redondeo = "ABAJO" | "ARRIBA" | "CERCANO";
export type TipoOperacion = "COMPRA" | "VENTA";

export const potencia10 = (exponente: number): bigint => 10n ** BigInt(exponente);
const absoluto = (n: bigint): bigint => (n < 0n ? -n : n);

/**
 * a / b con redondeo explícito. ABAJO y ARRIBA son piso y techo (también con
 * negativos); CERCANO redondea los .5 alejándose de cero.
 */
export function dividir(a: bigint, b: bigint, redondeo: Redondeo): bigint {
  if (b === 0n) throw new RangeError("División por cero");
  const signo = (a < 0n) !== (b < 0n) ? -1n : 1n;
  const [na, nb] = [absoluto(a), absoluto(b)];
  const cociente = na / nb;
  const resto = na % nb;
  if (resto === 0n) return signo * cociente;

  // Con el signo aparte, "hacia arriba" en valor absoluto depende del signo
  const alejarDeCero =
    redondeo === "CERCANO" ? 2n * resto >= nb : redondeo === "ARRIBA" ? signo > 0n : signo < 0n;
  return signo * (alejarDeCero ? cociente + 1n : cociente);
}

/** Lo que la casa paga se redondea hacia abajo; lo que cobra, hacia arriba. */
export const redondeoDe = (tipo: TipoOperacion): Redondeo => (tipo === "COMPRA" ? "ABAJO" : "ARRIBA");

export type ReglaPrecio = {
  tipoMargen: "PORCENTAJE" | "MONTO_FIJO";
  margenCompraE6: bigint;
  margenVentaE6: bigint;
};

/**
 * Precios de pizarra a partir de la tasa de referencia (RF-08).
 *   PORCENTAJE: compra = ref × (1 − m/100)   venta = ref × (1 + m/100)
 *   MONTO_FIJO: compra = ref − m             venta = ref + m
 * Compra hacia abajo y venta hacia arriba, a `decimalesTasa` decimales.
 */
export function calcularPrecios(
  referenciaE6: bigint,
  regla: ReglaPrecio,
  decimalesTasa: number,
): { compraE6: bigint; ventaE6: bigint } {
  if (decimalesTasa < 0 || decimalesTasa > 6) throw new RangeError("decimalesTasa debe estar entre 0 y 6");
  // Un paso de precio a `decimalesTasa` decimales, expresado en E6
  const paso = potencia10(6 - decimalesTasa);

  let compraE6: bigint;
  let ventaE6: bigint;
  if (regla.tipoMargen === "PORCENTAJE") {
    // Una sola división por precio: así no se redondea dos veces
    compraE6 = dividir(referenciaE6 * (CIEN_POR_CIENTO_E6 - regla.margenCompraE6), CIEN_POR_CIENTO_E6 * paso, "ABAJO") * paso;
    ventaE6 = dividir(referenciaE6 * (CIEN_POR_CIENTO_E6 + regla.margenVentaE6), CIEN_POR_CIENTO_E6 * paso, "ARRIBA") * paso;
  } else {
    compraE6 = dividir(referenciaE6 - regla.margenCompraE6, paso, "ABAJO") * paso;
    ventaE6 = dividir(referenciaE6 + regla.margenVentaE6, paso, "ARRIBA") * paso;
  }

  if (compraE6 <= 0n) throw new RangeError("El margen de compra deja un precio de compra que no es positivo");
  return { compraE6, ventaE6 };
}

/**
 * Regla con el margen reducido por la categoría del cliente (RF-18):
 * margen × (1 − descuento). Con 30 %, un margen de 1,5 % queda en 1,05 %.
 * El margen reducido se redondea hacia arriba: a favor de la casa.
 */
export function reglaConDescuento(regla: ReglaPrecio, descuentoPctE6: bigint): ReglaPrecio {
  const queda = CIEN_POR_CIENTO_E6 - descuentoPctE6;
  return {
    tipoMargen: regla.tipoMargen,
    margenCompraE6: dividir(regla.margenCompraE6 * queda, CIEN_POR_CIENTO_E6, "ARRIBA"),
    margenVentaE6: dividir(regla.margenVentaE6 * queda, CIEN_POR_CIENTO_E6, "ARRIBA"),
  };
}

/**
 * Valor de un monto de divisa en moneda base, en la unidad mínima de la base.
 *   base = montoDivisa / 10^decDivisa × tasa  →  × 10^decBase
 */
export function convertirABase(p: {
  montoDivisa: bigint;
  decimalesDivisa: number;
  tasaE6: bigint;
  decimalesBase: number;
  redondeo: Redondeo;
}): bigint {
  return dividir(
    p.montoDivisa * p.tasaE6 * potencia10(p.decimalesBase),
    potencia10(p.decimalesDivisa) * ESCALA,
    p.redondeo,
  );
}

/** Lo que paga o cobra la casa en moneda base por una operación (RF-03). */
export function montoBaseDe(p: {
  tipo: TipoOperacion;
  montoDivisa: bigint;
  decimalesDivisa: number;
  tasaE6: bigint;
  decimalesBase: number;
}): bigint {
  return convertirABase({ ...p, redondeo: redondeoDe(p.tipo) });
}

/**
 * Margen bruto (RF-03): lo que la casa gana frente a la tasa de referencia,
 * en unidad mínima de la moneda base. Incluye lo que deja el redondeo.
 *   VENTA:  cobrado − valor a referencia      COMPRA: valor a referencia − pagado
 */
export function margenBruto(p: {
  tipo: TipoOperacion;
  montoDivisa: bigint;
  decimalesDivisa: number;
  montoBase: bigint;
  tasaReferenciaE6: bigint;
  decimalesBase: number;
}): bigint {
  const aReferencia = convertirABase({
    montoDivisa: p.montoDivisa,
    decimalesDivisa: p.decimalesDivisa,
    tasaE6: p.tasaReferenciaE6,
    decimalesBase: p.decimalesBase,
    redondeo: "CERCANO",
  });
  return p.tipo === "VENTA" ? p.montoBase - aReferencia : aReferencia - p.montoBase;
}

/** Margen realizado de una venta: lo cobrado menos lo que costó esa divisa. */
export function margenRealizado(p: {
  montoDivisa: bigint;
  decimalesDivisa: number;
  montoBase: bigint;
  costoPromedioE6: bigint;
  decimalesBase: number;
}): bigint {
  const costo = convertirABase({
    montoDivisa: p.montoDivisa,
    decimalesDivisa: p.decimalesDivisa,
    tasaE6: p.costoPromedioE6,
    decimalesBase: p.decimalesBase,
    redondeo: "CERCANO",
  });
  return p.montoBase - costo;
}

/**
 * Costo promedio ponderado del stock de una divisa después de agregar
 * (cantidad > 0) o quitar (cantidad < 0) un lote a `costoLoteE6`.
 * Si el stock queda en cero o negativo, el costo anterior se mantiene.
 * Un stock sin costo conocido se valoriza al costo del lote.
 */
export function costoPromedio(p: {
  saldo: bigint;
  costoE6: bigint | null;
  cantidad: bigint;
  costoLoteE6: bigint;
}): bigint | null {
  const saldoPrevio = p.saldo > 0n ? p.saldo : 0n;
  const nuevoSaldo = saldoPrevio + p.cantidad;
  if (nuevoSaldo <= 0n) return p.costoE6;
  const costoPrevio = p.costoE6 ?? p.costoLoteE6;
  return dividir(saldoPrevio * costoPrevio + p.cantidad * p.costoLoteE6, nuevoSaldo, "CERCANO");
}

/** Equivalente en USD de un monto en moneda base (RF-17, RF-19), en unidad mínima del USD. */
export function equivalenteUsd(p: {
  montoBase: bigint;
  decimalesBase: number;
  tasaUsdE6: bigint;
  decimalesUsd: number;
}): bigint {
  return dividir(
    p.montoBase * potencia10(p.decimalesUsd) * ESCALA,
    potencia10(p.decimalesBase) * p.tasaUsdE6,
    "CERCANO",
  );
}

/** ¿La tasa se aleja de la pizarra a lo más `maximoPctE6` %? (tasa preferencial) */
export function dentroDeDesviacion(tasaE6: bigint, pizarraE6: bigint, maximoPctE6: bigint): boolean {
  return absoluto(tasaE6 - pizarraE6) * CIEN_POR_CIENTO_E6 <= maximoPctE6 * pizarraE6;
}

/**
 * Lee un decimal escrito como texto ("5", "5.25", "5,25", "-0.5") y lo
 * devuelve ×10^`decimales`, exacto. Rechaza más decimales de los permitidos
 * en vez de redondear en silencio.
 */
export function leerDecimal(texto: string, decimales = 6): bigint {
  const limpio = texto.trim().replace(",", ".");
  const coincidencia = /^(-?)(\d+)(?:\.(\d+))?$/.exec(limpio);
  if (!coincidencia) throw new RangeError(`"${texto}" no es un número válido`);
  const [, signo = "", enteros = "0", fraccion = ""] = coincidencia;
  if (fraccion.length > decimales) {
    throw new RangeError(`"${texto}" tiene más de ${decimales} decimales`);
  }
  const valor = BigInt(enteros + fraccion.padEnd(decimales, "0"));
  return signo === "-" ? -valor : valor;
}

/**
 * Formato chileno de una tasa E6 con al menos `decimalesMinimos` decimales:
 * 954100000n → "954,10"; una tasa preferencial 954123400n → "954,1234".
 */
export function formatearTasa(tasaE6: bigint, decimalesMinimos: number): string {
  const completo = formatearMonto(tasaE6, 6);
  const [enteros = "0", fraccion = ""] = completo.split(",");
  let recortada = fraccion;
  while (recortada.length > decimalesMinimos && recortada.endsWith("0")) recortada = recortada.slice(0, -1);
  return recortada ? `${enteros},${recortada}` : enteros;
}

/**
 * Formato chileno de un monto en unidad mínima: 123456789n con 2 decimales
 * → "1.234.567,89". Solo para mensajes y pantallas.
 */
export function formatearMonto(monto: bigint, decimales: number): string {
  const negativo = monto < 0n;
  const texto = absoluto(monto).toString().padStart(decimales + 1, "0");
  const enteros = texto.slice(0, texto.length - decimales) || "0";
  const fraccion = decimales > 0 ? texto.slice(texto.length - decimales) : "";
  const conMiles = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (negativo ? "-" : "") + conMiles + (fraccion ? `,${fraccion}` : "");
}
