// Compra y venta de divisas: borrador → confirmada → reversada (RF-01, 02, 07).
// Cada ruta valida la entrada y llama al servicio; las reglas y los permisos
// finos (de quién es el borrador, quién autoriza o reversa) los aplica el servicio.

import { cambiosOperacion, entradaOperacion, entradaReverso, filtrosOperaciones } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import type { Contexto } from "../servicios/contexto.ts";
import {
  autorizarTasa,
  confirmarOperacion,
  crearBorrador,
  editarBorrador,
  eliminarBorrador,
  listarOperaciones,
  obtenerOperacion,
  previsualizarOperacion,
  reversarOperacion,
} from "../servicios/operaciones.ts";
import { idDe } from "./comun.ts";


export function rutasOperaciones(api: FastifyInstance, ctx: Contexto) {
  api.get("/operaciones", (request) => listarOperaciones(ctx.db, filtrosOperaciones.parse(request.query)));

  api.get("/operaciones/:id", (request) => obtenerOperacion(ctx.db, idDe(request)));

  /** Cálculo de precio, montos y si exigirá ficha UAF, sin guardar nada. */
  api.post("/operaciones/previsualizar", (request) =>
    previsualizarOperacion(ctx, request.actor, entradaOperacion.parse(request.body)),
  );

  api.post("/operaciones", (request, reply) =>
    reply.code(201).send(crearBorrador(ctx, request.actor, entradaOperacion.parse(request.body))),
  );

  api.patch("/operaciones/:id", (request) =>
    editarBorrador(ctx, request.actor, idDe(request), cambiosOperacion.parse(request.body)),
  );

  api.delete("/operaciones/:id", (request, reply) => {
    eliminarBorrador(ctx, request.actor, idDe(request));
    return reply.code(204).send();
  });

  /** Un supervisor autoriza la tasa preferencial de un borrador. */
  api.post("/operaciones/:id/autorizar", (request) => autorizarTasa(ctx, request.actor, idDe(request)));

  /** Recalcula con la pizarra vigente, valida y mueve la caja. */
  api.post("/operaciones/:id/confirmar", (request) => confirmarOperacion(ctx, request.actor, idDe(request)));

  api.post("/operaciones/:id/reversar", (request) =>
    reversarOperacion(ctx, request.actor, idDe(request), entradaReverso.parse(request.body).motivo),
  );
}
