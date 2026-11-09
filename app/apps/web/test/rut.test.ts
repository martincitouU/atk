import { describe, expect, it } from "vitest";
import { formatearRut } from "../src/lib/rut.ts";

describe("formatearRut", () => {
  it.each([
    ["15555567-K", "15.555.567-K"],
    ["15555567-k", "15.555.567-K"],
    ["9876543-3", "9.876.543-3"],
    ["12.345.678-5", "12.345.678-5"],
    ["1-9", "1-9"],
    ["AR1234567", "AR1234567"], // un pasaporte queda como está
  ])("%s → %s", (rut, esperado) => {
    expect(formatearRut(rut)).toBe(esperado);
  });
});
