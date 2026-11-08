// Auditoría (RF-15, admin) y resumen de la jornada (RF-16, supervisor y admin).
// Los permisos los exige cada servicio.

import { filtrosAuditoria, filtrosResumen } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import { consultarAuditoria } from "../servicios/auditoria.ts";
import type { Contexto } from "../servicios/contexto.ts";
import { resumenJornada } from "../servicios/resumen.ts";

export function rutasConsultas(api: FastifyInstance, ctx: Contexto) {
  api.get("/auditoria", (request) => consultarAuditoria(ctx, request.actor, filtrosAuditoria.parse(request.query)));

  api.get("/resumen", (request) => resumenJornada(ctx, request.actor, filtrosResumen.parse(request.query).fecha));
}
