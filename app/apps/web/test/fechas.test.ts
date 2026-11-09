import { describe, expect, it } from "vitest";
import { formatearDia, formatearFechaHora, formatearHora, hoy } from "../src/lib/fechas.ts";

describe("fechas en la zona de la casa (UTC−3 todo el año)", () => {
  it("muestra la hora de Coyhaique, en formato de 24 horas", () => {
    expect(formatearHora("2026-11-08T18:30:00.000Z")).toBe("15:30");
    // En invierno Santiago está en UTC−4; Coyhaique sigue en UTC−3
    expect(formatearHora("2026-07-08T18:30:00.000Z")).toBe("15:30");
  });

  it("fecha y hora", () => {
    expect(formatearFechaHora("2026-11-08T18:30:00.000Z")).toBe("8 nov 2026, 15:30");
  });

  it("una fecha sin hora no se corre de día", () => {
    expect(formatearDia("2026-11-08")).toBe("8 nov 2026");
  });

  it("hoy usa el día de Coyhaique, no el de UTC", () => {
    // 01:30 UTC del 9 de noviembre = 22:30 del 8 en Coyhaique
    expect(hoy(undefined, new Date("2026-11-09T01:30:00.000Z"))).toBe("2026-11-08");
  });
});
