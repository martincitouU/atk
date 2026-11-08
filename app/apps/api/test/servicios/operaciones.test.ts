import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { movimientoCaja, operacion, parametro } from "../../src/db/esquema.ts";
import { editarCliente } from "../../src/servicios/clientes.ts";
import { publicarCotizacion } from "../../src/servicios/cotizaciones.ts";
import {
  autorizarTasa,
  confirmarOperacion,
  crearBorrador,
  editarBorrador,
  eliminarBorrador,
  listarOperaciones,
  previsualizarOperacion,
  reversarOperacion,
} from "../../src/servicios/operaciones.ts";
import { cerrarTurno } from "../../src/servicios/turnos.ts";
import { inicioDelDia, fechaLocal } from "../../src/dominio/tiempo.ts";
import {
  abrirConFondos,
  ADMIN,
  CAJERA_2,
  CAJERO,
  codigoDeError,
  costoDe,
  escenario,
  HORA,
  MINUTO,
  mensajeDeError,
  operar,
  saldoDe,
  SUPERVISOR,
} from "./escenario.ts";

const FONDOS = { CLP: 1_000_000n, USD: 100_000n }; // $ 1.000.000 y US$ 1.000,00
const VENTA_USD_100 = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n } as const;

describe("RF-01, RF-02, RF-03: registro y cálculo", () => {
  it("RF-02: una venta nace como borrador con el precio de pizarra, el monto en pesos y el margen", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100);

    expect(op).toMatchObject({
      estado: "BORRADOR",
      medioPago: "EFECTIVO",
      tasaAplicadaE6: 954_100_000n, // la pizarra vigente se aplica sola (RF-08)
      montoBase: 95_410n, // US$ 100,00 × 954,10
      tasaReferenciaE6: 940_000_000n,
      margenBruto: 1_410n, // 95.410 − 94.000
      equivalenteUsd: 10_000n,
      esPreferencial: false,
    });
  });

  it("RF-01: una compra registra el medio de pago", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    const op = crearBorrador(ctx, CAJERO, { tipo: "COMPRA", monedaCodigo: "EUR", montoDivisa: 50_000n, medioPago: "TRANSFERENCIA" });

    expect(op).toMatchObject({ medioPago: "TRANSFERENCIA", tasaAplicadaE6: 999_600_000n, montoBase: 499_800n, margenBruto: 10_200n });
  });

  it("aplica el tramo mayorista desde US$ 5.000", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, montoDivisa: 600_000n });

    // 940 × 1,01 = 949,40 (en vez de 954,10 del tramo base)
    expect(op).toMatchObject({ reglaSpreadId: 2, tasaAplicadaE6: 949_400_000n, montoBase: 5_696_400n });
  });

  it("un borrador no mueve la caja", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    crearBorrador(ctx, CAJERO, VENTA_USD_100);

    expect(saldoDe(ctx, 1, "USD")).toBe(100_000n);
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_000_000n);
  });

  it("rechaza sin turno, bajo el mínimo y divisas no habilitadas", () => {
    const { ctx } = escenario();
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, VENTA_USD_100))).toBe("SIN_TURNO");

    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, montoDivisa: 50n }))).toBe("BAJO_MINIMO");
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, monedaCodigo: "JPY" }))).toBe("MONEDA_NO_HABILITADA");
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, monedaCodigo: "CLP" }))).toBe("MONEDA_NO_HABILITADA");
  });

  it("rechaza operar con la pizarra vencida", () => {
    const { ctx, reloj } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    reloj.avanzar(13 * HORA); // la vigencia es de 12 horas

    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, VENTA_USD_100))).toBe("COTIZACION_VENCIDA");
  });
});

describe("RF-04: saldos tras confirmar", () => {
  it("una venta en efectivo entrega la divisa y recibe los pesos", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    operar(ctx, CAJERO, VENTA_USD_100, folio());

    expect(saldoDe(ctx, 1, "USD")).toBe(90_000n);
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_095_410n);
  });

  it("una compra pagada por transferencia recibe la divisa pero no saca pesos de la caja", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    operar(ctx, CAJERO, { tipo: "COMPRA", monedaCodigo: "EUR", montoDivisa: 50_000n, medioPago: "TRANSFERENCIA" }, folio());

    expect(saldoDe(ctx, 1, "EUR")).toBe(50_000n);
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_000_000n);
  });

  it("no entrega divisa que la caja no tiene, y no deja nada a medias", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, montoDivisa: 200_000n, ...folio() });

    expect(mensajeDeError(() => confirmarOperacion(ctx, CAJERO, op.id))).toBe(
      "Saldo insuficiente de USD en la caja: hay 1.000,00 y se necesitan 2.000,00",
    );
    expect(listarOperaciones(ctx.db)[0]?.estado).toBe("BORRADOR");
    expect(saldoDe(ctx, 1, "USD")).toBe(100_000n);
  });

  it("lleva el costo promedio de la divisa y calcula el margen realizado de la venta", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS); // US$ 1.000 a la referencia: 940,00
    expect(costoDe(ctx, 1, "USD")).toBe(940_000_000n);

    operar(ctx, CAJERO, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio()); // US$ 100 a 925,90
    // (1.000 × 940 + 100 × 925,90) / 1.100 = 938,718182
    expect(costoDe(ctx, 1, "USD")).toBe(938_718_182n);

    const venta = operar(ctx, CAJERO, VENTA_USD_100, folio());
    // cobrado 95.410 − costo 93.871,8182 → 1.538
    expect(venta.margenRealizado).toBe(1_538n);
    expect(costoDe(ctx, 1, "USD")).toBe(938_718_182n); // vender no cambia el costo
  });
});

