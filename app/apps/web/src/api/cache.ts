// La caché de la API (TanStack Query): guarda en memoria cada respuesta,
// evita pedir dos veces lo mismo y da a las vistas estados de carga y error.
//
// También vigila la sesión: si la API responde 401 a una consulta o a un
// envío mientras había sesión, es que venció (15 minutos sin uso) o que la
// cerraron en otro lado. Entonces se olvidan los datos y se avisa a la sesión
// (sesion/Sesion.tsx), que lleva al login.

import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ErrorApi, esSinSesion } from "./cliente.ts";
import type { Yo } from "./tipos.ts";

/** GET /api/yo: quién usa la app (null = nadie). */
export const CLAVE_YO = ["yo"] as const;

/** Lo que no es de una sesión: quién soy y los datos públicos de la casa. */
const SIN_DUENO = new Set(["yo", "casa"]);

type Opciones = {
  /** La API respondió 401 con una sesión abierta */
  alPerderSesion?: () => void;
  /** Reintentar lo que falló por la red o el servidor (los tests no esperan) */
  reintentar?: boolean;
};

export function crearConsultas({ alPerderSesion, reintentar = true }: Opciones = {}) {
  const consultas: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      // /api/yo responde 401 cuando no hay sesión: eso no es perderla
      onError: (error, consulta) => consulta.queryKey[0] !== "yo" && revisarSesion(error),
    }),
    mutationCache: new MutationCache({ onError: (error) => revisarSesion(error) }),
    defaultOptions: {
      queries: {
        // Un dato se considera al día por 30 s; después se vuelve a pedir al mostrarlo
        staleTime: 30_000,
        // Una vez, y solo si el problema puede ser pasajero: un 4xx no cambia por repetirlo
        retry: (fallas, error) => reintentar && fallas < 1 && esPasajero(error),
      },
    },
  });

  function revisarSesion(error: unknown) {
    if (!esSinSesion(error) || !consultas.getQueryData<Yo | null>(CLAVE_YO)) return;
    olvidarSesion(consultas);
    alPerderSesion?.();
  }

  return consultas;
}

/**
 * Deja la caché sin sesión: borra todo lo que se leyó con ella. Así los
 * datos de una persona no quedan en memoria para la siguiente.
 */
export function olvidarSesion(consultas: QueryClient) {
  consultas.setQueryData<Yo | null>(CLAVE_YO, null);
  consultas.removeQueries({ predicate: (consulta) => !SIN_DUENO.has(String(consulta.queryKey[0])) });
}

/** Sin conexión o error del servidor: puede andar al repetir. */
const esPasajero = (error: unknown) => !(error instanceof ErrorApi) || error.estado === 0 || error.estado >= 500;
