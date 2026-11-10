// Registro de clientes en el portal (POST /api/registro). La cuenta queda
// pendiente hasta que un cajero revisa el carnet en el local.
//
// Se valida con el mismo esquema que la API (registroCliente, de
// @atk/shared): el RUT y el correo se revisan aquí antes de enviarlos, y lo
// que la API rechace igual aparece junto a su campo.

import { zodResolver } from "@hookform/resolvers/zod";
import { registroCliente } from "@atk/shared";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { enviar } from "../../api/cliente.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { Entrada } from "../../componentes/Campo.tsx";
import { useTituloPestana } from "../../componentes/EncabezadoPagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { errorEnFormulario } from "../../lib/formularios.ts";
import css from "./Publico.module.css";

// Lo de la API y, solo en el formulario, repetir la contraseña
const esquema = registroCliente
  .extend({ repetir: z.string() })
  .refine((datos) => datos.contrasena === datos.repetir, { path: ["repetir"], message: "Las contraseñas no coinciden" });

type Valores = z.input<typeof esquema>;
type Campo = keyof Valores;
const CAMPOS: readonly Campo[] = ["nombre", "rut", "email", "contrasena"];

/** Los errores de la API que corresponden a un campo. */
const CAMPO_DEL_CODIGO: Record<string, Campo> = { CORREO_EN_USO: "email", CONTRASENA_CORTA: "contrasena" };

export function Registro() {
  useTituloPestana("Crear cuenta");
  const [creada, setCreada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: marcarCampo,
    formState: { errors, isSubmitting },
  } = useForm<Valores, unknown, z.output<typeof esquema>>({ resolver: zodResolver(esquema) });

  const alEnviar = handleSubmit(async ({ repetir: _repetir, ...datos }) => {
    setError(null);
    try {
      await enviar("/api/registro", datos);
      setCreada(true);
    } catch (e) {
      setError(errorEnFormulario(e, marcarCampo, CAMPOS, { porCodigo: CAMPO_DEL_CODIGO }));
    }
  });

  if (creada) {
    return (
      <Tarjeta elevada className={css.tarjeta}>
        <div className={css.listo}>
          <CircleCheck size={40} aria-hidden className={css.iconoListo} />
          <h1 className={css.titulo}>Cuenta creada</h1>
          <p className={css.bajada}>Para ver tus operaciones, acércate al local con tu carnet. Un cajero confirmará que el RUT es tuyo y activará tu cuenta.</p>
        </div>
        <EnlaceBoton to="/ingresar" variante="secundario" anchoCompleto>
          Ir a ingresar
        </EnlaceBoton>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta elevada className={css.tarjeta}>
      <div className={css.cabecera}>
        <h1 className={css.titulo}>Crea tu cuenta</h1>
        <p className={css.bajada}>Para consultar tus operaciones con nosotros. No sirve para operar en línea.</p>
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}

      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Entrada etiqueta="Nombre completo" autoComplete="name" error={errors.nombre?.message} {...register("nombre")} />
        <Entrada
          etiqueta="RUT"
          placeholder="12.345.678-5"
          ayuda="El mismo de tu carnet: lo revisaremos en el local."
          error={errors.rut?.message}
          {...register("rut")}
        />
        <Entrada etiqueta="Correo" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
        <Entrada
          etiqueta="Contraseña"
          type="password"
          autoComplete="new-password"
          ayuda="Mínimo 10 caracteres."
          error={errors.contrasena?.message}
          {...register("contrasena")}
        />
        <Entrada etiqueta="Repite la contraseña" type="password" autoComplete="new-password" error={errors.repetir?.message} {...register("repetir")} />
        <Boton type="submit" variante="primario" anchoCompleto cargando={isSubmitting}>
          Crear cuenta
        </Boton>
      </form>

      <p className={css.pie}>
        ¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link>
      </p>
    </Tarjeta>
  );
}
