import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
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

/** Entra al portal como la cuenta `id` (sin la sesión del personal de la semilla). */
function comoCliente(id: number) {
  const cuenta = estadoPrueba.cuentas.find((c) => c.id === id);
  if (!cuenta) throw new Error(`Sin la cuenta ${id}`);
  estadoPrueba.sesion = null;
  estadoPrueba.sesionCliente = cuenta;
  return cuenta;
}

describe("El portal de clientes (/mi)", () => {
  beforeEach(() => {
    estadoPrueba.sesion = null;
  });

  it("crear la cuenta: el RUT inválido se marca junto al campo; con uno válido entra y ve el paso que falta", async () => {
    const { router, u } = montar("/mi/registro");
    const nombre = await screen.findByLabelText("Nombre completo");
    await u.type(nombre, "Ana Ruiz Toledo");
    await u.type(screen.getByLabelText("RUT"), "12.345.678-9");
    await u.type(screen.getByLabelText("Correo"), "ana.ruiz@correo.cl");
    await u.type(screen.getByLabelText("Contraseña"), "una-clave-larga");
    await u.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    expect(screen.getByLabelText("RUT")).toHaveAccessibleDescription("RUT inválido: revise el número y el dígito verificador");
    expect(screen.getByLabelText("RUT")).toHaveFocus();

    await u.clear(screen.getByLabelText("RUT"));
    await u.type(screen.getByLabelText("RUT"), "12.345.678-5");
    await u.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mi"));
    expect(await screen.findByText("Su cuenta aún no está verificada. Acérquese al local con su carnet para activarla.")).toBeInTheDocument();
    const pasos = screen.getByRole("list", { name: "Los tres pasos" });
    expect(within(pasos).getByText("Muestre su carnet en el local").closest("li")).toHaveAttribute("aria-current", "step");
    expect(estadoPrueba.cuentas.at(-1)).toMatchObject({ rut: "12345678-5", estado: "PENDIENTE", email: "ana.ruiz@correo.cl" });
  });

  it("verificada: ve sus operaciones desde su lado (la venta de la casa es «Compró»), sin márgenes, y la anulada tachada", async () => {
    const cuenta = comoCliente(1);
    const mariela = estadoPrueba.clientes.find((c) => c.nombre === "Mariela Contreras Vidal");
    Object.assign(cuenta, { estado: "VERIFICADA", clienteId: mariela?.id ?? null });
    const venta = estadoPrueba.operaciones.find((o) => o.tipo === "VENTA" && o.estado === "CONFIRMADA" && o.monedaCodigo === "USD");
    const anulada = estadoPrueba.operaciones.find((o) => o.estado === "REVERSADA");
    for (const o of [venta, anulada]) if (o) o.clienteId = mariela?.id ?? null;

    montar("/mi");
    expect(await screen.findByRole("heading", { name: "Hola, Mariela" })).toBeInTheDocument();
    expect(await screen.findByText("Compró US$ 300,00")).toBeInTheDocument();
    expect(screen.getByText("Compró € 500,00").closest("li")).toHaveTextContent("Anulada");
    expect(screen.getByText("2 operaciones")).toBeInTheDocument();
    expect(screen.queryByText(/margen/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Operaciones" })).toHaveAttribute("aria-current", "page");
  });

  it("mi ficha: sus datos, con lo que falta marcado como «Sin dato»", async () => {
    const cuenta = comoCliente(1);
    const pedro = estadoPrueba.clientes.find((c) => c.nombre === "Pedro Soto Muñoz");
    Object.assign(cuenta, { estado: "VERIFICADA", clienteId: pedro?.id ?? null });
    montar("/mi/ficha");
    expect(await screen.findByText("Pedro Soto Muñoz")).toBeInTheDocument();
    expect(screen.getByText("22.222.222-2")).toBeInTheDocument();
    // El país con su nombre, como en la ficha del personal, no el código ISO
    expect(screen.getByText("Chile")).toBeInTheDocument();
    expect(screen.queryByText("CL")).not.toBeInTheDocument();
    expect(screen.getAllByText("Sin dato").length).toBeGreaterThan(0);
  });

  it("rechazada: el mensaje de la API y el motivo", async () => {
    const cuenta = comoCliente(2);
    Object.assign(cuenta, { estado: "RECHAZADA", motivoRechazo: "El carnet no coincide con el RUT" });
    montar("/mi");
    expect(await screen.findByText("Su cuenta fue rechazada. Acérquese al local si cree que es un error.")).toBeInTheDocument();
    expect(screen.getByText("Motivo: El carnet no coincide con el RUT")).toBeInTheDocument();
  });

  it("el personal que abre /mi va a la Ventanilla", async () => {
    estadoPrueba.sesion = estadoPrueba.usuarios[0] ?? null;
    const { router } = montar("/mi");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ventanilla"));
  });

  it("un cliente que abre la Ventanilla termina en su portal, y Salir lo deja en el ingreso", async () => {
    comoCliente(2);
    const { router, u } = montar("/ventanilla");
    await waitFor(() => expect(router.state.location.pathname).toBe("/mi"));
    await u.click(await screen.findByRole("button", { name: "Salir" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mi/entrar"));
    expect(estadoPrueba.sesionCliente).toBeNull();
  });

  it("entrar con la clave equivocada marca la contraseña; con la buena, entra", async () => {
    const { router, u } = montar("/mi/entrar");
    await u.type(await screen.findByLabelText("Correo"), "ana@ejemplo.com");
    await u.type(screen.getByLabelText("Contraseña"), "otra-clave-cualquiera");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Correo o contraseña incorrectos")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toHaveAttribute("aria-invalid", "true");

    await u.clear(screen.getByLabelText("Contraseña"));
    await u.type(screen.getByLabelText("Contraseña"), "portal-demo-2026");
    await u.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/mi"));
  });
});
