import { zodResolver } from "@hookform/resolvers/zod";
import { useState, type KeyboardEvent } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { ErrorNegocio } from "../api/cliente.ts";
import { useEntrar } from "../api/consultas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { ErrorCampo } from "../componentes/ErrorCampo.tsx";
import { Sep } from "../componentes/Sep.tsx";
import type { EstadoEntrar } from "../componentes/ConSesion.tsx";
import "../estilos/login.css";
import { DATOS_DE_EJEMPLO } from "./Ventanilla/comun.ts";

const Formulario = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Escriba su correo")
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Revise el correo: le falta la @ o el dominio"),
  password: z.string().min(1, "Escriba su contraseña"),
});

/**
 * La entrada: el letrero de ATK y el formulario, sin riel. Al entrar se va a
 * la Ventanilla; si la sesión se cerró por inactividad, lo dice arriba.
 */
export function Login() {
  const navegar = useNavigate();
  const { state } = useLocation() as { state: EstadoEntrar | null };
  const entrar = useEntrar();
  const [fallo, setFallo] = useState<string | null>(null);
  const [mayusculas, setMayusculas] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(Formulario), defaultValues: { email: "", password: "" } });

  const enviar = handleSubmit(async (datos) => {
    setFallo(null);
    try {
      await entrar.mutateAsync(datos);
      void navegar("/ventanilla", { replace: true });
    } catch (error) {
      if (error instanceof ErrorNegocio && error.codigo === "CREDENCIALES") {
        setError("password", { type: "server", message: error.message }, { shouldFocus: true });
      } else {
        setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo entrar. Inténtelo de nuevo.");
      }
    }
  });

  const avisarMayusculas = (e: KeyboardEvent<HTMLInputElement>) => setMayusculas(e.getModifierState("CapsLock"));
  const describir = (...ids: (string | false)[]) => ids.filter(Boolean).join(" ") || undefined;

  return (
    <main className="login" id="contenido">
      <div className="login-columna">
        <header className="login-letrero">
          <div className="login-letrero-in">
            <p className="login-marca">ATK</p>
            <p className="login-lugar">
              Casa de cambio
              <Sep />
              Coyhaique
            </p>
          </div>
        </header>

        <section className="login-panel" aria-labelledby="login-titulo">
          <h1 id="login-titulo">Iniciar sesión</h1>

          {state?.motivo === "inactividad" && (
            <Aviso tono="advertencia" rol="status" className="login-aviso">
              <b>Sesión cerrada por inactividad</b>
              <span>Entre de nuevo para seguir. Lo confirmado y los borradores quedan en el libro.</span>
            </Aviso>
          )}

          <form noValidate onSubmit={enviar}>
            <div className="login-campo">
              <label htmlFor="login-correo">Correo</label>
              <input
                id="login-correo"
                type="email"
                inputMode="email"
                autoComplete="username"
                // La entrada tiene una sola tarea: el foco parte en el correo.
                autoFocus
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={describir(errors.email !== undefined && "login-correo-error")}
                {...register("email")}
              />
              <ErrorCampo id="login-correo-error" mensaje={errors.email?.message} />
            </div>

            <div className="login-campo">
              <label htmlFor="login-clave">Contraseña</label>
              <input
                id="login-clave"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={describir(errors.password !== undefined && "login-clave-error", mayusculas && "login-mayus")}
                onKeyDown={avisarMayusculas}
                onKeyUp={avisarMayusculas}
                {...register("password")}
              />
              <ErrorCampo id="login-clave-error" mensaje={errors.password?.message} />
              {mayusculas && (
                <p className="login-mayus" id="login-mayus">
                  Bloq Mayús está activado
                </p>
              )}
            </div>

            {fallo && (
              <Aviso tono="error" rol="alert">
                {fallo}
              </Aviso>
            )}

            <button type="submit" className="btn prim" disabled={isSubmitting}>
              {isSubmitting ? "Entrando…" : "Entrar"}
            </button>
          </form>
        </section>

        {DATOS_DE_EJEMPLO && (
          <p className="login-ejemplo">
            Datos de ejemplo: <span className="num">rolando@atk.cl</span>
            <Sep />
            contraseña <span className="num">ventanilla</span>
          </p>
        )}
      </div>
    </main>
  );
}
