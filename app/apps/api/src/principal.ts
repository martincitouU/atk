// Punto de entrada del contenedor: abre la base, aplica las migraciones
// pendientes y atiende HTTP. Contrato con la infra (CLAUDE.md): escucha en
// PORT y guarda SQLite en DATABASE_PATH.

import { abrirBase } from "./db/conexion.ts";
import { migrar } from "./db/migrar.ts";
import { construirServidor } from "./servidor.ts";

const puerto = Number(process.env.PORT ?? 3000);
const rutaBase = process.env.DATABASE_PATH;
if (!rutaBase) {
  console.error("Falta la variable de entorno DATABASE_PATH");
  process.exit(1);
}

const conexion = abrirBase(rutaBase);
const aplicadas = migrar(conexion.sqlite);
// Hasta que exista el login (fase B), nadie tiene sesión: toda ruta de /api responde 401
const app = construirServidor(conexion, { obtenerActor: () => null });
app.log.info({ base: rutaBase, aplicadas }, aplicadas.length ? "migraciones aplicadas" : "base al día");

// docker stop manda SIGTERM: se termina lo que está en curso y se cierra la base
for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.once(senal, async () => {
    await app.close();
    conexion.sqlite.close();
    process.exit(0);
  });
}

await app.listen({ port: puerto, host: "0.0.0.0" });
