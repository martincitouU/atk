import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rutas } from "../src/app.tsx";
import { estadoPrueba, RELOJ_PRUEBA } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";

function montar(entrada: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [entrada] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return { router, u: userEvent.setup() };
}

describe("Los roles: un cajero no ve lo que la API le negaría", () => {
  // El reloj del navegador, el mismo de la semilla: después de medianoche el libro de «hoy» quedaba vacío
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(RELOJ_PRUEBA);
    if (estadoPrueba.sesion) estadoPrueba.sesion = { ...estadoPrueba.sesion, rol: "CAJERO" };
  });
  afterEach(() => vi.useRealTimers());

  it("la Jornada no está en el riel, F3 no lleva a ella y /jornada vuelve a la Ventanilla", async () => {
    const { router, u } = montar("/jornada");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ventanilla"));
    const riel = screen.getByRole("navigation", { name: "Secciones" });
    await waitFor(() => expect(within(riel).queryByRole("link", { name: /Jornada/ })).not.toBeInTheDocument());
    expect(within(riel).getAllByRole("link")).toHaveLength(4);

    await u.keyboard("{F3}");
    expect(router.state.location.pathname).toBe("/ventanilla");
  });

  it("en la Ventanilla no hay «Actualizar pizarra» ni reverso: R explica de quién es", async () => {
    const { u } = montar("/ventanilla");
    await screen.findByRole("heading", { name: "Libro del día" });
    await screen.findAllByRole("row", { name: /confirmada/i });
    expect(screen.queryByRole("button", { name: "Actualizar pizarra" })).not.toBeInTheDocument();
    expect(screen.queryByText(/reversar la seleccionada/)).not.toBeInTheDocument();

    await u.keyboard("r");
    expect(await screen.findByText("Reversar una operación es del supervisor o del administrador.")).toBeInTheDocument();
  });

  it("en el Cierre: lo teórico sale de la caja del turno, el gasto va solo en efectivo y no se reversa", async () => {
    montar("/cierre");
    const usd = await screen.findByRole("region", { name: /USD/ });
    expect(await within(usd).findByText("US$ 2.900,00")).toBeInTheDocument();
    expect(screen.queryByText(/Sin el saldo del sistema/)).not.toBeInTheDocument();

    const medio = screen.getByLabelText("Medio de pago");
    expect(within(medio).getAllByRole("option").map((o) => o.textContent)).toEqual(["Efectivo"]);
    expect(screen.queryByRole("button", { name: /Reversar el gasto/ })).not.toBeInTheDocument();
  });
});
