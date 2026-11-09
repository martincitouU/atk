import { describe, expect, it } from "vitest";
import {
  formatearConSimbolo,
  formatearMonto,
  formatearPorcentaje,
  formatearTasa,
  leerMonto,
  leerTasa,
} from "../src/lib/montos.ts";

describe("formatearMonto", () => {
  it.each([
    ["15025", 2, "150,25"],
    ["5", 2, "0,05"],
    ["0", 2, "0,00"],
    ["95410", 0, "95.410"],
    ["0", 0, "0"],
    ["123456789", 2, "1.234.567,89"],
    ["-1000", 0, "-1.000"],
    ["-5", 2, "-0,05"],
    // Más grande que Number.MAX_SAFE_INTEGER: un number ya lo habría deformado
    ["90071992547409930", 2, "900.719.925.474.099,30"],
  ])("%s con %i decimales → %s", (monto, decimales, esperado) => {
    expect(formatearMonto(monto, decimales)).toBe(esperado);
  });

  it("acepta bigint", () => {
    expect(formatearMonto(15025n, 2)).toBe("150,25");
  });
});

describe("formatearConSimbolo", () => {
  it.each([
    ["15025", 2, "US$", "US$ 150,25"],
    ["95410", 0, "$", "$ 95.410"],
    ["-1000", 0, "$", "-$ 1.000"],
  ])("%s → %s", (monto, decimales, simbolo, esperado) => {
    expect(formatearConSimbolo(monto, decimales as number, simbolo as string)).toBe(esperado);
  });
});

describe("formatearTasa", () => {
  it.each([
    ["954100000", 2, "954,10"],
    ["954100000", 0, "954,1"],
    ["712500", 4, "0,7125"],
    ["750000", 4, "0,7500"],
    ["1040400000", 2, "1.040,40"],
    ["954123456", 2, "954,123456"], // sin redondear: se ve la tasa exacta
  ])("%s con mínimo %i → %s", (tasa, minimos, esperado) => {
    expect(formatearTasa(tasa, minimos)).toBe(esperado);
  });
});

describe("formatearPorcentaje", () => {
  it.each([
    ["1500000", "1,5 %"],
    ["30000000", "30 %"],
    ["0", "0 %"],
  ])("%s → %s", (pct, esperado) => {
    expect(formatearPorcentaje(pct)).toBe(esperado);
  });
});

describe("leerMonto", () => {
  it.each([
    ["150,25", 2, "15025"],
    ["150", 2, "15000"],
    ["1.500,5", 2, "150050"],
    ["1.500", 2, "150000"],
    ["0,05", 2, "5"],
    ["95.410", 0, "95410"],
    ["95410", 0, "95410"],
    [" 1 500 ", 0, "1500"],
    ["007", 0, "7"],
    ["0", 0, "0"],
  ])("%j con %i decimales → %s", (texto, decimales, esperado) => {
    expect(leerMonto(texto, decimales)).toBe(esperado);
  });

  it.each([
    ["1,234", 2], // más decimales que la moneda: no se redondea
    ["150,5", 0],
    ["150.25", 2], // el punto es de miles: "150.25" no es un monto
    ["1.5", 2],
    ["", 2],
    [",5", 2],
    ["-10", 0], // los montos que se escriben son positivos
    ["1e3", 0],
    ["abc", 2],
    ["1,", 2],
  ])("%j con %i decimales → null", (texto, decimales) => {
    expect(leerMonto(texto, decimales)).toBeNull();
  });
});

describe("leerTasa", () => {
  it.each([
    ["954,10", "954100000"],
    ["0,7125", "712500"],
    ["1.040,4", "1040400000"],
  ])("%s → %s", (texto, esperado) => {
    expect(leerTasa(texto)).toBe(esperado);
  });

  it("rechaza más de 6 decimales", () => {
    expect(leerTasa("1,1234567")).toBeNull();
  });
});
