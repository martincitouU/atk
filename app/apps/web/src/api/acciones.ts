// Lo que el front guarda en la API: una acción por cada ruta que escribe,
// con TanStack Query (useMutation). Las vistas solo llaman a estos hooks.
//
// Cada acción dice qué temas de la caché refrescar al terminar (las claves
// de consultas.ts). Así ninguna pantalla queda mostrando datos viejos: al
// confirmar una operación se vuelven a pedir las operaciones, los saldos,
// el libro de caja y el resumen. La auditoría se refresca siempre, porque
// toda escritura deja su registro.
//
// mutateAsync termina recién cuando lo refrescado llegó: la vista puede
// navegar o mostrar "listo" sin ver datos viejos.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  cambiosUsuario,
  entradaAbrirTurno,
  entradaAjusteCaja,
  entradaCerrarTurno,
  entradaCliente,
  entradaGasto,
  entradaIngresoRetiro,
  entradaOperacion,
  entradaPublicacion,
  entradaUsuario,
} from "@atk/shared";
import type { z } from "zod";
import { CLAVE_YO } from "./cache.ts";
import { enviar, pedir } from "./cliente.ts";
import type { CategoriaCliente, Cliente, CuentaCliente, FilaArqueo, Gasto, Operacion, Turno, Usuario } from "./tipos.ts";

// Lo que se envía: la entrada (z.input) de los mismos esquemas que valida la
// API. Montos y tasas como texto de dígitos.
type EntradaAbrirTurno = z.input<typeof entradaAbrirTurno>;
type EntradaCerrarTurno = z.input<typeof entradaCerrarTurno>;
type EntradaIngresoRetiro = z.input<typeof entradaIngresoRetiro>;
type EntradaAjusteCaja = z.input<typeof entradaAjusteCaja>;
export type EntradaOperacionJson = z.input<typeof entradaOperacion>;
export type EntradaCliente = z.input<typeof entradaCliente>;
type EntradaGasto = z.input<typeof entradaGasto>;
type EntradaPublicacion = z.input<typeof entradaPublicacion>;
export type EntradaUsuario = z.input<typeof entradaUsuario>;
export type CambiosUsuario = z.input<typeof cambiosUsuario>;

/** Temas de la caché: el primer elemento de cada clave en consultas.ts. */
type Tema =
  | "yo"
  | "catalogo"
  | "pizarra"
  | "personal"
  | "operaciones"
  | "saldos"
  | "movimientos"
  | "turnos"
  | "clientes"
  | "cuentas-cliente"
  | "gastos"
  | "resumen"
  | "usuarios";

function useAccion<E, R>(guardar: (entrada: E) => Promise<R>, refresca: Tema[]) {
  const consultas = useQueryClient();
  return useMutation({
    mutationFn: guardar,
    onSuccess: () => Promise.all([...refresca, "auditoria"].map((tema) => consultas.invalidateQueries({ queryKey: tema === "yo" ? CLAVE_YO : [tema] }))),
  });
}

/** Lo que mueve dinero de una caja cambia saldos, libro de caja y el resumen del día. */
const CAJA: Tema[] = ["saldos", "movimientos", "resumen"];

// ---- Turnos y caja -------------------------------------------------------------

/** POST /api/turnos. El turno abierto viene en /api/yo: se vuelve a pedir. */
export const useAbrirTurno = () => useAccion((e: EntradaAbrirTurno) => enviar<Turno>("/api/turnos", e), ["yo", "turnos", ...CAJA]);

export type ResultadoCierre = { turno: Turno; arqueo: FilaArqueo[] };

/** POST /api/turnos/:id/cerrar: responde el arqueo con las diferencias. */
export const useCerrarTurno = (turnoId: number) =>
  useAccion((e: EntradaCerrarTurno) => enviar<ResultadoCierre>(`/api/turnos/${turnoId}/cerrar`, e), ["yo", "turnos", ...CAJA]);

/** POST /api/caja/movimientos: ingreso o retiro en la caja del propio turno. */
export const useMovimientoCaja = () => useAccion((e: EntradaIngresoRetiro) => enviar("/api/caja/movimientos", e), CAJA);

/** POST /api/caja/ajustes (supervisor o admin) */
export const useAjusteCaja = () => useAccion((e: EntradaAjusteCaja) => enviar("/api/caja/ajustes", e), CAJA);

// ---- Operaciones --------------------------------------------------------------

