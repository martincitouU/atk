// Login real con Better Auth (sin actor de prueba): cookie → sesión → usuario → Actor.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { crearCuenta } from "../../src/auth/auth.ts";
import { usuario } from "../../src/db/esquema.ts";
import { construirServidor } from "../../src/servidor.ts";
import { escenario, MINUTO } from "../servicios/escenario.ts";
import { conLogin as conLoginBase, CONTRASENA, cookieDeRespuesta as cookieDe, ORIGEN } from "./login.ts";

afterEach(() => {
  vi.useRealTimers();
});

/** El cajero de la semilla tiene cuenta; las llamadas sin IP usan la misma (para el límite de intentos). */
async function conLogin(opciones: { limitarIntentos?: boolean } = {}) {
  const base = await conLoginBase(opciones);
  await base.darCuenta("cajero@demo.cl");
  const iniciarSesion = (email = "cajero@demo.cl", password = CONTRASENA, ip = "10.0.0.1") => base.iniciarSesion(email, password, ip);
  const cookieDeSesion = () => base.cookieDe("cajero@demo.cl");
  return { ...base, iniciarSesion, cookieDeSesion };
}

describe("RF-14: inicio de sesión", () => {
  it("con la contraseña correcta entrega una cookie httpOnly y SameSite=Lax", async () => {
    const { iniciarSesion } = await conLogin();

    const respuesta = await iniciarSesion();

    expect(respuesta.statusCode).toBe(200);
    const setCookie = String(respuesta.headers["set-cookie"]);
    expect(setCookie).toContain("atk.session_token=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it("con contraseña incorrecta o correo desconocido responde 401 sin cookie", async () => {
    const { iniciarSesion } = await conLogin();

    for (const respuesta of [await iniciarSesion("cajero@demo.cl", "otra clave cualquiera"), await iniciarSesion("nadie@demo.cl")]) {
      expect(respuesta.statusCode).toBe(401);
      expect(respuesta.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("con la cookie, /api/yo dice quién es y si tiene turno", async () => {
    const { app, cookieDeSesion } = await conLogin();
    const cookie = await cookieDeSesion();

    const yo = await app.inject({ method: "GET", url: "/api/yo", headers: { cookie } });

    expect(yo.statusCode).toBe(200);
    expect(yo.json()).toEqual({
      tipo: "personal",
      usuario: { id: 3, nombre: "Cajero", email: "cajero@demo.cl", rol: "CAJERO", sucursalId: null },
      turnoAbierto: null,
    });
  });

  it("el actor sale de la sesión: el cajero opera con su propio usuario", async () => {
    const { app, cookieDeSesion } = await conLogin();
    const cookie = await cookieDeSesion();
    const comoCajero = { cookie, origin: ORIGEN };

    // Sin turno: el servicio recibió al cajero (id 3) y aplicó su regla
    const sinTurno = await app.inject({ method: "POST", url: "/api/operaciones", headers: comoCajero, payload: { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "100" } });
    expect(sinTurno.json().error.codigo).toBe("SIN_TURNO");

    // Publicar es solo del admin
    const publicar = await app.inject({
      method: "POST",
      url: "/api/cotizaciones",
      headers: comoCajero,
      payload: { monedaCodigo: "USD", referenciaE6: "950000000", margenCompraE6: "1", margenVentaE6: "1" },
    });
    expect(publicar.statusCode).toBe(403);
  });

  it("cerrar sesión invalida la cookie", async () => {
    const { app, cookieDeSesion } = await conLogin();
    const cookie = await cookieDeSesion();

    const salida = await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: { cookie, origin: ORIGEN }, payload: {} });
    expect(salida.statusCode).toBe(200);

    expect((await app.inject({ method: "GET", url: "/api/yo", headers: { cookie } })).statusCode).toBe(401);
  });

  it("un usuario desactivado pierde el acceso aunque tenga sesión", async () => {
    const { app, db, cookieDeSesion } = await conLogin();
    const cookie = await cookieDeSesion();

    db.update(usuario).set({ activo: false }).where(eq(usuario.id, 3)).run();

    expect((await app.inject({ method: "GET", url: "/api/yo", headers: { cookie } })).statusCode).toBe(401);
  });

  it("una cuenta sin usuario del personal (por ejemplo, un cliente) no obtiene actor", async () => {
    const { app, auth } = await conLogin();
    await crearCuenta(auth, { email: "cliente@correo.cl", nombre: "Cliente", contrasena: CONTRASENA });

    const entrada = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: ORIGEN },
      payload: { email: "cliente@correo.cl", password: CONTRASENA },
    });
    const cookie = cookieDe(entrada.headers["set-cookie"]);

    expect((await app.inject({ method: "GET", url: "/api/pizarra", headers: { cookie } })).statusCode).toBe(401);
  });
});

