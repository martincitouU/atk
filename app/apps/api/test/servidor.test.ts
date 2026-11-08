import { describe, expect, it } from "vitest";
import { cargarSemilla, migrar } from "../src/db/migrar.ts";
import { construirServidor } from "../src/servidor.ts";
import { baseTemporal } from "./ayuda.ts";

// Sin logs de cada petición en la salida de los tests
process.env.LOG_LEVEL ??= "silent";

describe("GET /health", () => {
  it("responde 200 con las migraciones aplicadas; una base nueva no está configurada", async () => {
    const conexion = baseTemporal();
    migrar(conexion.sqlite);
    const app = construirServidor(conexion);

    const respuesta = await app.inject({ method: "GET", url: "/health" });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ status: "ok", migraciones: ["0001_esquema.sql"], configurada: false });
    await app.close();
  });

  it("con la casa cargada, la base está configurada", async () => {
    const conexion = baseTemporal();
    migrar(conexion.sqlite);
    cargarSemilla(conexion.sqlite, "ejemplo");
    const app = construirServidor(conexion);

    expect((await app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({ configurada: true });
    await app.close();
  });

  it("si la base no responde, no devuelve 200", async () => {
    const conexion = baseTemporal();
    migrar(conexion.sqlite);
    const app = construirServidor(conexion);
    conexion.sqlite.close();

    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(500);
    await app.close();
  });
});
