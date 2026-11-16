// Datos fijos para armar las pantallas (divisas, cajas, categorías, parámetros).

import type { FastifyInstance } from "fastify";
import { catalogo, datosPublicos } from "../servicios/catalogo.ts";
import type { Contexto } from "../servicios/contexto.ts";

/** Sin sesión: el nombre de la casa y sus monedas, para el login y el portal de clientes. */
export function rutaCasa(api: FastifyInstance, ctx: Contexto) {
  api.get("/casa", () => datosPublicos(ctx.db));
}

/** Solo el personal: todo lo que necesitan sus pantallas. */
export function rutasCatalogo(api: FastifyInstance, ctx: Contexto) {
  api.get("/catalogo", () => catalogo(ctx.db));
}
