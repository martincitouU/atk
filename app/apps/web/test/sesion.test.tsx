// La sesión real de punta a punta (con la API simulada): entrar, volver a la
// vista pedida, una sesión que vence en pleno uso, salir y registrarse.

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { abrir, error, respuesta, rutasDe, SESIONES, sinSesion, usarApi, type Manejador } from "./apiFalsa.tsx";

/** /api/yo responde lo que diga `estado.sesion` en cada momento: cambia al entrar y salir. */
function conSesionCambiante(inicial: keyof typeof SESIONES | null, extra: Record<string, Manejador> = {}) {
  const estado = { sesion: inicial };
  const api = usarApi({
    ...rutasDe(null),
    "GET /api/yo": () => (estado.sesion ? SESIONES[estado.sesion] : sinSesion()),
    "POST /api/auth/sign-in/email": ({ cuerpo }: { cuerpo: unknown }) => {
      const { email, password } = cuerpo as { email: string; password: string };
      if (password !== "clave correcta") return respuesta(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
      estado.sesion = email.startsWith("admin") ? "admin" : "cajero";
      return { redirect: false, token: "x" };
    },
    "POST /api/auth/sign-out": () => {
      estado.sesion = null;
      return { success: true };
    },
    ...extra,
  });
  return { api, estado };
}

async function ingresar(email: string, contrasena: string) {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText("Correo"), email);
  await usuario.type(screen.getByLabelText("Contraseña"), contrasena);
  await usuario.click(screen.getByRole("button", { name: "Ingresar" }));
}

describe("entrar", () => {
  it("con la contraseña equivocada lo dice, en español", async () => {
    conSesionCambiante(null);
    abrir("/ingresar");

    await ingresar("cajero@demo.cl", "otra");

    expect(await screen.findByText("Correo o contraseña incorrectos")).toBeTruthy();
  });

  it("vuelve a la vista que se pidió antes del login", async () => {
    conSesionCambiante(null);
    abrir("/pizarra");
    await screen.findByRole("heading", { name: "Ingresar" });

    await ingresar("cajero@demo.cl", "clave correcta");

    expect(await screen.findByRole("heading", { name: "Pizarra" })).toBeTruthy();
  });

  it("una cuenta del personal desactivada no entra, y se cierra la sesión que abrió Better Auth", async () => {
    const { api } = conSesionCambiante(null, {
      // La contraseña es correcta, pero la API no la reconoce (usuario inactivo)
      "POST /api/auth/sign-in/email": { redirect: false, token: "x" },
    });
    abrir("/ingresar");

    await ingresar("cajera2@demo.cl", "clave correcta");

    expect(await screen.findByText(/Esta cuenta está desactivada/)).toBeTruthy();
    expect(api.a("POST /api/auth/sign-out")).toHaveLength(1);
  });
});

describe("la sesión vence en pleno uso", () => {
  it("lleva al login con el aviso, y al volver a entrar sigue donde estaba", async () => {
    const { estado } = conSesionCambiante("cajero", {
      // Pasaron 15 minutos: la API ya no reconoce la cookie
      "GET /api/operaciones": () => {
        estado.sesion = null;
        return sinSesion();
      },
    });
    abrir("/operaciones");

    expect(await screen.findByText("Tu sesión se cerró por inactividad")).toBeTruthy();

    await ingresar("cajero@demo.cl", "clave correcta");
    expect(await screen.findByRole("heading", { name: "Operaciones" })).toBeTruthy();
  });
});

describe("salir", () => {
  it("cierra la sesión en la API; quien entre después parte en su inicio", async () => {
    const { api } = conSesionCambiante("cajero");
    abrir("/pizarra");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Menú de Cajero" }));
    await usuario.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("heading", { name: "Ingresar" })).toBeTruthy();
    expect(api.a("POST /api/auth/sign-out")).toHaveLength(1);
    expect(screen.queryByText("Tu sesión se cerró por inactividad")).toBeNull();

    await ingresar("admin@demo.cl", "clave correcta");
    expect(await screen.findByRole("heading", { name: "Hola, Administrador" })).toBeTruthy();
  });

  it("sin conexión no finge haber salido", async () => {
    conSesionCambiante("cajero", { "POST /api/auth/sign-out": () => Promise.reject(new TypeError("Failed to fetch")) });
    abrir("/perfil");
    const usuario = userEvent.setup();

    await usuario.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByText(/No se pudo conectar con el servidor/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mi perfil" })).toBeTruthy();
  });
});

describe("registro de clientes", () => {
  async function llenar(datos: { nombre: string; rut: string; email: string; contrasena: string; repetir: string }) {
    const usuario = userEvent.setup();
    await usuario.type(await screen.findByLabelText("Nombre completo"), datos.nombre);
    await usuario.type(screen.getByLabelText("RUT"), datos.rut);
    await usuario.type(screen.getByLabelText("Correo"), datos.email);
    await usuario.type(screen.getByLabelText("Contraseña"), datos.contrasena);
    await usuario.type(screen.getByLabelText("Repite la contraseña"), datos.repetir);
    await usuario.click(screen.getByRole("button", { name: "Crear cuenta" }));
  }

  const DATOS = { nombre: "Ana Pérez", rut: "15.555.567-K", email: "ana@demo.cl", contrasena: "una clave larga", repetir: "una clave larga" };

  it("revisa el RUT y que las contraseñas coincidan antes de enviar", async () => {
    const api = usarApi(rutasDe(null));
    abrir("/registro");

    await llenar({ ...DATOS, rut: "12.345.678-9", repetir: "otra clave larga" });

    expect(await screen.findByText(/RUT inválido/)).toBeTruthy();
    expect(screen.getByText("Las contraseñas no coinciden")).toBeTruthy();
    expect(api.a("POST /api/registro")).toHaveLength(0);
  });

  it("envía el RUT normalizado y muestra qué sigue", async () => {
    const api = usarApi({
      ...rutasDe(null),
      "POST /api/registro": respuesta(201, { nombre: "Ana Pérez", rut: "15555567-K", estado: "PENDIENTE", mensaje: "Cuenta creada." }),
    });
    abrir("/registro");

    await llenar(DATOS);

    expect(await screen.findByRole("heading", { name: "Cuenta creada" })).toBeTruthy();
    expect(api.a("POST /api/registro")[0]?.cuerpo).toEqual({ nombre: "Ana Pérez", rut: "15555567-K", email: "ana@demo.cl", contrasena: "una clave larga" });
  });

  it("un correo ya registrado aparece junto al campo", async () => {
    usarApi({ ...rutasDe(null), "POST /api/registro": error(409, "CORREO_EN_USO", "Ya existe una cuenta con ese correo") });
    abrir("/registro");

    await llenar(DATOS);

    const mensaje = await screen.findByText("Ya existe una cuenta con ese correo");
    await waitFor(() => expect(screen.getByLabelText("Correo").getAttribute("aria-invalid")).toBe("true"));
    expect(mensaje).toBeTruthy();
  });
});
