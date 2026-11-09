// Marcos: lo que rodea a cada vista según quién la usa.
//
//   MarcoPersonal  barra de navegación por rol + la vista (personal)
//   MarcoCliente   barra simple + la vista (portal de clientes)
//   MarcoPublico   fondo con orbes + la vista centrada (login, registro)
//
// También deciden quién entra: sin sesión se va al login; una sesión del
// tipo equivocado se va a su propio inicio.

import { LogOut } from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router";
import { useCatalogo } from "../api/consultas.ts";
import type { Rol } from "../api/tipos.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { Boton } from "../componentes/Boton.tsx";
import { Marca } from "../componentes/Marca.tsx";
import { Orbes } from "../componentes/Orbes.tsx";
import { conexionSinCifrar } from "../lib/seguridad.ts";
import { useSesion } from "../sesion/Sesion.tsx";
import { SinPermiso } from "../vistas/SinPermiso.tsx";
import { AvisoEsqueleto } from "./AvisoEsqueleto.tsx";
import { BarraNavegacion } from "./BarraNavegacion.tsx";
import css from "./Marcos.module.css";

/** El nombre que se muestra de la casa: el de fantasía o la razón social. */
function useNombreCasa() {
  const { data } = useCatalogo();
  return data?.casa?.nombreFantasia ?? data?.casa?.razonSocial ?? "Casa de cambio";
}

export function MarcoPersonal() {
  const { sesion, salir } = useSesion();
  const ubicacion = useLocation();
  const nombreCasa = useNombreCasa();

  if (!sesion) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (sesion.tipo === "cliente") return <Navigate to="/mi" replace />;

  return (
    <>
      <AvisoEsqueleto />
      <BarraNavegacion nombreCasa={nombreCasa} usuario={sesion.usuario} alSalir={salir} />
      <main className={css.principal}>
        <Outlet />
      </main>
    </>
  );
}

/** Una parte del personal reservada a ciertos roles (por ejemplo, Administración). */
export function SoloRoles({ roles }: { roles: Rol[] }) {
  const { sesion } = useSesion();
  if (sesion?.tipo !== "personal" || !roles.includes(sesion.usuario.rol)) return <SinPermiso />;
  return <Outlet />;
}

const claseEnlaceCliente = ({ isActive }: { isActive: boolean }) => (isActive ? `${css.enlaceCliente} ${css.activo}` : css.enlaceCliente);

export function MarcoCliente() {
  const { sesion, salir } = useSesion();
  const ubicacion = useLocation();
  const nombreCasa = useNombreCasa();

  if (!sesion) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname }} />;
  if (sesion.tipo === "personal") return <Navigate to="/" replace />;

  return (
    <div className={css.conOrbes}>
      <Orbes />
      <AvisoEsqueleto />
      <header className={css.barraCliente}>
        <Marca nombre={nombreCasa} compactaEnMovil />
        <nav aria-label="Secciones" className={css.navCliente}>
          <NavLink to="/mi" end className={claseEnlaceCliente}>
            Mi cuenta
          </NavLink>
          <NavLink to="/mi/perfil" className={claseEnlaceCliente}>
            Perfil
          </NavLink>
          <Boton variante="texto" icono={<LogOut size={18} aria-hidden />} onClick={salir}>
            Salir
          </Boton>
        </nav>
      </header>
      <main className={`${css.principal} ${css.encima}`}>
        <Outlet />
      </main>
    </div>
  );
}

export function MarcoPublico() {
  const { sesion } = useSesion();
  const nombreCasa = useNombreCasa();
  // La vista que se pidió antes de ir al login (la anota el marco que redirigió)
  const desde = (useLocation().state as { desde?: string } | null)?.desde;

  // Con sesión (recién iniciada o de antes), el login no tiene sentido: a
  // la vista que se pidió o a su inicio. Es el único lugar que decide esto.
  if (sesion) return <Navigate to={desde ?? (sesion.tipo === "personal" ? "/" : "/mi")} replace />;

  return (
    <div className={`${css.conOrbes} ${css.publico}`}>
      <Orbes />
      <AvisoEsqueleto />
      <div className={css.centro}>
        <Marca nombre={nombreCasa} tamano="grande" />
        {conexionSinCifrar() && (
          <div className={css.avisoHttp}>
            <Aviso tono="atencion" titulo="Conexión sin cifrar">
              Este sitio todavía no tiene HTTPS: usa solo datos de prueba y una contraseña que no uses en otro lado.
            </Aviso>
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
