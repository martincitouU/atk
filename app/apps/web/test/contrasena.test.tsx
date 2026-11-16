import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { rutas } from "../src/app.tsx";
import { estadoPrueba } from "./preparar.ts";
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

describe("Mi contraseña (Configuración)", () => {
  it("la actual equivocada se marca junto a su campo, la repetida tiene que coincidir y, bien escrita, se cambia", async () => {
    const { u } = montar("/configuracion");
    const actual = await screen.findByLabelText("Contraseña actual");
    const nueva = screen.getByLabelText("Contraseña nueva");
    const repetida = screen.getByLabelText("Repita la nueva");
    const cambiar = screen.getByRole("button", { name: "Cambiar contraseña" });

    // La repetida no coincide: no llega a la API
    await u.type(actual, "ventanilla");
    await u.type(nueva, "carretera-austral");
    await u.type(repetida, "carretera-austra");
    await u.click(cambiar);
    expect(await screen.findByText("No coincide con la contraseña nueva")).toBeInTheDocument();
    expect(repetida).toHaveFocus();

    // La actual equivocada: la rechaza la API (400) y la sesión sigue
    await u.clear(actual);
    await u.type(actual, "otra-clave");
    await u.type(repetida, "l");
    await u.click(cambiar);
    expect(await screen.findByText("La contraseña actual no es correcta")).toBeInTheDocument();
    expect(actual).toHaveAttribute("aria-invalid", "true");
    expect(estadoPrueba.sesion).not.toBeNull();

    // Bien escrita: se cambia y los campos quedan vacíos
    await u.clear(actual);
    await u.type(actual, "ventanilla");
    await u.click(cambiar);
    expect(await screen.findByText("Contraseña cambiada. Sus otras sesiones abiertas se cerraron.")).toBeInTheDocument();
    expect(actual).toHaveValue("");
    expect(estadoPrueba.usuarios.find((x) => x.id === estadoPrueba.sesion?.id)?.clave).toBe("carretera-austral");
  });
});
