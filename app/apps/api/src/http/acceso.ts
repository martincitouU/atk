// Quién hace la petición y qué parte de la API puede usar.
//
//   personal → rutas de trabajo (operaciones, caja...): reciben un Actor
//   cliente  → solo /api/mi/... (lectura de lo propio)
//   sin sesión → 401
//
// De dónde sale la sesión no es asunto de las rutas: construirServidor
// recibe `obtenerSesion`. En producción la arma el login (auth/sesion.ts);
// en los tests de rutas, el usuario de prueba elegido. Recibe la respuesta
// porque renovar la sesión puede enviar una cookie nueva.

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CuentaCliente } from "../db/esquema.ts";
import type { Actor } from "../servicios/contexto.ts";

export type Sesion = { tipo: "personal"; actor: Actor } | { tipo: "cliente"; cuenta: CuentaCliente };

export type ObtenerSesion = (request: FastifyRequest, reply: FastifyReply) => Sesion | null | Promise<Sesion | null>;

// Agrega a los tipos de Fastify lo que dejan los hooks de abajo
declare module "fastify" {
  interface FastifyRequest {
    sesion: Sesion;
    /** Solo en rutas del personal */
    actor: Actor;
    /** Solo en rutas de clientes */
    cuenta: CuentaCliente;
  }
}

const SIN_SESION = { error: { codigo: "SIN_SESION", mensaje: "Inicie sesión para continuar" } };
const SOLO_PERSONAL = { error: { codigo: "SIN_PERMISO", mensaje: "Esta sección es solo para el personal de la casa de cambio" } };
const SOLO_CLIENTES = { error: { codigo: "SIN_PERMISO", mensaje: "Esta sección es solo para clientes" } };

/**
 * Exige una sesión del tipo indicado (o de cualquiera) en todas las rutas
 * del grupo. onRequest corre antes de leer el cuerpo: sin permiso, ni
 * siquiera se procesa.
 */
export function exigirSesion(api: FastifyInstance, obtenerSesion: ObtenerSesion, tipo?: Sesion["tipo"]) {
  api.decorateRequest<Sesion | null>("sesion", null);
  api.decorateRequest<Actor | null>("actor", null);
  api.decorateRequest<CuentaCliente | null>("cuenta", null);

  api.addHook("onRequest", async (request, reply) => {
    const sesion = await obtenerSesion(request, reply);
    if (!sesion) return reply.code(401).send(SIN_SESION);
    if (tipo && sesion.tipo !== tipo) return reply.code(403).send(tipo === "personal" ? SOLO_PERSONAL : SOLO_CLIENTES);

    request.sesion = sesion;
    if (sesion.tipo === "personal") request.actor = sesion.actor;
    else request.cuenta = sesion.cuenta;
  });
}
