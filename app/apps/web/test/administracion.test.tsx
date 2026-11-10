// Lo que guarda el admin (con la API simulada): publicar tasas, el personal
// y las categorías de fidelización.

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Usuario } from "../src/api/tipos.ts";
import { abrir, CATALOGO, error, respuesta, rutasDe, usarApi } from "./apiFalsa.tsx";

const usuario = (id: number, nombre: string, rol: Usuario["rol"]): Usuario => ({
  id,
  sucursalId: null,
  rut: "11111111-1",
  nombre,
  email: `${nombre.toLowerCase()}@demo.cl`,
  rol,
  activo: true,
  creadoEn: "2026-11-09T12:00:00.000Z",
  tieneCuenta: true,
});

const PERSONAL = [usuario(1, "Administrador", "ADMIN"), usuario(3, "Cajero", "CAJERO")];

describe("pizarra", () => {
  it("parte con los valores vigentes y publica la referencia nueva con escala ×10^6", async () => {
    const api = usarApi({ ...rutasDe("admin"), "POST /api/cotizaciones": respuesta(201, {}) });
    abrir("/pizarra");
    const usuarioPrueba = userEvent.setup();

    const referencia = (await screen.findByLabelText("Tasa de referencia")) as HTMLInputElement;
    expect(referencia.value).toBe("940,00");
    expect((screen.getByLabelText("Margen de compra") as HTMLInputElement).value).toBe("1,5");

    await usuarioPrueba.clear(referencia);
    await usuarioPrueba.type(referencia, "952,30");
    await usuarioPrueba.click(screen.getByRole("button", { name: "Publicar tasa" }));

    expect(await screen.findByText("Tasa de USD publicada: la pizarra ya cambió.")).toBeTruthy();
    expect(api.a("POST /api/cotizaciones")[0]?.cuerpo).toEqual({
      monedaCodigo: "USD",
      referenciaE6: "952300000",
      tipoMargen: "PORCENTAJE",
      margenCompraE6: "1500000",
      margenVentaE6: "1500000",
    });
  });
});

