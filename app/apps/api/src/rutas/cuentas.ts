// Portal de clientes: registro público, revisión por el personal y lectura de lo propio.

import { entradaRechazoCuenta, filtrosCuentasCliente, registroCliente } from "@atk/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Auth } from "../auth/auth.ts";
import type { Contexto } from "../servicios/contexto.ts";
import {
  fichaDeCuenta,
  listarCuentasCliente,
  operacionesDeCuenta,
  rechazarCuenta,
  registrarCliente,
  verificarCuenta,
} from "../servicios/cuentas.ts";
import { idDe } from "./comun.ts";


/** IP real del cliente: la pone Nginx en X-Real-IP (no se puede falsificar desde fuera). */
const ipDe = (request: FastifyRequest) => String(request.headers["x-real-ip"] ?? request.ip);

/** Sin sesión. Limitado por IP para que un script no cree miles de cuentas. */
export function rutaRegistro(api: FastifyInstance, ctx: Contexto, auth: Auth) {
  api.post(
    "/registro",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour", keyGenerator: ipDe } } },
    async (request, reply) => {
      const cuenta = await registrarCliente(ctx, auth, registroCliente.parse(request.body));
      return reply.code(201).send({
        nombre: cuenta.nombre,
        rut: cuenta.rut,
        estado: cuenta.estado,
        mensaje: "Cuenta creada. Para ver sus operaciones, acérquese al local con su carnet para verificarla.",
      });
    },
  );
}

/** El personal revisa las cuentas: el cajero verifica el carnet en el local. */
export function rutasCuentasCliente(api: FastifyInstance, ctx: Contexto) {
  api.get("/cuentas-cliente", (request) => listarCuentasCliente(ctx.db, filtrosCuentasCliente.parse(request.query)));

  api.post("/cuentas-cliente/:id/verificar", (request) => verificarCuenta(ctx, request.actor, idDe(request)));

  api.post("/cuentas-cliente/:id/rechazar", (request) =>
    rechazarCuenta(ctx, request.actor, idDe(request), entradaRechazoCuenta.parse(request.body).motivo),
  );
}

/** Lo que ve el cliente: siempre lo de SU cuenta (la de la sesión), nunca un id de la URL. */
export function rutasPortal(api: FastifyInstance, ctx: Contexto) {
  api.get("/mi/operaciones", (request) => operacionesDeCuenta(ctx.db, request.cuenta));

  api.get("/mi/ficha", (request) => fichaDeCuenta(ctx.db, request.cuenta));
}
