// Barra superior del personal (DESIGN.md › Nav Bar): marca a la izquierda,
// secciones al centro, "Nueva operación" y el menú de la persona a la
// derecha. Cada rol ve solo sus secciones. En pantallas angostas las
// secciones pasan a un menú desplegable.

import { ChevronDown, LogOut, Menu, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { Rol, UsuarioYo } from "../api/tipos.ts";
import { EnlaceBoton } from "../componentes/Boton.tsx";
import { Marca } from "../componentes/Marca.tsx";
import { ROL } from "../lib/textos.ts";
import css from "./BarraNavegacion.module.css";

type Seccion = { a: string; texto: string; fin?: boolean; roles?: Rol[] };

export const SECCIONES: Seccion[] = [
  { a: "/", texto: "Inicio", fin: true },
  { a: "/operaciones", texto: "Operaciones" },
  { a: "/caja", texto: "Caja" },
  { a: "/clientes", texto: "Clientes" },
  { a: "/pizarra", texto: "Pizarra" },
  { a: "/administracion", texto: "Administración", roles: ["ADMIN"] },
];

export function seccionesDe(rol: Rol) {
  return SECCIONES.filter((s) => !s.roles || s.roles.includes(rol));
}

type Props = { nombreCasa: string; usuario: UsuarioYo; alSalir: () => void };

export function BarraNavegacion({ nombreCasa, usuario, alSalir }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { pathname } = useLocation();

  // Al navegar se cierra el menú del teléfono
  useEffect(() => setMenuAbierto(false), [pathname]);

  const secciones = seccionesDe(usuario.rol);
  const claseEnlace = ({ isActive }: { isActive: boolean }) => (isActive ? `${css.enlace} ${css.activo}` : css.enlace);

  return (
    <header className={css.barra}>
      <div className={css.contenido}>
        <Link to="/" className={css.marca}>
          <Marca nombre={nombreCasa} />
        </Link>

        <nav aria-label="Secciones" className={css.secciones}>
          {secciones.map((s) => (
            <NavLink key={s.a} to={s.a} end={s.fin} className={claseEnlace}>
              {s.texto}
            </NavLink>
          ))}
        </nav>

        <div className={css.derecha}>
          {pathname !== "/operaciones/nueva" && (
            <EnlaceBoton to="/operaciones/nueva" variante="suave" icono={<Plus size={18} aria-hidden />} className={css.nueva}>
              <span className={css.textoNueva}>Nueva operación</span>
            </EnlaceBoton>
          )}
          <MenuPersona usuario={usuario} alSalir={alSalir} />
          <button
            type="button"
            className={css.botonMenu}
            aria-expanded={menuAbierto}
            aria-controls="menu-secciones"
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setMenuAbierto(!menuAbierto)}
          >
            {menuAbierto ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
      </div>

      {menuAbierto && (
        <nav id="menu-secciones" aria-label="Secciones" className={css.menuMovil}>
          {secciones.map((s) => (
            <NavLink key={s.a} to={s.a} end={s.fin} className={claseEnlace}>
              {s.texto}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Botón con el nombre de la persona que abre su menú (perfil, cerrar sesión). */
function MenuPersona({ usuario, alSalir }: { usuario: UsuarioYo; alSalir: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Se cierra con un clic afuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierto]);

  const iniciales = usuario.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  return (
    <div className={css.persona} ref={ref}>
      <button
        type="button"
        className={css.botonPersona}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={`Menú de ${usuario.nombre}`}
        onClick={() => setAbierto(!abierto)}
      >
        <span className={css.avatar} aria-hidden>
          {iniciales}
        </span>
        <span className={css.nombrePersona}>{usuario.nombre}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {abierto && (
        <div className={css.desplegable} role="menu">
          <div className={css.quien}>
            <p>{usuario.nombre}</p>
            <p className={css.correo}>{usuario.email}</p>
            <p className={css.correo}>{ROL[usuario.rol]}</p>
          </div>
          <Link to="/perfil" role="menuitem" className={css.opcion} onClick={() => setAbierto(false)}>
            <UserRound size={16} aria-hidden />
            Mi perfil
          </Link>
          <button type="button" role="menuitem" className={css.opcion} onClick={alSalir}>
            <LogOut size={16} aria-hidden />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
