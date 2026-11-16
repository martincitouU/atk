// La API para desarrollar el front (npm run dev): una base local con la
// semilla de ejemplo, cuentas para iniciar sesión con cada rol y una jornada
// a medias (turnos abiertos, operaciones, un borrador y un gasto). Se arma
// en cli/base-desarrollo.ts.
//
// SOLO DESARROLLO. La semilla nunca va a producción: db/semillas ni siquiera
// entra a la imagen (.dockerignore), y este comando se niega a correr con
// NODE_ENV=production.
//
// La primera vez crea app/.dev/atk.db y app/.dev/secreto (los dos fuera de
// git). Para partir de cero (por ejemplo, para tener la jornada de hoy), se
// borra app/.dev.
//
// Cuentas de prueba (todas con CONTRASENA_DESARROLLO):
//   admin@demo.cl, supervisor@demo.cl, cajero@demo.cl, cajera2@demo.cl
//   ana@demo.cl      cliente del portal, pendiente de verificación
//   cliente@demo.cl  cliente del portal, verificado

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prepararBaseDeDesarrollo } from "./base-desarrollo.ts";

/** La de todas las cuentas de prueba. Solo existe en la base local de desarrollo. */
export const CONTRASENA_DESARROLLO = "desarrollo-atk";

/** Donde el navegador abre el front en desarrollo (Vite). Valida el Origin. */
const URL_DESARROLLO = "http://localhost:5173";

if (process.env.NODE_ENV === "production") {
  console.error("✖ npm run dev es solo para desarrollo: nunca carga la semilla en producción");
  process.exit(1);
}

const carpeta = fileURLToPath(new URL("../../../../.dev/", import.meta.url));
const rutaBase = `${carpeta}atk.db`;
const rutaSecreto = `${carpeta}secreto`;
mkdirSync(carpeta, { recursive: true, mode: 0o700 });

// Un secreto propio de este computador: no se escribe en el repo
if (!existsSync(rutaSecreto)) writeFileSync(rutaSecreto, randomBytes(32).toString("hex"), { mode: 0o600 });
const secreto = readFileSync(rutaSecreto, "utf8").trim();

if (!existsSync(rutaBase)) {
  console.log(`Creando la base de desarrollo en ${rutaBase}…`);
  try {
    await prepararBaseDeDesarrollo({ rutaBase, secreto, urlPublica: URL_DESARROLLO, contrasena: CONTRASENA_DESARROLLO });
  } catch (error) {
    // Una base a medias no sirve: se borra para que el próximo arranque la cree de nuevo
    for (const sufijo of ["", "-wal", "-shm"]) rmSync(`${rutaBase}${sufijo}`, { force: true });
    throw error;
  }
  console.log("Base de desarrollo lista. Cuentas en apps/api/src/cli/desarrollo.ts");
}

// La app arranca igual que en producción, con estas variables
process.env.DATABASE_PATH = rutaBase;
process.env.BETTER_AUTH_SECRET = secreto;
process.env.BETTER_AUTH_URL = URL_DESARROLLO;
// Fijo: es el puerto al que el proxy de Vite reenvía /api (vite.config.ts)
process.env.PORT = "3000";
// Solo este computador: la base de desarrollo tiene contraseñas conocidas
process.env.ESCUCHAR_EN = "127.0.0.1";
await import("../principal.ts");
