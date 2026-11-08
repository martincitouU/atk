// Un hook de TanStack Query por ruta del contrato. Las consultas usan claves
// con prefijo (["libro", fecha], ["resumen", fecha]…) para que cada mutación
// invalide solo lo que cambió.

import { keepPreviousData, skipToken, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { z } from "zod";
import { fechaEn, ZONA_CASA } from "../comun.ts";
import { enviar, ErrorNegocio, pedir } from "./cliente.ts";
import {
  Catalogo,
  Cierre,
  Cliente,
  Cotizacion,
  CuentaCliente,
  FilaArqueo,
  FilaPizarra,
  Gasto,
  Movimiento,
  Operacion,
  Resumen,
  RUTAS,
  SaldoCaja,
  Turno,
  Vista,
  Yo,
  type CambiosOperacion,
  type EntradaCliente,
  type EntradaCotizacion,
  type EntradaGasto,
  type EntradaMovimiento,
  type EntradaOperacion,
  type EntradaSesion,
  type Sesion,
} from "./esquemas.ts";

const CINCO_MINUTOS = 5 * 60_000;

/** `ruta?clave=valor&…`, sin las claves vacías. */
function conConsulta(ruta: string, consulta: Record<string, string | undefined>): string {
  const params = new URLSearchParams(Object.entries(consulta).filter((par): par is [string, string] => Boolean(par[1])));
  const texto = params.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

/** Invalida varias claves y espera los refetch: así la mutación termina con la pantalla al día. */
function useInvalidar() {
  const qc = useQueryClient();
  return (...claves: QueryKey[]) => Promise.all(claves.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

// ---------------------------------------------------------------------------
// Consultas

/**
 * Quién está y su turno (GET /api/yo). Sin sesión lanza ErrorNegocio
 * SIN_SESION (401): no se reintenta. Una cuenta de cliente no entra a las
 * pantallas del personal.
 */
export const useSesion = () =>
  useQuery({
    queryKey: ["sesion"],
    queryFn: async ({ signal }): Promise<Sesion> => {
      const yo = await pedir(RUTAS.yo, Yo, { signal });
      if (yo.tipo === "cliente") {
        throw new ErrorNegocio("SOLO_PERSONAL", "Esta es la ventanilla del personal. El portal de clientes todavía no está disponible aquí.");
      }
      return { usuario: yo.usuario, turno: yo.turnoAbierto };
    },
    retry: false,
  });

/** La pizarra; se refresca sola cada minuto (vencimientos y cambios de otra caja). */
export const usePizarra = () =>
  useQuery({
    queryKey: ["pizarra"],
    queryFn: ({ signal }) => pedir(RUTAS.pizarra, z.array(FilaPizarra), { signal }),
    refetchInterval: 60_000,
  });

/**
 * El día de la casa como rango de instantes (la API filtra por desde/hasta):
 * "2026-11-08" → ["2026-11-08T00:00:00-03:00", "2026-11-09T00:00:00-03:00"].
 * ponytail: usa el desfase del mediodía; en un día con cambio de hora se corre una hora (Aysén no cambia la hora).
 */
export function rangoDelDia(fecha: string, zona: string = ZONA_CASA): { desde: string; hasta: string } {
  const desfase = (dia: string) => {
    const nombre = new Intl.DateTimeFormat("en-US", { timeZone: zona, timeZoneName: "longOffset" })
      .formatToParts(new Date(`${dia}T12:00:00Z`))
      .find((p) => p.type === "timeZoneName")?.value;
    const off = nombre?.replace("GMT", "") ?? "";
    return off === "" ? "Z" : off;
  };
  const siguiente = new Date(`${fecha}T12:00:00Z`);
  siguiente.setUTCDate(siguiente.getUTCDate() + 1);
  const manana = siguiente.toISOString().slice(0, 10);
  return { desde: `${fecha}T00:00:00${desfase(fecha)}`, hasta: `${manana}T00:00:00${desfase(manana)}` };
}

/** Las operaciones de un día (todas: borradores, confirmadas y reversadas). Sin fecha, hoy en la casa. */
export const useLibroDelDia = (fecha?: string) =>
  useQuery({
    queryKey: ["libro", fecha ?? "hoy"],
    queryFn: ({ signal }) => {
      const { desde, hasta } = rangoDelDia(fecha ?? fechaEn(new Date()));
      return pedir(conConsulta(RUTAS.operaciones, { desde, hasta, limite: "1000" }), z.array(Operacion), { signal });
    },
  });

/** Saldos, totales y margen del día (solo SUPERVISOR o ADMIN). */
export const useResumen = (fecha?: string) =>
  useQuery({
    queryKey: ["resumen", fecha ?? "hoy"],
    queryFn: ({ signal }) => pedir(conConsulta(RUTAS.resumen, { fecha }), Resumen, { signal }),
  });

export const useCatalogo = () =>
  useQuery({ queryKey: ["catalogo"], queryFn: ({ signal }) => pedir(RUTAS.catalogo, Catalogo, { signal }), staleTime: CINCO_MINUTOS });

/** Los parámetros vienen en el catálogo (no hay /api/parametros). */
export const useParametros = () =>
  useQuery({
    queryKey: ["catalogo"],
    queryFn: ({ signal }) => pedir(RUTAS.catalogo, Catalogo, { signal }),
    staleTime: CINCO_MINUTOS,
    select: (c) => c.parametros,
  });

/** Busca por nombre o documento (la API exige `q`: vacío, no consulta). Mientras escribe, muestra el resultado anterior. */
export const useClientes = (q: string) =>
  useQuery({
    queryKey: ["clientes", q.trim()],
    queryFn: q.trim() === "" ? skipToken : ({ signal }) => pedir(conConsulta(RUTAS.clientes, { q: q.trim() }), z.array(Cliente), { signal }),
    placeholderData: keepPreviousData,
  });

/** Un cliente por su id (la ficha que se abre con /clientes?id=). Sin id, no consulta. */
export const useCliente = (id: number | null | undefined) =>
  useQuery({
    queryKey: ["cliente", id],
    queryFn: id == null ? skipToken : ({ signal }) => pedir(RUTAS.cliente(id), Cliente, { signal }),
  });

/**
 * El saldo de cada moneda en una caja (GET /api/saldos, todos los roles): lo
 * teórico del Cierre y la «Caja en pesos». Sin caja (sin turno), no consulta.
 */
export const useSaldos = (cajaId: number | null | undefined) =>
  useQuery({
    queryKey: ["saldos", cajaId],
    queryFn: cajaId == null ? skipToken : ({ signal }) => pedir(conConsulta(RUTAS.saldos, { cajaId: String(cajaId) }), z.array(SaldoCaja), { signal }),
  });

/** El arqueo de un turno cerrado (vacío mientras está abierto). Sin turno, no consulta. */
export const useArqueo = (turnoId: number | null | undefined) =>
  useQuery({
    queryKey: ["arqueo", turnoId],
    queryFn: turnoId == null ? skipToken : ({ signal }) => pedir(RUTAS.arqueo(turnoId), z.array(FilaArqueo), { signal }),
  });

/** Los gastos de un día; sin fecha, todos. */
export const useGastos = (fecha?: string) =>
  useQuery({
    queryKey: ["gastos", fecha ?? "todos"],
    queryFn: ({ signal }) => pedir(conConsulta(RUTAS.gastos, { desde: fecha, hasta: fecha }), z.array(Gasto), { signal }),
  });

/** Las categorías de gasto vienen en el catálogo. */
export const useCategoriasGasto = () =>
  useQuery({
    queryKey: ["catalogo"],
    queryFn: ({ signal }) => pedir(RUTAS.catalogo, Catalogo, { signal }),
    staleTime: CINCO_MINUTOS,
    select: (c) => c.categoriasGasto,
  });

/**
 * La vista previa de una operación (tasa, pesos, margen, si pide ficha). Con
 * `null` no consulta; el debounce lo pone la pantalla. Un error de negocio
 * (BAJO_MINIMO, COTIZACION_VENCIDA…) queda en `error`, sin reintentos.
 * Mientras llega la vista nueva se ve la anterior (`isPlaceholderData`), para
 * que la placa no parpadee a cada tecla; con `null`, la pantalla la ignora.
 */
export const useVistaPrevia = (entrada: EntradaOperacion | null) =>
  useQuery({
    queryKey: ["vista", entrada],
    queryFn:
      entrada === null
        ? skipToken
        : ({ signal }) => pedir(RUTAS.previsualizar, Vista, { method: "POST", body: JSON.stringify(entrada), signal }),
    retry: false,
    placeholderData: keepPreviousData,
  });

// ---------------------------------------------------------------------------
// Mutaciones

export function useCrearOperacion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (entrada: EntradaOperacion) => enviar(RUTAS.operaciones, Operacion, entrada),
    onSuccess: () => invalidar(["libro"], ["resumen"], ["saldos"]),
  });
}

export function useConfirmar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => enviar(RUTAS.confirmar(id), Operacion),
    onSuccess: () => invalidar(["libro"], ["resumen"], ["saldos"]),
  });
}

