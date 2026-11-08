import { describe, expect, it } from "vitest";
import { puede, type Accion } from "../src/api/permisos.ts";

describe("puede: los roles de los servicios", () => {
  it.each<[Accion, boolean, boolean, boolean]>([
    // acción, CAJERO, SUPERVISOR, ADMIN
    ["publicarPizarra", false, false, true],
    ["reversar", false, true, true],
    ["verJornada", false, true, true],
    ["gastoSinEfectivo", false, false, true],
    ["administrar", false, false, true],
  ])("%s → cajero %s, supervisor %s, admin %s", (accion, cajero, supervisor, admin) => {
    expect(puede("CAJERO", accion)).toBe(cajero);
    expect(puede("SUPERVISOR", accion)).toBe(supervisor);
    expect(puede("ADMIN", accion)).toBe(admin);
  });

  it("sin sesión no puede nada", () => {
    expect(puede(undefined, "verJornada")).toBe(false);
  });

  it("si el reverso no requiere supervisor, el cajero reversa (la API revisa que sea suyo)", () => {
    expect(puede("CAJERO", "reversar", { reversoRequiereSupervisor: false })).toBe(true);
    expect(puede("CAJERO", "reversar", { reversoRequiereSupervisor: true })).toBe(false);
  });
});
