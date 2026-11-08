// Login con Better Auth: correo + contraseña, sesión en cookie httpOnly.
//
// Better Auth responde "quién eres" (cuenta y sesión). "Qué puedes hacer"
// lo decide la tabla usuario (ver auth/sesion.ts). Aquí no se escribe
// criptografía: el hash de contraseñas y los tokens son de Better Auth.

import { betterAuth } from "better-auth";
import { abrirBaseAuth } from "../db/conexion.ts";
import { ErrorNegocio, exigir } from "../servicios/contexto.ts";

export type OpcionesAuth = {
  /** Archivo SQLite; Better Auth abre su propia conexión */
  rutaBase: string;
  /** Firma las cookies. Largo y aleatorio; si cambia, se cierran todas las sesiones. */
  secreto: string;
  /** Dirección con que el navegador entra a la app (http://16.58.36.196). Se usa para validar Origin. */
  urlPublica: string;
  /** La sesión vence tras estos minutos sin uso (RF-14, parámetro sesion_inactividad_minutos) */
  inactividadMinutos: number;
  /** Límite de intentos por IP. Los tests lo apagan salvo el que lo prueba. */
  limitarIntentos?: boolean;
};

export function crearAuth(o: OpcionesAuth) {
  return betterAuth({
    database: abrirBaseAuth(o.rutaBase),
    secret: o.secreto,
    baseURL: o.urlPublica,
    basePath: "/api/auth",
    emailAndPassword: {
      enabled: true,
      // Nadie crea cuentas por /api/auth: el personal lo crea un admin y los
      // clientes se registran por /api/registro, que valida el RUT (fase C).
      disableSignUp: true,
      minPasswordLength: 10,
    },
    session: {
      // Vence tras N minutos; cada uso la renueva (como mucho, una escritura por minuto)
      expiresIn: o.inactividadMinutos * 60,
      updateAge: 60,
    },
    rateLimit: { enabled: o.limitarIntentos ?? true },
    advanced: {
      cookiePrefix: "atk",
      // Nginx pone X-Real-IP con la IP que ve; el cliente no puede falsificarla
      ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof crearAuth>;

async function contextoAuth(auth: Auth) {
  return auth.$context;
}

function exigirLargo(contrasena: string, minimo: number) {
  exigir(contrasena.length >= minimo, "CONTRASENA_CORTA", `La contraseña debe tener al menos ${minimo} caracteres`);
}

/**
 * Crea una cuenta con contraseña sin pasar por HTTP: el registro de
 * clientes, la creación de usuarios por un admin, el comando inicializar
 * y los tests. Devuelve el id de Better Auth (auth_user_id).
 */
export async function crearCuenta(auth: Auth, datos: { email: string; nombre: string; contrasena: string }): Promise<string> {
  const ctx = await contextoAuth(auth);
  exigirLargo(datos.contrasena, ctx.password.config.minPasswordLength);
  const email = datos.email.trim().toLowerCase();
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    throw new ErrorNegocio("CORREO_EN_USO", "Ya existe una cuenta con ese correo");
  }
  // Los mismos pasos que el registro de Better Auth (api/routes/sign-up)
  const cuenta = await ctx.internalAdapter.createUser({ email, name: datos.nombre, emailVerified: false }, { method: "email-password" });
  await ctx.internalAdapter.linkAccount({
    userId: cuenta.id,
    providerId: "credential", // correo + contraseña
    accountId: cuenta.id,
    password: await ctx.password.hash(datos.contrasena),
  });
  return cuenta.id;
}

/** Deshace crearCuenta cuando el paso siguiente falla: no quedan cuentas a medias. */
export async function borrarCuenta(auth: Auth, authUserId: string): Promise<void> {
  await (await contextoAuth(auth)).internalAdapter.deleteUser(authUserId);
}

/** Fija una contraseña nueva (la pone un admin) y cierra todas las sesiones de la cuenta. */
export async function fijarContrasena(auth: Auth, authUserId: string, contrasena: string): Promise<void> {
  const ctx = await contextoAuth(auth);
  exigirLargo(contrasena, ctx.password.config.minPasswordLength);
  await ctx.internalAdapter.updatePassword(authUserId, await ctx.password.hash(contrasena));
  await ctx.internalAdapter.deleteUserSessions(authUserId);
}

/** Cierra todas las sesiones abiertas de una cuenta (al desactivar a alguien). */
export async function cerrarSesiones(auth: Auth, authUserId: string): Promise<void> {
  await (await contextoAuth(auth)).internalAdapter.deleteUserSessions(authUserId);
}