describe("RF-07: corrección y reverso", () => {
  it("un borrador se edita y se recalcula", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100);

    const editada = editarBorrador(ctx, CAJERO, op.id, { montoDivisa: 20_000n, observacion: "Cliente frecuente" });

    expect(editada).toMatchObject({ estado: "BORRADOR", montoBase: 190_820n, observacion: "Cliente frecuente" });
  });

  it("un borrador se elimina", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100);

    eliminarBorrador(ctx, CAJERO, op.id);

    expect(listarOperaciones(ctx.db)).toEqual([]);
  });

  it("solo quien registró el borrador lo edita, elimina o confirma", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    abrirConFondos(ctx, CAJERA_2, 2, {});
    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100);

    expect(codigoDeError(() => editarBorrador(ctx, CAJERA_2, op.id, { montoDivisa: 1_000n }))).toBe("NO_ES_PROPIA");
    expect(codigoDeError(() => eliminarBorrador(ctx, CAJERA_2, op.id))).toBe("NO_ES_PROPIA");
    expect(codigoDeError(() => confirmarOperacion(ctx, CAJERA_2, op.id))).toBe("NO_ES_PROPIA");
  });

  it("una confirmada no se edita ni se elimina, tampoco directo en la base", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = operar(ctx, CAJERO, VENTA_USD_100, folio());

    expect(codigoDeError(() => editarBorrador(ctx, CAJERO, op.id, { montoDivisa: 1_000n }))).toBe("NO_ES_BORRADOR");
    expect(codigoDeError(() => eliminarBorrador(ctx, CAJERO, op.id))).toBe("NO_ES_BORRADOR");
    expect(() => ctx.db.update(operacion).set({ montoBase: 1n }).where(eq(operacion.id, op.id)).run()).toThrow(
      "confirmada no se modifica",
    );
    expect(() => ctx.db.delete(operacion).where(eq(operacion.id, op.id)).run()).toThrow("no se elimina");
  });

  it("el reverso exige supervisor y motivo, y devuelve la caja a como estaba", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = operar(ctx, CAJERO, VENTA_USD_100, folio());

    expect(codigoDeError(() => reversarOperacion(ctx, CAJERO, op.id, "error"))).toBe("SIN_PERMISO");
    expect(codigoDeError(() => reversarOperacion(ctx, SUPERVISOR, op.id, "   "))).toBe("FALTA_MOTIVO");

    const reversada = reversarOperacion(ctx, SUPERVISOR, op.id, "El cliente se arrepintió");

    expect(reversada).toMatchObject({ estado: "REVERSADA", reversadaPor: SUPERVISOR.id, motivoReverso: "El cliente se arrepintió" });
    expect(saldoDe(ctx, 1, "USD")).toBe(100_000n);
    expect(saldoDe(ctx, 1, "CLP")).toBe(1_000_000n);
    const libro = ctx.db.select().from(movimientoCaja).where(eq(movimientoCaja.operacionId, op.id)).all();
    expect(libro.map((m) => [m.tipo, m.monedaCodigo, m.monto])).toEqual([
      ["OPERACION", "USD", -10_000n],
      ["OPERACION", "CLP", 95_410n],
      ["REVERSO", "USD", 10_000n],
      ["REVERSO", "CLP", -95_410n],
    ]);
  });

  it("el reverso de una compra devuelve el costo promedio anterior", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const compra = operar(ctx, CAJERO, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio());

    reversarOperacion(ctx, SUPERVISOR, compra.id, "Billete falso");

    expect(costoDe(ctx, 1, "USD")).toBe(940_000_000n);
  });

  it("no se reversa un borrador, ni dos veces, ni con el turno cerrado", () => {
    const { ctx, folio } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const borrador = crearBorrador(ctx, CAJERO, VENTA_USD_100);
    expect(codigoDeError(() => reversarOperacion(ctx, SUPERVISOR, borrador.id, "x"))).toBe("NO_REVERSABLE");
    eliminarBorrador(ctx, CAJERO, borrador.id);

    const op = operar(ctx, CAJERO, VENTA_USD_100, folio());
    reversarOperacion(ctx, SUPERVISOR, op.id, "x");
    expect(codigoDeError(() => reversarOperacion(ctx, SUPERVISOR, op.id, "x"))).toBe("NO_REVERSABLE");

    const otra = operar(ctx, CAJERO, VENTA_USD_100, folio());
    cerrarTurno(ctx, CAJERO, turno.id, { CLP: 1_095_410n, USD: 90_000n });
    expect(codigoDeError(() => reversarOperacion(ctx, SUPERVISOR, otra.id, "x"))).toBe("TURNO_CERRADO");
  });

  it("si la pizarra cambió desde el borrador, no se confirma hasta recalcular", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, ...folio() });
    publicarCotizacion(ctx, ADMIN, { monedaCodigo: "USD", referenciaE6: 950_000_000n, margenCompraE6: 1_500_000n, margenVentaE6: 1_500_000n });

    expect(mensajeDeError(() => confirmarOperacion(ctx, CAJERO, op.id))).toBe(
      "La pizarra de USD cambió desde que se registró el borrador (954,10 → 964,25): edítelo para recalcular",
    );

    editarBorrador(ctx, CAJERO, op.id, {});
    expect(confirmarOperacion(ctx, CAJERO, op.id)).toMatchObject({ estado: "CONFIRMADA", tasaAplicadaE6: 964_250_000n, montoBase: 96_425n });
  });
});

