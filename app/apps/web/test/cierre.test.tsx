import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Cierre } from "../src/pantallas/Cierre/Cierre.tsx";
import { leerConteo, type Conteo } from "../src/pantallas/Cierre/conteo.ts";
import { RELOJ_PRUEBA } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";
import { texto } from "./texto.ts";

function montar() {
  render(
    <Proveedores>
      <MemoryRouter>
        <Cierre />
      </MemoryRouter>
    </Proveedores>,
  );
  return userEvent.setup();
}

/** El conteo por billete de una moneda: se elige en la grilla y queda su región (código y nombre). */
async function bloque(u: ReturnType<typeof userEvent.setup>, codigo: string) {
  await u.click(await screen.findByRole("button", { name: `Contar ${codigo}` }));
  return screen.findByRole("region", { name: new RegExp(`^${codigo} `) });
}

/** El valor de una fila del pie del bloque («Contado», «En sistema», «Diferencia»). */
function pie(region: HTMLElement, rotulo: string) {
  const dt = within(region).getByText(rotulo, { selector: "dt" });
  const dd = dt.nextElementSibling;
  if (!(dd instanceof HTMLElement)) throw new Error(`Sin valor para ${rotulo}`);
  return dd;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RELOJ_PRUEBA);
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("Cierre del día", () => {
  it("contar USD con 4 × 100 + 1 × 50 da 450,00, y la diferencia aparece contra el teórico de la semilla", async () => {
    const u = montar();
    const usd = await bloque(u, "USD");
    await u.type(within(usd).getByLabelText("Cantidad de billetes de US$ 100"), "4");
    await u.type(within(usd).getByLabelText("Cantidad de billetes de US$ 50"), "1");

    expect(within(usd).getByText("400,00")).toBeInTheDocument(); // el subtotal de la fila
    expect(pie(usd, "Contado")).toHaveTextContent("US$ 450,00");
    // La semilla: fondo de US$ 2.000 + compra de 1.200 − venta de 300 (el borrador de 80 no mueve la caja)
    expect(await within(usd).findByText("US$ 2.900,00")).toBeInTheDocument();
    const diferencia = pie(usd, "Diferencia");
    expect(diferencia).toHaveTextContent("Falta");
    expect(diferencia).toHaveTextContent("−US$ 2.450,00");
  });

  it("el total sin contar billetes se lee con coma decimal y miles con punto", async () => {
    const u = montar();
    const eur = await bloque(u, "EUR");
    await u.click(within(eur).getByRole("button", { name: "Ingresar el total sin contar billetes" }));
    await u.type(within(eur).getByLabelText(/Total contado en EUR/), "1.450,00");
    expect(pie(eur, "Contado")).toHaveTextContent("€ 1.450,00");
    expect(await within(eur).findByText("Cuadra")).toBeInTheDocument();
  });

  it("los borradores bloquean el cierre; sin ellos y con todo contado, cierra y deja el arqueo", async () => {
    const u = montar();
    const cerrar = await screen.findByRole("button", { name: "Cerrar turno" });
    expect(cerrar).toBeDisabled();

    // El borrador de la semilla (compra de US$ 80 de las 09:40), con su enlace a la Ventanilla
    expect(await screen.findByText(/Hay 1 borrador sin confirmar/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Confirmar en la Ventanilla/ })).toHaveAttribute("href", "/ventanilla");
    expect(cerrar).toHaveAccessibleDescription(/1 borrador pendiente/);
    await u.click(screen.getByRole("button", { name: "Eliminar el borrador de las 09:40" }));
    expect(await screen.findByText(/Eliminado el borrador de las 09:40/)).toBeInTheDocument();
    expect(cerrar).toHaveAccessibleDescription("Falta contar USD, ARS, EUR y CLP.");

    // Cada moneda por su total: lo mismo que dice el sistema
    for (const [codigo, total] of [
      ["USD", "2900"],
      ["ARS", "500000"],
      ["EUR", "1450"],
      ["CLP", "3482150"],
    ] as const) {
      const region = await bloque(u, codigo);
      await u.click(within(region).getByRole("button", { name: "Ingresar el total sin contar billetes" }));
      await u.type(within(region).getByLabelText(new RegExp(`Total contado en ${codigo}`)), total);
      expect(await within(region).findByText("Cuadra")).toBeInTheDocument();
    }
    expect(cerrar).toBeEnabled();
    await u.click(cerrar);

    // El «·» es solo visual: el lector de pantalla oye «Turno cerrado a las 10:44 Caja 1», sin juntar las palabras
    expect(await screen.findByRole("heading", { name: "Turno cerrado a las 10:44 Caja 1" })).toBeInTheDocument();
    expect(screen.getByText("Todo cuadra")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Abrir turno en Caja 1" })).toBeInTheDocument();
    expect(sessionStorage.getItem("atk.cierre.conteo.1")).toBeNull();
  });

  it("registra un gasto (con los campos que faltan marcados) y reversa otro con motivo", async () => {
    const u = montar();
    const form = await screen.findByRole("region", { name: "Gastos, retiros e ingresos" });
    await u.click(within(form).getByRole("button", { name: "Registrar gasto" }));
    expect(within(form).getByText("Elija la categoría del gasto.")).toBeInTheDocument();
    expect(within(form).getByText("Indique el monto.")).toBeInTheDocument();
    expect(within(form).getByText("Describa el gasto.")).toBeInTheDocument();

    await u.selectOptions(await within(form).findByRole("combobox", { name: /Categoría/ }), "Otros");
    await u.type(within(form).getByRole("textbox", { name: /Monto en pesos/ }), "5000");
    await u.type(within(form).getByRole("textbox", { name: /Descripción/ }), "Café para la ventanilla");
    await u.click(within(form).getByRole("button", { name: "Registrar gasto" }));
    expect(await within(form).findByText(texto("Gasto registrado: $5.000 · Otros."))).toBeInTheDocument();

    const lista = screen.getByRole("region", { name: "Gastos de hoy" });
    expect(await within(lista).findByText("Café para la ventanilla")).toBeInTheDocument();

    // El reverso: sin motivo no se puede
    await u.click(within(lista).getByRole("button", { name: /Reversar el gasto «Resma de papel/ }));
    const reversar = within(lista).getByRole("button", { name: "Reversar gasto" });
    expect(reversar).toBeDisabled();
    await u.type(within(lista).getByLabelText("Motivo del reverso"), "Se registró dos veces");
    await u.click(reversar);
    expect(await within(lista).findByText(/Reversado el gasto «Resma de papel.*»: el dinero volvió a la caja/)).toBeInTheDocument();
    expect(within(lista).getByText("Se registró dos veces")).toBeInTheDocument();
    expect(within(lista).getByText("Reversado")).toBeInTheDocument();
  });
});

