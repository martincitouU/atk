// Login: se pasan a Better Auth solo las rutas que la app usa.
//
// Better Auth trae muchas más (registro público, cambio de correo,
// recuperación por email...). Una lista explícita deja claro qué está
// expuesto; cualquier otra ruta de /api/auth responde 404.

import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance } from "fastify";
import type { Auth } from "../auth/auth.ts";

const PERMITIDAS = new Set([
  "POST /sign-in/email", // iniciar sesión: { email, password }
  "POST /sign-out", // cerrar sesión: {}
  "GET /get-session", // sesión actual (el front prefiere /api/yo)
  "POST /change-password", // { currentPassword, newPassword, revokeOtherSessions? }
]);

export function rutasAuth(api: FastifyInstance, auth: Auth, urlPublica: string) {
  api.route({
    method: ["GET", "POST"],
    url: "/auth/*",
    handler: async (request, reply) => {
      const url = new URL(request.url, urlPublica);
      const ruta = url.pathname.slice("/api/auth".length);
      if (!PERMITIDAS.has(`${request.method} ${ruta}`)) {
        return reply.code(404).send({ error: { codigo: "RUTA_NO_EXISTE", mensaje: `No existe ${request.method} ${url.pathname}` } });
      }

      // Fastify ya leyó el JSON; Better Auth recibe una petición web estándar
      const respuesta = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: request.method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
        }),
      );

      reply.code(respuesta.status);
      respuesta.headers.forEach((valor, nombre) => {
        if (nombre !== "set-cookie") reply.header(nombre, valor);
      });
      const cookies = respuesta.headers.getSetCookie();
      if (cookies.length > 0) reply.header("set-cookie", cookies);
      // Texto tal cual: el cuerpo ya viene en JSON desde Better Auth
      return reply.send(await respuesta.text());
    },
  });
}
