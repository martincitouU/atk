import { Suspense, useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { useSesion } from "../api/consultas.ts";
import { EsqueletoPantalla } from "./Esqueleto.tsx";
import { Riel, SECCIONES } from "./Riel.tsx";

/** El riel y el área de trabajo. F1–F4 cambian de sección desde cualquier parte. */
export function Marco() {
  const navegar = useNavigate();
  const { data: sesion } = useSesion();

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const seccion = SECCIONES.find((s) => s.tecla === e.key);
      if (!seccion) return;
      e.preventDefault();
      void navegar(seccion.ruta);
    }
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [navegar]);

  return (
    <div className="marco">
      <a className="saltar" href="#contenido">
        Saltar al contenido
      </a>
      <Riel sesion={sesion} />
      <main className="marco-principal" id="contenido">
        <Suspense fallback={<EsqueletoPantalla />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
