// Traduce los errores a respuestas HTTP con un formato único:
//
//   { "error": { "codigo": "SIN_TURNO", "mensaje": "Abra un turno...", "detalles"?: [...] } }
//
// El mensaje de un ErrorNegocio está escrito para mostrarlo tal cual. Los
// errores inesperados se registran en el log y al usuario solo le llega un
// mensaje genérico: nunca se exponen detalles internos.

import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { ErrorNegocio } from "../servicios/contexto.ts";

/** Sin permiso → 403, *_NO_EXISTE → 404, cualquier otra regla de negocio → 409. */
export function estadoDe(codigo: string): number {
  if (codigo === "SIN_PERMISO" || codigo === "CUENTA_NO_VERIFICADA") return 403;
  if (codigo.endsWith("_NO_EXISTE")) return 404;
  return 409;
}

export function registrarErrores(app: FastifyInstance) {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ErrorNegocio) {
      return reply.code(estadoDe(error.codigo)).send({ error: { codigo: error.codigo, mensaje: error.message } });
    }
    if (error instanceof ZodError) {
      const detalles = error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message }));
      return reply.code(400).send({ error: { codigo: "DATOS_INVALIDOS", mensaje: "Revise los datos enviados", detalles } });
    }
    // Errores de Fastify con estado 4xx: JSON mal formado, cuerpo vacío, etc.
    const deFastify = error as Partial<FastifyError>;
    if (deFastify.statusCode && deFastify.statusCode >= 400 && deFastify.statusCode < 500) {
      return reply
        .code(deFastify.statusCode)
        .send({ error: { codigo: deFastify.code ?? "PETICION_INVALIDA", mensaje: deFastify.message ?? "Petición inválida" } });
    }
    request.log.error({ err: error }, "error inesperado");
    return reply.code(500).send({ error: { codigo: "ERROR_INTERNO", mensaje: "Ocurrió un error inesperado. Intente de nuevo." } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { codigo: "RUTA_NO_EXISTE", mensaje: `No existe ${request.method} ${request.url}` } }),
  );
}
