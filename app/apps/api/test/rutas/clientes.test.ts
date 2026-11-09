import { describe, expect, it } from "vitest";
import { apiDePrueba } from "./api.ts";

const NUEVO = { tipoDocumento: "RUT", numeroDocumento: "11.111.111-1", nombre: "María Pérez", nacionalidad: "cl" };

describe("RF-17, RF-18: clientes por HTTP", () => {
  it("RF-17: crea la ficha (RUT sin puntos) y dice qué le falta para la UAF", async () => {
    const { pedir } = apiDePrueba();

    const creado = await pedir("CAJERO", "POST", "/api/clientes", NUEVO);
    expect(creado.statusCode).toBe(201);
    expect(creado.json()).toMatchObject({ numeroDocumento: "11111111-1", nacionalidad: "CL" });

    const ficha = (await pedir("CAJERO", "GET", `/api/clientes/${creado.json().id}`)).json();
    expect(ficha.faltantesUaf).toEqual(["oficio o profesión", "país de residencia", "domicilio", "contacto (teléfono o email)"]);
  });

  it("busca por nombre o documento, y edita", async () => {
    const { pedir } = apiDePrueba();
    const { id } = (await pedir("CAJERO", "POST", "/api/clientes", NUEVO)).json();

    expect((await pedir("CAJERO", "GET", "/api/clientes?q=pérez")).json()).toHaveLength(1);
    expect((await pedir("CAJERO", "GET", "/api/clientes?q=11111111")).json()).toHaveLength(1);
    expect((await pedir("CAJERO", "GET", "/api/clientes")).statusCode).toBe(400);

    const editado = await pedir("CAJERO", "PATCH", `/api/clientes/${id}`, { oficio: "Comerciante" });
    expect(editado.json()).toMatchObject({ oficio: "Comerciante" });
  });

  it("la búsqueda dice qué le falta a cada ficha, para saber antes de operar desde US$ 5.000", async () => {
    const { pedir } = apiDePrueba();

    const encontrados = (await pedir("CAJERO", "GET", "/api/clientes?q=de prueba")).json();

    expect(encontrados.map((c: { nombre: string; faltantesUaf: string[] }) => [c.nombre, c.faltantesUaf.length > 0])).toEqual([
      ["Cliente Completo de Prueba", false],
      ["Cliente Incompleto de Prueba", true],
    ]);
  });

  it("RUT inválido, duplicado e inexistente", async () => {
    const { pedir } = apiDePrueba();

    expect((await pedir("CAJERO", "POST", "/api/clientes", { ...NUEVO, numeroDocumento: "11111111-2" })).json().error.codigo).toBe("RUT_INVALIDO");
    expect((await pedir("CAJERO", "POST", "/api/clientes", { ...NUEVO, numeroDocumento: "12345678-5" })).json().error.codigo).toBe("CLIENTE_DUPLICADO");
    expect((await pedir("CAJERO", "GET", "/api/clientes/999")).statusCode).toBe(404);
  });

  it("RF-18: solo el admin crea categorías de fidelización", async () => {
    const { pedir } = apiDePrueba();
    const categoria = { nombre: "Oro", descuentoMargenPctE6: "50000000" };

    expect((await pedir("CAJERO", "POST", "/api/categorias-cliente", categoria)).statusCode).toBe(403);
    expect((await pedir("ADMIN", "POST", "/api/categorias-cliente", categoria)).statusCode).toBe(201);
    expect((await pedir("CAJERO", "GET", "/api/categorias-cliente")).json().map((c: { nombre: string }) => c.nombre)).toContain("Oro");
  });
});
