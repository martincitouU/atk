// Quién está usando la app: personal (con su rol y su turno), un cliente o
// nadie. Las vistas solo usan useSesion(); no saben de dónde sale la sesión.
//
//   GET  /api/yo                     quién soy (401 → nadie)
//   POST /api/auth/sign-in/email     ingresar
//   POST /api/auth/sign-out          salir
//
// La cookie de sesión es httpOnly: el front no la ve ni la guarda, el
// navegador la manda sola. Lo único que el front sabe es lo que dice /api/yo.
//
// El proveedor también crea la caché de la API (api/cache.ts), porque la
// caché avisa cuando una petición responde 401: la sesión venció y los
// marcos llevan al login, que muestra el motivo.

import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, useState, type ReactNode } from "react";
import { CLAVE_YO, crearConsultas, olvidarSesion } from "../api/cache.ts";
import { enviar, ErrorApi, esSinSesion, mensajeDe, obtener } from "../api/cliente.ts";
import type { Yo } from "../api/tipos.ts";
import { Cargando, ErrorDeCarga } from "../componentes/Estados.tsx";
import css from "./Sesion.module.css";

/** Cómo terminó la última sesión de esta pestaña. */
export type Cierre = "inactividad" | "salida" | null;

type ValorSesion = {
  sesion: Yo | null;
  /** "inactividad": venció sola (el login lo avisa); "salida": la cerró la persona. */
  cierre: Cierre;
  /** Inicia sesión. Si no se puede, lanza un ErrorApi con el motivo para mostrar. */
  ingresar: (email: string, contrasena: string) => Promise<void>;
  /** Cierra la sesión. Si no se puede (sin conexión), lanza un ErrorApi. */
  salir: () => Promise<void>;
};

const ContextoSesion = createContext<ValorSesion | null>(null);

/** 401 no es un error aquí: significa que no hay sesión. */
async function leerYo(): Promise<Yo | null> {
  try {
    return await obtener<Yo>("/api/yo");
  } catch (error) {
    if (esSinSesion(error)) return null;
    throw error;
  }
}

export function ProveedorSesion({ children, reintentar = true }: { children: ReactNode; /** Los tests no reintentan */ reintentar?: boolean }) {
  const [cierre, setCierre] = useState<Cierre>(null);
  const [consultas] = useState(() => crearConsultas({ reintentar, alPerderSesion: () => setCierre("inactividad") }));

  return (
    <QueryClientProvider client={consultas}>
      <Sesion cierre={cierre} setCierre={setCierre}>
        {children}
      </Sesion>
    </QueryClientProvider>
  );
}

function Sesion({ children, cierre, setCierre }: { children: ReactNode; cierre: Cierre; setCierre: (cierre: Cierre) => void }) {
  const consultas = useQueryClient();
  // Se pide una vez al abrir la app; después cambia solo al entrar o salir
  const yo = useQuery({ queryKey: CLAVE_YO, queryFn: leerYo, staleTime: Infinity });

  if (yo.isPending) {
    return (
      <div className={css.pantalla}>
        <Cargando texto="Abriendo…" />
      </div>
    );
  }
  if (yo.isError) {
    return (
      <div className={css.pantalla}>
        <div className={css.error}>
          <ErrorDeCarga error={yo.error} alReintentar={() => void yo.refetch()} />
        </div>
      </div>
    );
  }

  const valor: ValorSesion = {
    sesion: yo.data,
    cierre,
    async ingresar(email, contrasena) {
      await enviar("/api/auth/sign-in/email", { email, password: contrasena });
      const nueva = await leerYo();
      if (!nueva) {
        // La contraseña es correcta, pero la app no da acceso: un usuario del
        // personal desactivado. Se cierra la sesión que Better Auth abrió.
        await enviar("/api/auth/sign-out").catch(() => undefined);
        throw new ErrorApi(403, "CUENTA_DESACTIVADA", "Esta cuenta está desactivada. Si crees que es un error, habla con el administrador de la casa.");
      }
      olvidarSesion(consultas); // nada de una sesión anterior en esta pestaña
      consultas.setQueryData(CLAVE_YO, nueva);
      setCierre(null);
    },
    async salir() {
      try {
        await enviar("/api/auth/sign-out");
      } catch (error) {
        // 401: la sesión ya no existía, que es justo lo que se quería
        if (!esSinSesion(error)) throw error;
      }
      olvidarSesion(consultas);
      setCierre("salida");
    },
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

/**
 * Para un botón de "Cerrar sesión": si no se puede (sin conexión), deja el
 * mensaje para mostrarlo. Nunca se finge una salida: la cookie seguiría
 * valiendo en este computador.
 */
export function useSalir() {
  const { salir } = useSesion();
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    salir: () => {
      setError(null);
      salir().catch((e: unknown) => setError(`${mensajeDe(e)} La sesión se cerrará sola tras 15 minutos sin uso.`));
    },
  };
}