describe("tasa preferencial", () => {
  it("la pide el cajero y la autoriza un supervisor antes de confirmar", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, tasaSolicitadaE6: 950_000_000n, ...folio() });
    expect(op).toMatchObject({ esPreferencial: true, autorizadoPor: null, montoBase: 95_000n });

    expect(codigoDeError(() => confirmarOperacion(ctx, CAJERO, op.id))).toBe("FALTA_AUTORIZACION");
    expect(codigoDeError(() => autorizarTasa(ctx, CAJERO, op.id))).toBe("SIN_PERMISO");

    autorizarTasa(ctx, SUPERVISOR, op.id);
    expect(confirmarOperacion(ctx, CAJERO, op.id)).toMatchObject({ estado: "CONFIRMADA", autorizadoPor: SUPERVISOR.id });
  });

  it("editar el borrador quita la autorización", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, tasaSolicitadaE6: 950_000_000n });
    autorizarTasa(ctx, SUPERVISOR, op.id);

    expect(editarBorrador(ctx, CAJERO, op.id, { montoDivisa: 20_000n })).toMatchObject({ esPreferencial: true, autorizadoPor: null });
  });

  it("no se aleja de la pizarra más que la desviación máxima", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);

    expect(mensajeDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, tasaSolicitadaE6: 1_100_000_000n }))).toBe(
      "La tasa pedida se aleja más de 5 % de la pizarra (954,10)",
    );
  });

  it("un supervisor que registra su propia tasa preferencial la autoriza al registrarla", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, SUPERVISOR, 1, FONDOS);

    expect(crearBorrador(ctx, SUPERVISOR, { ...VENTA_USD_100, tasaSolicitadaE6: 950_000_000n })).toMatchObject({
      esPreferencial: true,
      autorizadoPor: SUPERVISOR.id,
    });
  });
});

describe("RF-20: folio tributario", () => {
  it("se exige para confirmar, válido y sin repetir", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const sinFolio = crearBorrador(ctx, CAJERO, VENTA_USD_100);
    expect(codigoDeError(() => confirmarOperacion(ctx, CAJERO, sinFolio.id))).toBe("FALTA_FOLIO");

    const conFolio = folio();
    operar(ctx, CAJERO, VENTA_USD_100, conFolio);
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, ...conFolio }))).toBe("FOLIO_DUPLICADO");
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, tipoDte: 33, folioDte: 5 }))).toBe("DTE_INVALIDO");
    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, tipoDte: 41 }))).toBe("DTE_INCOMPLETO");
  });

  it("se puede dejar opcional con el parámetro", () => {
    const { ctx } = escenario();
    ctx.db.update(parametro).set({ valor: "false" }).where(eq(parametro.clave, "folio_obligatorio_al_confirmar")).run();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const op = crearBorrador(ctx, CAJERO, VENTA_USD_100);

    expect(confirmarOperacion(ctx, CAJERO, op.id).estado).toBe("CONFIRMADA");
  });
});

