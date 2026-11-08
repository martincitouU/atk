import { describe, expect, it } from "vitest";
import { consultarAuditoria } from "../../src/servicios/auditoria.ts";
import { registrarGasto } from "../../src/servicios/gastos.ts";
import { confirmarOperacion, crearBorrador, reversarOperacion } from "../../src/servicios/operaciones.ts";
import { resumenJornada } from "../../src/servicios/resumen.ts";
import { abrirConFondos, ADMIN, CAJERO, codigoDeError, escenario, operar, SUPERVISOR } from "./escenario.ts";

const FONDOS = { CLP: 1_000_000n, USD: 100_000n };
const VENTA_USD_100 = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n } as const;

describe("RF-15: auditoría de operaciones", () => {
  it("registra creación, confirmación y reverso con usuario, fecha, hora y motivo", () => {
    const { ctx, reloj, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = operar(ctx, CAJERO, VENTA_USD_100, folio());
    reversarOperacion(ctx, SUPERVISOR, op.id, "Error de digitación");

    const eventos = consultarAuditoria(ctx, ADMIN, { tabla: "operacion", registroId: String(op.id) });

    expect(eventos.map((e) => [e.accion, e.usuarioId, e.motivo])).toEqual([
      ["REVERSAR", SUPERVISOR.id, "Error de digitación"],
      ["CONFIRMAR", CAJERO.id, null],
      ["CREAR", CAJERO.id, null],
    ]);
    expect(eventos[0]?.registradoEn).toEqual(reloj.ahora());
    // Los montos quedan como texto exacto: JSON no tiene bigint
    expect(eventos[1]?.datosDespues).toMatchObject({ estado: "CONFIRMADA", montoBase: "95410" });
  });

  it("si la acción falla, no queda registro", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100); // sin folio

    expect(codigoDeError(() => confirmarOperacion(ctx, CAJERO, op.id))).toBe("FALTA_FOLIO");
    const acciones = consultarAuditoria(ctx, ADMIN, { tabla: "operacion" }).map((e) => e.accion);
    expect(acciones).toEqual(["CREAR"]);
  });

  it("solo la consulta el administrador, y no se puede alterar", () => {
    const { ctx, sqlite } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    expect(codigoDeError(() => consultarAuditoria(ctx, SUPERVISOR))).toBe("SIN_PERMISO");
    expect(() => sqlite.prepare("UPDATE auditoria SET motivo = 'otro'").run()).toThrow("solo inserción");
    expect(() => sqlite.prepare("DELETE FROM auditoria").run()).toThrow("solo inserción");
  });
});

describe("RF-16: resumen de la jornada", () => {
  it("muestra saldos, operaciones y margen del día; lo reversado no suma", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    operar(ctx, CAJERO, VENTA_USD_100, folio());
    operar(ctx, CAJERO, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio());
    const reversada = operar(ctx, CAJERO, VENTA_USD_100, folio());
    reversarOperacion(ctx, SUPERVISOR, reversada.id, "Duplicada");
    registrarGasto(ctx, CAJERO, { categoriaId: 6, descripcion: "Resma", monto: 5_000n, medioPago: "EFECTIVO" });

    const resumen = resumenJornada(ctx, SUPERVISOR);

    expect(resumen.operaciones).toMatchObject({ confirmadas: 2, reversadas: 1 });
    expect(resumen.operaciones.porMoneda).toEqual([
      expect.objectContaining({ monedaCodigo: "USD", ventas: 1, compras: 1, baseCobrada: 95_410n, basePagada: 92_590n }),
    ]);
    expect(resumen.margen.bruto).toBe(2_820n); // 1.410 de la venta + 1.410 de la compra
    expect(resumen.gastos).toEqual({ cantidad: 1, total: 5_000n });
    expect(resumen.saldos.totales).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ monedaCodigo: "USD", saldo: 100_000n }),
        expect.objectContaining({ monedaCodigo: "CLP", saldo: 1_000_000n + 95_410n - 92_590n - 5_000n }),
      ]),
    );
    expect(resumen.turnosAbiertos).toHaveLength(1);
  });

  it("otro día no incluye las operaciones de hoy", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    operar(ctx, CAJERO, VENTA_USD_100, folio());

    expect(resumenJornada(ctx, ADMIN, "2020-01-01").operaciones.confirmadas).toBe(0);
  });

  it("es para supervisores y administradores", () => {
    const { ctx } = escenario();

    expect(codigoDeError(() => resumenJornada(ctx, CAJERO))).toBe("SIN_PERMISO");
  });
});
