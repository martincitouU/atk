// Servidor HTTP de la app. Por ahora solo expone /health; las rutas de la
// API se agregan aquí en la etapa 2.

import Fastify from "fastify";
import type { Conexion } from "./db/conexion.ts";
import { casa } from "./db/esquema.ts";

export function construirServidor({ sqlite, db }: Conexion) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Detrás de Nginx: la IP real del cliente viene en X-Forwarded-For
    trustProxy: true,
  });

  // Contrato con la infra: el HEALTHCHECK de Docker y Ansible piden 200.
  // Si la base no responde, la consulta falla y Fastify contesta 500.
  app.get("/health", () => {
    const migraciones = sqlite.prepare("SELECT nombre FROM migracion ORDER BY nombre").pluck().all() as string[];
    const configurada = db.select({ id: casa.id }).from(casa).get() !== undefined;
    return { status: "ok", migraciones, configurada };
  });

  return app;
}
