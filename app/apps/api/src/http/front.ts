// El front compilado (apps/web/dist) lo sirve la misma app: mismo origen
// que la API, sin CORS (CLAUDE.md). Nginx no cambia: todo le llega a Fastify.
//
//   /assets/*   archivos con un hash en el nombre: caché de un año
//   /, /caja…   las direcciones del front no son archivos: se responde
//               index.html y React Router muestra la vista en el navegador
//   /api/*      la API; una ruta que no existe responde 404 en JSON (servidor.ts)
//
// En desarrollo no se usa: el front lo sirve Vite en :5173.

import { extname, sep } from "node:path";
import estaticos from "@fastify/static";
import type { FastifyInstance } from "fastify";
import { rutaNoExiste } from "./errores.ts";

const UN_ANO = 365 * 24 * 60 * 60;

export function servirFront(app: FastifyInstance, carpeta: string) {
  app.register(estaticos, {
    root: carpeta,
    // Se registra una ruta por cada archivo que existe al arrancar (el front
    // compilado no cambia mientras la app corre). Sin comodín, una dirección
    // desconocida llega al manejador de "no encontrado" de abajo.
    wildcard: false,
    setHeaders(reply, ruta) {
      // Si un archivo de assets/ cambia, cambia su nombre: se puede guardar para siempre
      if (ruta.includes(`${sep}assets${sep}`)) reply.header("cache-control", `public, max-age=${UN_ANO}, immutable`);
      // Lo demás (index.html) se revalida siempre: un despliegue se ve al recargar
      else reply.header("cache-control", "no-cache");
    },
  });

  app.setNotFoundHandler((request, reply) => {
    const ruta = request.url.split("?")[0] ?? "/";
    // Una dirección del front: GET, fuera de /api y sin extensión (no es un archivo)
    const esDelFront = (request.method === "GET" || request.method === "HEAD") && !ruta.startsWith("/api/") && extname(ruta) === "";
    if (!esDelFront) return rutaNoExiste(request, reply);
    return reply.header("cache-control", "no-cache").sendFile("index.html");
  });
}