describe("leerConteo", () => {
  const usd = [10000n, 5000n, 2000n, 1000n, 500n, 100n];
  const conteo = (c: Partial<Conteo>): Conteo => ({ modo: "billetes", cantidades: {}, sueltos: "", total: "", ...c });

  it("suma con bigint cantidad × billete más los sueltos", () => {
    expect(leerConteo(conteo({ cantidades: { "10000": "4", "5000": "1" } }), usd, 2)).toEqual({ estado: "contado", monto: 45000n });
    expect(leerConteo(conteo({ cantidades: { "100": "3" }, sueltos: "0,75" }), usd, 2)).toEqual({ estado: "contado", monto: 375n });
  });

  it("sin nada escrito está sin contar; un 0 escrito es una caja vacía declarada", () => {
    expect(leerConteo(conteo({}), usd, 2)).toEqual({ estado: "sin-contar" });
    expect(leerConteo(conteo({ cantidades: { "10000": "0" } }), usd, 2)).toEqual({ estado: "contado", monto: 0n });
  });

  it("un monto con más decimales que la moneda no se redondea: es inválido", () => {
    expect(leerConteo(conteo({ sueltos: "1,234" }), usd, 2)).toEqual({ estado: "invalido" });
    expect(leerConteo(conteo({ modo: "total", total: "12,5" }), [], 0)).toEqual({ estado: "invalido" });
    expect(leerConteo(conteo({ modo: "total", total: "3.482.150" }), [], 0)).toEqual({ estado: "contado", monto: 3482150n });
  });
});
