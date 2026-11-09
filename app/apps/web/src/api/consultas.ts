// Lo que las vistas leen de la API, con TanStack Query (api/cache.ts):
// cada hook pide su ruta, guarda la respuesta y da estados de carga y error.
// Las vistas solo llaman a estos hooks; las rutas y sus parámetros están
// en docs/api.md.
//
// Las claves empiezan por el tema ("operaciones", "clientes"...): al guardar
// algo (F3) se invalida el tema completo y todo lo que lo muestra se
// vuelve a pedir.

import { useQuery } from "@tanstack/react-query";
import { diaSiguiente, inicioDelDia } from "../lib/fechas.ts";
import { obtener } from "./cliente.ts";
import type {
  AccionAuditoria,
  CasaPublica,
  Catalogo,
  CuentaCliente,
  Dia,
  EstadoCuentaCliente,
  EstadoGasto,
  EstadoOperacion,
  FichaCliente,
  FichaDeCuenta,
  FilaPizarra,
  Gasto,
  Moneda,
  MovimientoCaja,
  OperacionDeCliente,
  OperacionListada,
  Persona,
  RegistroAuditoria,
  Resumen,
  Saldo,
  TurnoAbierto,
  Usuario,
} from "./tipos.ts";

/** Un id de la URL que no es un número positivo no se pide: no existe. */
const esId = (id: number) => Number.isInteger(id) && id > 0;

/** Un día del filtro, como instante de la casa. "Hasta" incluye ese día completo. */
const desdeElDia = (dia?: Dia) => (dia ? inicioDelDia(dia) : undefined);
const hastaElDia = (dia?: Dia) => (dia ? inicioDelDia(diaSiguiente(dia)) : undefined);

// ---- Lo público y lo fijo ---------------------------------------------------

/** GET /api/casa: nombre y monedas. Sin sesión: sirve en el login y en el portal. */
export function useCasa() {
  return useQuery({ queryKey: ["casa"], queryFn: () => obtener<CasaPublica>("/api/casa"), staleTime: Infinity });
}

/** GET /api/catalogo: cajas, categorías, parámetros... Una vez por sesión. */
export function useCatalogo() {
  return useQuery({ queryKey: ["catalogo"], queryFn: () => obtener<Catalogo>("/api/catalogo"), staleTime: Infinity });
}

/** GET /api/pizarra */
export function usePizarra() {
  return useQuery({ queryKey: ["pizarra"], queryFn: () => obtener<FilaPizarra[]>("/api/pizarra") });
}

/** GET /api/personal: para mostrar nombres donde la API entrega ids. */
function usePersonas() {
  return useQuery({ queryKey: ["personal"], queryFn: () => obtener<Persona[]>("/api/personal"), staleTime: 5 * 60_000 });
}

// ---- Operaciones -------------------------------------------------------------

export type FiltrosOperaciones = {
  estado?: EstadoOperacion;
  monedaCodigo?: string;
  /** Días de la casa, inclusive */
  desde?: Dia;
  hasta?: Dia;
  turnoId?: number;
  limite?: number;
};

/** GET /api/operaciones, de la más reciente a la más antigua */
export function useOperaciones({ estado, monedaCodigo, desde, hasta, turnoId, limite }: FiltrosOperaciones = {}) {
  const parametros = { estado, monedaCodigo, turnoId, limite, desde: desdeElDia(desde), hasta: hastaElDia(hasta) };
  return useQuery({
    queryKey: ["operaciones", "lista", parametros],
    queryFn: () => obtener<OperacionListada[]>("/api/operaciones", parametros),
  });
}

/** GET /api/operaciones/:id */
export function useOperacion(id: number) {
  return useQuery({
    queryKey: ["operaciones", id],
    queryFn: () => obtener<OperacionListada>(`/api/operaciones/${id}`),
    enabled: esId(id),
  });
}

// ---- Turnos y caja ---------------------------------------------------------------

/** GET /api/saldos: de una caja o de todas */
export function useSaldos(cajaId?: number) {
  return useQuery({ queryKey: ["saldos", cajaId ?? "todas"], queryFn: () => obtener<Saldo[]>("/api/saldos", { cajaId }) });
}

/** GET /api/turnos/:id/movimientos: el libro de caja del turno */
export function useMovimientos(turnoId: number) {
  return useQuery({
    queryKey: ["movimientos", turnoId],
    queryFn: () => obtener<MovimientoCaja[]>(`/api/turnos/${turnoId}/movimientos`),
  });
}

/** GET /api/turnos/abiertos */
export function useTurnosAbiertos() {
  return useQuery({ queryKey: ["turnos", "abiertos"], queryFn: () => obtener<TurnoAbierto[]>("/api/turnos/abiertos") });
}

// ---- Clientes --------------------------------------------------------------------

/** Letras mínimas para buscar: con menos, la lista sería casi todo el registro. */
export const MINIMO_BUSQUEDA = 2;

