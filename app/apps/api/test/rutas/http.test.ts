import { describe, expect, it } from "vitest";
import { apiDePrueba, ORIGEN } from "./api.ts";

describe("Contrato HTTP de la API", () => {
  it("sin sesión, toda ruta de /api responde 401", async () => {
    const { pedir } = apiDePrueba();

    const respuesta = await pedir(null, "GET", "/api/pizarra");

    expect(respuesta.statusCode).toBe(401);
    expect(respuesta.json()).toEqual({ error: { codigo: "SIN_SESION", mensaje: "Inicie sesión para continuar" } });
  });

  it("/health no exige sesión", async () => {
    const { pedir } = apiDePrueba();
    expect((await pedir(null, "GET", "/health")).statusCode).toBe(200);
  });

  it("los montos y tasas salen como texto, nunca como number", async () => {
    const { pedir } = apiDePrueba();

    const usd = (await pedir("CAJERO", "GET", "/api/pizarra")).json().find((f: { monedaCodigo: string }) => f.monedaCodigo === "USD");

    expect(usd).toMatchObject({ ventaE6: "954100000", referenciaE6: "940000000", vencida: false });
    expect(typeof usd.vigenteDesde).toBe("string"); // fecha en ISO 8601
  });

  it("una ruta inexistente responde 404 con el formato de error", async () => {
    const { pedir } = apiDePrueba();

    const respuesta = await pedir("CAJERO", "GET", "/api/no-existe");

    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json().error.codigo).toBe("RUTA_NO_EXISTE");
  });

  it("un JSON mal formado responde 400, no 500", async () => {
    const { app } = apiDePrueba();

    const respuesta = await app.inject({
      method: "POST",
      url: "/api/operaciones",
      headers: { "x-actor-prueba": "CAJERO", "content-type": "application/json", origin: ORIGEN },
      payload: "{ esto no es json",
    });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().error.mensaje).toBeTypeOf("string");
  });

  it("un error inesperado responde 500 sin exponer detalles internos", async () => {
    const { pedir, sqlite } = apiDePrueba();
    sqlite.close();

    const respuesta = await pedir("CAJERO", "GET", "/api/pizarra");

    expect(respuesta.statusCode).toBe(500);
    expect(respuesta.json()).toEqual({
      error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado. Intente de nuevo." },
    });
  });
});
