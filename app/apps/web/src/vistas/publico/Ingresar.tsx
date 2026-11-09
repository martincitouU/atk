// Login del personal y de los clientes: correo y contraseña.
//
// ESQUELETO (F1): todavía no llama a la API. El selector "Entrar como"
// abre una sesión de ejemplo para recorrer las vistas de cada rol; en F2 se
// borra y el formulario llama a POST /api/auth/sign-in/email.

import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada, Seleccion } from "../../componentes/Campo.tsx";
import { useTituloPestana } from "../../componentes/EncabezadoPagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import type { SesionEjemplo } from "../../ejemplo/datos.ts";
import { useSesion } from "../../sesion/Sesion.tsx";
import css from "./Publico.module.css";

const OPCIONES_EJEMPLO: { valor: SesionEjemplo; texto: string }[] = [
  { valor: "cajero", texto: "Cajero (con turno abierto)" },
  { valor: "supervisor", texto: "Supervisor (sin turno)" },
  { valor: "admin", texto: "Admin" },
  { valor: "clientePendiente", texto: "Cliente con cuenta pendiente" },
  { valor: "clienteVerificado", texto: "Cliente verificado" },
];

export function Ingresar() {
  useTituloPestana("Ingresar");
  const { entrarComoEjemplo } = useSesion();
  const [como, setComo] = useState<SesionEjemplo>("cajero");

  // Con la sesión abierta, MarcoPublico lleva a la vista que se pidió
  function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    entrarComoEjemplo(como);
  }

  return (
    <Tarjeta elevada className={css.tarjeta}>
      <div className={css.cabecera}>
        <h1 className={css.titulo}>Ingresar</h1>
        <p className={css.bajada}>Con el correo y la contraseña de tu cuenta.</p>
      </div>

      <form className={css.formulario} onSubmit={alEnviar}>
        <Entrada etiqueta="Correo" type="email" name="email" autoComplete="username" placeholder="nombre@correo.cl" />
        <Entrada etiqueta="Contraseña" type="password" name="password" autoComplete="current-password" />

        <div className={css.ejemplo}>
          <Seleccion etiqueta="Entrar como (solo en el esqueleto)" value={como} onChange={(e) => setComo(e.target.value as SesionEjemplo)}>
            {OPCIONES_EJEMPLO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </Seleccion>
        </div>

        <Boton type="submit" variante="primario" anchoCompleto>
          Ingresar
        </Boton>
      </form>

      <p className={css.pie}>
        ¿Eres cliente y no tienes cuenta? <Link to="/registro">Crea tu cuenta</Link>
      </p>
    </Tarjeta>
  );
}