describe("RF-14: cierre por inactividad", () => {
  it("la sesión vence tras 15 minutos sin uso", async () => {
    const { app, cookieDeSesion } = await conLogin();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const cookie = await cookieDeSesion();

    vi.setSystemTime(Date.now() + 16 * MINUTO);

    expect((await app.inject({ method: "GET", url: "/api/yo", headers: { cookie } })).statusCode).toBe(401);
  });

  it("cada uso la renueva: con actividad cada 10 minutos sigue vigente", async () => {
    const { app, cookieDeSesion } = await conLogin();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
    const cookie = await cookieDeSesion();

    for (let i = 0; i < 4; i++) {
      vi.setSystemTime(Date.now() + 10 * MINUTO);
      expect((await app.inject({ method: "GET", url: "/api/yo", headers: { cookie } })).statusCode).toBe(200);
    }
  });
});

describe("Superficie expuesta y CSRF", () => {
  it("el registro público de Better Auth no está expuesto", async () => {
    const { app } = await conLogin();

    const registro = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { origin: ORIGEN },
      payload: { email: "x@x.cl", password: CONTRASENA, name: "X" },
    });

    expect(registro.statusCode).toBe(404);
  });

  it("una escritura desde otro sitio se rechaza aunque traiga la cookie", async () => {
    const { app, cookieDeSesion } = await conLogin();
    const cookie = await cookieDeSesion();

    for (const origin of ["http://sitio-malicioso.test", undefined]) {
      const respuesta = await app.inject({
        method: "POST",
        url: "/api/operaciones",
        headers: { cookie, ...(origin ? { origin } : {}) },
        payload: { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "100" },
      });
      expect(respuesta.statusCode).toBe(403);
      expect(respuesta.json().error.codigo).toBe("ORIGEN_NO_PERMITIDO");
    }
  });

  it("el login también exige el Origin de la app", async () => {
    const { app } = await conLogin();

    const respuesta = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: "http://sitio-malicioso.test" },
      payload: { email: "cajero@demo.cl", password: CONTRASENA },
    });

    expect(respuesta.statusCode).toBe(403);
  });

  it("limita los intentos de login por IP", async () => {
    const { iniciarSesion } = await conLogin({ limitarIntentos: true });

    const estados = [];
    for (let i = 0; i < 5; i++) estados.push((await iniciarSesion("cajero@demo.cl", "clave equivocada!!", "10.0.0.9")).statusCode);

    expect(estados).toContain(429);
    // Otra IP no queda bloqueada
    expect((await iniciarSesion(undefined, undefined, "10.0.0.10")).statusCode).toBe(200);
  });
});

describe("Sin login configurado", () => {
  it("/api/auth responde 503 y no se acepta ninguna escritura", async () => {
    const esc = escenario();
    const app = construirServidor(esc, { urlPublica: null, obtenerSesion: () => null });

    const login = await app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { origin: ORIGEN }, payload: {} });
    expect(login.statusCode).toBe(403); // sin dirección pública, ni siquiera el login pasa el chequeo de Origin

    const sesion = await app.inject({ method: "GET", url: "/api/auth/get-session" });
    expect(sesion.statusCode).toBe(503);
  });
});
