import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import { ErrorNegocio } from "../api/cliente.ts";
import { useParametros, useSalir, useSesion } from "../api/consultas.ts";

/** Lo que /entrar recibe en `location.state` cuando la sesión se cerró sola. */
export type EstadoEntrar = { motivo?: "inactividad" };

const sinSesion = (error: unknown) => error instanceof ErrorNegocio && error.codigo === "SIN_SESION";
/** Una cuenta de cliente que llega a las pantallas del personal: su lugar es el portal. */
const esCliente = (error: unknown) => error instanceof ErrorNegocio && error.codigo === "SOLO_PERSONAL";

/** Lo que cuenta como actividad: cualquier tecla, clic, toque, rueda o movimiento del puntero. */
const ACTIVIDAD = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/**
 * La guarda de la sesión, alrededor del marco:
 * - sin sesión (SIN_SESION en /api/sesion o en cualquier otra consulta o
 *   mutación), lleva a /entrar;
 * - tras `sesionInactividadMinutos` sin actividad, cierra la sesión y lleva a
 *   /entrar con el aviso «Sesión cerrada por inactividad».
 *
 * Es un componente y no un loader: mientras /api/sesion responde, el marco
 * ya está dibujado (los datos los protege el servidor, que responde 401), y
 * TanStack Query sigue siendo la única fuente de la sesión.
 */
export function ConSesion({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const minutos = useParametros().data?.sesionInactividadMinutos;
  const salir = useSalir();
  const navegar = useNavigate();
  const qc = useQueryClient();
  /** Desde que se cerró por inactividad, los 401 que siguen no cambian el aviso. */
  const cerrando = useRef(false);

  const aEntrar = useEffectEvent(() => {
    if (!cerrando.current) void navegar("/entrar", { replace: true });
  });

  const cerrarPorInactividad = useEffectEvent(() => {
    if (cerrando.current) return;
    cerrando.current = true;
    void navegar("/entrar", { replace: true, state: { motivo: "inactividad" } satisfies EstadoEntrar });
    salir.mutate();
  });

  // Un 401 en cualquier consulta o mutación: la sesión venció en el servidor.
  useEffect(() => {
    const consultas = qc.getQueryCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error" && sinSesion(e.action.error)) aEntrar();
    });
    const mutaciones = qc.getMutationCache().subscribe((e) => {
      if (e.type === "updated" && e.action.type === "error" && sinSesion(e.action.error)) aEntrar();
    });
    return () => {
      consultas();
      mutaciones();
    };
  }, [qc]);

  // La inactividad: un solo temporizador que se rearma al vencer, si hubo
  // actividad entretanto (no uno por tecla). Al volver a la pestaña se revisa
  // en seguida, porque el navegador frena los temporizadores en segundo plano.
  useEffect(() => {
    if (!minutos || minutos <= 0) return;
    const limite = minutos * 60_000;
    let ultima = Date.now();
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const marcar = () => {
      ultima = Date.now();
    };
    const revisar = () => {
      const resta = limite - (Date.now() - ultima);
      if (resta <= 0) cerrarPorInactividad();
      else reloj = setTimeout(revisar, resta);
    };
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(reloj);
      revisar();
    };
    reloj = setTimeout(revisar, limite);
    for (const evento of ACTIVIDAD) window.addEventListener(evento, marcar, { capture: true, passive: true });
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(reloj);
      for (const evento of ACTIVIDAD) window.removeEventListener(evento, marcar, { capture: true });
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [minutos]);

  if (sesion.isError && esCliente(sesion.error)) return <Navigate to="/mi" replace />;
  if (sesion.isError && !sesion.isFetching && sinSesion(sesion.error) && !cerrando.current) {
    return <Navigate to="/entrar" replace />;
  }
  return children;
}
