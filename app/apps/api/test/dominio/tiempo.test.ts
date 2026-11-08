import { describe, expect, it } from "vitest";
import { diaSiguiente, fechaLocal, inicioDelDia, rangoDelDia, validarFecha } from "../../src/dominio/tiempo.ts";

const SANTIAGO = "America/Santiago";
const COYHAIQUE = "America/Coyhaique";
const horas = (r: { desde: Date; hasta: Date }) => (r.hasta.getTime() - r.desde.getTime()) / 3_600_000;

describe("fechaLocal", () => {
  it("corta el día en la hora local, no en UTC", () => {
    // 02:59 UTC del 15 de enero son las 23:59 del 14 en Chile (verano, UTC-3)
    expect(fechaLocal(new Date("2026-01-15T02:59:59Z"), SANTIAGO)).toBe("2026-01-14");
    expect(fechaLocal(new Date("2026-01-15T03:00:00Z"), SANTIAGO)).toBe("2026-01-15");
  });
});

describe("inicioDelDia", () => {
  it("Coyhaique está en UTC-3 todo el año", () => {
    expect(inicioDelDia("2026-01-15", COYHAIQUE).toISOString()).toBe("2026-01-15T03:00:00.000Z");
    expect(inicioDelDia("2026-07-15", COYHAIQUE).toISOString()).toBe("2026-07-15T03:00:00.000Z");
  });

  it("Santiago cambia de horario: UTC-3 en verano y UTC-4 en invierno", () => {
    expect(inicioDelDia("2026-01-15", SANTIAGO).toISOString()).toBe("2026-01-15T03:00:00.000Z");
    expect(inicioDelDia("2026-07-15", SANTIAGO).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("si la medianoche no existe (salto de 00:00 a 01:00), el día empieza a la 01:00", () => {
    // 6 de septiembre de 2026: los relojes de Santiago saltan de 00:00 a 01:00
    expect(inicioDelDia("2026-09-06", SANTIAGO).toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });
});

describe("rangoDelDia", () => {
  it("un día normal dura 24 horas", () => {
    expect(horas(rangoDelDia("2026-03-10", COYHAIQUE))).toBe(24);
  });

  it("el día del cambio de horario de otoño dura 25 horas y el de primavera 23", () => {
    expect(horas(rangoDelDia("2026-04-04", SANTIAGO))).toBe(25);
    expect(horas(rangoDelDia("2026-09-06", SANTIAGO))).toBe(23);
  });
});

describe("validarFecha y diaSiguiente", () => {
  it.each([["2026-02-30"], ["2026-13-01"], ["26-01-01"], ["hoy"]])("rechaza %s", (fecha) => {
    expect(() => validarFecha(fecha)).toThrow("no es una fecha válida");
  });

  it("pasa de mes y de año", () => {
    expect(diaSiguiente("2026-01-31")).toBe("2026-02-01");
    expect(diaSiguiente("2026-12-31")).toBe("2027-01-01");
    expect(diaSiguiente("2028-02-28")).toBe("2028-02-29");
  });
});
