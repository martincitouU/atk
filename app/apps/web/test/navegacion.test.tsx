// Quién ve qué: las rutas protegidas, la navegación por rol y el login de
// ejemplo del esqueleto. Se renderiza la app completa en memoria (jsdom).

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { SesionEjemplo } from "../src/ejemplo/datos.ts";
import { crearRutasDePrueba } from "../src/rutas.tsx";
import { ProveedorSesion } from "../src/sesion/Sesion.tsx";

function abrir(ruta: string, sesion?: SesionEjemplo) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={consultas}>
      <ProveedorSesion inicial={sesion}>
        <RouterProvider router={crearRutasDePrueba(ruta)} />
      </ProveedorSesion>
    </QueryClientProvider>,
  );
}

/** Las secciones de la barra de navegación (la de escritorio). */
async function secciones() {
  const [barra] = await screen.findAllByRole("navigation", { name: "Secciones" });
  return within(barra!)
    .getAllByRole("link")
    .map((enlace) => enlace.textContent);
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("sin sesión", () => {
  it("una vista del personal lleva al login", async () => {
    abrir("/caja");
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeTruthy();
  });

  it("el portal del cliente también lleva al login", async () => {
    abrir("/mi");
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeTruthy();
  });

  it("el registro es público", async () => {
    abrir("/registro");
    expect(await screen.findByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
  });
});

describe("navegación por rol", () => {
  it("el cajero no ve Administración", async () => {
    abrir("/", "cajero");
    expect(await secciones()).toEqual(["Inicio", "Operaciones", "Caja", "Clientes", "Pizarra"]);
  });

  it("el admin ve Administración", async () => {
    abrir("/", "admin");
    expect(await secciones()).toContain("Administración");
  });

  it("un cajero que entra a Administración por la dirección no tiene acceso", async () => {
    abrir("/administracion/usuarios", "cajero");
    expect(await screen.findByRole("heading", { name: "No tienes acceso a esta sección" })).toBeTruthy();
  });

  it("supervisores y admin ven el resumen del día; el cajero no", async () => {
    abrir("/", "supervisor");
    expect(await screen.findByRole("heading", { name: "Hoy en la casa" })).toBeTruthy();
    cleanup();
    abrir("/", "cajero");
    await screen.findByRole("heading", { name: "Hola, Cajero" });
    expect(screen.queryByRole("heading", { name: "Hoy en la casa" })).toBeNull();
  });
});

describe("cada sesión va a su lugar", () => {
  it("un cliente que abre una vista del personal va a su portal", async () => {
    abrir("/operaciones", "clientePendiente");
    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeTruthy();
  });

  it("un cliente pendiente no ve operaciones, solo qué hacer", async () => {
    abrir("/mi", "clientePendiente");
    expect(await screen.findByText("Tu cuenta está pendiente de verificación")).toBeTruthy();
    expect(screen.queryByText("Mis operaciones")).toBeNull();
  });

  it("con sesión, el login lleva al inicio", async () => {
    abrir("/ingresar", "cajero");
    expect(await screen.findByRole("heading", { name: "Hola, Cajero" })).toBeTruthy();
  });

  it("una dirección que no existe muestra su aviso", async () => {
    abrir("/no-existe", "cajero");
    expect(await screen.findByRole("heading", { name: "Esta página no existe" })).toBeTruthy();
  });
});

describe("login de ejemplo (solo en el esqueleto)", () => {
  it("entra con el rol elegido y vuelve a la vista que se pidió", async () => {
    const usuario = userEvent.setup();
    abrir("/pizarra");
    await screen.findByRole("heading", { name: "Ingresar" });
    await usuario.selectOptions(screen.getByLabelText("Entrar como (solo en el esqueleto)"), "admin");
    await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
    expect(await screen.findByRole("heading", { name: "Pizarra" })).toBeTruthy();
    // Solo el admin ve el formulario para publicar tasas
    expect(screen.getByRole("heading", { name: "Publicar una tasa" })).toBeTruthy();
  });
});
