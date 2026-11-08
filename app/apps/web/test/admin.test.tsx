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

describe("Usuarios (solo ADMIN)", () => {
  it("el admin ve Usuarios y Auditoría en el riel", async () => {
    montar("/ventanilla");
    const riel = screen.getByRole("navigation", { name: "Secciones" });
    expect(await within(riel).findByRole("link", { name: "Usuarios" })).toBeInTheDocument();
    expect(within(riel).getByRole("link", { name: "Auditoría" })).toBeInTheDocument();
  });

  it("el cajero no entra a /usuarios", async () => {
    if (estadoPrueba.sesion) estadoPrueba.sesion = { ...estadoPrueba.sesion, rol: "CAJERO" };
    const { router } = montar("/usuarios");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ventanilla"));
    const riel = screen.getByRole("navigation", { name: "Secciones" });
    expect(within(riel).queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("crea a una cajera: la contraseña corta se marca junto al campo y, corregida, aparece en la lista", async () => {
    const { u } = montar("/usuarios");
    await screen.findByRole("button", { name: "Rolando del Río" });
    await u.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    const panel = screen.getByRole("region", { name: "Nuevo usuario" });
    await u.type(within(panel).getByLabelText("Nombre completo"), "Daniela Muñoz");
    await u.type(within(panel).getByLabelText("RUT"), "18.374.026-1");
    await u.type(within(panel).getByLabelText(/Correo/), "daniela@atk.cl");
    await u.type(within(panel).getByLabelText("Contraseña inicial"), "corta1234");
    await u.click(within(panel).getByRole("button", { name: "Crear usuario" }));
    expect(within(panel).getByLabelText("Contraseña inicial")).toHaveAccessibleDescription("La contraseña debe tener al menos 10 caracteres");

    await u.type(within(panel).getByLabelText("Contraseña inicial"), "5");
    await u.click(within(panel).getByRole("button", { name: "Crear usuario" }));
    expect(await screen.findByText("Daniela Muñoz ya puede entrar como cajero, con el correo daniela@atk.cl.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daniela Muñoz" })).toBeInTheDocument();
    expect(estadoPrueba.usuarios.find((x) => x.email === "daniela@atk.cl")).toMatchObject({ rut: "18374026-1", rol: "CAJERO" });
  });

  it("en su propia cuenta no puede quitarse el rol ni desactivarse; a otro lo desactiva", async () => {
    estadoPrueba.usuarios.push({ id: 2, nombre: "Daniela Muñoz", rol: "CAJERO", email: "daniela@atk.cl", clave: "x".repeat(10), rut: "18374026-1", activo: true });
    const { u } = montar("/usuarios");
    await u.click(await screen.findByRole("button", { name: "Rolando del Río" }));
    const yo = screen.getByRole("region", { name: "Rolando del Río" });
    expect(within(yo).getByLabelText("Rol")).toBeDisabled();
    expect(within(yo).getByRole("checkbox", { name: /Activo/ })).toBeDisabled();
    expect(within(yo).getByText(/Es su propia cuenta/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Daniela Muñoz" }));
    const ella = screen.getByRole("region", { name: "Daniela Muñoz" });
    await u.click(within(ella).getByRole("checkbox", { name: /Activo/ }));
    await u.click(within(ella).getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText("Daniela Muñoz quedó inactivo: sus sesiones se cerraron y ya no puede entrar.")).toBeInTheDocument();
    expect(estadoPrueba.usuarios.find((x) => x.id === 2)?.activo).toBe(false);
  });
});

describe("Auditoría (solo ADMIN)", () => {
  it("lista quién hizo qué, filtra por acción y despliega el antes y el después", async () => {
    const { router, u } = montar("/auditoria");
    const tabla = await screen.findByRole("table", { name: "Registro de cambios" });
    await waitFor(() => expect(within(tabla).getAllByRole("row")).toHaveLength(4)); // cabecera + 3

    await u.selectOptions(screen.getByLabelText("Acción"), "REVERSAR");
    await waitFor(() => expect(within(tabla).getAllByRole("row")).toHaveLength(2));
    expect(router.state.location.search).toBe("?accion=REVERSAR");
    const fila = within(tabla).getAllByRole("row")[1]!;
    expect(fila).toHaveTextContent("Rolando del Río");
    expect(fila).toHaveTextContent("Reversó operación");
    expect(within(fila).getByText("Monto mal digitado")).toBeInTheDocument();

    await u.click(within(fila).getByText("Antes y después"));
    expect(within(fila).getByText(/estado: "REVERSADA"/)).toBeVisible();
  });
});
