import { registroCliente } from "@atk/shared";
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { ErrorNegocio } from "../../api/cliente.ts";
import { useEntrar, useRegistrarCliente, useYo } from "../../api/consultas.ts";
import type { EntradaRegistro } from "../../api/esquemas.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { ErrorCampo } from "../../componentes/ErrorCampo.tsx";
import "../../estilos/portal.css";
import { Hitos, LetreroPortal } from "./Portal.tsx";

type Errores<K extends string> = Partial<Record<K, string>>;

/** Un campo con su rótulo arriba y su error debajo, fuera del rótulo (como en Clientes). */
function Campo({ id, rotulo, error, ayuda, ...input }: { id: string; rotulo: string; error?: string | undefined; ayuda?: string } & ComponentProps<"input">) {
  const describe = [error ? `${id}-error` : null, ayuda ? `${id}-ayuda` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="portal-campo">
      <label htmlFor={id}>{rotulo}</label>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describe} {...input} />
      {ayuda && !error && (
        <p className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </p>
      )}
      <ErrorCampo id={`${id}-error`} mensaje={error} />
    </div>
  );
}

/** Si ya hay sesión, el ingreso no se muestra: el cliente va a su cuenta y el personal a la Ventanilla. */
function useYaDentro(): string | null {
  const yo = useYo();
  if (!yo.data) return null;
  return yo.data.tipo === "cliente" ? "/mi" : "/ventanilla";
}

// ---------------------------------------------------------------------------
// Entrar

export function PortalEntrar() {
  const navegar = useNavigate();
  const entrar = useEntrar();
  const destino = useYaDentro();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errores, setErrores] = useState<Errores<"email" | "password">>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const primero = useRef<HTMLInputElement>(null);

  useEffect(() => primero.current?.focus(), []);
  if (destino) return <Navigate to={destino} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setFallo(null);
    const nuevos: Errores<"email" | "password"> = {
      ...(email.trim() ? {} : { email: "Escriba su correo" }),
      ...(password ? {} : { password: "Escriba su contraseña" }),
    };
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;
    try {
      await entrar.mutateAsync({ email: email.trim(), password });
      void navegar("/mi", { replace: true });
    } catch (error) {
      if (error instanceof ErrorNegocio && error.codigo === "CREDENCIALES") setErrores({ password: error.message });
      else setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo entrar. Inténtelo de nuevo.");
    }
  }

  return (
    <div className="portal acceso">
      <LetreroPortal />
      <main className="portal-cuerpo" id="contenido">
        <div className="portal-titulo">
          <h1>Entre a su cuenta</h1>
          <p>Para ver lo que ha cambiado en ATK.</p>
        </div>
        <form className="portal-form" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo
            ref={primero}
            id="mi-correo"
            rotulo="Correo"
            type="email"
            autoComplete="username"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errores.email}
          />
          <Campo
            id="mi-clave"
            rotulo="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errores.password}
          />
          {fallo && (
            <Aviso tono="error" rol="alert">
              <p>{fallo}</p>
            </Aviso>
          )}
          <button type="submit" className="portal-prim" disabled={entrar.isPending}>
            {entrar.isPending ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <p className="portal-otro">
          ¿Todavía no tiene cuenta? <Link to="/mi/registro">Crear mi cuenta</Link>
        </p>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Crear la cuenta

type CampoRegistro = keyof EntradaRegistro;

export function PortalRegistro() {
  const navegar = useNavigate();
  const registrar = useRegistrarCliente();
  const entrar = useEntrar();
  const destino = useYaDentro();
  const [v, setV] = useState<EntradaRegistro>({ nombre: "", rut: "", email: "", contrasena: "" });
  const [errores, setErrores] = useState<Errores<CampoRegistro>>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const primero = useRef<HTMLInputElement>(null);

  useEffect(() => primero.current?.focus(), []);
  useEffect(() => {
    if (Object.keys(errores).length > 0) formulario.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [errores]);
  if (destino) return <Navigate to={destino} replace />;

  const campo = (k: CampoRegistro) => ({ value: v[k], onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }), error: errores[k] });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setFallo(null);
    // El mismo esquema que valida la API: el RUT con su dígito, el correo y el largo de la contraseña
    const revision = registroCliente.safeParse(v);
    if (!revision.success) {
      const nuevos: Errores<CampoRegistro> = {};
      for (const i of revision.error.issues) nuevos[i.path[0] as CampoRegistro] ??= i.message;
      setErrores(nuevos);
      return;
    }
    setErrores({});
    try {
      await registrar.mutateAsync(v);
    } catch (error) {
      if (error instanceof ErrorNegocio && error.codigo === "CORREO_EN_USO") setErrores({ email: error.message });
      else if (error instanceof ErrorNegocio && error.detalles.length > 0) {
        setErrores(Object.fromEntries(error.detalles.map((d) => [d.campo, d.mensaje])) as Errores<CampoRegistro>);
      } else if (error instanceof ErrorNegocio && error.codigo === "DEMASIADOS_INTENTOS") {
        setFallo("Se crearon demasiadas cuentas desde esta conexión. Vuelva a intentarlo en una hora.");
      } else setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo crear la cuenta. Inténtelo de nuevo.");
      return;
    }
    // Creada: entra con lo que escribió y ve el paso que le falta
    try {
      await entrar.mutateAsync({ email: v.email.trim(), password: v.contrasena });
      void navegar("/mi", { replace: true });
    } catch {
      void navegar("/mi/entrar", { replace: true });
    }
  }

  const ocupado = registrar.isPending || entrar.isPending;

  return (
    <div className="portal acceso">
      <LetreroPortal />
      <main className="portal-cuerpo" id="contenido">
        <div className="portal-titulo">
          <h1>Vea sus operaciones desde el teléfono</h1>
          <p>Cree su cuenta aquí. La activamos en el local, cuando nos muestre su carnet.</p>
        </div>
        <Hitos pasos={["aqui", "pendiente", "pendiente"]} />
        <form ref={formulario} className="portal-form" onSubmit={(e) => void enviar(e)} noValidate>
          <Campo ref={primero} id="reg-nombre" rotulo="Nombre completo" autoComplete="name" {...campo("nombre")} />
          <Campo id="reg-rut" rotulo="RUT" className="num" autoComplete="off" spellCheck={false} placeholder="12.345.678-5" {...campo("rut")} />
          <Campo id="reg-correo" rotulo="Correo" type="email" autoComplete="email" spellCheck={false} placeholder="nombre@correo.cl" {...campo("email")} />
          <Campo
            id="reg-clave"
            rotulo="Contraseña"
            type="password"
            autoComplete="new-password"
            ayuda="Al menos 10 caracteres."
            {...campo("contrasena")}
          />
          {fallo && (
            <Aviso tono="error" rol="alert">
              <p>{fallo}</p>
            </Aviso>
          )}
          <button type="submit" className="portal-prim" disabled={ocupado}>
            {ocupado ? "Creando su cuenta…" : "Crear mi cuenta"}
          </button>
        </form>
        <p className="portal-otro">
          ¿Ya tiene cuenta? <Link to="/mi/entrar">Entrar</Link>
        </p>
      </main>
    </div>
  );
}
