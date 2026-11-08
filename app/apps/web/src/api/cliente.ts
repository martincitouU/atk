import type { z } from "zod";
import { ErrorApi, ErrorAuth } from "./esquemas.ts";

/**
 * Error esperable, con el `mensaje` escrito para mostrarse tal cual: el
 * { codigo, mensaje } que manda la API (docs/api.md, «Errores»). Un 400
 * trae además `detalles`, el mensaje de cada campo.
 */
export class ErrorNegocio extends Error {
  readonly codigo: string;
  readonly detalles: { campo: string; mensaje: string }[];

  constructor(codigo: string, mensaje: string, detalles: { campo: string; mensaje: string }[] = []) {
    super(mensaje);
    this.name = "ErrorNegocio";
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Better Auth responde en inglés: estos son los que la pantalla puede ver. */
const MENSAJES_AUTH: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos",
  INVALID_EMAIL: "Revise el correo: no tiene la forma nombre@dominio.cl.",
};

/** El ErrorNegocio de una respuesta fallida: de la API, de Better Auth o, si no se entiende, por su status. */
function errorDe(status: number, cuerpo: unknown): ErrorNegocio {
  const api = ErrorApi.safeParse(cuerpo);
  if (api.success) return new ErrorNegocio(api.data.error.codigo, api.data.error.mensaje, api.data.error.detalles);
  if (status === 429) return new ErrorNegocio("DEMASIADOS_INTENTOS", "Demasiados intentos seguidos. Espere un minuto y vuelva a probar.");
  const auth = ErrorAuth.safeParse(cuerpo);
  if (auth.success) {
    // El login fallido es el único error de credenciales: la pantalla lo marca en la contraseña
    const codigo = auth.data.code === "INVALID_EMAIL_OR_PASSWORD" ? "CREDENCIALES" : auth.data.code;
    return new ErrorNegocio(codigo, MENSAJES_AUTH[auth.data.code] ?? "No se pudo iniciar sesión. Inténtelo de nuevo.");
  }
  if (status === 401) return new ErrorNegocio("SIN_SESION", "Inicie sesión para continuar");
  return new ErrorNegocio("ERROR", `Error ${status}`);
}

/**
 * fetch + zod. Una respuesta 4xx/5xx se lanza como ErrorNegocio; sin red,
 * como SIN_CONEXION; una respuesta que no cumple el esquema, como el
 * ZodError (es un error de programación, no del usuario).
 */
export async function pedir<T>(ruta: string, esquema: z.ZodType<T, unknown>, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    // Solo con cuerpo va el Content-Type: Fastify rechaza un JSON vacío
    const headers = init?.body === undefined ? undefined : { "content-type": "application/json" };
    r = await fetch(ruta, { credentials: "same-origin", headers, ...init });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ErrorNegocio("SIN_CONEXION", "No hay conexión con el servidor. Anote en el libro físico y regístrelo después.");
  }
  let cuerpo: unknown = null;
  if (r.status !== 204) {
    try {
      cuerpo = await r.json();
    } catch {
      cuerpo = null; // un 502 del proxy trae HTML, no JSON
    }
  }
  if (!r.ok) throw errorDe(r.status, cuerpo);
  return esquema.parse(cuerpo);
}

/** pedir() con un cuerpo JSON (POST por defecto). La API exige cuerpo en toda escritura, aunque sea {}. */
export function enviar<T>(ruta: string, esquema: z.ZodType<T, unknown>, cuerpo: unknown = {}, metodo = "POST"): Promise<T> {
  return pedir(ruta, esquema, { method: metodo, body: JSON.stringify(cuerpo) });
}
