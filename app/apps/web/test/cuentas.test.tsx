import { render, screen, waitFor, within } from "@testing-library/react";
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

const panel = () => screen.findByRole("region", { name: "Cuentas por verificar" });

describe("Cuentas por verificar (Clientes)", () => {
  it("verifica la cuenta de quien ya tiene ficha y deja de estar pendiente", async () => {
    const { u } = montar("/clientes");
    const cuentas = await panel();
    expect(within(cuentas).getByText(/2 del portal/)).toBeInTheDocument();

    await u.click(within(cuentas).getByRole("button", { name: "Verificar a Mariela Contreras Vidal" }));
    expect(await within(cuentas).findByText("Cuenta de Mariela Contreras Vidal verificada: ya puede ver sus operaciones en el portal.")).toBeInTheDocument();
    await waitFor(() => expect(within(cuentas).queryByText("Mariela Contreras Vidal")).not.toBeInTheDocument());
    expect(estadoPrueba.cuentas.find((c) => c.id === 1)?.estado).toBe("VERIFICADA");
  });

  it("sin ficha con ese RUT muestra el mensaje de la API y ofrece crearla con el RUT y el nombre escritos", async () => {
    const { router, u } = montar("/clientes");
    const cuentas = await panel();
    await u.click(within(cuentas).getByRole("button", { name: "Verificar a Ana Ruiz Toledo" }));
    expect(await within(cuentas).findByRole("alert")).toHaveTextContent(
      "No hay ficha de cliente con RUT 12345678-5: regístrela antes de verificar la cuenta",
    );

    await u.click(within(cuentas).getByRole("button", { name: "Crear la ficha con este RUT" }));
    expect(router.state.location.search).toContain("nuevo=1");
    const ficha = await screen.findByRole("region", { name: "Nueva ficha" });
    expect(within(ficha).getByLabelText("Número de documento")).toHaveValue("12345678-5");
    expect(within(ficha).getByLabelText("Nombre completo")).toHaveValue("Ana Ruiz Toledo");
  });

  it("rechazar pide el motivo y la cuenta sale de la lista", async () => {
    const { u } = montar("/clientes");
    const cuentas = await panel();
    await u.click(within(cuentas).getByRole("button", { name: "Rechazar a Ana Ruiz Toledo" }));
    const enviar = within(cuentas).getByRole("button", { name: "Rechazar cuenta" });
    expect(enviar).toBeDisabled();

    await u.type(within(cuentas).getByLabelText("Motivo del rechazo"), "El carnet no coincide con el RUT");
    await u.click(enviar);
    expect(await within(cuentas).findByText("Cuenta de Ana Ruiz Toledo rechazada. El motivo le aparece en el portal.")).toBeInTheDocument();
    expect(estadoPrueba.cuentas.find((c) => c.id === 2)).toMatchObject({ estado: "RECHAZADA", motivoRechazo: "El carnet no coincide con el RUT" });
  });
});
