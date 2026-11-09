// Punto de entrada del contenedor: abre la base, aplica las migraciones
// pendientes y atiende HTTP. Contrato con la infra (CLAUDE.md): escucha en
// PORT y guarda SQLite en DATABASE_PATH.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crearAuth } from "./auth/auth.ts";
import { sesionDesdeCookie } from "./auth/sesion.ts";
import { abrirBase } from "./db/conexion.ts";
import { migrar } from "./db/migrar.ts";
import { construirServidor } from "./servidor.ts";
import { leerParametros } from "./servicios/parametros.ts";

const puerto = Number(process.env.PORT ?? 3000);
const rutaBase = process.env.DATABASE_PATH;
if (!rutaBase) {
  console.error("Falta la variable de entorno DATABASE_PATH");
  process.exit(1);
}

const conexion = abrirBase(rutaBase);
const aplicadas = migrar(conexion.sqlite);
// Login: necesita el secreto que firma las cookies y la dirección pública
// (para validar Origin). En la VM los deja Ansible fuera del repo. Si
// faltan, la app arranca igual pero cerrada: nadie inicia sesión, toda
// ruta de /api responde 401 y no se acepta ninguna escritura.
const secreto = process.env.BETTER_AUTH_SECRET;
// Una variable vacía cuenta como ausente
const urlPublica = process.env.BETTER_AUTH_URL || null;
const auth =
  secreto && urlPublica
    ? crearAuth({
        rutaBase,
        secreto,
        urlPublica,
        inactividadMinutos: leerParametros(conexion.db).sesionInactividadMinutos,
      })
    : null;

// El front compilado (apps/web/dist) lo deja la imagen de Docker. En
// desarrollo no existe: el front lo sirve Vite.
const carpetaFront = fileURLToPath(new URL("../../web/dist/", import.meta.url));

const app = construirServidor(conexion, {
  auth,
  urlPublica,
  obtenerSesion: auth ? sesionDesdeCookie(auth, conexion.db) : () => null,
  carpetaFront: existsSync(carpetaFront) ? carpetaFront : null,
});
app.log.info({ base: rutaBase, aplicadas }, aplicadas.length ? "migraciones aplicadas" : "base al día");
if (!auth) app.log.warn("Faltan BETTER_AUTH_SECRET o BETTER_AUTH_URL: el login está desactivado");
if (!existsSync(carpetaFront)) app.log.info("Sin front compilado: solo se sirven /health y /api");

// docker stop manda SIGTERM: se termina lo que está en curso y se cierra la base
for (const senal of ["SIGTERM", "SIGINT"] as const) {
  process.once(senal, async () => {
    await app.close();
    conexion.sqlite.close();
    process.exit(0);
  });
}

await app.listen({ port: puerto, host: "0.0.0.0" });
