// La API para desarrollar el front (npm run dev): una base local con la
// semilla de ejemplo y cuentas para iniciar sesión con cada rol.
//
// SOLO DESARROLLO. La semilla nunca va a producción: db/semillas ni siquiera
// entra a la imagen (.dockerignore), y este comando se niega a correr con
// NODE_ENV=production.
//
// La primera vez crea app/.dev/atk.db y app/.dev/secreto (los dos fuera de
// git). Para partir de cero, se borra app/.dev.
//
// Cuentas de prueba (todas con CONTRASENA_DESARROLLO):
//   admin@demo.cl, supervisor@demo.cl, cajero@demo.cl, cajera2@demo.cl
//   ana@demo.cl      cliente del portal, pendiente de verificación
//   cliente@demo.cl  cliente del portal, verificado

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { crearAuth, crearCuenta } from "../auth/auth.ts";
import { abrirBase } from "../db/conexion.ts";
import { usuario } from "../db/esquema.ts";
import { cargarSemilla, migrar } from "../db/migrar.ts";
import { crearContexto } from "../servicios/contexto.ts";
import { registrarCliente, verificarCuenta } from "../servicios/cuentas.ts";
import { leerParametros } from "../servicios/parametros.ts";

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

if (!existsSync(rutaBase)) await prepararBase();

// La app arranca igual que en producción, con estas variables
process.env.DATABASE_PATH = rutaBase;
process.env.BETTER_AUTH_SECRET = secreto;
process.env.BETTER_AUTH_URL = URL_DESARROLLO;
// Fijo: es el puerto al que el proxy de Vite reenvía /api (vite.config.ts)
process.env.PORT = "3000";
// Solo este computador: la base de desarrollo tiene contraseñas conocidas
process.env.ESCUCHAR_EN = "127.0.0.1";
await import("../principal.ts");

async function prepararBase() {
  console.log(`Creando la base de desarrollo en ${rutaBase}…`);
  const { sqlite, db } = abrirBase(rutaBase);
  migrar(sqlite);
  cargarSemilla(sqlite, "ejemplo");

  const auth = crearAuth({
    rutaBase,
    secreto,
    urlPublica: URL_DESARROLLO,
    inactividadMinutos: leerParametros(db).sesionInactividadMinutos,
    limitarIntentos: false,
  });

  // El personal de la semilla, con cuenta para iniciar sesión
  for (const persona of db.select().from(usuario).all()) {
    const authUserId = await crearCuenta(auth, { email: persona.email, nombre: persona.nombre, contrasena: CONTRASENA_DESARROLLO });
    db.update(usuario).set({ authUserId }).where(eq(usuario.id, persona.id)).run();
  }

  // Dos clientes del portal: uno pendiente y otro ya verificado por el cajero
  const ctx = crearContexto(db);
  await registrarCliente(ctx, auth, { nombre: "Ana Pérez", rut: "15555567-K", email: "ana@demo.cl", contrasena: CONTRASENA_DESARROLLO });
  const verificada = await registrarCliente(ctx, auth, {
    nombre: "Cliente Incompleto de Prueba",
    rut: "12345678-5", // el RUT de su ficha en la semilla
    email: "cliente@demo.cl",
    contrasena: CONTRASENA_DESARROLLO,
  });
  verificarCuenta(ctx, { id: 3, rol: "CAJERO" }, verificada.id);

  sqlite.close();
  console.log("Base de desarrollo lista. Cuentas en apps/api/src/cli/desarrollo.ts");
}
