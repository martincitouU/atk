// Handlers MSW con el contrato de la API (docs/api.md): cada ruta llama a su
// función de estado.ts. Los cuerpos se validan con los esquemas de
// @atk/shared, como la API (un campo de más es un 400). Un ErrorNegocio
// sale como { error: { codigo, mensaje } } con el status de http/errores.ts;
// el login fallido, como Better Auth: { message, code }.

import {
  cambiosOperacion,
  entradaAbrirTurno,
  entradaCerrarTurno,
  entradaCliente,
  entradaGasto,
  entradaIngresoRetiro,
  entradaOperacion,
  entradaPublicacion,
  entradaReverso,
} from "@atk/shared";
import { http, HttpResponse, type HttpHandler, type PathParams } from "msw";
import { z } from "zod";
import { ErrorNegocio } from "../api/cliente.ts";
import { EntradaSesion, RUTAS } from "../api/esquemas.ts";
import * as m from "./estado.ts";

/** El status HTTP de un código de ErrorNegocio, como estadoDe (apps/api/src/http/errores.ts). */
export function estadoHttp(codigo: string): number {
  if (codigo === "SIN_SESION") return 401;
  if (codigo === "SIN_PERMISO" || codigo === "CUENTA_NO_VERIFICADA" || codigo.startsWith("NO_ES_PROPI")) return 403;
  if (codigo.endsWith("_NO_EXISTE")) return 404;
  return 409;
}

/** JSON con los bigint como string (por si alguno se escapa de las vistas de estado.ts). */
function responder(datos: unknown, status: number): HttpResponse<string> {
  if (status === 204) return new HttpResponse(null, { status });
  const cuerpo = JSON.stringify(datos, (_clave, valor: unknown) => (typeof valor === "bigint" ? valor.toString() : valor));
  return new HttpResponse(cuerpo, { status, headers: { "content-type": "application/json" } });
}

function fallar(error: unknown): HttpResponse<string> {
  if (error instanceof ErrorNegocio && error.codigo === "CREDENCIALES") {
    return responder({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }, 401);
  }
  if (error instanceof ErrorNegocio) {
    return responder({ error: { codigo: error.codigo, mensaje: error.message } }, estadoHttp(error.codigo));
  }
  if (error instanceof z.ZodError) {
    const detalles = error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message }));
    return responder({ error: { codigo: "DATOS_INVALIDOS", mensaje: "Revise los datos enviados", detalles } }, 400);
  }
  if (error instanceof SyntaxError) {
    return responder({ error: { codigo: "FST_ERR_CTP_INVALID_JSON_BODY", mensaje: "El cuerpo no es JSON válido" } }, 400);
  }
  throw error;
}

type Pedido = { request: Request; params: PathParams; url: URL };

/** Envuelve una acción de estado.ts: responde lo que devuelve, o el error con su status. */
const manejar =
  (accion: (p: Pedido) => unknown, status = 200) =>
  async ({ request, params }: { request: Request; params: PathParams }) => {
    try {
      return responder(await accion({ request, params, url: new URL(request.url) }), status);
    } catch (error) {
      return fallar(error);
    }
  };

/** El cuerpo tal como llegó (montos como texto), después de validarlo con el esquema de la API. */
async function cuerpo<E extends z.ZodType>(request: Request, esquema: E): Promise<z.input<E>> {
  const texto = await request.text();
  const datos: unknown = texto ? JSON.parse(texto) : {};
  esquema.parse(datos);
  return datos as z.input<E>;
}

const id = (params: PathParams) => Number(params.id);
const consulta = (url: URL, clave: string) => url.searchParams.get(clave) ?? undefined;

// Las rutas valen para cualquier origen: el navegador (mismo origen) y Node (http://localhost en los tests).
const en = (ruta: string) => `*${ruta}`;
const conId = (ruta: (id: number) => string) => en(ruta(-1).replace("-1", ":id"));

