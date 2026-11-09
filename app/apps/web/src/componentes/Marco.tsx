import { Suspense, useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useSesion } from "../api/consultas.ts";
import { BarraEstado, BarraTitulo, Pestanas, seccionesDe } from "./Barras.tsx";
import { Cinta } from "./Cinta.tsx";
import { EsqueletoPantalla } from "./Esqueleto.tsx";

/**
 * El marco de escritorio, como un programa de oficina: la barra de título,
 * las pestañas de sección, la cinta de la pantalla, el área de trabajo y la
 * barra de estado. F1–F5 cambian de sección desde cualquier parte.
 */
export function Marco() {
  const navegar = useNavigate();
  const sesion = useSesion();

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const seccion = seccionesDe(sesion.data).find((s) => s.tecla === e.key);
      if (!seccion) return;
      e.preventDefault();
      void navegar(seccion.ruta);
    }
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [navegar, sesion.data]);

  return (
    <div className="marco">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <BarraTitulo sesion={sesion.data} />
      <Pestanas sesion={sesion.data} />
      <Cinta />
      <main className="marco-principal" id="contenido">
        <Suspense fallback={<EsqueletoPantalla />}>
          <Outlet />
        </Suspense>
      </main>
      <BarraEstado sesion={sesion.data} conectado={!sesion.isError} />
    </div>
  );
}
