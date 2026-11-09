// Lo que las vistas leen de la API, con TanStack Query: guarda en memoria
// cada respuesta, evita pedir dos veces lo mismo y da estados de carga y
// error. Las vistas solo llaman a estos hooks.
//
// ESQUELETO (F1): cada consulta devuelve los datos de ejemplo. En F2 cada
// `queryFn` pasa a pedir su ruta de la API (anotada al lado) y las vistas
// no cambian.

import { useQuery } from "@tanstack/react-query";
import * as ejemplo from "../ejemplo/datos.ts";
import type { Divisa, EstadoOperacion } from "./tipos.ts";

/** Responde con un dato de ejemplo como si viniera de la red. */
const deEjemplo = <T,>(dato: T) => () => Promise.resolve(dato);

/** GET /api/catalogo: lo fijo de la casa. Se pide una vez por sesión. */
export function useCatalogo() {
  return useQuery({ queryKey: ["catalogo"], queryFn: deEjemplo(ejemplo.catalogo), staleTime: Infinity });
}

/** GET /api/pizarra */
export function usePizarra() {
  return useQuery({ queryKey: ["pizarra"], queryFn: deEjemplo(ejemplo.pizarra) });
}

export type FiltrosOperaciones = { estado?: EstadoOperacion; monedaCodigo?: string; desde?: string; hasta?: string; turnoId?: number };

/** GET /api/operaciones?estado=&monedaCodigo=&desde=&hasta=&turnoId= */
export function useOperaciones(filtros: FiltrosOperaciones = {}) {
  return useQuery({
    queryKey: ["operaciones", filtros],
    queryFn: deEjemplo(
      ejemplo.operaciones.filter(
        (o) =>
          (!filtros.estado || o.estado === filtros.estado) &&
          (!filtros.monedaCodigo || o.monedaCodigo === filtros.monedaCodigo) &&
          (filtros.turnoId === undefined || o.turnoId === filtros.turnoId),
      ),
    ),
  });
}

/** GET /api/operaciones/:id */
export function useOperacion(id: number) {
  return useQuery({ queryKey: ["operaciones", id], queryFn: deEjemplo(ejemplo.operaciones.find((o) => o.id === id) ?? null) });
}

/** POST /api/operaciones/previsualizar (se pide mientras el cajero escribe) */
export function usePrevisualizacion() {
  return useQuery({ queryKey: ["previsualizacion"], queryFn: deEjemplo(ejemplo.previsualizacion) });
}

/** GET /api/saldos?cajaId= */
export function useSaldos(cajaId?: number) {
  return useQuery({
    queryKey: ["saldos", cajaId],
    queryFn: deEjemplo(cajaId === undefined ? ejemplo.saldos : ejemplo.saldos.filter((s) => s.cajaId === cajaId)),
  });
}

/** GET /api/turnos/:id/movimientos */
export function useMovimientos(turnoId: number) {
  return useQuery({ queryKey: ["movimientos", turnoId], queryFn: deEjemplo(ejemplo.movimientos) });
}

/** GET /api/turnos/abiertos */
export function useTurnosAbiertos() {
  return useQuery({ queryKey: ["turnos-abiertos"], queryFn: deEjemplo(ejemplo.turnosAbiertos) });
}

/** GET /api/clientes?q= */
export function useClientes(q: string) {
  const texto = q.trim().toLowerCase();
  return useQuery({
    queryKey: ["clientes", texto],
    queryFn: deEjemplo(ejemplo.clientes.filter((c) => !texto || c.nombre.toLowerCase().includes(texto) || c.numeroDocumento.toLowerCase().includes(texto))),
  });
}

/** GET /api/clientes/:id */
export function useCliente(id: number) {
  return useQuery({ queryKey: ["clientes", id], queryFn: deEjemplo(ejemplo.clientes.find((c) => c.id === id) ?? null) });
}

/** GET /api/cuentas-cliente?estado= */
export function useCuentasCliente() {
  return useQuery({ queryKey: ["cuentas-cliente"], queryFn: deEjemplo(ejemplo.cuentasCliente) });
}

/** GET /api/gastos */
export function useGastos() {
  return useQuery({ queryKey: ["gastos"], queryFn: deEjemplo(ejemplo.gastos) });
}

/** GET /api/resumen?fecha= */
export function useResumen() {
  return useQuery({ queryKey: ["resumen"], queryFn: deEjemplo(ejemplo.resumen) });
}

/** GET /api/auditoria */
export function useAuditoria() {
  return useQuery({ queryKey: ["auditoria"], queryFn: deEjemplo(ejemplo.auditoria) });
}

/** GET /api/usuarios */
export function useUsuarios() {
  return useQuery({ queryKey: ["usuarios"], queryFn: deEjemplo(ejemplo.usuarios) });
}

/** GET /api/mi/operaciones */
export function useMisOperaciones() {
  return useQuery({ queryKey: ["mi", "operaciones"], queryFn: deEjemplo(ejemplo.misOperaciones) });
}

/** GET /api/mi/ficha */
export function useMiFicha() {
  return useQuery({ queryKey: ["mi", "ficha"], queryFn: deEjemplo(ejemplo.miFicha) });
}

// ---- Ayudas sobre el catálogo ----------------------------------------------

export type InfoMoneda = Pick<Divisa, "codigo" | "simbolo" | "decimales"> & { nombre: string };

/**
 * Monedas por código (las divisas y la moneda base), para formatear montos.
 * Devuelve undefined mientras el catálogo no llega.
 */
export function useMonedas(): Map<string, InfoMoneda> | undefined {
  const { data } = useCatalogo();
  if (!data) return undefined;
  const mapa = new Map<string, InfoMoneda>();
  if (data.monedaBase) mapa.set(data.monedaBase.codigo, { codigo: data.monedaBase.codigo, decimales: data.monedaBase.decimales, simbolo: "$", nombre: "Peso chileno" });
  for (const d of data.divisas) mapa.set(d.codigo, d);
  return mapa;
}

/** Ordena por moneda como la pizarra: primero la moneda base y después las divisas. */
export function useOrdenMonedas() {
  const { data } = useCatalogo();
  const orden = [data?.monedaBase?.codigo, ...(data?.divisas.map((d) => d.codigo) ?? [])];
  const posicion = (codigo: string) => (orden.includes(codigo) ? orden.indexOf(codigo) : orden.length);
  return <T extends { monedaCodigo: string }>(lista: readonly T[]) => [...lista].sort((a, b) => posicion(a.monedaCodigo) - posicion(b.monedaCodigo));
}

/** Nombre de una persona del personal por su id (ver datos de ejemplo). */
export function nombreUsuario(id: number | null): string {
  if (id === null) return "—";
  return ejemplo.nombresUsuarios[id] ?? `Usuario ${id}`;
}
