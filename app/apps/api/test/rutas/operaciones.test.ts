import { describe, expect, it } from "vitest";
import { abrirConFondos, CAJERO } from "../servicios/escenario.ts";
import { apiDePrueba } from "./api.ts";

const FONDOS = { CLP: 1_000_000n, USD: 100_000n };
const VENTA_USD_100 = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "10000" };

/** API con el turno del cajero abierto en la caja 1. */
function conTurno() {
  const api = apiDePrueba();
  abrirConFondos(api.ctx, CAJERO, 1, FONDOS);
  return api;
}

describe("RF-08: pizarra y publicación por HTTP", () => {
  it("un cajero no puede publicar tipos de cambio (403)", async () => {
    const { pedir } = apiDePrueba();
    const publicacion = { monedaCodigo: "USD", referenciaE6: "950000000", margenCompraE6: "15000", margenVentaE6: "15000" };

    const respuesta = await pedir("CAJERO", "POST", "/api/cotizaciones", publicacion);

    expect(respuesta.statusCode).toBe(403);
    expect(respuesta.json().error.codigo).toBe("SIN_PERMISO");
  });

  it("el admin publica y la pizarra cambia", async () => {
    const { pedir, reloj } = apiDePrueba();
    reloj.avanzar(1000);
    const publicacion = { monedaCodigo: "USD", referenciaE6: "950000000", margenCompraE6: "15000", margenVentaE6: "15000" };

    expect((await pedir("ADMIN", "POST", "/api/cotizaciones", publicacion)).statusCode).toBe(201);

    const usd = (await pedir("CAJERO", "GET", "/api/pizarra")).json().find((f: { monedaCodigo: string }) => f.monedaCodigo === "USD");
    expect(usd.referenciaE6).toBe("950000000");
  });
});

describe("RF-01, RF-02, RF-07: operaciones por HTTP", () => {
  it("RF-02: crea un borrador (201) con los montos calculados como texto", async () => {
    const { pedir } = conTurno();

    const respuesta = await pedir("CAJERO", "POST", "/api/operaciones", VENTA_USD_100);

    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json()).toMatchObject({ estado: "BORRADOR", tasaAplicadaE6: "954100000", montoBase: "95410", margenBruto: "1410" });
  });

  it("previsualizar calcula sin guardar", async () => {
    const { pedir } = conTurno();

    const vista = await pedir("CAJERO", "POST", "/api/operaciones/previsualizar", VENTA_USD_100);

    expect(vista.json()).toMatchObject({ montoBase: "95410", requiereFicha: false });
    expect((await pedir("CAJERO", "GET", "/api/operaciones")).json()).toEqual([]);
  });

  it("un monto como number se rechaza (400) indicando el campo", async () => {
    const { pedir } = conTurno();

    const respuesta = await pedir("CAJERO", "POST", "/api/operaciones", { ...VENTA_USD_100, montoDivisa: 100.5 });

    expect(respuesta.statusCode).toBe(400);
    expect(respuesta.json().error).toMatchObject({ codigo: "DATOS_INVALIDOS", detalles: [{ campo: "montoDivisa" }] });
  });

  it("un campo desconocido se rechaza (400), para no ignorar errores de tipeo", async () => {
    const { pedir } = conTurno();

    const respuesta = await pedir("CAJERO", "POST", "/api/operaciones", { ...VENTA_USD_100, monto: "10000" });

    expect(respuesta.statusCode).toBe(400);
  });

  it("sin turno abierto, la regla de negocio responde 409 con su mensaje", async () => {
    const { pedir } = apiDePrueba();

    const respuesta = await pedir("CAJERO", "POST", "/api/operaciones", VENTA_USD_100);

    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error).toEqual({ codigo: "SIN_TURNO", mensaje: "Abra un turno antes de registrar operaciones" });
  });

  it("RF-07: edita y elimina un borrador", async () => {
    const { pedir } = conTurno();
    const { id } = (await pedir("CAJERO", "POST", "/api/operaciones", VENTA_USD_100)).json();

    const editada = await pedir("CAJERO", "PATCH", `/api/operaciones/${id}`, { montoDivisa: "20000" });
    expect(editada.json()).toMatchObject({ montoDivisa: "20000", montoBase: "190820" });

    expect((await pedir("CAJERO", "DELETE", `/api/operaciones/${id}`)).statusCode).toBe(204);
    expect((await pedir("CAJERO", "GET", `/api/operaciones/${id}`)).statusCode).toBe(404);
  });

  it("RF-07: confirma con folio y un supervisor reversa con motivo", async () => {
    const { pedir } = conTurno();
    const { id } = (await pedir("CAJERO", "POST", "/api/operaciones", { ...VENTA_USD_100, tipoDte: 41, folioDte: 501 })).json();

    const confirmada = await pedir("CAJERO", "POST", `/api/operaciones/${id}/confirmar`);
    expect(confirmada.json()).toMatchObject({ estado: "CONFIRMADA" });

    expect((await pedir("SUPERVISOR", "POST", `/api/operaciones/${id}/reversar`, { motivo: "  " })).statusCode).toBe(400);
    expect((await pedir("CAJERO", "POST", `/api/operaciones/${id}/reversar`, { motivo: "Error de monto" })).statusCode).toBe(403);

    const reversada = await pedir("SUPERVISOR", "POST", `/api/operaciones/${id}/reversar`, { motivo: "Error de monto" });
    expect(reversada.json()).toMatchObject({ estado: "REVERSADA", motivoReverso: "Error de monto" });
  });

  it("lista filtrando por estado", async () => {
    const { pedir } = conTurno();
    await pedir("CAJERO", "POST", "/api/operaciones", VENTA_USD_100);

    expect((await pedir("CAJERO", "GET", "/api/operaciones?estado=BORRADOR")).json()).toHaveLength(1);
    expect((await pedir("CAJERO", "GET", "/api/operaciones?estado=CONFIRMADA")).json()).toHaveLength(0);
    expect((await pedir("CAJERO", "GET", "/api/operaciones?estado=OTRO")).statusCode).toBe(400);
  });

  it("la lista y el detalle traen el nombre del cliente (null si la operación es anónima)", async () => {
    const { pedir } = conTurno();
    const conCliente = (await pedir("CAJERO", "POST", "/api/operaciones", { ...VENTA_USD_100, clienteId: 1 })).json();
    const anonima = (await pedir("CAJERO", "POST", "/api/operaciones", VENTA_USD_100)).json();

    const lista = (await pedir("CAJERO", "GET", "/api/operaciones")).json();

    expect(lista.map((o: { id: number; clienteNombre: string | null }) => [o.id, o.clienteNombre])).toEqual([
      [anonima.id, null],
      [conCliente.id, "Cliente Completo de Prueba"],
    ]);
    const detalle = (await pedir("CAJERO", "GET", `/api/operaciones/${conCliente.id}`)).json();
    expect(detalle).toMatchObject({ id: conCliente.id, clienteId: 1, clienteNombre: "Cliente Completo de Prueba", montoBase: "95410" });
  });

  it("una operación inexistente responde 404", async () => {
    const { pedir } = apiDePrueba();
    expect((await pedir("CAJERO", "POST", "/api/operaciones/999/confirmar")).statusCode).toBe(404);
    expect((await pedir("CAJERO", "GET", "/api/operaciones/999")).json().error.codigo).toBe("OPERACION_NO_EXISTE");
  });
});