/** GET /api/clientes?q=: busca en nombre y documento */
export function useClientes(texto: string) {
  const q = texto.trim();
  return useQuery({
    queryKey: ["clientes", "busqueda", q.toLowerCase()],
    queryFn: () => obtener<FichaCliente[]>("/api/clientes", { q }),
    enabled: q.length >= MINIMO_BUSQUEDA,
    // Mientras se escribe, la lista anterior se queda hasta que llega la nueva
    placeholderData: (anterior) => anterior,
  });
}

/** GET /api/clientes/:id */
export function useCliente(id: number) {
  return useQuery({ queryKey: ["clientes", id], queryFn: () => obtener<FichaCliente>(`/api/clientes/${id}`), enabled: esId(id) });
}

/** GET /api/cuentas-cliente?estado= (sin estado: todas) */
export function useCuentasCliente(estado?: EstadoCuentaCliente) {
  return useQuery({
    queryKey: ["cuentas-cliente", estado ?? "todas"],
    queryFn: () => obtener<CuentaCliente[]>("/api/cuentas-cliente", { estado }),
  });
}

// ---- Gastos y consultas -----------------------------------------------------------

export type FiltrosGastos = { desde?: Dia; hasta?: Dia; estado?: EstadoGasto };

/** GET /api/gastos (las fechas son días de la casa, inclusive) */
export function useGastos(filtros: FiltrosGastos = {}) {
  return useQuery({ queryKey: ["gastos", filtros], queryFn: () => obtener<Gasto[]>("/api/gastos", filtros) });
}

/** GET /api/resumen?fecha= (hoy si no se indica) */
export function useResumen(fecha?: Dia) {
  return useQuery({ queryKey: ["resumen", fecha ?? "hoy"], queryFn: () => obtener<Resumen>("/api/resumen", { fecha }) });
}

export type FiltrosAuditoria = { tabla?: string; accion?: AccionAuditoria; desde?: Dia; hasta?: Dia };

/** GET /api/auditoria: lo más reciente primero */
export function useAuditoria({ tabla, accion, desde, hasta }: FiltrosAuditoria = {}) {
  const parametros = { tabla, accion, desde: desdeElDia(desde), hasta: hastaElDia(hasta) };
  return useQuery({
    queryKey: ["auditoria", parametros],
    queryFn: () => obtener<RegistroAuditoria[]>("/api/auditoria", parametros),
  });
}

/** GET /api/usuarios (solo admin) */
export function useUsuarios() {
  return useQuery({ queryKey: ["usuarios"], queryFn: () => obtener<Usuario[]>("/api/usuarios") });
}

// ---- Portal de clientes ------------------------------------------------------------

/** GET /api/mi/operaciones. Solo con la cuenta verificada: antes, la API responde 403. */
export function useMisOperaciones(verificada: boolean) {
  return useQuery({
    queryKey: ["mi", "operaciones"],
    queryFn: () => obtener<OperacionDeCliente[]>("/api/mi/operaciones"),
    enabled: verificada,
  });
}

/** GET /api/mi/ficha. Solo con la cuenta verificada. */
export function useMiFicha(verificada: boolean) {
  return useQuery({ queryKey: ["mi", "ficha"], queryFn: () => obtener<FichaDeCuenta>("/api/mi/ficha"), enabled: verificada });
}

// ---- Ayudas para mostrar ---------------------------------------------------------

export type InfoMoneda = Moneda & { decimalesTasa?: number };

/**
 * Monedas por código (la base y todas las divisas), para formatear montos y
 * tasas. Undefined mientras no llega /api/casa.
 */
export function useMonedas(): Map<string, InfoMoneda> | undefined {
  const { data } = useCasa();
  if (!data) return undefined;
  const mapa = new Map<string, InfoMoneda>();
  if (data.monedaBase) mapa.set(data.monedaBase.codigo, data.monedaBase);
  for (const divisa of data.divisas) mapa.set(divisa.codigo, divisa);
  return mapa;
}

/** Decimales con que se muestra la tasa de una divisa (2 si no se sabe aún). */
export function useDecimalesTasa() {
  const monedas = useMonedas();
  return (codigo: string) => monedas?.get(codigo)?.decimalesTasa ?? 2;
}

/** Código de la moneda base (los "pesos" de cada operación). */
export function useMonedaBase(): string {
  return useCasa().data?.monedaBase?.codigo ?? "CLP";
}

/** Ordena por moneda como la pizarra: primero la moneda base y después las divisas. */
export function useOrdenMonedas() {
  const { data } = useCasa();
  const orden = [data?.monedaBase?.codigo, ...(data?.divisas.map((d) => d.codigo) ?? [])];
  const posicion = (codigo: string) => (orden.includes(codigo) ? orden.indexOf(codigo) : orden.length);
  return <T extends { monedaCodigo: string }>(lista: readonly T[]) => [...lista].sort((a, b) => posicion(a.monedaCodigo) - posicion(b.monedaCodigo));
}

/** Nombre de una persona del personal por su id ("…" mientras llega la lista). */
export function useNombres() {
  const { data } = usePersonas();
  const porId = new Map(data?.map((p) => [p.id, p.nombre]));
  return (id: number | null): string => {
    if (id === null) return "—";
    if (!data) return "…";
    return porId.get(id) ?? `Usuario ${id}`;
  };
}
