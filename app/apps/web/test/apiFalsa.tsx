// Una API simulada para los tests del front: reemplaza fetch y responde
// según el método y la ruta, con las formas de docs/api.md. Cada test parte
// de rutasDe(sesion) y cambia lo que necesita.

import { cleanup, render } from "@testing-library/react";
import { RouterProvider } from "react-router";
import { afterEach, vi } from "vitest";
import type { CasaPublica, Catalogo, FichaCliente, FilaPizarra, OperacionListada, Persona, Resumen, Turno, Yo } from "../src/api/tipos.ts";
import { crearRutasDePrueba } from "../src/rutas.tsx";
import { ProveedorSesion } from "../src/sesion/Sesion.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Lo que recibió la API simulada. */
export type Pedido = { metodo: string; ruta: string; url: URL; cuerpo: unknown };

/** Un valor (responde 200 con él), una Response armada, o una función del pedido. */
export type Manejador = unknown | ((pedido: Pedido) => unknown);

export const respuesta = (estado: number, cuerpo?: unknown) =>
  new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });

export const error = (estado: number, codigo: string, mensaje: string, detalles?: { campo: string; mensaje: string }[]) =>
  respuesta(estado, { error: { codigo, mensaje, ...(detalles ? { detalles } : {}) } });

export const sinSesion = () => error(401, "SIN_SESION", "Inicie sesión para continuar");

/** Reemplaza fetch por la API simulada. Devuelve los pedidos que va recibiendo. */
export function usarApi(rutas: Record<string, Manejador>) {
  const pedidos: Pedido[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (entrada: string, opciones: RequestInit = {}) => {
      const metodo = opciones.method ?? "GET";
      const url = new URL(entrada, "http://localhost");
      const cuerpo: unknown = typeof opciones.body === "string" ? JSON.parse(opciones.body) : undefined;
      const pedido = { metodo, ruta: url.pathname + url.search, url, cuerpo };
      pedidos.push(pedido);

      const manejador = rutas[`${metodo} ${url.pathname}`];
      if (manejador === undefined) return error(404, "RUTA_NO_EXISTE", `No existe ${metodo} ${url.pathname}`);
      // Una promesa rechazada simula una falla de red: fetch también se rechaza
      const resultado: unknown = await (typeof manejador === "function" ? (manejador as (p: Pedido) => unknown)(pedido) : manejador);
      return resultado instanceof Response ? resultado : respuesta(200, resultado);
    }),
  );
  return {
    pedidos,
    /** Los pedidos a una ruta (sin los parámetros) */
    a: (metodoYRuta: string) => pedidos.filter((p) => `${p.metodo} ${p.url.pathname}` === metodoYRuta),
  };
}

/** La app completa en memoria, partiendo de `ruta`. */
export function abrir(ruta: string) {
  render(
    <ProveedorSesion reintentar={false}>
      <RouterProvider router={crearRutasDePrueba(ruta)} />
    </ProveedorSesion>,
  );
}

// ---- Datos con la forma real de la API ---------------------------------------

