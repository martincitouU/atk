// Servidor HTTP de la app: /health para la infra y la API bajo /api.
//
// Las rutas son una capa delgada: validan la entrada con los esquemas de
// @atk/shared, toman el actor de la petición y llaman al servicio. Las
// reglas de negocio viven en servicios/, nunca aquí.

import Fastify from "fastify";
import type { Auth } from "./auth/auth.ts";
import type { Conexion } from "./db/conexion.ts";
import { casa } from "./db/esquema.ts";
import { exigirActor, type ObtenerActor } from "./http/actor.ts";
import { registrarErrores } from "./http/errores.ts";
import { aJson } from "./http/json.ts";
import { exigirMismoOrigen } from "./http/origen.ts";
import { rutasAuth } from "./rutas/auth.ts";
import { rutasCotizaciones } from "./rutas/cotizaciones.ts";
import { rutasOperaciones } from "./rutas/operaciones.ts";
import { rutasYo } from "./rutas/yo.ts";
import { crearContexto } from "./servicios/contexto.ts";

export type OpcionesServidor = {
  /** Quién hace cada petición; null → 401. Ver http/actor.ts. */
  obtenerActor: ObtenerActor;
  /** Dirección pública de la app: solo se aceptan escrituras con ese Origin. null → ninguna. */
  urlPublica: string | null;
  /** Login. Sin él, /api/auth responde 503 y nadie obtiene sesión. */
  auth?: Auth | null;
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
      exigirMismoOrigen(api, opciones.urlPublica);

      // Login: lo único de /api que no exige sesión
      const { auth, urlPublica } = opciones;
      if (auth && urlPublica) {
        rutasAuth(api, auth, urlPublica);
      } else {
        api.all("/auth/*", (_request, reply) =>
          reply.code(503).send({ error: { codigo: "LOGIN_NO_CONFIGURADO", mensaje: "El inicio de sesión no está disponible" } }),
        );
      }

      // Todo lo demás exige un usuario del personal con sesión
      api.register(async (privada) => {
        exigirActor(privada, opciones.obtenerActor);
        rutasYo(privada, ctx);
        rutasCotizaciones(privada, ctx);
        rutasOperaciones(privada, ctx);
      });
    },
    { prefix: "/api" },
  );

  return app;
}
