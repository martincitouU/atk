// Quién soy: lo primero que pide el front al cargar, para saber qué mostrar.

import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { usuario } from "../db/esquema.ts";
import type { Contexto } from "../servicios/contexto.ts";
import { turnoAbiertoDe } from "../servicios/turnos.ts";

export function rutasYo(api: FastifyInstance, ctx: Contexto) {
  api.get("/yo", (request) => {
    const yo = ctx.db
      .select({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, sucursalId: usuario.sucursalId })
      .from(usuario)
      .where(eq(usuario.id, request.actor.id))
      .get();
    return { usuario: yo, turnoAbierto: turnoAbiertoDe(ctx.db, request.actor.id) };
  });
}
