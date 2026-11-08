// Qué puede hacer cada rol en la interfaz. Copia las reglas de los servicios
// (exigirRol en apps/api/src/servicios) para ocultar lo que la API rechazaría
// con 403; la API sigue siendo la que decide.

import type { Rol } from "@atk/shared";
import { useParametros, useSesion } from "./consultas.ts";

export type Accion =
  /** POST /api/cotizaciones (cotizaciones.ts) */
  | "publicarPizarra"
  /** POST /api/operaciones/:id/reversar y /api/gastos/:id/reversar, con reverso_requiere_supervisor */
  | "reversar"
  /** GET /api/resumen: la Jornada (resumen.ts) */
  | "verJornada"
  /** POST /api/gastos con TRANSFERENCIA o TARJETA (gastos.ts) */
  | "gastoSinEfectivo"
  /** /api/usuarios y /api/auditoria (usuarios.ts, auditoria.ts) */
  | "administrar";

const ROLES: Record<Accion, readonly Rol[]> = {
  publicarPizarra: ["ADMIN"],
  reversar: ["SUPERVISOR", "ADMIN"],
  verJornada: ["SUPERVISOR", "ADMIN"],
  gastoSinEfectivo: ["ADMIN"],
  administrar: ["ADMIN"],
};

/**
 * ¿Puede `rol` hacer `accion`? Sin rol (la sesión todavía no llega), no.
 * Si los reversos no requieren supervisor, cualquiera reversa (lo suyo: eso
 * lo revisa la API, que conoce de quién es cada operación).
 */
export function puede(rol: Rol | undefined, accion: Accion, parametros?: { reversoRequiereSupervisor: boolean }): boolean {
  if (rol === undefined) return false;
  if (accion === "reversar" && parametros?.reversoRequiereSupervisor === false) return true;
  return ROLES[accion].includes(rol);
}

/** puede() con el rol de la sesión y los parámetros de la casa. */
export function usePuede(): (accion: Accion) => boolean {
  const { data: sesion } = useSesion();
  const { data: parametros } = useParametros();
  return (accion) => puede(sesion?.usuario.rol, accion, parametros);
}
