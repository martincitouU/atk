// Datos fijos para armar las pantallas (divisas, cajas, categorías, parámetros).

import type { FastifyInstance } from "fastify";
import { catalogo } from "../servicios/catalogo.ts";
import type { Contexto } from "../servicios/contexto.ts";

export function rutasCatalogo(api: FastifyInstance, ctx: Contexto) {
  api.get("/catalogo", () => catalogo(ctx.db));
}
