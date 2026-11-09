// Quién está usando la app: personal (con su rol y su turno) o un cliente.
//
// Las vistas solo usan useSesion(); no saben de dónde sale la sesión.
//
// ESQUELETO (F1): la sesión es de ejemplo y se elige en el login, para
// recorrer las vistas de cada rol sin la API. Se guarda en sessionStorage
// para que sobreviva a una recarga. En F2 se reemplaza por GET /api/yo, el
// login real y el cierre de sesión de Better Auth, sin tocar las vistas.

import { createContext, use, useState, type ReactNode } from "react";
import type { Yo } from "../api/tipos.ts";
import { sesiones, type SesionEjemplo } from "../ejemplo/datos.ts";

type ValorSesion = {
  sesion: Yo | null;
  entrarComoEjemplo: (cual: SesionEjemplo) => void;
  salir: () => void;
};

const ContextoSesion = createContext<ValorSesion | null>(null);
const CLAVE = "atk.sesion-ejemplo";

function leerGuardada(): SesionEjemplo | null {
  try {
    const guardada = sessionStorage.getItem(CLAVE);
    return guardada && guardada in sesiones ? (guardada as SesionEjemplo) : null;
  } catch {
    return null; // almacenamiento bloqueado: se parte sin sesión
  }
}

export function ProveedorSesion({ children, inicial }: { children: ReactNode; /** Para los tests */ inicial?: SesionEjemplo }) {
  const [cual, setCual] = useState<SesionEjemplo | null>(() => inicial ?? leerGuardada());

  const guardar = (valor: SesionEjemplo | null) => {
    setCual(valor);
    try {
      if (valor) sessionStorage.setItem(CLAVE, valor);
      else sessionStorage.removeItem(CLAVE);
    } catch {
      // sin almacenamiento la sesión dura hasta recargar
    }
  };

  const valor: ValorSesion = {
    sesion: cual ? sesiones[cual] : null,
    entrarComoEjemplo: guardar,
    salir: () => guardar(null),
  };
  return <ContextoSesion value={valor}>{children}</ContextoSesion>;
}

export function useSesion(): ValorSesion {
  const valor = use(ContextoSesion);
  if (!valor) throw new Error("useSesion se usa dentro de <ProveedorSesion>");
  return valor;
}

/** La sesión del personal; las vistas del personal solo se muestran con una. */
export function usePersonal() {
  const { sesion } = useSesion();
  if (sesion?.tipo !== "personal") throw new Error("Esta vista es solo para el personal");
  return sesion;
}
