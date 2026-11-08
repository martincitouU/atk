// Quién soy: lo primero que pide el front al cargar, para saber qué mostrar.
// El personal ve su usuario y su turno; un cliente, el estado de su cuenta.

import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { usuario } from "../db/esquema.ts";
import type { Contexto } from "../servicios/contexto.ts";
import { turnoAbiertoDe } from "../servicios/turnos.ts";

export function rutasYo(api: FastifyInstance, ctx: Contexto) {
  api.get("/yo", (request) => {
    const { sesion } = request;
    if (sesion.tipo === "cliente") {
      const { nombre, rut, estado, motivoRechazo, creadaEn } = sesion.cuenta;
      return { tipo: "cliente", cuenta: { nombre, rut, estado, motivoRechazo, creadaEn } };
    }
    const yo = ctx.db
      .select({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, sucursalId: usuario.sucursalId })
      .from(usuario)
      .where(eq(usuario.id, sesion.actor.id))
      .get();
    return { tipo: "personal", usuario: yo, turnoAbierto: turnoAbiertoDe(ctx.db, sesion.actor.id) };
  });
}