export function useReversar() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => enviar(RUTAS.reversar(id), Operacion, { motivo }),
    onSuccess: () => invalidar(["libro"], ["resumen"], ["saldos"]),
  });
}

/** Corrige un borrador; se recalcula con la pizarra vigente (la salida de PIZARRA_CAMBIO). */
export function useEditarBorrador() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, cambios }: { id: number; cambios: CambiosOperacion }) => enviar(RUTAS.operacion(id), Operacion, cambios, "PATCH"),
    onSuccess: () => invalidar(["libro"], ["resumen"], ["saldos"]),
  });
}

export function useEliminarBorrador() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => enviar(RUTAS.operacion(id), z.null(), {}, "DELETE"),
    onSuccess: () => invalidar(["libro"], ["resumen"], ["saldos"]),
  });
}

/** Publica referencia y márgenes de una divisa; después se relee la pizarra. */
export function usePublicarCotizacion() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (entrada: EntradaCotizacion) => enviar(RUTAS.cotizaciones, Cotizacion, entrada),
    onSuccess: () => invalidar(["pizarra"], ["vista"]),
  });
}

export function useAbrirTurno() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (cajaId: number) => enviar(RUTAS.turnos, Turno, { cajaId }),
    onSuccess: () => invalidar(["sesion"], ["resumen"], ["saldos"]),
  });
}

