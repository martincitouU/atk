import { describe, expect, it } from "vitest";
import { cambiosOperacion, entero, entradaOperacion, entradaReverso, filtrosOperaciones } from "../src/index.ts";

describe("montos como texto → bigint", () => {
  it.each([
    ["0", 0n],
    ["15025", 15025n],
    ["123456789012345678901234567890", 123456789012345678901234567890n], // sin perder precisión
  ])("acepta %s", (texto, esperado) => {
    expect(entero.parse(texto)).toBe(esperado);
  });

  it.each([
    ["number", 15025],
    ["decimal", "150.25"],
    ["con puntos de miles", "1.000"],
    ["negativo", "-5"],
    ["vacío", ""],
    ["con espacios", " 10"],
    ["31 dígitos", "1".repeat(31)],
  ])("rechaza %s", (_caso, valor) => {
    expect(entero.safeParse(valor).success).toBe(false);
  });
});

describe("entrada de operación", () => {
  const base = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "10000" };

  it("convierte montos y fechas a los tipos del servicio", () => {
    const entrada = entradaOperacion.parse({ ...base, tasaSolicitadaE6: "950000000", realizadaEn: "2026-11-08T09:30:00-03:00" });
    expect(entrada).toMatchObject({ montoDivisa: 10000n, tasaSolicitadaE6: 950000000n });
    expect(entrada.realizadaEn?.toISOString()).toBe("2026-11-08T12:30:00.000Z");
  });

  it("rechaza campos desconocidos, tipo DTE fuera de 34/41 y moneda mal escrita", () => {
    expect(entradaOperacion.safeParse({ ...base, monto: "1" }).success).toBe(false);
    expect(entradaOperacion.safeParse({ ...base, tipoDte: 33 }).success).toBe(false);
    expect(entradaOperacion.safeParse({ ...base, monedaCodigo: "usd" }).success).toBe(false);
    expect(entradaOperacion.safeParse({ ...base, realizadaEn: "2026-11-08 09:30" }).success).toBe(false);
  });

  it("al editar, todos los campos son opcionales", () => {
    expect(cambiosOperacion.parse({ montoDivisa: "5" })).toEqual({ montoDivisa: 5n });
  });

  it("el reverso exige un motivo con texto", () => {
    expect(entradaReverso.safeParse({ motivo: "   " }).success).toBe(false);
    expect(entradaReverso.parse({ motivo: " Error de monto " })).toEqual({ motivo: "Error de monto" });
  });

  it("los filtros de la URL llegan como texto y se convierten", () => {
    expect(filtrosOperaciones.parse({ turnoId: "3", limite: "50" })).toEqual({ turnoId: 3, limite: 50 });
    expect(filtrosOperaciones.safeParse({ limite: "5000" }).success).toBe(false);
  });
});
