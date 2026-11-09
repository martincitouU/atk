// Login del personal y de los clientes: correo y contraseña
// (POST /api/auth/sign-in/email). Con la sesión abierta, MarcoPublico lleva
// a la vista que se pidió o al inicio de cada uno.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { mensajeDe } from "../../api/cliente.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada } from "../../componentes/Campo.tsx";
import { useTituloPestana } from "../../componentes/EncabezadoPagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { useSesion } from "../../sesion/Sesion.tsx";
import css from "./Publico.module.css";

type Formulario = { email: string; contrasena: string };

export function Ingresar() {
  useTituloPestana("Ingresar");
  const { ingresar, cierre } = useSesion();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Formulario>();

  const alEnviar = handleSubmit(async ({ email, contrasena }) => {
    setError(null);
    try {
      await ingresar(email.trim(), contrasena);
    } catch (e) {
      setError(mensajeDe(e));
    }
  });

  return (
    <Tarjeta elevada className={css.tarjeta}>
      <div className={css.cabecera}>
        <h1 className={css.titulo}>Ingresar</h1>
        <p className={css.bajada}>Con el correo y la contraseña de tu cuenta.</p>
      </div>

      {error ? (
        <Aviso tono="error">{error}</Aviso>
      ) : (
        cierre === "inactividad" && (
          <Aviso tono="atencion" titulo="Tu sesión se cerró por inactividad">
            Ingresa de nuevo para seguir donde estabas.
          </Aviso>
        )
      )}

      {/* noValidate: los mensajes son los nuestros, en español y junto al campo */}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Entrada
          etiqueta="Correo"
          type="email"
          autoComplete="username"
          placeholder="nombre@correo.cl"
          error={errors.email?.message}
          {...register("email", { required: "Escribe tu correo" })}
        />
        <Entrada
          etiqueta="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.contrasena?.message}
          {...register("contrasena", { required: "Escribe tu contraseña" })}
        />
        <Boton type="submit" variante="primario" anchoCompleto cargando={isSubmitting}>
          Ingresar
        </Boton>
      </form>

      <p className={css.pie}>
        ¿Eres cliente y no tienes cuenta? <Link to="/registro">Crea tu cuenta</Link>
      </p>
    </Tarjeta>
  );
}
