import { describe, expect, it } from "vitest";
import { migrar } from "../../src/db/migrar.ts";
import { construirServidor } from "../../src/servidor.ts";
import { baseTemporal } from "../ayuda.ts";
import { abrirConFondos, CAJERO, operar } from "../servicios/escenario.ts";
import { apiDePrueba } from "./api.ts";

describe("Datos públicos de la casa", () => {
  it("sin sesión entrega el nombre y las monedas, nada privado", async () => {
    const { pedir } = apiDePrueba();

    const respuesta = await pedir(null, "GET", "/api/casa");

    expect(respuesta.statusCode).toBe(200);
    const casa = respuesta.json();
    expect(casa).toEqual({
      nombre: "Cambios Demo",
      monedaBase: { codigo: "CLP", nombre: "Peso chileno", simbolo: "$", decimales: 0 },
      divisas: [
        { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", decimales: 2, decimalesTasa: 2, activa: true },
        { codigo: "EUR", nombre: "Euro", simbolo: "€", decimales: 2, decimalesTasa: 2, activa: true },
        { codigo: "BRL", nombre: "Real brasileño", simbolo: "R$", decimales: 2, decimalesTasa: 2, activa: true },
        { codigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, activa: true },
      ],
    });
  });

  it("una divisa que ya no se opera sigue en la lista, para mostrar sus operaciones antiguas", async () => {
    const { pedir, sqlite } = apiDePrueba();
    sqlite.prepare("UPDATE casa_moneda SET activa = 0 WHERE moneda_codigo = 'ARS'").run();

    const casa = (await pedir(null, "GET", "/api/casa")).json();

    expect(casa.divisas.find((d: { codigo: string }) => d.codigo === "ARS")).toMatchObject({ decimales: 2, activa: false });
  });

  it("antes de configurar la casa, y con el login apagado, responde vacío en vez de fallar", async () => {
    const base = baseTemporal();
    migrar(base.sqlite);
    const app = construirServidor(base, { urlPublica: null, obtenerSesion: () => null });

    const respuesta = await app.inject({ method: "GET", url: "/api/casa" });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ nombre: null, monedaBase: null, divisas: [] });
  });
});

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
