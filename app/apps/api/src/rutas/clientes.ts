// Fichas de clientes (RF-17) y categorías de fidelización (RF-18).

import { cambiosCliente, entradaCategoriaCliente, entradaCliente, filtrosClientes } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import {
  buscarClientes,
  categoriasDeCliente,
  crearCategoriaCliente,
  crearCliente,
  editarCliente,
  faltantesFicha,
  obtenerCliente,
} from "../servicios/clientes.ts";
import { ErrorNegocio, type Contexto } from "../servicios/contexto.ts";
import { idDe } from "./comun.ts";

export function rutasClientes(api: FastifyInstance, ctx: Contexto) {
  /** Busca por nombre o número de documento (?q=perez). Cada uno con lo que le falta a su ficha. */
  api.get("/clientes", (request) => {
    const { q, limite } = filtrosClientes.parse(request.query);
    return buscarClientes(ctx.db, q, limite).map((c) => ({ ...c, faltantesUaf: faltantesFicha(c) }));
  });

  /** La ficha, con lo que le falta para cumplir con la UAF. */
  api.get("/clientes/:id", (request) => {
    const id = idDe(request);
    const ficha = obtenerCliente(ctx.db, id);
    if (!ficha) throw new ErrorNegocio("CLIENTE_NO_EXISTE", `El cliente ${id} no existe`);
    return { ...ficha, faltantesUaf: faltantesFicha(ficha) };
  });

  api.post("/clientes", (request, reply) =>
    reply.code(201).send(crearCliente(ctx, request.actor, entradaCliente.parse(request.body))),
  );

  api.patch("/clientes/:id", (request) => editarCliente(ctx, request.actor, idDe(request), cambiosCliente.parse(request.body)));

  api.get("/categorias-cliente", () => categoriasDeCliente(ctx.db));

  /** Nueva categoría de fidelización (admin). */
  api.post("/categorias-cliente", (request, reply) =>
    reply.code(201).send(crearCategoriaCliente(ctx, request.actor, entradaCategoriaCliente.parse(request.body))),
  );
}