export const CASA: CasaPublica = {
  nombre: "Cambios Demo",
  monedaBase: { codigo: "CLP", nombre: "Peso chileno", simbolo: "$", decimales: 0 },
  divisas: [
    { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", decimales: 2, decimalesTasa: 2, activa: true },
    { codigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, activa: true },
  ],
};

const TURNO: Turno = {
  id: 1,
  cajaId: 1,
  usuarioId: 3,
  estado: "ABIERTO",
  abiertoEn: "2026-11-09T12:00:00.000Z",
  cerradoEn: null,
  cerradoPor: null,
  observacion: null,
};

const personal = (id: number, nombre: string, rol: "ADMIN" | "SUPERVISOR" | "CAJERO", turno: Turno | null = null): Yo => ({
  tipo: "personal",
  usuario: { id, nombre, email: `${nombre.toLowerCase()}@demo.cl`, rol, sucursalId: null },
  turnoAbierto: turno,
});

const cliente = (nombre: string, estado: "PENDIENTE" | "VERIFICADA"): Yo => ({
  tipo: "cliente",
  cuenta: { nombre, rut: "12345678-5", estado, motivoRechazo: null, creadaEn: "2026-11-09T12:00:00.000Z" },
});

export const SESIONES = {
  admin: personal(1, "Administrador", "ADMIN"),
  supervisor: personal(2, "Supervisor", "SUPERVISOR"),
  cajero: personal(3, "Cajero", "CAJERO", TURNO),
  clientePendiente: cliente("Ana Pérez", "PENDIENTE"),
  clienteVerificado: cliente("Cliente de Prueba", "VERIFICADA"),
};

export type NombreSesion = keyof typeof SESIONES;

export const PERSONAL: Persona[] = [
  { id: 1, nombre: "Administrador" },
  { id: 2, nombre: "Supervisor" },
  { id: 3, nombre: "Cajero" },
];

export const CATALOGO: Catalogo = {
  casa: {
    id: 1,
    rut: "76123456-0",
    razonSocial: "Casa de Cambio Demo SpA",
    nombreFantasia: "Cambios Demo",
    monedaBase: "CLP",
    creadaEn: "2026-11-09T12:00:00.000Z",
  },
  monedaBase: { codigo: "CLP", decimales: 0 },
  divisas: [
    { codigo: "USD", nombre: "Dólar estadounidense", simbolo: "US$", decimales: 2, decimalesTasa: 2, montoMinimo: "100", ordenPizarra: 1 },
    { codigo: "ARS", nombre: "Peso argentino", simbolo: "AR$", decimales: 2, decimalesTasa: 4, montoMinimo: "100000", ordenPizarra: 2 },
  ],
  sucursales: [{ id: 1, nombre: "Casa Matriz", direccion: null, comuna: "Coyhaique", activa: true }],
  cajas: [{ id: 1, sucursalId: 1, nombre: "Caja 1", activa: true }],
  categoriasGasto: [{ id: 6, nombre: "Insumos y oficina", activa: true }],
  categoriasCliente: [],
  parametros: {
    zonaHoraria: "America/Coyhaique",
    umbralFichaClienteUsd: "5000",
    umbralRoeUsd: "10000",
    permitirSaldoNegativo: false,
    vigenciaCotizacionMinutos: 720,
    reversoRequiereSupervisor: true,
    desviacionMaximaPreferencialPctE6: "5000000",
    folioObligatorioAlConfirmar: true,
    sesionInactividadMinutos: 15,
  },
};

export const PIZARRA: FilaPizarra[] = [
  {
    monedaCodigo: "USD",
    nombre: "Dólar estadounidense",
    simbolo: "US$",
    decimales: 2,
    decimalesTasa: 2,
    montoMinimo: "100",
    compraE6: "925900000",
    ventaE6: "954100000",
    referenciaE6: "940000000",
    tipoMargen: "PORCENTAJE",
    margenCompraE6: "1500000",
    margenVentaE6: "1500000",
    vigenteDesde: "2026-11-09T12:00:00.000Z",
    vencida: false,
  },
];

/** Una operación confirmada: la cambia cada test con lo que necesita. */
export function operacion(cambios: Partial<OperacionListada> = {}): OperacionListada {
  return {
    id: 5,
    cajaId: 1,
    turnoId: 1,
    usuarioId: 3,
    clienteId: null,
    tipo: "VENTA",
    monedaCodigo: "USD",
    montoDivisa: "30000",
    medioPago: "EFECTIVO",
    tasaAplicadaE6: "954100000",
    montoBase: "286230",
    tasaReferenciaE6: "940000000",
    cotizacionId: 1,
    reglaSpreadId: 1,
    esPreferencial: false,
    categoriaClienteId: null,
    autorizadoPor: null,
    autorizadoEn: null,
    margenBruto: "4230",
    margenRealizado: null,
    equivalenteUsd: "30000",
    proposito: null,
    tipoDte: 41,
    folioDte: 1005,
    estado: "CONFIRMADA",
    confirmadaPor: 3,
    confirmadaEn: "2026-11-09T12:30:00.000Z",
    reversadaPor: null,
    reversadaEn: null,
    motivoReverso: null,
    origen: "SISTEMA",
    loteMigracionId: null,
    registroDiferido: false,
    realizadaEn: "2026-11-09T12:30:00.000Z",
    registradaEn: "2026-11-09T12:29:00.000Z",
    observacion: null,
    clienteNombre: null,
    ...cambios,
  };
}

export const FICHAS: FichaCliente[] = [
  {
    id: 2,
    tipoDocumento: "RUT",
    numeroDocumento: "12345678-5",
    nombre: "Cliente Incompleto de Prueba",
    nacionalidad: "CL",
    oficio: null,
    paisResidencia: null,
    domicilio: null,
    telefono: null,
    email: null,
    relacionPermanente: false,
    categoriaId: null,
    creadoEn: "2026-11-09T12:00:00.000Z",
    actualizadoEn: "2026-11-09T12:00:00.000Z",
    faltantesUaf: ["domicilio"],
  },
];

export const RESUMEN: Resumen = {
  fecha: "2026-11-09",
  zonaHoraria: "America/Coyhaique",
  saldos: { porCaja: [], totales: [{ monedaCodigo: "CLP", decimales: 0, saldo: "2912095" }] },
  operaciones: { confirmadas: 8, reversadas: 1, porMoneda: [], ultimas: [] },
  margen: { bruto: "85465", realizado: "68488" },
  gastos: { cantidad: 1, total: "12500" },
  borradoresPendientes: 1,
  turnosAbiertos: [],
};

/**
 * Las rutas de lectura con una sesión (null = sin sesión: /api/yo responde
 * 401). Lo demás de la API responde 404, como una ruta que no existe.
 */
export function rutasDe(sesion: NombreSesion | null): Record<string, Manejador> {
  return {
    "GET /api/yo": sesion ? SESIONES[sesion] : sinSesion(),
    "GET /api/casa": CASA,
    "GET /api/catalogo": CATALOGO,
    "GET /api/pizarra": PIZARRA,
    "GET /api/personal": PERSONAL,
    "GET /api/operaciones": [],
    "GET /api/resumen": RESUMEN,
    "GET /api/saldos": [],
    "GET /api/turnos/abiertos": [],
    "GET /api/turnos/1/movimientos": [],
    "GET /api/cuentas-cliente": [],
    "GET /api/gastos": [],
    "GET /api/usuarios": [],
    "GET /api/auditoria": [],
    "GET /api/mi/operaciones": [],
    "GET /api/mi/ficha": {
      nombre: "Cliente de Prueba",
      tipoDocumento: "RUT",
      numeroDocumento: "12345678-5",
      nacionalidad: "CL",
      oficio: null,
      paisResidencia: null,
      domicilio: null,
      telefono: null,
      email: null,
    },
  };
}
