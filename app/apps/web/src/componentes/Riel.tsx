import type { Sesion } from "../api/esquemas.ts";
import { SignOutIcon } from "@phosphor-icons/react";
import { NavLink, useNavigate } from "react-router";
import { useSalir } from "../api/consultas.ts";
import { Kbd } from "./Kbd.tsx";
import { Sep } from "./Sep.tsx";

export type Seccion = {
  ruta: string;
  nombre: string;
  /** El rótulo de la pestaña en la barra inferior del teléfono. */
  corto: string;
  /** El color de función de la sección (un token). */
  color: string;
  tecla?: string;
};

export const SECCIONES: readonly Seccion[] = [
  { ruta: "/ventanilla", nombre: "Ventanilla", corto: "Ventanilla", color: "var(--vial)", tecla: "F1" },
  { ruta: "/cierre", nombre: "Cierre del día", corto: "Cierre", color: "var(--amarillo)", tecla: "F2" },
  { ruta: "/jornada", nombre: "Jornada", corto: "Jornada", color: "var(--turismo)", tecla: "F3" },
  { ruta: "/clientes", nombre: "Clientes", corto: "Clientes", color: "var(--servicios)", tecla: "F4" },
  { ruta: "/configuracion", nombre: "Configuración", corto: "Config.", color: "var(--neutro)" },
];

const hora = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dia = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" });

/** «domingo, 8 de noviembre» → «Domingo 8 de noviembre». */
function diaLargo(fecha: Date): string {
  const texto = dia.format(fecha).replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function Turno({ sesion }: { sesion: Sesion }) {
  const turno = sesion.turno;
  if (!turno || turno.estado !== "ABIERTO") {
    return (
      <div className="riel-turno">
        <b>Sin turno abierto</b>
        {sesion.usuario.nombre}
      </div>
    );
  }
  const desde = new Date(turno.abiertoEn);
  return (
    <div className="riel-turno">
      <b>
        Turno abierto
        <Sep />
        Caja {turno.cajaId}
      </b>
      Desde {hora.format(desde)}
      <Sep />
      {sesion.usuario.nombre}
      <br />
      {diaLargo(desde)}
    </div>
  );
}

/**
 * Cierra la sesión y lleva a /entrar. Si el servidor no responde, va igual:
 * la caja no queda abierta a la vista, y la cookie vence sola con la
 * inactividad.
 */
function Salir() {
  const salir = useSalir();
  const navegar = useNavigate();
  const alSalir = () => {
    void salir
      .mutateAsync()
      .catch(() => undefined)
      .finally(() => void navegar("/entrar", { replace: true }));
  };
  return (
    <button type="button" className="riel-salir" onClick={alSalir} disabled={salir.isPending}>
      <SignOutIcon size={16} weight="bold" aria-hidden="true" />
      Salir
    </button>
  );
}

export function Riel({ sesion }: { sesion?: Sesion | undefined }) {
  return (
    <header className="riel">
      <div className="riel-marca">
        ATK
        <small>
          Casa de cambio
          <Sep />
          Coyhaique
        </small>
      </div>
      <nav aria-label="Secciones">
        <ul>
          {SECCIONES.map((s) => (
            <li key={s.ruta}>
              <NavLink to={s.ruta}>
                <span className="riel-cuadro" aria-hidden="true" style={{ background: s.color }} />
                {s.corto === s.nombre ? (
                  s.nombre
                ) : (
                  <>
                    <span className="largo">{s.nombre}</span>
                    <span className="corto">{s.corto}</span>
                  </>
                )}
                {s.tecla && <Kbd>{s.tecla}</Kbd>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {/* En el PC, el turno y «Salir» al pie del riel; en el teléfono, «Salir» es la última pestaña de la barra */}
      <div className="riel-pie">
        {sesion && <Turno sesion={sesion} />}
        <Salir />
      </div>
    </header>
  );
}