describe("personal", () => {
  it("crea un usuario con los datos que pide la API", async () => {
    const api = usarApi({ ...rutasDe("admin"), "GET /api/usuarios": PERSONAL, "POST /api/usuarios": respuesta(201, usuario(5, "Cajera Nueva", "CAJERO")) });
    abrir("/administracion/usuarios");
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Nuevo usuario" }));
    const dialogo = await screen.findByRole("dialog");
    await u.type(within(dialogo).getByLabelText("Nombre"), "Cajera Nueva");
    await u.type(within(dialogo).getByLabelText("RUT"), "15.555.567-K");
    await u.type(within(dialogo).getByLabelText("Correo"), "Nueva@Demo.cl");
    await u.type(within(dialogo).getByLabelText("Contraseña inicial"), "una clave larga");
    await u.click(within(dialogo).getByRole("button", { name: "Crear usuario" }));

    expect(await screen.findByText("Cajera Nueva ya puede iniciar sesión con su correo.")).toBeTruthy();
    expect(api.a("POST /api/usuarios")[0]?.cuerpo).toEqual({
      nombre: "Cajera Nueva",
      rut: "15555567-K",
      email: "nueva@demo.cl",
      rol: "CAJERO",
      sucursalId: null,
      contrasena: "una clave larga",
    });
  });

  it("desactivar a alguien envía activo: false; para uno mismo no aparece la opción", async () => {
    const api = usarApi({ ...rutasDe("admin"), "GET /api/usuarios": PERSONAL, "PATCH /api/usuarios/3": { ...PERSONAL[1], activo: false } });
    abrir("/administracion/usuarios");
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Editar a Administrador" }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).queryByLabelText(/Activo/)).toBeNull();
    expect(within(dialogo).getByText(/No puedes cambiar tu propio rol/)).toBeTruthy();
    await u.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await u.click(screen.getByRole("button", { name: "Editar a Cajero" }));
    dialogo = await screen.findByRole("dialog");
    await u.click(within(dialogo).getByLabelText(/Activo/));
    await u.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Cambios de Cajero guardados.")).toBeTruthy();
    expect(api.a("PATCH /api/usuarios/3")[0]?.cuerpo).toEqual({ nombre: "Cajero", rol: "CAJERO", sucursalId: null, activo: false });
  });

  it("al editarse a sí mismo, solo envía el nombre y la sucursal", async () => {
    const api = usarApi({ ...rutasDe("admin"), "GET /api/usuarios": PERSONAL, "PATCH /api/usuarios/1": PERSONAL[0] });
    abrir("/administracion/usuarios");
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Editar a Administrador" }));
    const dialogo = await screen.findByRole("dialog");
    await u.click(within(dialogo).getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Cambios de Administrador guardados.");
    expect(api.a("PATCH /api/usuarios/1")[0]?.cuerpo).toEqual({ nombre: "Administrador", sucursalId: null });
  });

  it("restablecer la contraseña exige 10 caracteres", async () => {
    const api = usarApi({ ...rutasDe("admin"), "GET /api/usuarios": PERSONAL, "POST /api/usuarios/3/contrasena": respuesta(204) });
    abrir("/administracion/usuarios");
    const u = userEvent.setup();

    await u.click(await screen.findByRole("button", { name: "Contraseña de Cajero" }));
    const dialogo = await screen.findByRole("dialog");
    await u.type(within(dialogo).getByLabelText("Nueva contraseña"), "corta");
    await u.click(within(dialogo).getByRole("button", { name: "Restablecer contraseña" }));
    expect(await within(dialogo).findByText("La contraseña debe tener al menos 10 caracteres")).toBeTruthy();

    await u.type(within(dialogo).getByLabelText("Nueva contraseña"), " y más larga");
    await u.click(within(dialogo).getByRole("button", { name: "Restablecer contraseña" }));

    expect(await screen.findByText("Contraseña de Cajero restablecida.")).toBeTruthy();
    expect(api.a("POST /api/usuarios/3/contrasena")[0]?.cuerpo).toEqual({ contrasena: "corta y más larga" });
  });
});

describe("fidelización", () => {
  it("crea una categoría con el descuento en % ×10^6", async () => {
    const api = usarApi({
      ...rutasDe("admin"),
      "GET /api/catalogo": { ...CATALOGO, categoriasCliente: [{ id: 1, nombre: "Frecuente", descuentoMargenPctE6: "30000000", activa: true }] },
      "POST /api/categorias-cliente": respuesta(201, { id: 2, nombre: "Mayorista", descuentoMargenPctE6: "12500000", activa: true }),
    });
    abrir("/administracion/fidelizacion");
    const u = userEvent.setup();

    expect(await screen.findByText("Frecuente")).toBeTruthy();
    expect(screen.getByText("30 %")).toBeTruthy();
    await u.type(screen.getByLabelText("Nombre"), "Mayorista");
    await u.type(screen.getByLabelText("Descuento del margen"), "12,5");
    await u.click(screen.getByRole("button", { name: "Crear categoría" }));

    expect(await screen.findByText("Categoría Mayorista creada.")).toBeTruthy();
    expect(api.a("POST /api/categorias-cliente")[0]?.cuerpo).toEqual({ nombre: "Mayorista", descuentoMargenPctE6: "12500000" });
  });

  it("un nombre repetido aparece junto al campo", async () => {
    usarApi({ ...rutasDe("admin"), "POST /api/categorias-cliente": error(409, "CATEGORIA_DUPLICADA", "Ya existe la categoría Frecuente") });
    abrir("/administracion/fidelizacion");
    const u = userEvent.setup();

    await u.type(await screen.findByLabelText("Nombre"), "Frecuente");
    await u.type(screen.getByLabelText("Descuento del margen"), "30");
    await u.click(screen.getByRole("button", { name: "Crear categoría" }));

    expect(await screen.findByText("Ya existe la categoría Frecuente")).toBeTruthy();
  });
});
