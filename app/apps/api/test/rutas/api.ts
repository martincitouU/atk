// API de prueba: el escenario de los servicios (semilla + reloj) servido por
// Fastify. Las peticiones se simulan con app.inject, sin abrir un puerto.
//
// El actor se elige con la cabecera x-actor-prueba. Esto existe SOLO en los
// tests: en producción el actor sale de la sesión (fase B).

import type { InjectOptions } from "fastify";
import { construirServidor } from "../../src/servidor.ts";
import { ADMIN, CAJERA_2, CAJERO, escenario, SUPERVISOR } from "../servicios/escenario.ts";

process.env.LOG_LEVEL ??= "silent";

const ACTORES = { ADMIN, SUPERVISOR, CAJERO, CAJERA_2 };
type NombreActor = keyof typeof ACTORES;

export function apiDePrueba() {
  const esc = escenario();
  const app = construirServidor(esc, {
    ahora: esc.reloj.ahora,
    obtenerActor: (request) => ACTORES[request.headers["x-actor-prueba"] as NombreActor] ?? null,
  });

  /** Hace una petición como `actor` (null = sin sesión). */
  function pedir(actor: NombreActor | null, method: InjectOptions["method"], url: string, cuerpo?: unknown) {
    return app.inject({
      method,
      url,
      headers: actor ? { "x-actor-prueba": actor } : {},
      ...(cuerpo === undefined ? {} : { payload: cuerpo as InjectOptions["payload"] }),
    });
  }

  return { ...esc, app, pedir };
}
