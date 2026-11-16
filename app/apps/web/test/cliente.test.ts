import { Operacion, RUTAS, Yo } from "../src/api/esquemas.ts";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { enviar, ErrorNegocio, pedir } from "../src/api/cliente.ts";
import { servidor } from "./preparar.ts";

describe("pedir", () => {
  it("valida la respuesta con el esquema del contrato", async () => {
    const yo = await pedir(RUTAS.yo, Yo);
    expect(yo).toMatchObject({ tipo: "personal", usuario: { nombre: "Rolando del Río" } });
  });

  it("un error de negocio llega como ErrorNegocio, con el mensaje del servicio tal cual", async () => {
    const error = await enviar(RUTAS.reversar(1), Operacion, { motivo: "x" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorNegocio);
    expect(error).toMatchObject({ codigo: "NO_REVERSABLE", message: "Un borrador no se reversa: se elimina" });
  });

  it("sin red, SIN_CONEXION con la indicación del libro físico", async () => {
    servidor.use(http.get(`*${RUTAS.pizarra}`, () => HttpResponse.error()));
    await expect(pedir(RUTAS.pizarra, Yo)).rejects.toMatchObject({
      codigo: "SIN_CONEXION",
      message: "No hay conexión con el servidor. Anote en el libro físico y regístrelo después.",
    });
  });
});
