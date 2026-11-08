// Quién hace la petición. Toda ruta bajo /api lo exige: sin actor → 401.
//
// De dónde sale el actor no es asunto de las rutas: construirServidor
// recibe la función `obtenerActor`. En producción la arma el login (fase B);
// en los tests, una función que devuelve el usuario de prueba elegido.

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Actor } from "../servicios/contexto.ts";

export type ObtenerActor = (request: FastifyRequest) => Actor | null | Promise<Actor | null>;

// Agrega `request.actor` a los tipos de Fastify
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor;
  }
}

export function exigirActor(api: FastifyInstance, obtenerActor: ObtenerActor) {
  api.decorateRequest("actor", null as unknown as Actor);
  // onRequest corre antes de leer el cuerpo: sin sesión, ni siquiera se procesa
  api.addHook("onRequest", async (request, reply) => {
    const actor = await obtenerActor(request);
    if (!actor) {
      return reply.code(401).send({ error: { codigo: "SIN_SESION", mensaje: "Inicie sesión para continuar" } });
    }
    request.actor = actor;
  });
}
