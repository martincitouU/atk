// Turnos, caja y gastos que guardan (con la API simulada).

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Saldo, Yo } from "../src/api/tipos.ts";
import { abrir, error, respuesta, rutasDe, SESIONES, usarApi, type Pedido } from "./apiFalsa.tsx";

const saldo = (monedaCodigo: string, decimales: number, valor: string): Saldo => ({
  cajaId: 1,
  cajaNombre: "Caja 1",
  monedaCodigo,
  decimales,
  saldo: valor,
  costoPromedioE6: null,
  actualizadoEn: "2026-11-09T12:00:00.000Z",
});

/** /api/yo responde lo que diga `estado.yo`: cambia al abrir y cerrar el turno. */
function conYo(inicial: Yo, extra: Record<string, unknown> = {}) {
  const estado = { yo: inicial };
  const api = usarApi({ ...rutasDe("cajero"), "GET /api/yo": () => estado.yo, ...extra });
  return { api, estado };
}

describe("turno", () => {
  it("abrir el turno lo muestra abierto", async () => {
    const sinTurno: Yo = { ...SESIONES.cajero, turnoAbierto: null } as Yo;
    const { api, estado } = conYo(sinTurno, {
      "POST /api/turnos": ({ cuerpo }: Pedido) => {
        estado.yo = SESIONES.cajero;
        return respuesta(201, { id: 1, cajaId: (cuerpo as { cajaId: number }).cajaId });
      },
    });
    abrir("/caja");

    await userEvent.setup().click(await screen.findByRole("button", { name: "Abrir turno" }));

    expect(await screen.findByText("Turno abierto")).toBeTruthy();
    expect(api.a("POST /api/turnos")[0]?.cuerpo).toEqual({ cajaId: 1 });
  });

  it("cerrar pide el conteo de cada moneda con saldo y muestra el arqueo con las diferencias", async () => {
    const { api, estado } = conYo(SESIONES.cajero, {
      "GET /api/saldos": [saldo("CLP", 0, "2912095"), saldo("USD", 2, "395000")],
      "POST /api/turnos/1/cerrar": () => {
        estado.yo = { ...SESIONES.cajero, turnoAbierto: null } as Yo;
        return {
          turno: { id: 1 },
          arqueo: [
            { monedaCodigo: "CLP", decimales: 0, saldoSistema: "2912095", saldoContado: "2911095", diferencia: "-1000" },
            { monedaCodigo: "USD", decimales: 2, saldoSistema: "395000", saldoContado: "395000", diferencia: "0" },
          ],
        };
      },
    });
    abrir("/caja");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Cerrar turno" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Contado en CLP"), "2.911.095");
    await usuario.type(within(dialogo).getByLabelText("Contado en USD"), "3.950,00");
    await usuario.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));

    expect(await screen.findByText("Turno cerrado: arqueo")).toBeTruthy();
    expect(screen.getByText("Hay diferencias")).toBeTruthy();
    expect(screen.getByText("-1.000")).toBeTruthy();
    expect(api.a("POST /api/turnos/1/cerrar")[0]?.cuerpo).toEqual({ conteo: { CLP: "2911095", USD: "395000" } });
  });

  it("con borradores pendientes no cierra y dice por qué", async () => {
    conYo(SESIONES.cajero, {
      "GET /api/saldos": [saldo("CLP", 0, "1000")],
      "POST /api/turnos/1/cerrar": error(409, "BORRADORES_PENDIENTES", "El turno tiene 1 operación(es) en borrador: confírmelas o elimínelas antes de cerrar"),
    });
    abrir("/caja");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Cerrar turno" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Contado en CLP"), "1000");
    await usuario.click(within(dialogo).getByRole("button", { name: "Cerrar turno" }));

    expect(await within(dialogo).findByText(/1 operación\(es\) en borrador/)).toBeTruthy();
  });
});

