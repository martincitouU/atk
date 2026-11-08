import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => vi.useRealTimers());

describe("Login y sesión", () => {
  it("sin sesión, la raíz y cualquier sección llevan a /entrar", async () => {
    estadoPrueba.sesion = null;
    const router = montar("/clientes");
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(await screen.findByRole("heading", { level: 1, name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secciones" })).not.toBeInTheDocument();
  });

  it("revisa los campos antes de enviar y deja cada error junto a su campo", async () => {
    estadoPrueba.sesion = null;
    montar("/entrar");
    const u = userEvent.setup();
    const correo = await screen.findByLabelText("Correo");
    expect(correo).toHaveAttribute("autocomplete", "username");
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("autocomplete", "current-password");

    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(correo).toHaveAccessibleDescription("Escriba su correo");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription("Escriba su contraseña");
    expect(correo).toHaveFocus();

    await u.type(correo, "rolando");
    expect(correo).toHaveAccessibleDescription("Revise el correo: le falta la @ o el dominio");
    expect(estadoPrueba.sesion).toBeNull();
  });

  it("con credenciales malas muestra el mensaje del servidor junto a la contraseña; con las buenas va a la Ventanilla", async () => {
    estadoPrueba.sesion = null;
    const router = montar("/entrar");
    const u = userEvent.setup();
    expect(await screen.findByText(/Datos de ejemplo:/)).toHaveTextContent("rolando@atk.cl · contraseña ventanilla");

    await u.type(screen.getByLabelText("Correo"), "rolando@atk.cl");
    await u.type(screen.getByLabelText("Contraseña"), "mostrador");
    await u.keyboard("{Enter}");
    const clave = screen.getByLabelText("Contraseña");
    await waitFor(() => expect(clave).toHaveAccessibleDescription("Correo o contraseña incorrectos"));
    expect(clave).toHaveAttribute("aria-invalid", "true");
    expect(clave).toHaveFocus();

    await u.clear(clave);
    await u.type(clave, "ventanilla{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ventanilla"));
    expect(estadoPrueba.sesion).toMatchObject({ email: "rolando@atk.cl" });
    expect(await screen.findByText(texto("Turno abierto · Caja 1"))).toBeInTheDocument();
  });

  it("tras los minutos de inactividad cierra la sesión y vuelve a /entrar con el aviso", async () => {
    // Los temporizadores falsos avanzan solos con el reloj real (para MSW y Query); el salto de 15 min lo da el test.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const router = montar("/configuracion");
    // Configuración muestra el parámetro: la guarda ya tiene sus minutos y armó el temporizador
    expect(await screen.findByText("tras 15 min sin actividad")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(14 * 60_000);
    });
    expect(router.state.location.pathname).toBe("/configuracion");

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
    expect(await screen.findByRole("status")).toHaveTextContent("Sesión cerrada por inactividad");
    await waitFor(() => expect(estadoPrueba.sesion).toBeNull());
    // El 401 de lo que se vuelve a pedir no borra el aviso
    expect(screen.getByText("Sesión cerrada por inactividad")).toBeInTheDocument();
  });

  it("la actividad reinicia la cuenta de la inactividad", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "Date"] });
    const router = montar("/configuracion");
    expect(await screen.findByText("tras 15 min sin actividad")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    });
    act(() => {
      vi.advanceTimersByTime(10 * 60_000);
    });
    expect(router.state.location.pathname).toBe("/configuracion");

    act(() => {
      vi.advanceTimersByTime(6 * 60_000);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/entrar"));
  });
});