/** POST /api/operaciones: queda como BORRADOR, sin mover la caja. */
export const useCrearBorrador = () => useAccion((e: EntradaOperacionJson) => enviar<Operacion>("/api/operaciones", e), ["operaciones", "resumen"]);

/** PATCH /api/operaciones/:id: la API recalcula con la pizarra vigente. */
export const useEditarBorrador = (id: number) =>
  useAccion((cambios: Partial<EntradaOperacionJson>) => pedir<Operacion>("PATCH", `/api/operaciones/${id}`, cambios), ["operaciones"]);

export const useEliminarBorrador = (id: number) => useAccion(() => pedir<void>("DELETE", `/api/operaciones/${id}`), ["operaciones", "resumen"]);

/** POST /api/operaciones/:id/autorizar: la tasa preferencial (supervisor o admin) */
export const useAutorizarTasa = (id: number) => useAccion(() => enviar<Operacion>(`/api/operaciones/${id}/autorizar`), ["operaciones"]);

/** POST /api/operaciones/:id/confirmar: mueve la caja. */
export const useConfirmarOperacion = (id: number) =>
  useAccion(() => enviar<Operacion>(`/api/operaciones/${id}/confirmar`), ["operaciones", "clientes", ...CAJA]);

/** POST /api/operaciones/:id/reversar: movimientos inversos (supervisor o admin) */
export const useReversarOperacion = (id: number) =>
  useAccion((e: { motivo: string }) => enviar<Operacion>(`/api/operaciones/${id}/reversar`, e), ["operaciones", ...CAJA]);

// ---- Clientes y cuentas del portal ----------------------------------------------------

export const useCrearCliente = () => useAccion((e: EntradaCliente) => enviar<Cliente>("/api/clientes", e), ["clientes"]);

/** El nombre del cliente también aparece en las operaciones. */
export const useEditarCliente = (id: number) =>
  useAccion((cambios: Partial<EntradaCliente>) => pedir<Cliente>("PATCH", `/api/clientes/${id}`, cambios), ["clientes", "operaciones"]);

/** El cajero revisó el carnet: la cuenta se enlaza con la ficha del mismo RUT. */
export const useVerificarCuenta = () => useAccion((id: number) => enviar<CuentaCliente>(`/api/cuentas-cliente/${id}/verificar`), ["cuentas-cliente"]);

export const useRechazarCuenta = () =>
  useAccion(({ id, motivo }: { id: number; motivo: string }) => enviar<CuentaCliente>(`/api/cuentas-cliente/${id}/rechazar`, { motivo }), ["cuentas-cliente"]);

// ---- Gastos -------------------------------------------------------------------------

/** En efectivo sale de la caja del turno. */
export const useRegistrarGasto = () => useAccion((e: EntradaGasto) => enviar<Gasto>("/api/gastos", e), ["gastos", ...CAJA]);

export const useReversarGasto = () =>
  useAccion(({ id, motivo }: { id: number; motivo: string }) => enviar<Gasto>(`/api/gastos/${id}/reversar`, { motivo }), ["gastos", ...CAJA]);

// ---- Pizarra, personal y fidelización (admin) -------------------------------------------

export const usePublicarTasa = () => useAccion((e: EntradaPublicacion) => enviar("/api/cotizaciones", e), ["pizarra"]);

export const useCrearUsuario = () => useAccion((e: EntradaUsuario) => enviar<Usuario>("/api/usuarios", e), ["usuarios", "personal"]);

export const useEditarUsuario = () =>
  useAccion(({ id, cambios }: { id: number; cambios: CambiosUsuario }) => pedir<Usuario>("PATCH", `/api/usuarios/${id}`, cambios), ["usuarios", "personal"]);

/** Cierra las sesiones de esa persona: tendrá que entrar con la nueva. */
export const useRestablecerContrasena = () =>
  useAccion(({ id, contrasena }: { id: number; contrasena: string }) => enviar<void>(`/api/usuarios/${id}/contrasena`, { contrasena }), ["usuarios"]);

/** Las categorías vienen en el catálogo. */
export const useCrearCategoria = () =>
  useAccion((e: { nombre: string; descuentoMargenPctE6: string }) => enviar<CategoriaCliente>("/api/categorias-cliente", e), ["catalogo"]);

// ---- Mi cuenta -------------------------------------------------------------------------

/** POST /api/auth/change-password (Better Auth). La actual equivocada responde 400. */
export const useCambiarContrasena = () =>
  useAccion((e: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean }) => enviar("/api/auth/change-password", e), []);
