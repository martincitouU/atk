// Operaciones que guardan (con la API simulada): el cálculo en vivo, el
// borrador, confirmar con folio, la pizarra que cambió, reversar y eliminar.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { OperacionListada, Previsualizacion } from "../src/api/tipos.ts";
import { abrir, CATALOGO, error, FICHAS, operacion, respuesta, rutasDe, usarApi, type Pedido } from "./apiFalsa.tsx";

const CALCULO: Previsualizacion = {
  tasaAplicadaE6: "954100000",
  montoBase: "95410",
  tasaReferenciaE6: "940000000",
  cotizacionId: 1,
  reglaSpreadId: 1,
  esPreferencial: false,
  categoriaClienteId: null,
  margenBruto: "1410",
  equivalenteUsd: "10000",
  realizadaEn: "2026-11-09T12:30:00.000Z",
  registroDiferido: false,
  requiereFicha: false,
};

async function escribirMonto(texto: string) {
  await userEvent.setup().type(await screen.findByLabelText("El cliente recibe"), texto);
}

describe("nueva operación", () => {
  it("calcula al terminar de escribir y registra el borrador con los montos como texto de dígitos", async () => {
    const api = usarApi({
      ...rutasDe("cajero"),
      "POST /api/operaciones/previsualizar": CALCULO,
      "POST /api/operaciones": respuesta(201, operacion({ id: 9, estado: "BORRADOR" })),
      "GET /api/operaciones/9": operacion({ id: 9, estado: "BORRADOR" }),
    });
    abrir("/operaciones/nueva");

    await escribirMonto("100");

    expect(await screen.findByText("95.410")).toBeTruthy();
    // Una sola petición al terminar de escribir, no una por tecla
    expect(api.a("POST /api/operaciones/previsualizar")).toHaveLength(1);
    expect(api.a("POST /api/operaciones/previsualizar")[0]?.cuerpo).toMatchObject({ tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "10000" });

    await userEvent.setup().type(screen.getByLabelText("Folio"), "1017");
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrar borrador" }));

    expect(await screen.findByRole("heading", { name: "Venta N° 9" })).toBeTruthy();
    expect(api.a("POST /api/operaciones")[0]?.cuerpo).toEqual({
      tipo: "VENTA",
      monedaCodigo: "USD",
      montoDivisa: "10000",
      medioPago: "EFECTIVO",
      clienteId: null,
      tasaSolicitadaE6: null,
      realizadaEn: null,
      proposito: null,
      tipoDte: 41,
      folioDte: 1017,
      observacion: null,
    });
  });

  it("un monto con más decimales que la divisa es un error: nunca se redondea", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "POST /api/operaciones/previsualizar": CALCULO });
    abrir("/operaciones/nueva");

    await escribirMonto("10,555");
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrar borrador" }));

    expect(await screen.findByText("Escribe un monto con hasta 2 decimales después de la coma")).toBeTruthy();
    expect(api.a("POST /api/operaciones")).toHaveLength(0);
    expect(api.a("POST /api/operaciones/previsualizar")).toHaveLength(0);
  });

  it("desde el umbral UAF exige cliente y propósito antes de guardar", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "POST /api/operaciones/previsualizar": { ...CALCULO, requiereFicha: true, equivalenteUsd: "600000" } });
    abrir("/operaciones/nueva");

    await escribirMonto("6.000");
    expect(await screen.findByText("Requiere ficha del cliente (UAF)")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Registrar borrador" }));

    expect(await screen.findByText("Desde US$ 5.000 hay que identificar al cliente (UAF).")).toBeTruthy();
    expect(screen.getByText("Indica el propósito: lo exige la UAF desde este monto.")).toBeTruthy();
    expect(api.a("POST /api/operaciones")).toHaveLength(0);
  });

  it("elegir un cliente lo incluye en el cálculo (su categoría cambia el margen)", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "GET /api/clientes": FICHAS, "POST /api/operaciones/previsualizar": CALCULO });
    abrir("/operaciones/nueva");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Cliente"), "cli");
    await usuario.click(await screen.findByRole("button", { name: /Cliente Incompleto de Prueba/ }));
    await escribirMonto("100");

    await waitFor(() => expect(api.a("POST /api/operaciones/previsualizar").at(-1)?.cuerpo).toMatchObject({ clienteId: 2 }));
    expect(screen.getByText("12345678-5 · ficha incompleta")).toBeTruthy();
  });

  it("si la API no puede calcular, lo dice en el widget", async () => {
    usarApi({ ...rutasDe("cajero"), "POST /api/operaciones/previsualizar": error(409, "SIN_COTIZACION", "No hay una tasa vigente para USD") });
    abrir("/operaciones/nueva");

    await escribirMonto("100");

    expect(await screen.findByText("No hay una tasa vigente para USD")).toBeTruthy();
  });
});

