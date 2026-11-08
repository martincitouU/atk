import { describe, expect, it } from "vitest";
import { ajustarCaja, movimientosDeTurno, registrarIngresoORetiro } from "../../src/servicios/caja.ts";
import { listarGastos, registrarGasto, reversarGasto } from "../../src/servicios/gastos.ts";
import { crearBorrador } from "../../src/servicios/operaciones.ts";
import { abrirTurno, cerrarTurno } from "../../src/servicios/turnos.ts";
import {
  abrirConFondos,
  ADMIN,
  CAJERA_2,
  CAJERO,
  codigoDeError,
  escenario,
  mensajeDeError,
  operar,
  saldoDe,
  SUPERVISOR,
} from "./escenario.ts";

const FONDOS = { CLP: 1_000_000n, USD: 100_000n };
const VENTA_USD_100 = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n } as const;
const PAPEL = 6; // categoría "Insumos y oficina"

describe("turnos", () => {
  it("una persona tiene un turno a la vez y una caja tiene un turno a la vez", () => {
    const { ctx } = escenario();
    abrirTurno(ctx, CAJERO, 1);

    expect(codigoDeError(() => abrirTurno(ctx, CAJERO, 2))).toBe("YA_TIENE_TURNO");
    expect(mensajeDeError(() => abrirTurno(ctx, CAJERA_2, 1))).toBe("La caja Caja 1 ya tiene un turno abierto de Cajero");
  });
});

describe("RF-05: retiros e ingresos de caja", () => {
  it("un retiro con motivo descuenta la caja y queda en el libro con su fecha", () => {
    const { ctx, reloj } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);

    registrarIngresoORetiro(ctx, CAJERO, { tipo: "RETIRO", monedaCodigo: "CLP", monto: 200_000n, motivo: "Depósito en banco" });

    expect(saldoDe(ctx, 1, "CLP")).toBe(800_000n);
    const retiro = movimientosDeTurno(ctx.db, turno.id).at(-1);
    expect(retiro).toMatchObject({ tipo: "RETIRO", monto: -200_000n, saldoPost: 800_000n, descripcion: "Depósito en banco" });
    expect(retiro?.creadoEn).toEqual(reloj.ahora());
  });

  it("exige motivo, turno y saldo suficiente", () => {
    const { ctx } = escenario();
    const retiro = { tipo: "RETIRO", monedaCodigo: "CLP", monto: 2_000_000n, motivo: "Depósito" } as const;
    expect(codigoDeError(() => registrarIngresoORetiro(ctx, CAJERO, retiro))).toBe("SIN_TURNO");

    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    expect(codigoDeError(() => registrarIngresoORetiro(ctx, CAJERO, { ...retiro, motivo: " " }))).toBe("FALTA_MOTIVO");
    expect(codigoDeError(() => registrarIngresoORetiro(ctx, CAJERO, retiro))).toBe("SALDO_INSUFICIENTE");
  });
});

describe("RF-05: gastos operacionales", () => {
  it("un gasto en efectivo sale de la caja y su reverso lo devuelve", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    const gasto = registrarGasto(ctx, CAJERO, { categoriaId: PAPEL, descripcion: "Resma de papel", monto: 5_000n, medioPago: "EFECTIVO" });
    expect(gasto).toMatchObject({ estado: "VIGENTE", cajaId: 1 });
    expect(saldoDe(ctx, 1, "CLP")).toBe(995_000n);

    expect(codigoDeError(() => reversarGasto(ctx, CAJERO, gasto.id, "Error"))).toBe("SIN_PERMISO");
    reversarGasto(ctx, SUPERVISOR, gasto.id, "Se pagó con fondos personales");
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_000_000n);
  });

  it("un gasto por transferencia lo registra el admin, con su fecha, y no toca la caja", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const arriendo = { fecha: "2026-11-01", categoriaId: 1, descripcion: "Arriendo noviembre", monto: 900_000n, medioPago: "TRANSFERENCIA" } as const;

    expect(codigoDeError(() => registrarGasto(ctx, CAJERO, arriendo))).toBe("SIN_PERMISO");
    expect(registrarGasto(ctx, ADMIN, arriendo)).toMatchObject({ fecha: "2026-11-01", cajaId: null, turnoId: null });
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_000_000n);
    expect(listarGastos(ctx.db, { desde: "2026-11-01", hasta: "2026-11-01" })).toHaveLength(1);
  });

  it("rechaza fechas futuras o inválidas", () => {
    const { ctx } = escenario();
    const gasto = { categoriaId: 1, descripcion: "Arriendo", monto: 1n, medioPago: "TRANSFERENCIA" } as const;

    expect(codigoDeError(() => registrarGasto(ctx, ADMIN, { ...gasto, fecha: "2999-01-01" }))).toBe("FECHA_FUTURA");
    expect(codigoDeError(() => registrarGasto(ctx, ADMIN, { ...gasto, fecha: "2026-02-30" }))).toBe("FECHA_INVALIDA");
  });
});

describe("RF-06: arqueo y cierre diario", () => {
  it("muestra por divisa la diferencia entre lo contado y el saldo del sistema", () => {
    const { ctx, folio } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    operar(ctx, CAJERO, VENTA_USD_100, folio());

    const { turno: cerrado, arqueo } = cerrarTurno(ctx, CAJERO, turno.id, { CLP: 1_095_410n, USD: 89_900n });

    expect(cerrado.estado).toBe("CERRADO");
    expect(arqueo.map((a) => [a.monedaCodigo, a.saldoSistema, a.saldoContado, a.diferencia])).toEqual([
      ["CLP", 1_095_410n, 1_095_410n, 0n],
      ["USD", 90_000n, 89_900n, -100n], // faltan US$ 1,00
    ]);
  });

  it("toda moneda con saldo se cuenta: olvidar una no pasa por cero", () => {
    const { ctx } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);

    expect(mensajeDeError(() => cerrarTurno(ctx, CAJERO, turno.id, { CLP: 1_000_000n }))).toBe("Falta el conteo de: USD");
  });

  it("no se cierra con borradores pendientes", () => {
    const { ctx } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    crearBorrador(ctx, CAJERO, VENTA_USD_100);

    expect(codigoDeError(() => cerrarTurno(ctx, CAJERO, turno.id, { CLP: 1_000_000n, USD: 100_000n }))).toBe("BORRADORES_PENDIENTES");
  });

  it("solo quien abrió el turno o un supervisor lo cierra", () => {
    const { ctx } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    abrirTurno(ctx, CAJERA_2, 2);

    expect(codigoDeError(() => cerrarTurno(ctx, CAJERA_2, turno.id, { CLP: 1_000_000n, USD: 100_000n }))).toBe("SIN_PERMISO");
    expect(cerrarTurno(ctx, SUPERVISOR, turno.id, { CLP: 1_000_000n, USD: 100_000n }).turno.cerradoPor).toBe(SUPERVISOR.id);
  });

  it("un supervisor ajusta la diferencia con motivo", () => {
    const { ctx } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    cerrarTurno(ctx, CAJERO, turno.id, { CLP: 1_000_000n, USD: 99_900n });
    const ajuste = { cajaId: 1, monedaCodigo: "USD", monto: -100n, motivo: "Faltante del arqueo", turnoId: turno.id };

    expect(codigoDeError(() => ajustarCaja(ctx, CAJERO, ajuste))).toBe("SIN_PERMISO");
    ajustarCaja(ctx, SUPERVISOR, ajuste);
    expect(saldoDe(ctx, 1, "USD")).toBe(99_900n);
  });
});
