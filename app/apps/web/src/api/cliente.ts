// La única puerta a la API: toda petición del front pasa por aquí.
//
//   obtener("/api/operaciones", { estado: "CONFIRMADA" })   GET con parámetros
//   enviar("/api/auth/sign-out")                             POST (cuerpo {} si no hay)
//
// Cualquier falla termina en un ErrorApi con la misma forma, venga de donde
// venga: { estado, codigo, mensaje, detalles }. El `mensaje` está en español
// y se muestra tal cual; el `codigo` sirve para decidir qué hacer.
//
// Dos casos no traen nuestro formato (docs/api.md) y se traducen aquí:
//   - /api/auth/* es de Better Auth: { message, code }, en inglés.
//   - 429 (demasiados intentos) lo arma la librería del límite, en inglés.

/** Un campo que la API rechazó: viene con DATOS_INVALIDOS (400). */
export type DetalleError = { campo: string; mensaje: string };

export class ErrorApi extends Error {
  /** Estado HTTP; 0 si ni siquiera hubo respuesta (sin conexión). */
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: DetalleError[];

  constructor(estado: number, codigo: string, mensaje: string, detalles: DetalleError[] = []) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** La sesión venció o no existe: los marcos llevan al login. */
export const esSinSesion = (error: unknown): boolean => error instanceof ErrorApi && error.estado === 401;

/** Lo pedido no existe (404): la vista muestra "no existe" en vez de un error. */
export const esNoExiste = (error: unknown): boolean => error instanceof ErrorApi && error.estado === 404;

/** El mensaje para mostrar de cualquier error, sea o no de la API. */
export const mensajeDe = (error: unknown): string => (error instanceof ErrorApi ? error.message : "Ocurrió un error inesperado. Intenta de nuevo.");

// Los de Better Auth que pueden llegar desde las rutas que la app usa
const MENSAJES_LOGIN: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos",
  INVALID_EMAIL: "Correo inválido",
  INVALID_PASSWORD: "La contraseña actual no es correcta",
  PASSWORD_TOO_SHORT: "La contraseña debe tener al menos 10 caracteres",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga",
};

type Metodo = "GET" | "POST" | "PATCH" | "DELETE";

export async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  const escribe = metodo !== "GET";
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      // La API exige cuerpo JSON en toda escritura, aunque sea {}
      headers: escribe ? { "content-type": "application/json" } : undefined,
      body: escribe ? JSON.stringify(cuerpo ?? {}) : undefined,
    });
  } catch {
    throw new ErrorApi(0, "SIN_CONEXION", "No se pudo conectar con el servidor. Revisa la conexión e intenta de nuevo.");
  }

  if (respuesta.status === 204) return undefined as T;
  const datos: unknown = await respuesta.json().catch(() => null);
  if (respuesta.ok) return datos as T;
  throw errorDesde(respuesta.status, datos);
}

/** Valores de un filtro: lo vacío o indefinido no se envía. */
export type Parametros = Record<string, string | number | boolean | null | undefined>;

export function obtener<T>(ruta: string, parametros: Parametros = {}): Promise<T> {
  const query = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") query.set(clave, String(valor));
  }
  const texto = query.toString();
  return pedir<T>("GET", texto ? `${ruta}?${texto}` : ruta);
}

export const enviar = <T>(ruta: string, cuerpo: unknown = {}) => pedir<T>("POST", ruta, cuerpo);

/** Arma el ErrorApi de una respuesta con error, sea cual sea su formato. */
export function errorDesde(estado: number, datos: unknown): ErrorApi {
  if (estado === 429) {
    return new ErrorApi(429, "DEMASIADOS_INTENTOS", "Demasiados intentos desde esta conexión. Espera un rato antes de volver a intentar.");
  }

  // El nuestro: { error: { codigo, mensaje, detalles? } }
  const nuestro = (datos as { error?: { codigo?: unknown; mensaje?: unknown; detalles?: unknown } } | null)?.error;
  if (typeof nuestro?.codigo === "string" && typeof nuestro.mensaje === "string") {
    const detalles = Array.isArray(nuestro.detalles) ? (nuestro.detalles as DetalleError[]) : [];
    return new ErrorApi(estado, nuestro.codigo, nuestro.mensaje, detalles);
  }

  // Better Auth: { message, code }
  const deLogin = datos as { code?: unknown } | null;
  if (typeof deLogin?.code === "string") {
    return new ErrorApi(estado, deLogin.code, MENSAJES_LOGIN[deLogin.code] ?? generico(estado));
  }

  // Sin cuerpo JSON (por ejemplo, Nginx con la app caída)
  return new ErrorApi(estado, estado >= 500 ? "ERROR_SERVIDOR" : "ERROR_HTTP", generico(estado));
}

function generico(estado: number): string {
  if (estado === 502 || estado === 503 || estado === 504) return "El servidor no responde. Intenta de nuevo en un momento.";
  return `Ocurrió un error inesperado (HTTP ${estado}). Intenta de nuevo.`;
}
