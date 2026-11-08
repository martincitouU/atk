import { describe, expect, it } from "vitest";
import { montoMinimo, teclear, verMonto, type Borrador } from "../src/teclado/registro.ts";

const D = ["USD", "ARS", "EUR"];
const vacio: Borrador = { tipo: "COMPRA", moneda: "USD", monto: "", medioPago: "EFECTIVO", folio: "", esperaDivisa: false };
const escribir = (teclas: string[], desde: Borrador = vacio) => teclas.reduce((b, t) => teclear(b, t, D).borrador, desde);

describe("el reductor del registro con teclado", () => {
  it("C/V eligen el tipo y el dígito siguiente, la divisa", () => {
    expect(escribir(["v", "3"])).toMatchObject({ tipo: "VENTA", moneda: "EUR", monto: "", esperaDivisa: false });
    expect(escribir(["V"])).toMatchObject({ tipo: "VENTA", esperaDivisa: true });
  });

  it("después de elegir la divisa, los dígitos van al monto (150 en ARS)", () => {
    expect(escribir(["c", "2", "1", "5", "0"])).toMatchObject({ moneda: "ARS", monto: "150" });
  });

  it("un dígito fuera de rango después de C/V va al monto", () => {
    expect(escribir(["v", "4", "5"])).toMatchObject({ tipo: "VENTA", moneda: "USD", monto: "45", esperaDivisa: false });
  });

  it("ArrowDown pasa a la divisa siguiente y ArrowUp a la anterior, en círculo", () => {
    expect(escribir(["ArrowDown"]).moneda).toBe("ARS");
    expect(escribir(["ArrowUp"]).moneda).toBe("EUR");
    expect(escribir(["v", "ArrowDown", "4"])).toMatchObject({ moneda: "ARS", monto: "4", esperaDivisa: false });
  });

  it("los dígitos y una sola coma van al monto; Backspace borra", () => {
    expect(escribir(["4", "5", "0", ",", "2", ",", "5"]).monto).toBe("450,25");
    expect(escribir(["4", "5", "Backspace"]).monto).toBe("4");
    expect(escribir([","]).monto).toBe("0,");
    expect(escribir(["0", "0", "7"]).monto).toBe("7");
  });

  it("las teclas que no son del registro no cambian nada", () => {
    for (const tecla of ["x", ".", "Tab", "F1", "r"]) expect(teclear(vacio, tecla, D)).toEqual({ borrador: vacio });
  });

  it("Enter pide confirmar solo con un monto válido; B deja borrador; Escape limpia", () => {
    expect(teclear(vacio, "Enter", D).accion).toBeUndefined();
    expect(teclear({ ...vacio, monto: "0" }, "Enter", D).accion).toBeUndefined();
    expect(teclear({ ...vacio, monto: "450" }, "Enter", D).accion).toBe("CONFIRMAR");
    expect(teclear({ ...vacio, monto: "450" }, "b", D).accion).toBe("BORRADOR");
    expect(teclear({ ...vacio, monto: "450" }, "Escape", D)).toEqual({ borrador: vacio, accion: "LIMPIAR" });
  });

  it("Escape deja el tipo y la divisa, y vuelve el medio de pago a efectivo", () => {
    const lleno: Borrador = { tipo: "VENTA", moneda: "EUR", monto: "50", medioPago: "TARJETA", folio: "18234", esperaDivisa: true };
    expect(teclear(lleno, "Escape", D).borrador).toEqual({ ...vacio, tipo: "VENTA", moneda: "EUR" });
  });

  it("montoMinimo respeta los decimales de la divisa", () => {
    expect(montoMinimo({ ...vacio, monto: "450,25" }, 2)).toBe(45025n);
    expect(montoMinimo({ ...vacio, monto: "450,255" }, 2)).toBeNull();
    expect(montoMinimo({ ...vacio, monto: "150000" }, 0)).toBe(150000n);
    expect(montoMinimo({ ...vacio, monto: "0" }, 2)).toBeNull();
    expect(montoMinimo({ ...vacio, monto: "" }, 2)).toBeNull();
  });

  it("verMonto agrupa los miles al mostrar lo escrito", () => {
    expect(verMonto("150000")).toBe("150.000");
    expect(verMonto("1200,5")).toBe("1.200,5");
    expect(verMonto("0,")).toBe("0,");
    expect(verMonto("")).toBe("");
  });
});
