import { describe, expect, it } from "vitest";
import { abrirConFondos, CAJERO, operar } from "../servicios/escenario.ts";
import { apiDePrueba } from "./api.ts";

describe("Catálogo, RF-15 y RF-16 por HTTP", () => {
  it("el catálogo trae lo que el front necesita para armar las pantallas", async () => {
    const { pedir } = apiDePrueba();

    const catalogo = (await pedir("CAJERO", "GET", "/api/catalogo")).json();

    expect(catalogo.casa).toMatchObject({ monedaBase: "CLP" });
    expect(catalogo.divisas.map((d: { codigo: string }) => d.codigo)).toEqual(["USD", "EUR", "BRL", "ARS"]);
    expect(catalogo.cajas).toHaveLength(2);
    expect(catalogo.parametros).toMatchObject({ zonaHoraria: "America/Coyhaique", umbralFichaClienteUsd: "5000" });
  });

  it("RF-16: el resumen del día es para supervisores", async () => {
    const { pedir, ctx, folio } = apiDePrueba();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 1_000_000n, USD: 100_000n });
    operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio());

    expect((await pedir("CAJERO", "GET", "/api/resumen")).statusCode).toBe(403);
    const resumen = (await pedir("SUPERVISOR", "GET", "/api/resumen")).json();
    expect(resumen.operaciones.confirmadas).toBe(1);
    expect(resumen.margen.bruto).toBe("1410");
  });

  it("RF-15: la auditoría es solo del admin y se filtra", async () => {
    const { pedir, ctx, folio } = apiDePrueba();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 1_000_000n, USD: 100_000n });
    operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio());

    expect((await pedir("SUPERVISOR", "GET", "/api/auditoria")).statusCode).toBe(403);
    const confirmaciones = (await pedir("ADMIN", "GET", "/api/auditoria?accion=CONFIRMAR")).json();
    expect(confirmaciones).toHaveLength(1);
    expect(confirmaciones[0]).toMatchObject({ tabla: "operacion", usuarioId: 3 });
    expect((await pedir("ADMIN", "GET", "/api/auditoria?accion=BORRAR")).statusCode).toBe(400);
  });
});
