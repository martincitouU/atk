import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Jornada } from "../src/pantallas/Jornada.tsx";
import { RELOJ_PRUEBA } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";
import { texto } from "./texto.ts";

function montar(entrada = "/jornada") {
  const router = createMemoryRouter([{ path: "/jornada", element: <Jornada /> }], { initialEntries: [entrada] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return router;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RELOJ_PRUEBA);
});
afterEach(() => vi.useRealTimers());

describe("Jornada", () => {
  it("muestra el día, los saldos, el margen, los gastos, los borradores y las operaciones de hoy", async () => {
    montar();
    expect(screen.getByRole("heading", { level: 1, name: "Jornada" })).toBeInTheDocument();
    expect(screen.getByText(texto(/^Hoy · Domingo 8 de noviembre/))).toBeInTheDocument();

    const saldos = screen.getByRole("region", { name: /Saldos en caja/ });
    expect(await within(saldos).findByText("US$ 2.900,00")).toBeInTheDocument();
    expect(within(saldos).getByText("$3.482.150")).toBeInTheDocument();
    // La proporción en pesos, a la referencia vigente del USD (943,50)
    expect(await within(saldos).findByText(/≈ \$2\.736\.150/)).toBeInTheDocument();

    const dia = screen.getByRole("region", { name: "El día" });
    expect(await within(dia).findByText("$18.400")).toBeInTheDocument(); // el margen del comp
    expect(within(dia).getByText("$18.990")).toBeInTheDocument(); // la resma de papel
    expect(within(dia).getByText(texto("4 confirmadas · 1 reversada"))).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Borradores pendientes: 1/ })).toHaveAttribute("href", "/ventanilla");

    const ops = screen.getByRole("region", { name: /Operaciones de hoy/ });
    expect(await within(ops).findAllByRole("listitem")).toHaveLength(6);
    expect(within(ops).getByText("Monto mal digitado")).toBeInTheDocument();
  });

  it("cambiar el día lleva la fecha a la URL y muestra ese día", async () => {
    const router = montar();
    await screen.findByText("US$ 2.900,00");
    fireEvent.change(screen.getByLabelText("Ver otro día"), { target: { value: "2026-11-07" } });

    expect(router.state.location.search).toBe("?fecha=2026-11-07");
    expect(screen.getByText("Sábado 7 de noviembre", { exact: false })).toBeInTheDocument();
    expect(await screen.findByText("Ese día no hay operaciones registradas.")).toBeInTheDocument();
    expect(screen.getByText(/de ahora, no del día elegido/)).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Volver a hoy" }));
    expect(router.state.location.search).toBe("");
    expect(await screen.findByText(texto(/^Hoy · Domingo 8 de noviembre/))).toBeInTheDocument();
  });
});
