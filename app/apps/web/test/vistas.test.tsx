// Las vistas muestran lo que responde la API (simulada): nombres en vez de
// ids, filtros como parámetros, errores con "Reintentar" y lo que no existe.

import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { hoy, inicioDelMes } from "../src/lib/fechas.ts";
import { abrir, error, FICHAS, operacion, rutasDe, usarApi } from "./apiFalsa.tsx";

describe("operaciones", () => {
  it("la lista muestra el cliente y quién registró, con nombres", async () => {
    usarApi({
      ...rutasDe("cajero"),
      "GET /api/operaciones": [operacion({ id: 6, clienteId: 1, clienteNombre: "Cliente Completo de Prueba" }), operacion({ id: 5 })],
    });
    abrir("/operaciones");

    // La tabla se desliza dentro de una región con su nombre (componentes/Tabla.tsx)
    const tabla = await screen.findByRole("region", { name: "Operaciones" });
    const filas = within(tabla).getAllByRole("row");
    expect(within(filas[1]!).getByText("Cliente Completo de Prueba")).toBeTruthy();
    expect(await within(filas[1]!).findByText("Cajero")).toBeTruthy();
    expect(within(filas[1]!).getByText("US$ 300,00")).toBeTruthy();
    expect(within(filas[1]!).getByText("$ 286.230")).toBeTruthy();
  });

  it("filtrar por días pide desde el inicio del primero hasta el inicio del día siguiente al último", async () => {
    const api = usarApi(rutasDe("cajero"));
    abrir("/operaciones");
    await screen.findByText("No hay operaciones con estos filtros");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-08" } });

    await screen.findByText("No hay operaciones con estos filtros");
    const ultima = api.a("GET /api/operaciones").at(-1)!.url.searchParams;
    expect(ultima.get("desde")).toBe("2026-11-01T00:00:00-03:00");
    expect(ultima.get("hasta")).toBe("2026-11-09T00:00:00-03:00");
  });

  it("si la lista no carga, muestra el motivo y se puede reintentar", async () => {
    let intentos = 0;
    usarApi({
      ...rutasDe("cajero"),
      "GET /api/operaciones": () => (++intentos === 1 ? error(500, "ERROR_INTERNO", "Ocurrió un error inesperado. Intente de nuevo.") : [operacion()]),
    });
    abrir("/operaciones");

    expect(await screen.findByText("Ocurrió un error inesperado. Intente de nuevo.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("region", { name: "Operaciones" })).toBeTruthy();
  });

  it("el detalle de una que no existe dice que no existe", async () => {
    usarApi({ ...rutasDe("cajero"), "GET /api/operaciones/999": error(404, "OPERACION_NO_EXISTE", "La operación 999 no existe") });
    abrir("/operaciones/999");
    expect(await screen.findByRole("heading", { name: "Esta página no existe" })).toBeTruthy();
  });

  it("el detalle lleva al cliente y dice quién registró", async () => {
    usarApi({ ...rutasDe("cajero"), "GET /api/operaciones/6": operacion({ id: 6, clienteId: 1, clienteNombre: "Cliente Completo de Prueba" }) });
    abrir("/operaciones/6");

    expect(await screen.findByRole("heading", { name: "Venta N° 6" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Cliente Completo de Prueba" }).getAttribute("href")).toBe("/clientes/1");
    // Registró y confirmó la misma persona
    expect(await screen.findAllByText(/^Cajero, /)).toHaveLength(2);
  });
});

describe("clientes", () => {
  it("la búsqueda espera dos letras y marca las fichas incompletas", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "GET /api/clientes": FICHAS });
    abrir("/clientes");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Buscar cliente"), "c");
    expect(screen.getByText(/Escribe al menos 2 letras/)).toBeTruthy();
    expect(api.a("GET /api/clientes")).toHaveLength(0);

    await usuario.type(screen.getByLabelText("Buscar cliente"), "l");
    expect(await screen.findByRole("link", { name: "Cliente Incompleto de Prueba" })).toBeTruthy();
    expect(screen.getByText("Incompleta")).toBeTruthy();
    expect(api.a("GET /api/clientes").at(-1)?.url.searchParams.get("q")).toBe("cl");
  });
});

describe("caja", () => {
  it("los gastos parten mostrando los del mes en curso", async () => {
    const api = usarApi(rutasDe("cajero"));
    abrir("/caja/gastos");

    await screen.findByText("No hay gastos con estos filtros");
    const pedido = api.a("GET /api/gastos")[0]!.url.searchParams;
    expect(pedido.get("desde")).toBe(inicioDelMes(hoy()));
    expect(pedido.get("hasta")).toBe(hoy());
  });
});

describe("portal de clientes", () => {
  it("una cuenta verificada ve sus operaciones, con la tasa en los decimales de su divisa", async () => {
    usarApi({
      ...rutasDe("clienteVerificado"),
      "GET /api/mi/operaciones": [
        {
          id: 7,
          tipo: "COMPRA",
          monedaCodigo: "ARS",
          montoDivisa: "10000000",
          tasaAplicadaE6: "712500",
          montoBase: "71250",
          medioPago: "EFECTIVO",
          estado: "CONFIRMADA",
          tipoDte: 41,
          folioDte: 1007,
          realizadaEn: "2026-11-09T12:30:00.000Z",
        },
      ],
    });
    abrir("/mi");

    expect(await screen.findByText("AR$ 100.000,00")).toBeTruthy();
    expect(screen.getByText(/\$ 0,7125/)).toBeTruthy();
    expect(screen.getByText("$ 71.250")).toBeTruthy();
  });

  it("una cuenta pendiente no pide sus datos: la API los niega hasta verificarla", async () => {
    const api = usarApi(rutasDe("clientePendiente"));
    abrir("/mi");

    expect(await screen.findByText("Tu cuenta está pendiente de verificación")).toBeTruthy();
    expect(api.pedidos.filter((p) => p.url.pathname.startsWith("/api/mi/"))).toHaveLength(0);
  });
});
