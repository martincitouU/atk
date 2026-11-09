// Usuarios del personal. Gestionarlos es solo del administrador (lo exige el
// servicio); la lista de nombres es para todo el personal.

import { cambiosUsuario, entradaContrasena, entradaUsuario } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import type { Auth } from "../auth/auth.ts";
import type { Contexto } from "../servicios/contexto.ts";
import { crearUsuario, editarUsuario, listarUsuarios, nombresDelPersonal, restablecerContrasena } from "../servicios/usuarios.ts";
import { idDe } from "./comun.ts";

/** Los nombres del personal: las pantallas reciben ids y muestran nombres. */
export function rutaPersonal(api: FastifyInstance, ctx: Contexto) {
  api.get("/personal", () => nombresDelPersonal(ctx.db));
}

export function rutasUsuarios(api: FastifyInstance, ctx: Contexto, auth: Auth) {
  api.get("/usuarios", (request) => listarUsuarios(ctx, request.actor));

  api.post("/usuarios", async (request, reply) =>
    reply.code(201).send(await crearUsuario(ctx, request.actor, auth, entradaUsuario.parse(request.body))),
  );

  api.patch("/usuarios/:id", (request) => editarUsuario(ctx, request.actor, auth, idDe(request), cambiosUsuario.parse(request.body)));

  api.post("/usuarios/:id/contrasena", async (request, reply) => {
    await restablecerContrasena(ctx, request.actor, auth, idDe(request), entradaContrasena.parse(request.body).contrasena);
    return reply.code(204).send();
  });
}
