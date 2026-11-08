import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { cotizacion, reglaSpread } from "../../src/db/esquema.ts";
import { pizarra, publicarCotizacion } from "../../src/servicios/cotizaciones.ts";
import { abrirConFondos, ADMIN, CAJERO, codigoDeError, escenario, HORA, operar, SUPERVISOR } from "./escenario.ts";

const USD_950 = { monedaCodigo: "USD", referenciaE6: 950_000_000n, margenCompraE6: 1_500_000n, margenVentaE6: 1_500_000n };

describe("RF-08: panel de tipos de cambio y spread", () => {
  it("publicar calcula compra y venta con el margen, y la pizarra la muestra", () => {
    const { ctx } = escenario();

    const nueva = publicarCotizacion(ctx, ADMIN, USD_950);

    // 950 × 0,985 = 935,75      950 × 1,015 = 964,25
    expect(nueva).toMatchObject({ precioCompraE6: 935_750_000n, precioVentaE6: 964_250_000n });
    expect(pizarra(ctx).find((p) => p.monedaCodigo === "USD")).toMatchObject({
      compraE6: 935_750_000n,
      ventaE6: 964_250_000n,
      referenciaE6: 950_000_000n,
      margenCompraE6: 1_500_000n,
      vencida: false,
    });
  });

  it("la cotización anterior queda cerrada, no borrada", () => {
    const { ctx } = escenario();
    publicarCotizacion(ctx, ADMIN, USD_950);

    const historial = ctx.db.select().from(cotizacion).where(eq(cotizacion.monedaCodigo, "USD")).all();
    expect(historial).toHaveLength(2);
    expect(historial[0]?.vigenteHasta).toEqual(historial[1]?.vigenteDesde);
  });

  it("cambiar el margen cierra la regla anterior y crea otra; la operación ya hecha conserva la suya", () => {
    const { ctx, folio } = escenario();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 1_000_000n, USD: 100_000n });
    const anterior = operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n }, folio());

    const nueva = publicarCotizacion(ctx, ADMIN, { ...USD_950, margenVentaE6: 2_000_000n });

    expect(nueva.reglaSpreadId).not.toBe(anterior.reglaSpreadId);
    const reglaVieja = ctx.db.select().from(reglaSpread).where(eq(reglaSpread.id, anterior.reglaSpreadId ?? -1)).get();
    expect(reglaVieja?.vigenteHasta).toEqual(nueva.vigenteDesde);
    expect(reglaVieja?.margenVentaE6).toBe(1_500_000n);
  });

  it("si el margen no cambia, se reutiliza la regla", () => {
    const { ctx } = escenario();
    const primera = publicarCotizacion(ctx, ADMIN, USD_950);
    const segunda = publicarCotizacion(ctx, ADMIN, { ...USD_950, referenciaE6: 951_000_000n });

    expect(segunda.reglaSpreadId).toBe(primera.reglaSpreadId);
  });

  it("el tramo mayorista se mantiene al cambiar el margen base", () => {
    const { ctx } = escenario();
    publicarCotizacion(ctx, ADMIN, { ...USD_950, margenVentaE6: 2_000_000n });

    const vigentes = ctx.db.select().from(reglaSpread).where(eq(reglaSpread.monedaCodigo, "USD")).all().filter((r) => !r.vigenteHasta);
    expect(vigentes.map((r) => [r.montoDesde, r.montoHasta, r.margenVentaE6])).toEqual([
      [500_000n, null, 1_000_000n], // mayorista, sin cambios
      [0n, 500_000n, 2_000_000n], // base nueva, con el mismo tope del tramo
    ]);
  });

  it("solo el administrador publica, con márgenes válidos", () => {
    const { ctx } = escenario();

    expect(codigoDeError(() => publicarCotizacion(ctx, SUPERVISOR, USD_950))).toBe("SIN_PERMISO");
    expect(codigoDeError(() => publicarCotizacion(ctx, ADMIN, { ...USD_950, margenCompraE6: 100_000_000n }))).toBe("MARGEN_INVALIDO");
    expect(codigoDeError(() => publicarCotizacion(ctx, ADMIN, { ...USD_950, margenVentaE6: -1n }))).toBe("MARGEN_INVALIDO");
    expect(codigoDeError(() => publicarCotizacion(ctx, ADMIN, { ...USD_950, referenciaE6: 0n }))).toBe("REFERENCIA_INVALIDA");
    expect(codigoDeError(() => publicarCotizacion(ctx, ADMIN, { ...USD_950, monedaCodigo: "JPY" }))).toBe("MONEDA_NO_HABILITADA");
  });

  it("la pizarra marca las cotizaciones vencidas", () => {
    const { ctx, reloj } = escenario();
    reloj.avanzar(13 * HORA);

    expect(pizarra(ctx).every((p) => p.vencida)).toBe(true);
  });
});
