import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { rutas } from "../src/app.tsx";
import { estadoPrueba } from "./preparar.ts";
import { Proveedores } from "./proveedores.tsx";
import { texto } from "./texto.ts";

function montar(entrada: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [entrada] });
  render(
    <Proveedores>
      <RouterProvider router={router} />
    </Proveedores>,
  );
  return router;
}

describe("Marco", () => {
  it("las pestañas son las cinco secciones y F2 lleva al Cierre del día", async () => {
    const router = montar("/ventanilla");
    const riel = screen.getByRole("navigation", { name: "Secciones" });

    expect(within(riel).getAllByRole("link")).toHaveLength(5);
    for (const nombre of [/Ventanilla/, /Cierre del día/, /Jornada/, /Clientes/, /Configuración/]) {
      expect(within(riel).getByRole("link", { name: nombre })).toBeInTheDocument();
    }
    expect(within(riel).getByRole("link", { name: /Ventanilla/ })).toHaveAttribute("aria-current", "page");

    await userEvent.setup().keyboard("{F2}");

    expect(router.state.location.pathname).toBe("/cierre");
    expect(await screen.findByRole("heading", { level: 1, name: "Cierre del día" })).toBeInTheDocument();
    expect(within(riel).getByRole("link", { name: /Cierre del día/ })).toHaveAttribute("aria-current", "page");
  });

  it("la barra de estado muestra el turno de la sesión (useSesion, desde los mocks)", async () => {
    montar("/ventanilla");
    const estado = screen.getByRole("contentinfo", { name: "Barra de estado" });
    expect(await within(estado).findByText(texto(/^Turno abierto · Caja 1 · desde \d\d:\d\d$/))).toBeInTheDocument();
    expect(within(estado).getByText(texto("Rolando del Río · Administrador"))).toBeInTheDocument();
  });

  it("«Salir», junto a las pestañas, cierra la sesión y lleva a /entrar", async () => {
    const router = montar("/jornada");
    await screen.findByText(texto(/^Turno abierto · Caja 1 · desde/));
    expect(estadoPrueba.sesion).not.toBeNull();

    await userEvent.setup().click(screen.getByRole("button", { name: "Salir" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(estadoPrueba.sesion).toBeNull();
    expect(await screen.findByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secciones" })).not.toBeInTheDocument();
  });

  it("la raíz lleva a la Ventanilla", () => {
    const router = montar("/");
    expect(router.state.location.pathname).toBe("/ventanilla");
  });
});
