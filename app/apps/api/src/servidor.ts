// Servidor HTTP de la app: /health para la infra y la API bajo /api.
//
// Las rutas son una capa delgada: validan la entrada con los esquemas de
// @atk/shared, toman el actor de la petición y llaman al servicio. Las
// reglas de negocio viven en servicios/, nunca aquí.

import Fastify from "fastify";
import type { Conexion } from "./db/conexion.ts";
import { casa } from "./db/esquema.ts";
import { exigirActor, type ObtenerActor } from "./http/actor.ts";
import { registrarErrores } from "./http/errores.ts";
import { aJson } from "./http/json.ts";
import { rutasCotizaciones } from "./rutas/cotizaciones.ts";
import { rutasOperaciones } from "./rutas/operaciones.ts";
import { crearContexto } from "./servicios/contexto.ts";

export type OpcionesServidor = {
  /** Quién hace cada petición; null → 401. Ver http/actor.ts. */
  obtenerActor: ObtenerActor;
  /** Reloj inyectable para los tests */
  ahora?: () => Date;
};

export function construirServidor({ sqlite, db }: Conexion, opciones: OpcionesServidor) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Detrás de Nginx: la IP real del cliente viene en X-Forwarded-For
    trustProxy: true,
  });
  app.setReplySerializer((payload) => aJson(payload));
  registrarErrores(app);

  // Contrato con la infra: el HEALTHCHECK de Docker y Ansible piden 200.
  // Si la base no responde, la consulta falla y Fastify contesta 500.
  app.get("/health", () => {
    const migraciones = sqlite.prepare("SELECT nombre FROM migracion ORDER BY nombre").pluck().all() as string[];
    const configurada = db.select({ id: casa.id }).from(casa).get() !== undefined;
    return { status: "ok", migraciones, configurada };
  });

  const ctx = crearContexto(db, opciones.ahora);
  app.register(
    async (api) => {
      exigirActor(api, opciones.obtenerActor);
      rutasCotizaciones(api, ctx);
      rutasOperaciones(api, ctx);
    },
    { prefix: "/api" },
  );

  return app;
}