export function handlers(e: m.Estado): HttpHandler[] {
  return [
    // Sesión (Better Auth) y quién soy
    http.post(en(RUTAS.entrar), manejar(async ({ request }) => {
      const { email, password } = await cuerpo(request, EntradaSesion);
      return m.entrar(e, email, password);
    })),
    http.post(en(RUTAS.salir), manejar(() => {
      m.salir(e);
      return { success: true };
    })),
    http.get(en(RUTAS.yo), manejar(() => m.yo(e))),

    // Pizarra
    http.get(en(RUTAS.pizarra), manejar(() => m.pizarra(e))),
    http.post(en(RUTAS.cotizaciones), manejar(async ({ request }) => m.publicarCotizacion(e, await cuerpo(request, entradaPublicacion)), 201)),

    // Operaciones
    http.post(en(RUTAS.previsualizar), manejar(async ({ request }) => m.previsualizar(e, await cuerpo(request, entradaOperacion)))),
    http.get(en(RUTAS.operaciones), manejar(({ url }) => {
      const desde = consulta(url, "desde");
      return m.libroDelDia(e, desde === undefined ? undefined : m.fechaLocal(new Date(desde), "America/Coyhaique"));
    })),
    http.post(en(RUTAS.operaciones), manejar(async ({ request }) => m.crearOperacion(e, await cuerpo(request, entradaOperacion)), 201)),
    http.patch(conId(RUTAS.operacion), manejar(async ({ request, params }) => m.editarBorrador(e, id(params), await cuerpo(request, cambiosOperacion)))),
    http.delete(conId(RUTAS.operacion), manejar(({ params }) => m.eliminarBorrador(e, id(params)), 204)),
    http.post(conId(RUTAS.confirmar), manejar(({ params }) => m.confirmar(e, id(params)))),
    http.post(conId(RUTAS.reversar), manejar(async ({ request, params }) => m.reversar(e, id(params), (await cuerpo(request, entradaReverso)).motivo))),

    // Turnos y caja
    http.post(en(RUTAS.turnos), manejar(async ({ request }) => m.abrirTurno(e, (await cuerpo(request, entradaAbrirTurno)).cajaId), 201)),
    http.post(conId(RUTAS.cerrarTurno), manejar(async ({ request, params }) => m.cerrarTurno(e, id(params), (await cuerpo(request, entradaCerrarTurno)).conteo))),
    http.get(conId(RUTAS.arqueo), manejar(({ params }) => m.arqueoDeTurno(e, id(params)))),
    http.get(en(RUTAS.saldos), manejar(({ url }) => {
      const caja = consulta(url, "cajaId");
      return m.saldos(e, caja === undefined ? undefined : Number(caja));
    })),
    http.post(en(RUTAS.movimientos), manejar(async ({ request }) => m.moverDinero(e, await cuerpo(request, entradaIngresoRetiro)), 201)),

    // Gastos
    http.get(en(RUTAS.gastos), manejar(({ url }) => m.listarGastos(e, { desde: consulta(url, "desde"), hasta: consulta(url, "hasta") }))),
    http.post(en(RUTAS.gastos), manejar(async ({ request }) => m.registrarGasto(e, await cuerpo(request, entradaGasto)), 201)),
    http.post(conId(RUTAS.reversarGasto), manejar(async ({ request, params }) => m.reversarGasto(e, id(params), (await cuerpo(request, entradaReverso)).motivo))),

    // Clientes: la búsqueda exige q, como la API
    http.get(en(RUTAS.clientes), manejar(({ url }) => {
      const q = z.string().trim().min(1, "Escriba al menos un carácter").parse(consulta(url, "q") ?? "");
      return m.buscarClientes(e, q);
    })),
    http.post(en(RUTAS.clientes), manejar(async ({ request }) => m.guardarCliente(e, await cuerpo(request, entradaCliente)), 201)),
    http.get(conId(RUTAS.cliente), manejar(({ params }) => m.clientePorId(e, id(params)))),
    http.patch(conId(RUTAS.cliente), manejar(async ({ request, params }) => m.guardarCliente(e, await cuerpo(request, entradaCliente), id(params)))),

    // Resumen y catálogo (los parámetros y las categorías de gasto vienen en el catálogo)
    http.get(en(RUTAS.resumen), manejar(({ url }) => m.resumen(e, consulta(url, "fecha")))),
    http.get(en(RUTAS.catalogo), manejar(() => m.catalogo(e))),
  ];
}
