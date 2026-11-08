import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useSesion } from "../api/consultas.ts";
import { puede, type Accion } from "../api/permisos.ts";

/**
 * Una pantalla solo para algunos roles: quien no puede, vuelve a la
 * Ventanilla en vez de ver un 403. Mientras la sesión llega, no monta la
 * pantalla (así no dispara consultas que la API rechazaría).
 */
export function ConPermiso({ accion, children }: { accion: Accion; children: ReactNode }) {
  const { data: sesion } = useSesion();
  if (!sesion) return null;
  if (!puede(sesion.usuario.rol, accion)) return <Navigate to="/ventanilla" replace />;
  return children;
}
