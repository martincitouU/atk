// Servidor HTTP de la app: /health para la infra y la API bajo /api.
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
import { registrarErrores } from "./http/errores.ts";
import { aJson } from "./http/json.ts";
import { exigirMismoOrigen } from "./http/origen.ts";
import { rutasAuth } from "./rutas/auth.ts";
import { rutasCaja } from "./rutas/caja.ts";
import { rutasCatalogo } from "./rutas/catalogo.ts";
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

  // Límite de intentos solo donde una ruta lo pide (el registro). El login
  // tiene el suyo, de Better Auth.
  app.register(limiteDeIntentos, { global: false });

  const ctx = crearContexto(db, opciones.ahora);
  app.register(
    async (api) => {
      exigirMismoOrigen(api, opciones.urlPublica);

      // Login y registro de clientes: lo único de /api que no exige sesión
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
