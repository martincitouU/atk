import { describe, expect, it } from "vitest";
import {
  calcularPrecios,
  costoPromedio,
  dentroDeDesviacion,
  dividir,
  equivalenteUsd,
  formatearMonto,
  leerDecimal,
  margenBruto,
  margenRealizado,
  montoBaseDe,
  reglaConDescuento,
} from "../../src/dominio/dinero.ts";

describe("dividir: redondeo explícito", () => {
  it.each([
    [7n, 2n, "ABAJO", 3n],
    [7n, 2n, "ARRIBA", 4n],
    [7n, 2n, "CERCANO", 4n], // 3,5 se aleja de cero
    [-7n, 2n, "ABAJO", -4n], // piso de -3,5
    [-7n, 2n, "ARRIBA", -3n], // techo de -3,5
    [-7n, 2n, "CERCANO", -4n],
    [7n, -2n, "ABAJO", -4n],
    [5n, 3n, "CERCANO", 2n], // 1,67
    [4n, 3n, "CERCANO", 1n], // 1,33
    [6n, 3n, "ARRIBA", 2n], // exacta: no redondea
  ] as const)("%s / %s %s = %s", (a, b, redondeo, esperado) => {
    expect(dividir(a, b, redondeo)).toBe(esperado);
  });

  it("rechaza dividir por cero", () => {
    expect(() => dividir(1n, 0n, "ABAJO")).toThrow("División por cero");
  });
});

describe("RF-08: precios de pizarra desde la tasa de referencia", () => {
  const porcentaje = (compra: bigint, venta: bigint) =>
    ({ tipoMargen: "PORCENTAJE", margenCompraE6: compra, margenVentaE6: venta }) as const;

  it.each([
    ["USD", 940_000_000n, 1_500_000n, 2, 925_900_000n, 954_100_000n],
    ["EUR", 1_020_000_000n, 2_000_000n, 2, 999_600_000n, 1_040_400_000n],
    ["BRL", 170_000_000n, 3_000_000n, 2, 164_900_000n, 175_100_000n],
    ["ARS", 750_000n, 5_000_000n, 4, 712_500n, 787_500n],
  ])("%s: los mismos precios de la semilla", (_, referencia, margen, decimales, compra, venta) => {
    expect(calcularPrecios(referencia, porcentaje(margen, margen), decimales)).toEqual({ compraE6: compra, ventaE6: venta });
  });

  it("redondea la compra hacia abajo y la venta hacia arriba", () => {
    // 943,37 × 0,985 = 929,21945 → 929,21     943,37 × 1,015 = 957,52055 → 957,53
    expect(calcularPrecios(943_370_000n, porcentaje(1_500_000n, 1_500_000n), 2)).toEqual({
      compraE6: 929_210_000n,
      ventaE6: 957_530_000n,
    });
  });

  it("aplica margen en monto fijo", () => {
    const regla = { tipoMargen: "MONTO_FIJO", margenCompraE6: 5_000_000n, margenVentaE6: 7_500_000n } as const;
    // 940 − 5 = 935      940 + 7,5 = 947,5 → a 0 decimales, hacia arriba: 948
    expect(calcularPrecios(940_000_000n, regla, 0)).toEqual({ compraE6: 935_000_000n, ventaE6: 948_000_000n });
  });

  it("rechaza un margen que deja la compra en cero o menos", () => {
    const regla = { tipoMargen: "MONTO_FIJO", margenCompraE6: 940_000_000n, margenVentaE6: 0n } as const;
    expect(() => calcularPrecios(940_000_000n, regla, 2)).toThrow("no es positivo");
  });
});

describe("RF-03: monto en pesos de una operación", () => {
  const usd = { decimalesDivisa: 2, decimalesBase: 0 };

  it("venta exacta: US$ 100,00 a 954,10 = $ 95.410", () => {
    expect(montoBaseDe({ ...usd, tipo: "VENTA", montoDivisa: 10_000n, tasaE6: 954_100_000n })).toBe(95_410n);
  });

  it("lo que la casa paga se redondea hacia abajo; lo que cobra, hacia arriba", () => {
    // US$ 10,01 × 925,90 = 9.268,259      US$ 10,01 × 954,10 = 9.550,541
    expect(montoBaseDe({ ...usd, tipo: "COMPRA", montoDivisa: 1_001n, tasaE6: 925_900_000n })).toBe(9_268n);
    expect(montoBaseDe({ ...usd, tipo: "VENTA", montoDivisa: 1_001n, tasaE6: 954_100_000n })).toBe(9_551n);
  });

  it("funciona con divisas que valen menos de un peso (ARS)", () => {
    // AR$ 1.000,00 × 0,7125 = 712,5 → 712      AR$ 1.000,00 × 0,7875 = 787,5 → 788
    expect(montoBaseDe({ ...usd, tipo: "COMPRA", montoDivisa: 100_000n, tasaE6: 712_500n })).toBe(712n);
    expect(montoBaseDe({ ...usd, tipo: "VENTA", montoDivisa: 100_000n, tasaE6: 787_500n })).toBe(788n);
  });

  it("no pierde precisión con montos grandes", () => {
    // US$ 90.000.000.000,00: el producto intermedio supera por mucho 2^53
    const monto = montoBaseDe({ ...usd, tipo: "VENTA", montoDivisa: 9_000_000_000_000n, tasaE6: 954_100_000n });
    expect(monto).toBe(85_869_000_000_000n);
  });
});

