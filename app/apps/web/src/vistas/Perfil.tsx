// Perfil: los datos de la sesión, cambiar la contraseña
// (POST /api/auth/change-password, se conecta en F3) y cerrar sesión. Sirve
// al personal y a los clientes.

import { LogOut } from "lucide-react";
import { Aviso } from "../componentes/Aviso.tsx";
import { Boton } from "../componentes/Boton.tsx";
import { Entrada } from "../componentes/Campo.tsx";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina.tsx";
import { Columnas, Datos, Pagina } from "../componentes/Pagina.tsx";
import { Tarjeta } from "../componentes/Tarjeta.tsx";
import { formatearRut } from "../lib/rut.ts";
import { ROL } from "../lib/textos.ts";
import { useSalir, useSesion } from "../sesion/Sesion.tsx";
import css from "./personal/Personal.module.css";

export function Perfil() {
  const { sesion } = useSesion();
  const { salir, error } = useSalir();
  if (!sesion) return null;

  const datos =
    sesion.tipo === "personal"
      ? [
          { etiqueta: "Nombre", valor: sesion.usuario.nombre },
          { etiqueta: "Correo", valor: sesion.usuario.email },
          { etiqueta: "Rol", valor: ROL[sesion.usuario.rol] },
        ]
      : [
          { etiqueta: "Nombre", valor: sesion.cuenta.nombre },
          { etiqueta: "RUT", valor: formatearRut(sesion.cuenta.rut) },
        ];

  return (
    <Pagina>
      <EncabezadoPagina titulo="Mi perfil" />
      <Columnas
        lateral={
          <Tarjeta titulo="Sesión" descripcion="Se cierra sola tras 15 minutos sin uso. En un computador compartido, ciérrala al terminar.">
            {error && <Aviso tono="error">{error}</Aviso>}
            <Boton icono={<LogOut size={18} aria-hidden />} onClick={salir}>
              Cerrar sesión
            </Boton>
          </Tarjeta>
        }
      >
        <Tarjeta titulo="Tus datos">
          <Datos filas={datos} />
        </Tarjeta>
        <Tarjeta titulo="Cambiar contraseña">
          <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
            <Entrada etiqueta="Contraseña actual" type="password" autoComplete="current-password" />
            <Entrada etiqueta="Nueva contraseña" type="password" autoComplete="new-password" ayuda="Mínimo 10 caracteres." />
            <Entrada etiqueta="Repite la nueva contraseña" type="password" autoComplete="new-password" />
            <label className={css.casilla}>
              <input type="checkbox" defaultChecked />
              Cerrar mis sesiones en otros dispositivos
            </label>
            <div className={css.acciones}>
              <Boton type="submit" variante="primario">
                Cambiar contraseña
              </Boton>
            </div>
          </form>
        </Tarjeta>
      </Columnas>
    </Pagina>
  );
}
