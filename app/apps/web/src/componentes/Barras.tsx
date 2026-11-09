import type { Rol } from "@atk/shared";
import { CalendarBlankIcon, CashRegisterIcon, ClockIcon, SignOutIcon, UserIcon } from "@phosphor-icons/react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { usePizarra, useSalir } from "../api/consultas.ts";
import type { Sesion } from "../api/esquemas.ts";
import { puede, type Accion } from "../api/permisos.ts";
import { hora, useAhora } from "../comun.ts";
import { Kbd } from "./Kbd.tsx";
import { Sep } from "./Sep.tsx";

// El marco de escritorio (vuelta 3, «profesional tipo Office»): la barra de
// título, las pestañas de sección con su color y su tecla, y la barra de
// estado al pie. En el teléfono las pestañas bajan a la barra inferior de
// siempre y la barra de título y la de estado no se muestran.

export type Seccion = {
  ruta: string;
  nombre: string;
  /** El rótulo de la pestaña en la barra inferior del teléfono. */
  corto: string;
  /** El color de función de la sección (un token). */
  color: string;
  tecla?: string;
  /** Si la sección es solo de algunos roles (la API respondería 403). */
  permiso?: Accion;
  /** Del administrador, en el PC: aparece cuando la sesión lo confirma y no va en la barra del teléfono. */
  admin?: boolean;
};

export const SECCIONES: readonly Seccion[] = [
  { ruta: "/ventanilla", nombre: "Ventanilla", corto: "Ventanilla", color: "var(--vial)", tecla: "F1" },
  { ruta: "/cierre", nombre: "Cierre del día", corto: "Cierre", color: "var(--amarillo)", tecla: "F2" },
  { ruta: "/jornada", nombre: "Jornada", corto: "Jornada", color: "var(--turismo)", tecla: "F3", permiso: "verJornada" },
  { ruta: "/clientes", nombre: "Clientes", corto: "Clientes", color: "var(--servicios)", tecla: "F4" },
  { ruta: "/configuracion", nombre: "Configuración", corto: "Config.", color: "var(--neutro)", tecla: "F5" },
  { ruta: "/usuarios", nombre: "Usuarios", corto: "Usuarios", color: "var(--neutro)", permiso: "administrar", admin: true },
  { ruta: "/auditoria", nombre: "Auditoría", corto: "Auditoría", color: "var(--neutro)", permiso: "administrar", admin: true },
];

const ROL: Record<Rol, string> = { ADMIN: "Administrador", SUPERVISOR: "Supervisor", CAJERO: "Cajero" };

const dia = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" });

/** «domingo, 8 de noviembre» → «Domingo 8 de noviembre». */
function diaLargo(fecha: Date): string {
  const texto = dia.format(fecha).replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Las secciones que ve quien entró. Mientras la sesión no llega, las de todos
 * (las pestañas no saltan) salvo las del administrador; después, las de su rol.
 */
export function seccionesDe(sesion: Sesion | undefined): readonly Seccion[] {
  return SECCIONES.filter((s) => !s.permiso || (sesion ? puede(sesion.usuario.rol, s.permiso) : !s.admin));
}

/** La barra de título: la casa, la sección abierta con su caja, y quién está. */
export function BarraTitulo({ sesion }: { sesion?: Sesion | undefined }) {
  const { pathname } = useLocation();
  const seccion = SECCIONES.find((s) => pathname.startsWith(s.ruta));
  const caja = sesion?.turno?.estado === "ABIERTO" ? sesion.turno.cajaId : null;
  return (
    <header className="titulo">
      <span className="titulo-marca">ATK</span>
      <span className="titulo-casa">
        Casa de cambio
        <Sep />
        Coyhaique
      </span>
      <span className="titulo-doc">
        {seccion?.nombre ?? "ATK"}
        {caja !== null && (
          <>
            <Sep />
            Caja {caja}
          </>
        )}
      </span>
      {sesion && (
        <span className="titulo-quien">
          <UserIcon size={15} weight="bold" aria-hidden="true" />
          {sesion.usuario.nombre}
          <Sep />
          {ROL[sesion.usuario.rol]}
        </span>
      )}
    </header>
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
    <button type="button" className="pestanas-salir" onClick={alSalir} disabled={salir.isPending}>
      <SignOutIcon size={16} weight="bold" aria-hidden="true" />
      Salir
    </button>
  );
}

/** Las secciones como pestañas (en el teléfono, la barra inferior) y «Salir» al final. */
export function Pestanas({ sesion }: { sesion?: Sesion | undefined }) {
  return (
    <div className="pestanas">
      <nav aria-label="Secciones">
        <ul>
          {seccionesDe(sesion).map((s) => (
            <li key={s.ruta} className={s.admin ? "pestana-admin" : undefined}>
              <NavLink to={s.ruta}>
                <span className="pestana-cuadro" aria-hidden="true" style={{ background: s.color }} />
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
      <Salir />
    </div>
  );
}

/** La barra de estado: el turno, quién, la conexión, la vigencia de la pizarra y la hora. */
export function BarraEstado({ sesion, conectado }: { sesion?: Sesion | undefined; conectado: boolean }) {
  const ahora = useAhora();
  const pizarra = usePizarra();
  const ultima = (pizarra.data ?? []).reduce<string | null>((max, f) => (f.vigenteDesde && (!max || f.vigenteDesde > max) ? f.vigenteDesde : max), null);
  const turno = sesion?.turno;
  return (
    <footer className="estado" aria-label="Barra de estado">
      <span>
        <CashRegisterIcon size={15} weight="bold" aria-hidden="true" />
        {turno && turno.estado === "ABIERTO" ? (
          <>
            <b>Turno abierto</b>
            <Sep />
            Caja {turno.cajaId}
            <Sep />
            desde {hora(turno.abiertoEn)}
          </>
        ) : (
          <b>Sin turno abierto</b>
        )}
      </span>
      {sesion && (
        <span>
          <UserIcon size={15} weight="bold" aria-hidden="true" />
          {sesion.usuario.nombre}
          <Sep />
          {ROL[sesion.usuario.rol]}
        </span>
      )}
      <span>
        <i className={`estado-punto${conectado ? "" : " caido"}`} aria-hidden="true" />
        {conectado ? "Conectado al servidor" : "Sin conexión con el servidor"}
      </span>
      {ultima && (
        <span>
          <ClockIcon size={15} weight="bold" aria-hidden="true" />
          Pizarra vigente desde {hora(ultima)}
        </span>
      )}
      <span className="estado-der">
        <CalendarBlankIcon size={15} weight="bold" aria-hidden="true" />
        {diaLargo(ahora)}
        <Sep />
        <b className="num">{hora(ahora.toISOString())}</b>
      </span>
    </footer>
  );
}
