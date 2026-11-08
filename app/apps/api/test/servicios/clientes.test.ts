import { describe, expect, it } from "vitest";
import {
  buscarClientes,
  categoriasDeCliente,
  crearCategoriaCliente,
  crearCliente,
  editarCliente,
  faltantesFicha,
  rutValido,
} from "../../src/servicios/clientes.ts";
import { ADMIN, CAJERO, codigoDeError, escenario, mensajeDeError } from "./escenario.ts";

const COMPLETO = {
  tipoDocumento: "PASAPORTE",
  numeroDocumento: "br9876543",
  nombre: "  Ana Souza  ",
  nacionalidad: "br",
  oficio: "Ingeniera",
  paisResidencia: "BR",
  domicilio: "Rua Exemplo 10, Porto Alegre",
  email: "ana@ejemplo.com",
} as const;

describe("rutValido", () => {
  it.each([
    ["12345678-5", true],
    ["12.345.678-5", true],
    ["12345678-4", false],
    ["76123456-0", true], // dígito 0
    ["6-K", true], // dígito K
    ["6-k", true],
    ["12345678", false],
    ["abc-1", false],
  ])("%s → %s", (rut, valido) => {
    expect(rutValido(rut)).toBe(valido);
  });
});

describe("RF-17: ficha de cliente", () => {
  it("crea la ficha normalizando los datos", () => {
    const { ctx } = escenario();

    const ana = crearCliente(ctx, CAJERO, COMPLETO);

    expect(ana).toMatchObject({ nombre: "Ana Souza", numeroDocumento: "BR9876543", nacionalidad: "BR", telefono: null });
    expect(faltantesFicha(ana)).toEqual([]);
  });

  it("valida el RUT y lo guarda sin puntos", () => {
    const { ctx } = escenario();

    expect(codigoDeError(() => crearCliente(ctx, CAJERO, { tipoDocumento: "RUT", numeroDocumento: "12.345.678-4", nombre: "X" }))).toBe(
      "RUT_INVALIDO",
    );
    const conRut = crearCliente(ctx, CAJERO, { tipoDocumento: "RUT", numeroDocumento: "11.111.111-1", nombre: "X" });
    expect(conRut.numeroDocumento).toBe("11111111-1");
  });

  it("no repite un documento y exige códigos de país ISO", () => {
    const { ctx } = escenario();
    crearCliente(ctx, CAJERO, COMPLETO);

    expect(mensajeDeError(() => crearCliente(ctx, CAJERO, { ...COMPLETO, nombre: "Otra" }))).toBe(
      "Ya existe un cliente con PASAPORTE BR9876543: Ana Souza",
    );
    expect(codigoDeError(() => crearCliente(ctx, CAJERO, { ...COMPLETO, numeroDocumento: "X1", nacionalidad: "Brasil" }))).toBe(
      "PAIS_INVALIDO",
    );
  });

  it("dice qué le falta a una ficha incompleta", () => {
    const { ctx } = escenario();
    const incompleto = crearCliente(ctx, CAJERO, { tipoDocumento: "DNI", numeroDocumento: "30111222", nombre: "Juan" });

    expect(faltantesFicha(incompleto)).toEqual([
      "nacionalidad",
      "oficio o profesión",
      "país de residencia",
      "domicilio",
      "contacto (teléfono o email)",
    ]);
  });

  it("se edita y se busca por nombre o documento", () => {
    const { ctx } = escenario();
    const ana = crearCliente(ctx, CAJERO, COMPLETO);

    expect(editarCliente(ctx, CAJERO, ana.id, { telefono: "+55 51 0000 0000" }).telefono).toBe("+55 51 0000 0000");
    expect(buscarClientes(ctx.db, "souza").map((c) => c.id)).toEqual([ana.id]);
    expect(buscarClientes(ctx.db, "9876").map((c) => c.id)).toEqual([ana.id]);
  });
});

describe("RF-18: categorías de cliente", () => {
  it("el admin crea categorías y se asignan a los clientes", () => {
    const { ctx } = escenario();

    expect(codigoDeError(() => crearCategoriaCliente(ctx, CAJERO, { nombre: "Oro", descuentoMargenPctE6: 50_000_000n }))).toBe("SIN_PERMISO");
    const oro = crearCategoriaCliente(ctx, ADMIN, { nombre: "Oro", descuentoMargenPctE6: 50_000_000n });
    expect(codigoDeError(() => crearCategoriaCliente(ctx, ADMIN, { nombre: "Oro", descuentoMargenPctE6: 1n }))).toBe("CATEGORIA_DUPLICADA");
    expect(codigoDeError(() => crearCategoriaCliente(ctx, ADMIN, { nombre: "Gratis", descuentoMargenPctE6: 0n }))).toBe("DESCUENTO_INVALIDO");

    expect(crearCliente(ctx, CAJERO, { ...COMPLETO, categoriaId: oro.id }).categoriaId).toBe(oro.id);
    expect(categoriasDeCliente(ctx.db).map((c) => c.nombre)).toEqual(["Frecuente", "Oro"]);
  });

  it("no asigna una categoría inexistente", () => {
    const { ctx } = escenario();

    expect(codigoDeError(() => crearCliente(ctx, CAJERO, { ...COMPLETO, categoriaId: 99 }))).toBe("CATEGORIA_INVALIDA");
  });
});
