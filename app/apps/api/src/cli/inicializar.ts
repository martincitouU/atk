// Comando de configuración inicial. Se corre UNA vez, dentro del contenedor:
//
//   sudo docker compose -f /srv/atk/compose.yaml exec app node apps/api/src/cli/inicializar.ts
//
// Pregunta los datos de la casa y del primer administrador. La contraseña
// se escribe sin mostrarse y no queda en archivos ni en el historial.

import { entradaInicializacion } from "@atk/shared";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { ZodError } from "zod";
import { crearAuth } from "../auth/auth.ts";
import { abrirBase } from "../db/conexion.ts";
import { migrar } from "../db/migrar.ts";
import { crearContexto, ErrorNegocio } from "../servicios/contexto.ts";
import { estaInicializada, inicializar } from "../servicios/inicializacion.ts";
import { leerParametros } from "../servicios/parametros.ts";

function salir(mensaje: string): never {
  console.error(`\n✖ ${mensaje}`);
  process.exit(1);
}

const { DATABASE_PATH, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;
if (!DATABASE_PATH || !BETTER_AUTH_SECRET || !BETTER_AUTH_URL) {
  salir("Faltan DATABASE_PATH, BETTER_AUTH_SECRET o BETTER_AUTH_URL: corra el comando dentro del contenedor de la app");
}
if (!process.stdin.isTTY) salir("Este comando necesita una terminal interactiva (docker compose exec, no -T)");

// Una sola interfaz para todas las preguntas (si se pega texto con varias
// líneas, ninguna se pierde). Para las contraseñas se silencia la salida:
// lo que se escribe no aparece en pantalla.
let silenciar = false;
const salida = new Writable({
  write(trozo, codificacion, listo) {
    if (!silenciar) process.stdout.write(trozo, codificacion);
    listo();
  },
});
const rl = createInterface({ input: process.stdin, output: salida, terminal: true });
rl.on("SIGINT", () => salir("Cancelado: no se creó nada"));

/** Pregunta con un valor por defecto entre corchetes. */
async function preguntar(texto: string, porDefecto = ""): Promise<string> {
  const respuesta = (await rl.question(porDefecto ? `${texto} [${porDefecto}]: ` : `${texto}: `)).trim();
  return respuesta || porDefecto;
}

/** Lee sin mostrar lo que se escribe (contraseñas). */
async function preguntarOculto(texto: string): Promise<string> {
  process.stdout.write(`${texto}: `);
  silenciar = true;
  const respuesta = await rl.question("");
  silenciar = false;
  process.stdout.write("\n");
  return respuesta;
}

const conexion = abrirBase(DATABASE_PATH);
migrar(conexion.sqlite);
const ctx = crearContexto(conexion.db);
if (estaInicializada(ctx)) salir("La casa de cambio ya está configurada. Este comando solo se usa una vez.");

console.log("Configuración inicial de ATK\n");
console.log("— Casa de cambio");
const casa = {
  rut: await preguntar("RUT de la empresa"),
  razonSocial: await preguntar("Razón social"),
  nombreFantasia: (await preguntar("Nombre de fantasía (opcional)")) || null,
};
const divisas = (await preguntar("Divisas que opera, en orden de pizarra", "USD,EUR,BRL,ARS"))
  .split(",")
  .map((d) => d.trim().toUpperCase())
  .filter(Boolean);
console.log("\n— Sucursal");
const sucursal = {
  nombre: await preguntar("Nombre", "Casa Matriz"),
  direccion: (await preguntar("Dirección (opcional)")) || null,
  comuna: await preguntar("Comuna", "Coyhaique"),
};
const cajas = (await preguntar("Cajas, separadas por coma", "Caja 1"))
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);
console.log("\n— Primer administrador");
const admin = {
  nombre: await preguntar("Nombre"),
  rut: await preguntar("RUT"),
  email: await preguntar("Correo (con él inicia sesión)"),
  contrasena: await preguntarOculto("Contraseña (mínimo 10 caracteres)"),
};
if ((await preguntarOculto("Repita la contraseña")) !== admin.contrasena) salir("Las contraseñas no coinciden");

let datos;
try {
  datos = entradaInicializacion.parse({ casa, divisas, sucursal, cajas, admin });
} catch (error) {
  if (error instanceof ZodError) salir(error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  "));
  throw error;
}

console.log(`
Se creará:
  Casa:      ${datos.casa.razonSocial} (${datos.casa.rut})
  Divisas:   ${datos.divisas.join(", ")}
  Sucursal:  ${datos.sucursal.nombre}, ${datos.sucursal.comuna ?? ""}
  Cajas:     ${datos.cajas.join(", ")}
  Admin:     ${datos.admin.nombre} <${datos.admin.email}>`);
if ((await preguntar("\n¿Confirmar? (s/n)", "n")).toLowerCase() !== "s") salir("Cancelado: no se creó nada");

const auth = crearAuth({
  rutaBase: DATABASE_PATH,
  secreto: BETTER_AUTH_SECRET,
  urlPublica: BETTER_AUTH_URL,
  inactividadMinutos: leerParametros(conexion.db).sesionInactividadMinutos,
});
try {
  await inicializar(ctx, auth, datos);
} catch (error) {
  if (error instanceof ErrorNegocio) salir(error.message);
  throw error;
}
rl.close();
console.log(`\n✔ Listo. Inicie sesión en ${BETTER_AUTH_URL} con ${datos.admin.email} y publique los tipos de cambio.`);
process.exit(0);