/** Cierra el turno con el conteo de cada moneda, en unidad mínima: { USD: "45000", … }. */
export function useCerrarTurno() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ turnoId, conteo }: { turnoId: number; conteo: Record<string, string> }) =>
      enviar(RUTAS.cerrarTurno(turnoId), Cierre, { conteo }),
    onSuccess: () => invalidar(["sesion"], ["resumen"], ["saldos"], ["libro"], ["arqueo"]),
  });
}

/** Ingreso o retiro de la caja del turno. */
export function useMovimientoCaja() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (entrada: EntradaMovimiento) => enviar(RUTAS.movimientos, Movimiento, entrada),
    onSuccess: () => invalidar(["resumen"], ["saldos"]),
  });
}

export function useRegistrarGasto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (entrada: EntradaGasto) => enviar(RUTAS.gastos, Gasto, entrada),
    onSuccess: () => invalidar(["gastos"], ["resumen"], ["saldos"]),
  });
}

/** Reversa un gasto con motivo (como el de una operación: sin motivo, FALTA_MOTIVO). */
export function useReversarGasto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => enviar(RUTAS.reversarGasto(id), Gasto, { motivo }),
    onSuccess: () => invalidar(["gastos"], ["resumen"], ["saldos"]),
  });
}

/** Crea un cliente o, con `id`, lo edita. */
export function useGuardarCliente() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, datos }: { id?: number | undefined; datos: EntradaCliente }) =>
      id === undefined ? enviar(RUTAS.clientes, Cliente, datos) : enviar(RUTAS.cliente(id), Cliente, datos, "PATCH"),
    onSuccess: () => invalidar(["clientes"], ["cliente"]),
  });
}

/** Las cuentas del portal que esperan que alguien revise el carnet en el local. */
export const useCuentasPendientes = () =>
  useQuery({
    queryKey: ["cuentas", "PENDIENTE"],
    queryFn: ({ signal }) => pedir(conConsulta(RUTAS.cuentas, { estado: "PENDIENTE" }), z.array(CuentaCliente), { signal }),
  });

/** Verifica una cuenta: la enlaza con la ficha del mismo RUT (sin ficha, SIN_FICHA). */
export function useVerificarCuenta() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: number) => enviar(RUTAS.verificarCuenta(id), CuentaCliente),
    onSuccess: () => invalidar(["cuentas"]),
  });
}

/** Rechaza una cuenta con su motivo (el cliente lo ve en el portal). */
export function useRechazarCuenta() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo: string }) => enviar(RUTAS.rechazarCuenta(id), CuentaCliente, { motivo }),
    onSuccess: () => invalidar(["cuentas"]),
  });
}

/** Inicia sesión (Better Auth). Su respuesta no se usa: después se vuelve a pedir /api/yo. */
export function useEntrar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (datos: EntradaSesion) => enviar(RUTAS.entrar, z.unknown(), datos),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** Cierra la sesión y vacía lo que quedó en caché de quien salió. */
export function useSalir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => enviar(RUTAS.salir, z.unknown()),
    onSuccess: () => qc.resetQueries(),
  });
}
