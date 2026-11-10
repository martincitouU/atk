// Perfil: los datos de la sesión, cambiar la contraseña
// (POST /api/auth/change-password, de Better Auth) y cerrar sesión. Sirve
// al personal y a los clientes.

import { zodResolver } from "@hookform/resolvers/zod";
import { contrasena } from "@atk/shared";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useCambiarContrasena } from "../api/acciones.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { Boton } from "../componentes/Boton.tsx";
import { Entrada } from "../componentes/Campo.tsx";
import { EncabezadoPagina } from "../componentes/EncabezadoPagina.tsx";
import { Columnas, Datos, Pagina } from "../componentes/Pagina.tsx";
import { Tarjeta } from "../componentes/Tarjeta.tsx";
import { errorEnFormulario } from "../lib/formularios.ts";
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
        <CambiarContrasena />
      </Columnas>
    </Pagina>
  );
}

// La nueva cumple lo mismo que pide la API (mínimo 10); repetirla es solo del formulario
const esquema = z
  .object({
    actual: z.string().min(1, "Escribe tu contraseña actual"),
    nueva: contrasena,
    repetir: z.string(),
    cerrarOtras: z.boolean(),
  })
  .refine((d) => d.nueva === d.repetir, { path: ["repetir"], message: "Las contraseñas no coinciden" })
  .refine((d) => d.nueva !== d.actual, { path: ["nueva"], message: "La nueva debe ser distinta de la actual" });

type Valores = z.infer<typeof esquema>;

function CambiarContrasena() {
  const cambiar = useCambiarContrasena();
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError: marcar,
    formState: { errors },
  } = useForm<Valores>({ resolver: zodResolver(esquema), defaultValues: { actual: "", nueva: "", repetir: "", cerrarOtras: true } });

  const alEnviar = handleSubmit(async ({ actual, nueva, cerrarOtras }) => {
    setError(null);
    setListo(false);
    try {
      await cambiar.mutateAsync({ currentPassword: actual, newPassword: nueva, revokeOtherSessions: cerrarOtras });
      reset();
      setListo(true);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, [], {
          porCodigo: { INVALID_PASSWORD: "actual", PASSWORD_TOO_SHORT: "nueva", PASSWORD_TOO_LONG: "nueva" },
        }),
      );
    }
  });

  return (
    <Tarjeta titulo="Cambiar contraseña">
      {listo && <Aviso tono="exito">Contraseña cambiada. La próxima vez entra con la nueva.</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Entrada etiqueta="Contraseña actual" type="password" autoComplete="current-password" error={errors.actual?.message} {...register("actual")} />
        <Entrada
          etiqueta="Nueva contraseña"
          type="password"
          autoComplete="new-password"
          ayuda="Mínimo 10 caracteres."
          error={errors.nueva?.message}
          {...register("nueva")}
        />
        <Entrada etiqueta="Repite la nueva contraseña" type="password" autoComplete="new-password" error={errors.repetir?.message} {...register("repetir")} />
        <label className={css.casilla}>
          <input type="checkbox" {...register("cerrarOtras")} />
          Cerrar mis sesiones en otros dispositivos
        </label>
        <div className={css.acciones}>
          <Boton type="submit" variante="primario" cargando={cambiar.isPending}>
            Cambiar contraseña
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
