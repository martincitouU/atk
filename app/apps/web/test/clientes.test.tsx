// Fichas de clientes y cuentas del portal que guardan (con la API simulada).

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CuentaCliente } from "../src/api/tipos.ts";
import { abrir, error, FICHAS, respuesta, rutasDe, usarApi } from "./apiFalsa.tsx";

const FICHA = FICHAS[0]!;

const CUENTA_ANA: CuentaCliente = {
  id: 1,
  authUserId: "x",
  rut: "15555567-K",
  nombre: "Ana Pérez",
  estado: "PENDIENTE",
  clienteId: null,
  revisadaPor: null,
  revisadaEn: null,
  motivoRechazo: null,
  creadaEn: "2026-11-09T12:00:00.000Z",
};

describe("fichas", () => {
  it("revisa el RUT antes de enviar y guarda lo vacío como sin dato", async () => {
    const api = usarApi({
      ...rutasDe("cajero"),
      "POST /api/clientes": respuesta(201, { ...FICHA, id: 7 }),
      "GET /api/clientes/7": { ...FICHA, id: 7 },
    });
    abrir("/clientes/nuevo");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Número de documento"), "12.345.678-9");
    await usuario.type(screen.getByLabelText("Nombre completo"), "María Pérez");
    await usuario.click(screen.getByRole("button", { name: "Guardar cliente" }));
    expect(await screen.findByText(/RUT inválido/)).toBeTruthy();
    expect(api.a("POST /api/clientes")).toHaveLength(0);

    await usuario.clear(screen.getByLabelText("Número de documento"));
    await usuario.type(screen.getByLabelText("Número de documento"), "12.345.678-5");
    await usuario.type(screen.getByLabelText("Nacionalidad"), "cl");
    await usuario.click(screen.getByRole("button", { name: "Guardar cliente" }));

    expect(await screen.findByRole("heading", { name: FICHA.nombre })).toBeTruthy();
    expect(api.a("POST /api/clientes")[0]?.cuerpo).toEqual({
      tipoDocumento: "RUT",
      numeroDocumento: "12.345.678-5",
      nombre: "María Pérez",
      nacionalidad: "cl",
      oficio: null,
      paisResidencia: null,
      domicilio: null,
      telefono: null,
      email: null,
      relacionPermanente: false,
      categoriaId: null,
    });
  });

  it("un documento ya registrado aparece junto al campo", async () => {
    usarApi({ ...rutasDe("cajero"), "POST /api/clientes": error(409, "CLIENTE_DUPLICADO", "Ya existe un cliente con ese documento") });
    abrir("/clientes/nuevo");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Número de documento"), "12.345.678-5");
    await usuario.type(screen.getByLabelText("Nombre completo"), "María Pérez");
    await usuario.click(screen.getByRole("button", { name: "Guardar cliente" }));

    expect(await screen.findByText("Ya existe un cliente con ese documento")).toBeTruthy();
    expect(screen.getByLabelText("Número de documento").getAttribute("aria-invalid")).toBe("true");
  });

  it("editar la ficha envía los cambios y vuelve a ella", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "GET /api/clientes/2": FICHA, "PATCH /api/clientes/2": FICHA });
    abrir("/clientes/2/editar");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Domicilio"), "Calle Uno 123, Coyhaique");
    await usuario.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByRole("heading", { name: FICHA.nombre })).toBeTruthy();
    expect(api.a("PATCH /api/clientes/2")[0]?.cuerpo).toMatchObject({ domicilio: "Calle Uno 123, Coyhaique", numeroDocumento: "12.345.678-5" });
  });
});

describe("cuentas del portal", () => {
  it("verificar sin ficha con ese RUT ofrece crearla con los datos ya escritos", async () => {
    usarApi({
      ...rutasDe("cajero"),
      "GET /api/cuentas-cliente": [CUENTA_ANA],
      "POST /api/cuentas-cliente/1/verificar": error(409, "SIN_FICHA", "No hay ficha de cliente con RUT 15555567-K: regístrela antes de verificar la cuenta"),
    });
    abrir("/clientes/cuentas");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Verificar" }));
    await usuario.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, revisé el carnet" }));
    await usuario.click(await screen.findByRole("button", { name: "Crear la ficha" }));

    expect(await screen.findByRole("heading", { name: "Nuevo cliente" })).toBeTruthy();
    expect((screen.getByLabelText("Número de documento") as HTMLInputElement).value).toBe("15555567-K");
    expect((screen.getByLabelText("Nombre completo") as HTMLInputElement).value).toBe("Ana Pérez");
  });

  it("rechazar exige el motivo y lo envía", async () => {
    const api = usarApi({
      ...rutasDe("cajero"),
      "GET /api/cuentas-cliente": [CUENTA_ANA],
      "POST /api/cuentas-cliente/1/rechazar": { ...CUENTA_ANA, estado: "RECHAZADA" },
    });
    abrir("/clientes/cuentas");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Rechazar" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Rechazar cuenta" }));
    expect(await within(dialogo).findByText("Escribe el motivo del rechazo")).toBeTruthy();

    await usuario.type(within(dialogo).getByLabelText("Motivo"), "El carnet no coincide");
    await usuario.click(within(dialogo).getByRole("button", { name: "Rechazar cuenta" }));

    await screen.findByRole("button", { name: "Verificar" });
    expect(api.a("POST /api/cuentas-cliente/1/rechazar")[0]?.cuerpo).toEqual({ motivo: "El carnet no coincide" });
  });
});