describe("RF-17: ficha de cliente (UAF)", () => {
  const FONDOS_GRANDES = { CLP: 1_000_000n, USD: 1_000_000n, EUR: 1_000_000n };

  it("bajo US$ 5.000 no exige identificar al cliente", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS_GRANDES);

    expect(operar(ctx, CAJERO, { ...VENTA_USD_100, montoDivisa: 499_999n }, folio()).estado).toBe("CONFIRMADA");
  });

  it("desde US$ 5.000 exige cliente, ficha completa y propósito", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS_GRANDES);
    const grande = { ...VENTA_USD_100, montoDivisa: 500_000n };

    expect(codigoDeError(() => operar(ctx, CAJERO, grande, folio()))).toBe("FALTA_CLIENTE");
    expect(mensajeDeError(() => operar(ctx, CAJERO, { ...grande, clienteId: 2 }, folio()))).toBe(
      "La ficha del cliente está incompleta: falta oficio o profesión, país de residencia, domicilio, contacto (teléfono o email)",
    );
    expect(codigoDeError(() => operar(ctx, CAJERO, { ...grande, clienteId: 1 }, folio()))).toBe("FALTA_PROPOSITO");
    expect(operar(ctx, CAJERO, { ...grande, clienteId: 1, proposito: "Viaje familiar" }, folio()).estado).toBe("CONFIRMADA");
  });

  it("el umbral se mide en dólares también para las demás divisas", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS_GRANDES);

    // € 4.700 × 1.040,40 = $ 4.889.880 → US$ 5.202 a 940: exige ficha
    expect(codigoDeError(() => operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 470_000n }, folio()))).toBe(
      "FALTA_CLIENTE",
    );
    // € 4.500 → US$ 4.980: no
    expect(operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 450_000n }, folio()).equivalenteUsd).toBe(498_064n);
  });

  it("un cliente con relación permanente exige la ficha completa aunque el monto sea bajo", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS_GRANDES);
    editarCliente(ctx, CAJERO, 2, { relacionPermanente: true });

    expect(codigoDeError(() => operar(ctx, CAJERO, { ...VENTA_USD_100, clienteId: 2 }, folio()))).toBe("FICHA_INCOMPLETA");
  });

  it("la vista previa avisa si la operación exigirá la ficha", () => {
    const { ctx } = escenario();
    abrirConFondos(ctx, CAJERO, 1, FONDOS_GRANDES);

    expect(previsualizarOperacion(ctx, CAJERO, VENTA_USD_100).requiereFicha).toBe(false);
    expect(previsualizarOperacion(ctx, CAJERO, { ...VENTA_USD_100, montoDivisa: 500_000n }).requiereFicha).toBe(true);
  });
});

describe("RF-21: registro diferido", () => {
  it("guarda la hora real, la marca de diferido y el precio de la pizarra de esa hora", () => {
    const { ctx, reloj, folio } = escenario();
    const apertura = reloj.ahora();
    abrirConFondos(ctx, CAJERO, 1, FONDOS);
    reloj.avanzar(HORA);
    publicarCotizacion(ctx, ADMIN, { monedaCodigo: "USD", referenciaE6: 950_000_000n, margenCompraE6: 1_500_000n, margenVentaE6: 1_500_000n });
    reloj.avanzar(2 * HORA);

    // Ocurrió media hora después de abrir, cuando la pizarra todavía era 954,10
    const horaReal = new Date(apertura.getTime() + 30 * MINUTO);
    const op = crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, realizadaEn: horaReal, ...folio() });
    expect(op).toMatchObject({ registroDiferido: true, realizadaEn: horaReal, tasaAplicadaE6: 954_100_000n });

    const confirmada = confirmarOperacion(ctx, CAJERO, op.id);
    expect(confirmada.realizadaEn).toEqual(horaReal);
    expect(confirmada.registradaEn.getTime()).toBeGreaterThan(horaReal.getTime());
  });

  it("la hora real debe ser pasada y del día en que se abrió el turno", () => {
    const { ctx, reloj } = escenario();
    const turno = abrirConFondos(ctx, CAJERO, 1, FONDOS);
    const zona = "America/Coyhaique";
    const inicio = inicioDelDia(fechaLocal(turno.abiertoEn, zona), zona);

    expect(codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, realizadaEn: new Date(reloj.ahora().getTime() + MINUTO) }))).toBe(
      "DIFERIDO_FUTURO",
    );
    expect(
      codigoDeError(() => crearBorrador(ctx, CAJERO, { ...VENTA_USD_100, realizadaEn: new Date(inicio.getTime() - MINUTO) })),
    ).toBe("DIFERIDO_FUERA_DE_TURNO");
  });
});
