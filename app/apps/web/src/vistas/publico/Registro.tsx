// Registro de clientes en el portal (POST /api/registro). La cuenta queda
// pendiente hasta que un cajero revisa el carnet en el local.
//
// ESQUELETO (F1): al enviar muestra el mensaje final sin llamar a la API.

import { CircleCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { Entrada } from "../../componentes/Campo.tsx";
import { useTituloPestana } from "../../componentes/EncabezadoPagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import css from "./Publico.module.css";

export function Registro() {
  useTituloPestana("Crear cuenta");
  const [enviado, setEnviado] = useState(false);

  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    setEnviado(true);
  }

  if (enviado) {
    return (
      <Tarjeta elevada className={css.tarjeta}>
        <div className={css.listo}>
          <CircleCheck size={40} aria-hidden className={css.iconoListo} />
          <h1 className={css.titulo}>Cuenta creada</h1>
          <p className={css.bajada}>
            Para ver tus operaciones, acércate al local con tu carnet. Un cajero confirmará que el RUT es tuyo y activará tu cuenta.
          </p>
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

      <form className={css.formulario} onSubmit={alEnviar}>
        <Entrada etiqueta="Nombre completo" name="nombre" autoComplete="name" />
        <Entrada etiqueta="RUT" name="rut" placeholder="12.345.678-5" ayuda="El mismo de tu carnet: lo revisaremos en el local." />
        <Entrada etiqueta="Correo" type="email" name="email" autoComplete="email" />
        <Entrada etiqueta="Contraseña" type="password" name="contrasena" autoComplete="new-password" ayuda="Mínimo 10 caracteres." />
        <Entrada etiqueta="Repite la contraseña" type="password" name="repetir" autoComplete="new-password" />
        <Boton type="submit" variante="primario" anchoCompleto>
          Crear cuenta
        </Boton>
      </form>

      <p className={css.pie}>
        ¿Ya tienes cuenta? <Link to="/ingresar">Ingresa</Link>
      </p>
    </Tarjeta>
  );
}