describe("RF-03: márgenes", () => {
  const base = { montoDivisa: 10_000n, decimalesDivisa: 2, decimalesBase: 0, tasaReferenciaE6: 940_000_000n };

  it("margen bruto de una venta y de una compra frente a la referencia", () => {
    expect(margenBruto({ ...base, tipo: "VENTA", montoBase: 95_410n })).toBe(1_410n);
    expect(margenBruto({ ...base, tipo: "COMPRA", montoBase: 92_590n })).toBe(1_410n);
  });

  it("margen realizado de una venta frente al costo del stock", () => {
    const margen = margenRealizado({
      montoDivisa: 10_000n,
      decimalesDivisa: 2,
      montoBase: 95_410n,
      costoPromedioE6: 925_900_000n,
      decimalesBase: 0,
    });
    expect(margen).toBe(2_820n);
  });
});

describe("costo promedio ponderado del stock", () => {
  it("el primer lote fija el costo", () => {
    expect(costoPromedio({ saldo: 0n, costoE6: null, cantidad: 10_000n, costoLoteE6: 925_900_000n })).toBe(925_900_000n);
  });

  it("un segundo lote promedia según cantidad", () => {
    expect(costoPromedio({ saldo: 10_000n, costoE6: 925_900_000n, cantidad: 10_000n, costoLoteE6: 930_000_000n })).toBe(
      927_950_000n,
    );
  });

  it("quitar el mismo lote (reverso de una compra) devuelve el costo anterior", () => {
    expect(costoPromedio({ saldo: 20_000n, costoE6: 927_950_000n, cantidad: -10_000n, costoLoteE6: 930_000_000n })).toBe(
      925_900_000n,
    );
  });

  it("si el stock queda en cero, el costo se mantiene", () => {
    expect(costoPromedio({ saldo: 10_000n, costoE6: 925_900_000n, cantidad: -10_000n, costoLoteE6: 930_000_000n })).toBe(
      925_900_000n,
    );
  });
});

describe("RF-17 y RF-19: equivalente en USD", () => {
  it("convierte pesos a centavos de dólar con la tasa de referencia", () => {
    // $ 95.410 / 940 = US$ 101,50
    expect(equivalenteUsd({ montoBase: 95_410n, decimalesBase: 0, tasaUsdE6: 940_000_000n, decimalesUsd: 2 })).toBe(10_150n);
    // $ 5.202.000 / 940 = US$ 5.534,0425… → 5.534,04
    expect(equivalenteUsd({ montoBase: 5_202_000n, decimalesBase: 0, tasaUsdE6: 940_000_000n, decimalesUsd: 2 })).toBe(
      553_404n,
    );
  });
});

describe("tasa preferencial: desviación máxima", () => {
  // 5 % de 954,10 = 47,705
  it.each([
    [1_001_800_000n, true], // +47,70
    [1_001_810_000n, false], // +47,71
    [906_400_000n, true], // −47,70
    [906_390_000n, false], // −47,71
  ])("%s frente a 954,10 con 5 %%: %s", (tasa, permitida) => {
    expect(dentroDeDesviacion(tasa, 954_100_000n, 5_000_000n)).toBe(permitida);
  });
});

describe("leerDecimal: texto a entero escalado, exacto", () => {
  it.each([
    ["5", 6, 5_000_000n],
    ["5,25", 6, 5_250_000n],
    ["5.25", 6, 5_250_000n],
    ["-0.5", 6, -500_000n],
    ["150,25", 2, 15_025n],
    ["  940 ", 6, 940_000_000n],
  ])("%s con %s decimales = %s", (texto, decimales, esperado) => {
    expect(leerDecimal(texto, decimales)).toBe(esperado);
  });

  it.each([["abc"], ["1.2.3"], [""], ["1e5"]])("rechaza %s", (texto) => {
    expect(() => leerDecimal(texto)).toThrow("no es un número válido");
  });

  it("rechaza más decimales de los permitidos en vez de redondear", () => {
    expect(() => leerDecimal("10,005", 2)).toThrow("más de 2 decimales");
  });
});

describe("formatearMonto: formato chileno", () => {
  it.each([
    [123_456_789n, 2, "1.234.567,89"],
    [5n, 2, "0,05"],
    [95_410n, 0, "95.410"],
    [-1_500n, 2, "-15,00"],
    [0n, 0, "0"],
    [712_500n, 6, "0,712500"],
  ])("%s con %s decimales = %s", (monto, decimales, esperado) => {
    expect(formatearMonto(monto, decimales)).toBe(esperado);
  });
});

describe("RF-18: margen reducido por la categoría del cliente", () => {
  it("un 30 % de descuento deja un margen de 1,5 % en 1,05 %", () => {
    const regla = { tipoMargen: "PORCENTAJE", margenCompraE6: 1_500_000n, margenVentaE6: 1_500_000n } as const;
    expect(reglaConDescuento(regla, 30_000_000n)).toEqual({ ...regla, margenCompraE6: 1_050_000n, margenVentaE6: 1_050_000n });
  });

  it("funciona con margen fijo y con descuento total", () => {
    const fijo = { tipoMargen: "MONTO_FIJO", margenCompraE6: 5_000_000n, margenVentaE6: 7_000_000n } as const;
    expect(reglaConDescuento(fijo, 30_000_000n)).toMatchObject({ margenCompraE6: 3_500_000n, margenVentaE6: 4_900_000n });
    expect(reglaConDescuento(fijo, 100_000_000n)).toMatchObject({ margenCompraE6: 0n, margenVentaE6: 0n });
  });

  it("el margen reducido se redondea a favor de la casa", () => {
    // 1 × 0,7 = 0,7 → 1 (hacia arriba)
    const minimo = { tipoMargen: "PORCENTAJE", margenCompraE6: 1n, margenVentaE6: 1n } as const;
    expect(reglaConDescuento(minimo, 30_000_000n)).toMatchObject({ margenCompraE6: 1n, margenVentaE6: 1n });
  });
});
