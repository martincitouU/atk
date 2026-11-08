// API con login real (Better Auth), para probar sesiones de punta a punta.
// Los usuarios de la semilla no tienen cuenta: darCuenta() les crea una.

import { eq } from "drizzle-orm";
import { expect } from "vitest";
import { crearAuth, crearCuenta } from "../../src/auth/auth.ts";
import { sesionDesdeCookie } from "../../src/auth/sesion.ts";
import { usuario } from "../../src/db/esquema.ts";
import { construirServidor } from "../../src/servidor.ts";
import { escenario } from "../servicios/escenario.ts";

process.env.LOG_LEVEL ??= "silent";

export const ORIGEN = "http://atk.test";
export const CONTRASENA = "una clave larga de prueba";

let ultimaIp = 0;

export async function conLogin({ limitarIntentos = false } = {}) {
  const esc = escenario();
  const auth = crearAuth({ rutaBase: esc.sqlite.name, secreto: "s".repeat(40), urlPublica: ORIGEN, inactividadMinutos: 15, limitarIntentos });
  const app = construirServidor(esc, { auth, urlPublica: ORIGEN, obtenerSesion: sesionDesdeCookie(auth, esc.db), ahora: esc.reloj.ahora });

  /** Crea la cuenta de Better Auth de un usuario de la semilla (por su correo). */
  async function darCuenta(email: string) {
    const elUsuario = esc.db.select().from(usuario).where(eq(usuario.email, email)).get();
    const authUserId = await crearCuenta(auth, { email, nombre: elUsuario?.nombre ?? email, contrasena: CONTRASENA });
    esc.db.update(usuario).set({ authUserId }).where(eq(usuario.email, email)).run();
  }

  /** Cada llamada usa otra IP salvo que se indique: el límite de intentos no interfiere. */
  function iniciarSesion(email: string, password = CONTRASENA, ip = `10.1.0.${++ultimaIp % 250}`) {
    return app.inject({ method: "POST", url: "/api/auth/sign-in/email", headers: { origin: ORIGEN, "x-real-ip": ip }, payload: { email, password } });
  }

  /** Inicia sesión y devuelve la cookie que el navegador reenviaría. */
  async function cookieDe(email: string, password = CONTRASENA) {
    const respuesta = await iniciarSesion(email, password);
    expect(respuesta.statusCode, `login de ${email}: ${respuesta.body}`).toBe(200);
    return cookieDeRespuesta(respuesta.headers["set-cookie"]);
  }

  /** Petición con la cookie de una sesión y el Origin de la app. */
  function como(cookie: string, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, cuerpo?: unknown) {
    return app.inject({
      method,
      url,
      headers: { cookie, origin: ORIGEN },
      ...(cuerpo === undefined ? {} : { payload: cuerpo as object }),
    });
  }

  return { ...esc, app, auth, darCuenta, iniciarSesion, cookieDe, como };
}

/** "atk.session_token=abc; Path=/; HttpOnly..." → "atk.session_token=abc" */
export function cookieDeRespuesta(setCookie: string | string[] | undefined): string {
  const lista = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return lista.map((c) => c.split(";")[0]).join("; ");
}
