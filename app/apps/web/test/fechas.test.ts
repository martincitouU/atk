import { describe, expect, it } from "vitest";
import { diaSiguiente, formatearDia, formatearFechaHora, formatearHora, hoy, inicioDelDia, inicioDelMes, instanteDeHora } from "../src/lib/fechas.ts";

describe("días para los filtros de la API", () => {
  it("un día empieza a medianoche de Coyhaique, también en invierno", () => {
    expect(inicioDelDia("2026-11-08")).toBe("2026-11-08T00:00:00-03:00");
    expect(inicioDelDia("2026-07-08")).toBe("2026-07-08T00:00:00-03:00");
    // Santiago sí cambia de hora: el mismo cálculo da su desfase de cada época
    expect(inicioDelDia("2026-07-08", "America/Santiago")).toBe("2026-07-08T00:00:00-04:00");
  });

  it("el día siguiente cruza meses y años", () => {
    expect(diaSiguiente("2026-11-08")).toBe("2026-11-09");
    expect(diaSiguiente("2026-11-30")).toBe("2026-12-01");
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
    expect(diaSiguiente("2028-02-28")).toBe("2028-02-29");
  });

  it("una hora del día, para el registro diferido", () => {
    expect(instanteDeHora("2026-11-08", "14:05")).toBe("2026-11-08T14:05:00-03:00");
  });

  it("el inicio del mes", () => {
    expect(inicioDelMes("2026-11-08")).toBe("2026-11-01");
  });
});

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
