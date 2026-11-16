// La app sirve el front compilado: los archivos, index.html para las
// direcciones del front y JSON para todo lo que es de la API.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construirServidor } from "../../src/servidor.ts";
import { carpetaTemporal } from "../ayuda.ts";
import { escenario } from "../servicios/escenario.ts";

process.env.LOG_LEVEL ??= "silent";

/** Servidor con un front compilado mínimo, como el que deja `vite build`. Se borra solo. */
function conFront() {
  const carpeta = carpetaTemporal();
  mkdirSync(join(carpeta, "assets"));
  writeFileSync(join(carpeta, "index.html"), "<!doctype html><title>ATK</title>");
  writeFileSync(join(carpeta, "assets", "index-abc123.js"), "console.log('hola')");
  return construirServidor(escenario(), { urlPublica: null, obtenerSesion: () => null, carpetaFront: carpeta });
}

describe("con el front compilado", () => {
  it.each(["/", "/caja", "/operaciones/16", "/mi/perfil"])("GET %s responde index.html, sin caché", async (url) => {
    const respuesta = await conFront().inject({ method: "GET", url });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers["content-type"]).toContain("text/html");
    expect(respuesta.body).toContain("<title>ATK</title>");
    expect(respuesta.headers["cache-control"]).toBe("no-cache");
  });

  it("los archivos de assets/ se guardan por un año", async () => {
    const respuesta = await conFront().inject({ method: "GET", url: "/assets/index-abc123.js" });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers["cache-control"]).toContain("immutable");
  });

  it("un archivo que no existe es 404, no index.html", async () => {
    const respuesta = await conFront().inject({ method: "GET", url: "/assets/viejo-999.js" });
    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json().error.codigo).toBe("RUTA_NO_EXISTE");
  });

  it("una ruta de la API que no existe responde JSON, nunca el front", async () => {
    const respuesta = await conFront().inject({ method: "GET", url: "/api/no-existe" });
    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json().error.codigo).toBe("RUTA_NO_EXISTE");
  });

  it("un POST fuera de la API no recibe el front", async () => {
    const respuesta = await conFront().inject({ method: "POST", url: "/caja", payload: {} });
    expect(respuesta.statusCode).toBe(404);
  });

  it("/health y la API siguen respondiendo JSON", async () => {
    const app = conFront();
    expect((await app.inject({ method: "GET", url: "/health" })).json().status).toBe("ok");
    expect((await app.inject({ method: "GET", url: "/api/pizarra" })).statusCode).toBe(401);
  });
});

describe("sin front (desarrollo y tests)", () => {
  it("una dirección del front responde 404 en JSON", async () => {
    const app = construirServidor(escenario(), { urlPublica: null, obtenerSesion: () => null });
    const respuesta = await app.inject({ method: "GET", url: "/caja" });
    expect(respuesta.statusCode).toBe(404);
    expect(respuesta.json().error.codigo).toBe("RUTA_NO_EXISTE");
  });
});
