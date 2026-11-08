// Turnos, saldos y movimientos de caja (RF-04, RF-05, RF-06).

import { entradaAbrirTurno, entradaAjusteCaja, entradaCerrarTurno, entradaIngresoRetiro, filtrosSaldos } from "@atk/shared";
import type { FastifyInstance } from "fastify";
import { ajustarCaja, movimientosDeTurno, registrarIngresoORetiro, saldos } from "../servicios/caja.ts";
import type { Contexto } from "../servicios/contexto.ts";
import { abrirTurno, arqueoDeTurno, cerrarTurno, turnosAbiertos } from "../servicios/turnos.ts";
import { idDe } from "./comun.ts";

export function rutasCaja(api: FastifyInstance, ctx: Contexto) {
  /** Turnos abiertos ahora, con caja y cajero. */
  api.get("/turnos/abiertos", () => turnosAbiertos(ctx.db));

  /** Abre el turno del usuario en una caja. */
  api.post("/turnos", (request, reply) =>
    reply.code(201).send(abrirTurno(ctx, request.actor, entradaAbrirTurno.parse(request.body).cajaId)),
  );

  /** Cierra con el conteo físico y devuelve el arqueo con las diferencias. */
  api.post("/turnos/:id/cerrar", (request) =>
    cerrarTurno(ctx, request.actor, idDe(request), entradaCerrarTurno.parse(request.body).conteo),
  );

  /** Libro de caja del turno, en orden. */
  api.get("/turnos/:id/movimientos", (request) => movimientosDeTurno(ctx.db, idDe(request)));

  api.get("/turnos/:id/arqueo", (request) => arqueoDeTurno(ctx.db, idDe(request)));

  /** Saldo por moneda de una caja (?cajaId=1) o de todas. */
  api.get("/saldos", (request) => saldos(ctx.db, filtrosSaldos.parse(request.query).cajaId));

  /** Ingreso o retiro en la caja del propio turno. */
  api.post("/caja/movimientos", (request, reply) =>
    reply.code(201).send(registrarIngresoORetiro(ctx, request.actor, entradaIngresoRetiro.parse(request.body))),
  );

  /** Ajuste tras un arqueo (supervisor o admin). */
  api.post("/caja/ajustes", (request, reply) =>
    reply.code(201).send(ajustarCaja(ctx, request.actor, entradaAjusteCaja.parse(request.body))),
  );
}
