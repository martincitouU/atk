import { describe, expect, it } from "vitest";
import { abrirConFondos, CAJERO } from "../servicios/escenario.ts";
import { apiDePrueba } from "./api.ts";

const GASTO = { categoriaId: 1, descripcion: "Artículos de aseo", monto: "12990", medioPago: "EFECTIVO" };

describe("RF-05: gastos por HTTP", () => {
  it("un gasto en efectivo sale de la caja del turno", async () => {
    const { pedir, ctx } = apiDePrueba();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 100_000n });

    const gasto = await pedir("CAJERO", "POST", "/api/gastos", GASTO);

    expect(gasto.statusCode).toBe(201);
    expect(gasto.json()).toMatchObject({ estado: "VIGENTE", monto: "12990", cajaId: 1 });
    const clp = (await pedir("CAJERO", "GET", "/api/saldos?cajaId=1")).json().find((s: { monedaCodigo: string }) => s.monedaCodigo === "CLP");
    expect(clp.saldo).toBe("87010");
  });

  it("sin turno no se paga en efectivo; fecha inválida da 400", async () => {
    const { pedir } = apiDePrueba();

    expect((await pedir("CAJERO", "POST", "/api/gastos", GASTO)).json().error.codigo).toBe("SIN_TURNO");
    expect((await pedir("CAJERO", "POST", "/api/gastos", { ...GASTO, fecha: "08-11-2026" })).statusCode).toBe(400);
  });

  it("un supervisor reversa con motivo y la lista filtra por estado", async () => {
    const { pedir, ctx } = apiDePrueba();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 100_000n });
    const { id } = (await pedir("CAJERO", "POST", "/api/gastos", GASTO)).json();

    expect((await pedir("SUPERVISOR", "POST", `/api/gastos/${id}/reversar`, { motivo: "Duplicado" })).json()).toMatchObject({ estado: "REVERSADO" });

    expect((await pedir("CAJERO", "GET", "/api/gastos?estado=VIGENTE")).json()).toHaveLength(0);
    expect((await pedir("CAJERO", "GET", "/api/gastos?estado=REVERSADO")).json()).toHaveLength(1);
  });
});