describe("ingresos, retiros y ajustes", () => {
  it("el fondo inicial en dólares viaja en centavos", async () => {
    const api = usarApi({ ...rutasDe("cajero"), "POST /api/caja/movimientos": respuesta(201, {}) });
    abrir("/caja");
    const usuario = userEvent.setup();

    await screen.findByRole("option", { name: "USD" });
    await usuario.selectOptions(screen.getByLabelText("Moneda"), "USD");
    await usuario.type(screen.getByLabelText("Monto"), "1.000,50");
    await usuario.type(screen.getByLabelText("Motivo"), "Fondo inicial");
    await usuario.click(screen.getByRole("button", { name: "Registrar ingreso" }));

    expect(await screen.findByText("Ingreso registrado.")).toBeTruthy();
    expect(api.a("POST /api/caja/movimientos")[0]?.cuerpo).toEqual({
      tipo: "INGRESO",
      monedaCodigo: "USD",
      monto: "100050",
      motivo: "Fondo inicial",
      costoE6: null,
    });
  });

  it("un retiro sin saldo suficiente aparece junto al monto", async () => {
    usarApi({ ...rutasDe("cajero"), "POST /api/caja/movimientos": error(409, "SALDO_INSUFICIENTE", "Saldo insuficiente de CLP en la caja: hay $ 500") });
    abrir("/caja");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("radio", { name: "Retiro" }));
    await usuario.type(screen.getByLabelText("Monto"), "1000");
    await usuario.type(screen.getByLabelText("Motivo"), "Depósito al banco");
    await usuario.click(screen.getByRole("button", { name: "Registrar retiro" }));

    expect(await screen.findByText("Saldo insuficiente de CLP en la caja: hay $ 500")).toBeTruthy();
  });

  it("un ajuste del supervisor puede restar", async () => {
    const api = usarApi({ ...rutasDe("supervisor"), "POST /api/caja/ajustes": respuesta(201, {}) });
    abrir("/caja");
    const usuario = userEvent.setup();

    const formulario = (await screen.findByRole("button", { name: "Registrar ajuste" })).closest("form")!;
    await usuario.type(within(formulario).getByLabelText("Monto"), "-1.000");
    await usuario.type(within(formulario).getByLabelText("Motivo"), "Diferencia del arqueo del turno 1");
    await usuario.click(within(formulario).getByRole("button", { name: "Registrar ajuste" }));

    expect(await screen.findByText("Ajuste registrado.")).toBeTruthy();
    expect(api.a("POST /api/caja/ajustes")[0]?.cuerpo).toEqual({ cajaId: 1, monedaCodigo: "CLP", monto: "-1000", motivo: "Diferencia del arqueo del turno 1" });
  });
});

describe("gastos", () => {
  it("registra un gasto en efectivo y lo reversa con motivo", async () => {
    const gasto = {
      id: 1,
      fecha: "2026-11-09",
      categoriaId: 6,
      descripcion: "Resmas de papel",
      monto: "12500",
      medioPago: "EFECTIVO",
      cajaId: 1,
      turnoId: 1,
      documento: null,
      estado: "VIGENTE",
      reversadoPor: null,
      reversadoEn: null,
      motivoReverso: null,
      usuarioId: 3,
      registradoEn: "2026-11-09T12:00:00.000Z",
    };
    const api = usarApi({
      ...rutasDe("supervisor"),
      "GET /api/gastos": [gasto],
      "POST /api/gastos": respuesta(201, gasto),
      "POST /api/gastos/1/reversar": { ...gasto, estado: "REVERSADO" },
    });
    abrir("/caja/gastos");
    const usuario = userEvent.setup();

    await usuario.type(await screen.findByLabelText("Descripción"), "Resmas de papel");
    await usuario.type(screen.getByLabelText("Monto"), "12.500");
    await usuario.click(screen.getByRole("button", { name: "Registrar gasto" }));
    expect(await screen.findByText("Gasto registrado.")).toBeTruthy();
    expect(api.a("POST /api/gastos")[0]?.cuerpo).toMatchObject({
      categoriaId: 6,
      descripcion: "Resmas de papel",
      monto: "12500",
      medioPago: "EFECTIVO",
      documento: null,
    });

    await usuario.click(screen.getByRole("button", { name: "Reversar" }));
    const dialogo = await screen.findByRole("dialog");
    await usuario.type(within(dialogo).getByLabelText("Motivo"), "Se pagó dos veces");
    await usuario.click(within(dialogo).getByRole("button", { name: "Reversar gasto" }));

    await screen.findByText("Gasto registrado.");
    expect(api.a("POST /api/gastos/1/reversar")[0]?.cuerpo).toEqual({ motivo: "Se pagó dos veces" });
  });
});
