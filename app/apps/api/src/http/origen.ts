// Protección CSRF: otro sitio no puede hacer que el navegador de un cajero
// logueado envíe una operación a nuestra API.
//
// Tres capas: la cookie es SameSite=Lax (el navegador no la manda en un
// POST que viene de otro sitio), Fastify solo acepta cuerpos JSON, y este
// chequeo exige que toda petición que modifica algo traiga Origin igual al
// de la app. Los navegadores ponen Origin solos y una página no puede
// falsificarlo.

import type { FastifyInstance } from "fastify";

const SOLO_LECTURA = new Set(["GET", "HEAD", "OPTIONS"]);

/** Sin urlPublica (login no configurado) no se acepta ninguna escritura. */
export function exigirMismoOrigen(api: FastifyInstance, urlPublica: string | null) {
  const permitido = urlPublica ? new URL(urlPublica).origin : null;
  api.addHook("onRequest", async (request, reply) => {
    if (SOLO_LECTURA.has(request.method)) return;
    if (permitido === null || request.headers.origin !== permitido) {
      return reply.code(403).send({ error: { codigo: "ORIGEN_NO_PERMITIDO", mensaje: "Petición rechazada: no viene desde la app" } });
    }
  });
}
