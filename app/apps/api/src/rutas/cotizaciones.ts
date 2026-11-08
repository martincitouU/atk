// Pizarra y panel central de tipos de cambio (RF-08).

import { entradaPublicacion, filtrosPizarra } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import type { Contexto } from "../servicios/contexto.ts";
import { pizarra, publicarCotizacion } from "../servicios/cotizaciones.ts";

export function rutasCotizaciones(api: FastifyInstance, ctx: Contexto) {
  /** Pizarra vigente: compra y venta de cada divisa habilitada. */
  api.get("/pizarra", (request) => {
    const { sucursalId } = filtrosPizarra.parse(request.query);
    return pizarra(ctx, sucursalId ?? null);
  });

  /** Publica una nueva tasa de referencia y márgenes para una divisa. */
  api.post("/cotizaciones", (request, reply) => {
    const entrada = entradaPublicacion.parse(request.body);
    return reply.code(201).send(publicarCotizacion(ctx, request.actor, entrada));
  });
}
