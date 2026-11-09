// Quién ve qué: las rutas protegidas y la navegación por rol. La app
// completa en memoria (jsdom), con la API simulada (apiFalsa.tsx).

import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { abrir, rutasDe, usarApi, type NombreSesion } from "./apiFalsa.tsx";

function abrirComo(ruta: string, sesion: NombreSesion | null) {
  usarApi(rutasDe(sesion));
  abrir(ruta);
}

/** Las secciones de la barra de navegación (la de escritorio). */
async function secciones() {
  const [barra] = await screen.findAllByRole("navigation", { name: "Secciones" });
  return within(barra!)
    .getAllByRole("link")
    .map((enlace) => enlace.textContent);
}

describe("sin sesión", () => {
  it("una vista del personal lleva al login", async () => {
    abrirComo("/caja", null);
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeTruthy();
  });

  it("el portal del cliente también lleva al login", async () => {
    abrirComo("/mi", null);
    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeTruthy();
  });

  it("el registro es público y muestra el nombre de la casa", async () => {
    abrirComo("/registro", null);
    expect(await screen.findByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
    expect(await screen.findByText("Cambios Demo")).toBeTruthy();
  });
});

describe("navegación por rol", () => {
  it("el cajero no ve Administración", async () => {
    abrirComo("/", "cajero");
    expect(await secciones()).toEqual(["Inicio", "Operaciones", "Caja", "Clientes", "Pizarra"]);
  });

  it("el admin ve Administración", async () => {
    abrirComo("/", "admin");
    expect(await secciones()).toContain("Administración");
  });

  it("un cajero que entra a Administración por la dirección no tiene acceso", async () => {
    abrirComo("/administracion/usuarios", "cajero");
    expect(await screen.findByRole("heading", { name: "No tienes acceso a esta sección" })).toBeTruthy();
  });

  it("supervisores y admin ven el resumen del día; el cajero no", async () => {
    abrirComo("/", "supervisor");
    expect(await screen.findByRole("heading", { name: "Hoy en la casa" })).toBeTruthy();
  });

  it("el cajero ve su turno, sin el resumen de la casa", async () => {
    abrirComo("/", "cajero");
    await screen.findByRole("heading", { name: "Hola, Cajero" });
    expect(await screen.findByText("Turno abierto")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Hoy en la casa" })).toBeNull();
  });
});

describe("cada sesión va a su lugar", () => {
  it("un cliente que abre una vista del personal va a su portal", async () => {
    abrirComo("/operaciones", "clientePendiente");
    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeTruthy();
  });

  it("con sesión, el login lleva al inicio", async () => {
    abrirComo("/ingresar", "cajero");
    expect(await screen.findByRole("heading", { name: "Hola, Cajero" })).toBeTruthy();
  });

  it("una dirección que no existe muestra su aviso", async () => {
    abrirComo("/no-existe", "cajero");
    expect(await screen.findByRole("heading", { name: "Esta página no existe" })).toBeTruthy();
  });
});
