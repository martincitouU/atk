// Gastos operacionales (RF-05).

import { entradaGasto, entradaReverso, filtrosGastos } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import type { Contexto } from "../servicios/contexto.ts";
import { listarGastos, registrarGasto, reversarGasto } from "../servicios/gastos.ts";
import { idDe } from "./comun.ts";

export function rutasGastos(api: FastifyInstance, ctx: Contexto) {
  /** Entre dos fechas locales, ambas incluidas (?desde=2026-11-01&hasta=2026-11-30). */
  api.get("/gastos", (request) => listarGastos(ctx.db, filtrosGastos.parse(request.query)));

  api.post("/gastos", (request, reply) => reply.code(201).send(registrarGasto(ctx, request.actor, entradaGasto.parse(request.body))));

  api.post("/gastos/:id/reversar", (request) =>
    reversarGasto(ctx, request.actor, idDe(request), entradaReverso.parse(request.body).motivo),
  );
}
