// El cliente HTTP: qué envía y cómo convierte cada formato de error en un
// ErrorApi con mensaje en español.

import { describe, expect, it, vi } from "vitest";
import { enviar, ErrorApi, errorDesde, obtener, pedir } from "../src/api/cliente.ts";
import { respuesta, usarApi } from "./apiFalsa.tsx";

/** El error que lanza `promesa` (falla el test si no lanza). */
async function errorDe(promesa: Promise<unknown>): Promise<ErrorApi> {
  try {
    await promesa;
  } catch (e) {
    if (e instanceof ErrorApi) return e;
    throw e;
  }
  throw new Error("se esperaba un error");
}

describe("lo que se envía", () => {
  it("una escritura lleva cuerpo JSON, {} si no hay datos (la API lo exige)", async () => {
    const api = usarApi({ "POST /api/auth/sign-out": { success: true } });

    await enviar("/api/auth/sign-out");

    expect(api.pedidos[0]).toMatchObject({ metodo: "POST", cuerpo: {} });
    const [, opciones] = vi.mocked(fetch).mock.calls[0]!;
    expect(opciones?.headers).toEqual({ "content-type": "application/json" });
  });

  it("los filtros vacíos no se envían", async () => {
    const api = usarApi({ "GET /api/operaciones": [] });

    await obtener("/api/operaciones", { estado: "CONFIRMADA", monedaCodigo: undefined, desde: "", limite: 5 });

    expect(api.pedidos[0]?.ruta).toBe("/api/operaciones?estado=CONFIRMADA&limite=5");
  });

  it("204 no trae cuerpo", async () => {
    usarApi({ "DELETE /api/operaciones/7": respuesta(204) });
    await expect(pedir("DELETE", "/api/operaciones/7")).resolves.toBeUndefined();
  });
});

describe("cada error termina con la misma forma", () => {
  it("el formato de la API pasa tal cual, con los campos rechazados", () => {
    const e = errorDesde(400, {
      error: { codigo: "DATOS_INVALIDOS", mensaje: "Revise los datos enviados", detalles: [{ campo: "rut", mensaje: "RUT inválido" }] },
    });
    expect(e).toMatchObject({
      estado: 400,
      codigo: "DATOS_INVALIDOS",
      message: "Revise los datos enviados",
      detalles: [{ campo: "rut", mensaje: "RUT inválido" }],
    });
  });

  it("los de Better Auth se traducen", () => {
    const e = errorDesde(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(e).toMatchObject({ estado: 401, codigo: "INVALID_EMAIL_OR_PASSWORD", message: "Correo o contraseña incorrectos" });
  });

  it("demasiados intentos, venga de donde venga, en español", () => {
    expect(errorDesde(429, { message: "Too many requests" }).message).toMatch(/^Demasiados intentos/);
    expect(errorDesde(429, { error: { codigo: "PETICION_INVALIDA", mensaje: "Rate limit exceeded, retry in 1 hour" } }).codigo).toBe("DEMASIADOS_INTENTOS");
  });

  it("sin cuerpo JSON (Nginx con la app caída)", () => {
    expect(errorDesde(502, null)).toMatchObject({ codigo: "ERROR_SERVIDOR", message: "El servidor no responde. Intenta de nuevo en un momento." });
    expect(errorDesde(500, null).message).toContain("HTTP 500");
  });

  it("sin conexión, un ErrorApi con estado 0", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const e = await errorDe(obtener("/api/yo"));

    expect(e).toMatchObject({ estado: 0, codigo: "SIN_CONEXION" });
  });
});
