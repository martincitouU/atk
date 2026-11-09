// Servidor HTTP de la app: /health para la infra, la API bajo /api y, en
// producción, el front compilado en todo lo demás (http/front.ts).
//
// Las rutas son una capa delgada: validan la entrada con los esquemas de
// @atk/shared, toman el actor de la petición y llaman al servicio. Las
// reglas de negocio viven en servicios/, nunca aquí.

import limiteDeIntentos from "@fastify/rate-limit";
import Fastify from "fastify";
import type { Auth } from "./auth/auth.ts";
import type { Conexion } from "./db/conexion.ts";
import { casa } from "./db/esquema.ts";
import { exigirSesion, type ObtenerSesion } from "./http/acceso.ts";
import { registrarErrores, rutaNoExiste } from "./http/errores.ts";
import { servirFront } from "./http/front.ts";
import { aJson } from "./http/json.ts";
import { exigirMismoOrigen } from "./http/origen.ts";
import { rutasAuth } from "./rutas/auth.ts";
import { rutasCaja } from "./rutas/caja.ts";
import { rutaCasa, rutasCatalogo } from "./rutas/catalogo.ts";
import { rutasClientes } from "./rutas/clientes.ts";
import { rutasConsultas } from "./rutas/consultas.ts";
import { rutaRegistro, rutasCuentasCliente, rutasPortal } from "./rutas/cuentas.ts";
import { rutasGastos } from "./rutas/gastos.ts";
import { rutasCotizaciones } from "./rutas/cotizaciones.ts";
import { rutasOperaciones } from "./rutas/operaciones.ts";
import { rutasUsuarios } from "./rutas/usuarios.ts";
import { rutasYo } from "./rutas/yo.ts";
import { crearContexto } from "./servicios/contexto.ts";

export type OpcionesServidor = {
  /** Quién hace cada petición: personal, cliente o nadie (401). Ver http/acceso.ts. */
  obtenerSesion: ObtenerSesion;
  /** Dirección pública de la app: solo se aceptan escrituras con ese Origin. null → ninguna. */
  urlPublica: string | null;
  /** Login. Sin él, /api/auth responde 503 y nadie obtiene sesión. */
  auth?: Auth | null;
  /** Reloj inyectable para los tests */
  ahora?: () => Date;
  /** Carpeta del front compilado (apps/web/dist). Sin ella no se sirve el front (desarrollo y tests). */
  carpetaFront?: string | null;
};

export function construirServidor({ sqlite, db }: Conexion, opciones: OpcionesServidor) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Detrás de Nginx: la IP real del cliente viene en X-Forwarded-For
    trustProxy: true,
  });
  app.setReplySerializer((payload) => aJson(payload));
  registrarErrores(app);

  // Lo que no es de la API: el front, o un 404 en JSON si no hay front
  if (opciones.carpetaFront) servirFront(app, opciones.carpetaFront);
  else app.setNotFoundHandler(rutaNoExiste);

  // Contrato con la infra: el HEALTHCHECK de Docker y Ansible piden 200.
  // Si la base no responde, la consulta falla y Fastify contesta 500.
  app.get("/health", () => {
    const migraciones = sqlite.prepare("SELECT nombre FROM migracion ORDER BY nombre").pluck().all() as string[];
    const configurada = db.select({ id: casa.id }).from(casa).get() !== undefined;
    return { status: "ok", migraciones, configurada };
  });

  // Límite de intentos solo donde una ruta lo pide (el registro). El login
  // tiene el suyo, de Better Auth.
  app.register(limiteDeIntentos, { global: false });

  const ctx = crearContexto(db, opciones.ahora);
  app.register(
    async (api) => {
      // Una ruta de la API que no existe siempre responde JSON, nunca el front
      api.setNotFoundHandler(rutaNoExiste);
      exigirMismoOrigen(api, opciones.urlPublica);

      // Sin sesión: el nombre de la casa y sus monedas (lo que muestra la
      // pizarra del local). Responde aunque el login no esté configurado.
      rutaCasa(api, ctx);

      // Login y registro de clientes: tampoco exigen sesión
      const { auth, urlPublica } = opciones;
      if (auth && urlPublica) {
        rutasAuth(api, auth, urlPublica);
        rutaRegistro(api, ctx, auth);
      } else {
        api.all("/auth/*", (_request, reply) =>
          reply.code(503).send({ error: { codigo: "LOGIN_NO_CONFIGURADO", mensaje: "El inicio de sesión no está disponible" } }),
        );
      }

      // Quién soy: cualquier sesión
      api.register(async (conSesion) => {
        exigirSesion(conSesion, opciones.obtenerSesion);
        rutasYo(conSesion, ctx);
      });

      // Trabajo de la casa de cambio: solo el personal
      api.register(async (personal) => {
        exigirSesion(personal, opciones.obtenerSesion, "personal");
        rutasCatalogo(personal, ctx);
        rutasCotizaciones(personal, ctx);
        rutasOperaciones(personal, ctx);
        rutasCaja(personal, ctx);
        rutasClientes(personal, ctx);
        rutasGastos(personal, ctx);
        rutasConsultas(personal, ctx);
        rutasCuentasCliente(personal, ctx);
        if (auth) rutasUsuarios(personal, ctx, auth);
      });

      // Portal de clientes: solo lectura de lo propio
      api.register(async (clientes) => {
        exigirSesion(clientes, opciones.obtenerSesion, "cliente");
        rutasPortal(clientes, ctx);
      });
    },
    { prefix: "/api" },
  );

  return app;
}