describe("confirmar un borrador", () => {
  /** Un borrador sin folio que cambia según lo que reciba la API. */
  function conBorrador(extra: Record<string, unknown> = {}) {
    const estado: { op: OperacionListada } = {
      op: operacion({ id: 9, estado: "BORRADOR", folioDte: null, tipoDte: null, confirmadaPor: null, confirmadaEn: null }),
    };
    const api = usarApi({
      ...rutasDe("cajero"),
      "GET /api/operaciones/9": () => estado.op,
      "PATCH /api/operaciones/9": ({ cuerpo }: Pedido) => {
        estado.op = { ...estado.op, ...(cuerpo as object) };
        return estado.op;
      },
      "POST /api/operaciones/9/confirmar": () => {
        estado.op = { ...estado.op, estado: "CONFIRMADA", confirmadaPor: 3, confirmadaEn: "2026-11-09T12:40:00.000Z" };
        return estado.op;
      },
      ...extra,
    });
    return { api, estado };
  }

  async function confirmarConFolio(folio: string) {
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("button", { name: "Confirmar operación" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Folio"), folio);
    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar" }));
  }

  it("pide el folio, lo guarda y confirma", async () => {
    const { api } = conBorrador();
    abrir("/operaciones/9");

    await confirmarConFolio("1017");

    expect(await screen.findByText("Operación confirmada: la caja ya se movió.")).toBeTruthy();
    expect(api.a("PATCH /api/operaciones/9")[0]?.cuerpo).toEqual({ tipoDte: 41, folioDte: 1017 });
    expect(api.a("POST /api/operaciones/9/confirmar")).toHaveLength(1);
  });

  it("si al guardar el folio los montos cambiaron (pizarra nueva), no confirma: hay que revisarlos", async () => {
    const { api, estado } = conBorrador({
      "PATCH /api/operaciones/9": ({ cuerpo }: Pedido) => {
        estado.op = { ...estado.op, ...(cuerpo as object), tasaAplicadaE6: "960000000", montoBase: "96000" };
        return estado.op;
      },
    });
    abrir("/operaciones/9");

    await confirmarConFolio("1017");

    expect(await screen.findByText(/La pizarra cambió desde el borrador/)).toBeTruthy();
    expect(api.a("POST /api/operaciones/9/confirmar")).toHaveLength(0);
  });

  it("si la API dice que la pizarra cambió, se recalcula sin perder nada", async () => {
    const { api } = conBorrador({
      "POST /api/operaciones/9/confirmar": error(
        409,
        "PIZARRA_CAMBIO",
        "La pizarra de USD cambió desde que se registró el borrador (954,10 → 960,00): edítelo para recalcular",
      ),
    });
    abrir("/operaciones/9");

    await confirmarConFolio("1017");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Recalcular" }));

    expect(await screen.findByText(/Montos recalculados con la pizarra vigente/)).toBeTruthy();
    expect(api.a("PATCH /api/operaciones/9").at(-1)?.cuerpo).toEqual({});
  });

  it("un folio repetido aparece junto al campo", async () => {
    conBorrador({ "PATCH /api/operaciones/9": error(409, "FOLIO_DUPLICADO", "El folio 1017 ya está asociado a la operación 3") });
    abrir("/operaciones/9");

    await confirmarConFolio("1017");

    expect(await screen.findByText("El folio 1017 ya está asociado a la operación 3")).toBeTruthy();
  });

  it("eliminar un borrador vuelve a la lista", async () => {
    const { api } = conBorrador({ "DELETE /api/operaciones/9": respuesta(204) });
    abrir("/operaciones/9");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Eliminar borrador" }));
    await usuario.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByRole("heading", { name: "Operaciones" })).toBeTruthy();
    expect(api.a("DELETE /api/operaciones/9")).toHaveLength(1);
  });
});

describe("reversar", () => {
  it("exige el motivo y lo envía", async () => {
    let op = operacion({ id: 6 });
    const api = usarApi({
      ...rutasDe("supervisor"),
      "GET /api/operaciones/6": () => op,
      "POST /api/operaciones/6/reversar": ({ cuerpo }: Pedido) => {
        op = { ...op, estado: "REVERSADA", reversadaPor: 2, reversadaEn: "2026-11-09T13:00:00.000Z", motivoReverso: (cuerpo as { motivo: string }).motivo };
        return op;
      },
    });
    abrir("/operaciones/6");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Reversar operación" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.click(within(dialogo).getByRole("button", { name: "Reversar" }));
    expect(await within(dialogo).findByText("Escribe el motivo del reverso")).toBeTruthy();
    expect(api.a("POST /api/operaciones/6/reversar")).toHaveLength(0);

    await usuario.type(within(dialogo).getByLabelText("Motivo"), "Monto mal digitado");
    await usuario.click(within(dialogo).getByRole("button", { name: "Reversar" }));

    expect(await screen.findByText("Motivo: Monto mal digitado")).toBeTruthy();
    expect(api.a("POST /api/operaciones/6/reversar")[0]?.cuerpo).toEqual({ motivo: "Monto mal digitado" });
  });
});

describe("ayuda del monto", () => {
  it("sin monto mínimo definido no muestra «Mínimo US$ 0,00»", async () => {
    const catalogo = { ...CATALOGO, divisas: CATALOGO.divisas.map((d) => ({ ...d, montoMinimo: "0" })) };
    usarApi({ ...rutasDe("cajero"), "GET /api/catalogo": catalogo });
    abrir("/operaciones/nueva");

    expect(await screen.findByText("Escribe los decimales con coma")).toBeTruthy();
    expect(screen.queryByText(/Mínimo/)).toBeNull();
  });

  it("con mínimo, lo muestra", async () => {
    usarApi(rutasDe("cajero"));
    abrir("/operaciones/nueva");
    expect(await screen.findByText(/Mínimo US\$ 1,00/)).toBeTruthy();
  });
});
