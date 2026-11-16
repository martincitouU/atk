import { entradaUsuario, ROLES, type Rol } from "@atk/shared";
import { CheckCircleIcon, ClockCounterClockwiseIcon, GearIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ErrorNegocio } from "../api/cliente.ts";
import { useCrearUsuario, useEditarUsuario, useRestablecerContrasena, useSesion, useUsuarios } from "../api/consultas.ts";
import type { Usuario } from "../api/esquemas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { useCinta } from "../componentes/Cinta.tsx";
import { ErrorCampo } from "../componentes/ErrorCampo.tsx";
import { Sep } from "../componentes/Sep.tsx";
import { rutConPuntos } from "../comun.ts";
import "../estilos/clientes.css";
import "../estilos/admin.css";

/** Los roles en el idioma del local, con lo que puede cada uno (docs/api.md, «Roles»). */
const ROL: Record<Rol, { nombre: string; puede: string }> = {
  CAJERO: { nombre: "Cajero", puede: "Opera en la ventanilla, cuenta su caja y registra gastos en efectivo." },
  SUPERVISOR: { nombre: "Supervisor", puede: "Además reversa operaciones y gastos, ajusta la caja y ve la Jornada." },
  ADMIN: { nombre: "Administrador", puede: "Todo: además publica la pizarra, maneja el personal y ve la auditoría." },
};

const mensajeDe = (error: unknown, otro: string) => (error instanceof ErrorNegocio ? error.message : otro);

type Lado = { tipo: "nuevo" } | { tipo: "editar"; id: number } | null;

/**
 * El personal de la casa (RF-14, solo ADMIN): quién puede entrar, con qué rol
 * y si está activo. Crear, editar y fijar una contraseña nueva van en el panel
 * de la derecha; desactivar a alguien cierra sus sesiones.
 */
export function Usuarios() {
  const usuarios = useUsuarios();
  const { data: sesion } = useSesion();
  const [lado, setLado] = useState<Lado>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const lista = usuarios.data ?? [];
  const elegido = lado?.tipo === "editar" ? (lista.find((u) => u.id === lado.id) ?? null) : null;
  const activos = lista.filter((u) => u.activo).length;

  function terminar(mensaje: string | null) {
    setLado(null);
    if (mensaje) setHecho(mensaje);
  }

  function nuevo() {
    setHecho(null);
    setLado({ tipo: "nuevo" });
  }

  const navegar = useNavigate();
  useCinta([
    {
      nombre: "Personal",
      comandos: [
        { id: "nuevo", etiqueta: "Nuevo usuario", Icono: PlusIcon, grande: true, alPulsar: nuevo },
        { id: "cerrar", etiqueta: "Cerrar el panel", Icono: XIcon, deshabilitado: lado === null, alPulsar: () => setLado(null) },
      ],
      nota: [`${lista.length} ${lista.length === 1 ? "persona" : "personas"}`, `${activos} ${activos === 1 ? "activa" : "activas"}`],
    },
    {
      nombre: "Ir a",
      comandos: [
        { id: "auditoria", etiqueta: "Auditoría", Icono: ClockCounterClockwiseIcon, grande: true, alPulsar: () => void navegar("/auditoria") },
        { id: "config", etiqueta: "Configuración", Icono: GearIcon, tecla: "F5", grande: true, alPulsar: () => void navegar("/configuracion") },
      ],
    },
  ]);

  let panel: ReactNode = <GuiaRoles />;
  if (lado?.tipo === "nuevo") panel = <NuevoUsuario onCerrar={terminar} />;
  else if (elegido) panel = <EditarUsuario key={elegido.id} usuario={elegido} esUsted={elegido.id === sesion?.usuario.id} onCerrar={terminar} />;

  return (
    <div className="config admin">
      <header className="cartel-seccion gris">
        <div className="cartel-seccion-in">
          <div className="cartel-titulo">
            <h1>Usuarios</h1>
            <p>El personal de la casa</p>
          </div>
          <button type="button" className="btn-cartel" onClick={nuevo}>
            <PlusIcon size={16} weight="bold" aria-hidden="true" />
            Nuevo usuario
          </button>
        </div>
      </header>

      <p className="admin-hecho" aria-live="polite">
        {hecho && (
          <>
            <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />
            {hecho}
          </>
        )}
      </p>

      <div className="admin-trabajo">
        <section className="panel" aria-labelledby="usuarios-titulo">
          <header>
            <h2 id="usuarios-titulo">Personal</h2>
            {usuarios.isSuccess && (
              <p className="hint">
                {lista.length} {lista.length === 1 ? "persona" : "personas"}
                <Sep />
                {activos} {activos === 1 ? "activa" : "activas"}
              </p>
            )}
          </header>
          {usuarios.isError ? (
            <div className="clientes-estado">
              <Aviso tono="error" rol="alert">
                <p>{mensajeDe(usuarios.error, "No se pudo cargar el personal.")}</p>
              </Aviso>
            </div>
          ) : (
            <div className="admin-tabla">
              <table aria-labelledby="usuarios-titulo" aria-busy={usuarios.isPending || undefined}>
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col" className="admin-col-rut">
                      RUT
                    </th>
                    <th scope="col">Rol</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((u) => (
                    <tr key={u.id} className={u.id === elegido?.id ? "elegido" : undefined}>
                      <td>
                        <button
                          type="button"
                          className="admin-nombre"
                          aria-current={u.id === elegido?.id ? "true" : undefined}
                          onClick={() => {
                            setHecho(null);
                            setLado({ tipo: "editar", id: u.id });
                          }}
                        >
                          {u.nombre}
                        </button>
                        <span className="admin-correo">{u.email}</span>
                      </td>
                      <td className="num admin-col-rut">{rutConPuntos(u.rut)}</td>
                      <td>{ROL[u.rol].nombre}</td>
                      <td>
                        {u.activo ? <span className="est ok">Activo</span> : <span className="est rev">Inactivo</span>}
                        {!u.tieneCuenta && <span className="admin-sin-cuenta">Sin cuenta para entrar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {panel}
      </div>
    </div>
  );
}

/** Sin nadie elegido: qué permite cada rol. */
function GuiaRoles() {
  return (
    <section className="panel admin-lado" aria-labelledby="roles-titulo">
      <header>
        <h2 id="roles-titulo">Los roles</h2>
      </header>
      <dl className="admin-roles">
        {ROLES.map((r) => (
          <div key={r}>
            <dt>{ROL[r].nombre}</dt>
            <dd>{ROL[r].puede}</dd>
          </div>
        ))}
      </dl>
      <p className="admin-nota">Elija a una persona de la lista para cambiar su rol, desactivarla o darle una contraseña nueva.</p>
    </section>
  );
}

function Lado({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <section
      className="panel admin-lado"
      aria-label={titulo}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCerrar();
        }
      }}
    >
      <header>
        <h2>{titulo}</h2>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
          <XIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </header>
      {children}
    </section>
  );
}

type CamposNuevo = { nombre: string; rut: string; email: string; rol: Rol; contrasena: string };
type Errores = Partial<Record<keyof CamposNuevo, string>>;

/** Crear: los mismos esquemas que la API (entradaUsuario), así el error sale junto a su campo. */
function NuevoUsuario({ onCerrar }: { onCerrar: (mensaje: string | null) => void }) {
  const crear = useCrearUsuario();
  const [v, setV] = useState<CamposNuevo>({ nombre: "", rut: "", email: "", rol: "CAJERO", contrasena: "" });
  const [errores, setErrores] = useState<Errores>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const primero = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);

  useEffect(() => primero.current?.focus(), []);

  const campo = (k: keyof CamposNuevo) => ({
    id: `nuevo-${k}`,
    value: v[k],
    onChange: (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value }),
    "aria-invalid": errores[k] ? true : undefined,
    "aria-describedby": errores[k] ? `nuevo-${k}-error` : undefined,
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setFallo(null);
    const revision = entradaUsuario.safeParse(v);
    if (!revision.success) {
      const nuevos: Errores = {};
      for (const i of revision.error.issues) {
        const k = i.path[0] as keyof CamposNuevo;
        nuevos[k] ??= i.message;
      }
      setErrores(nuevos);
      formulario.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
      return;
    }
    setErrores({});
    try {
      const u = await crear.mutateAsync(v);
      onCerrar(`${u.nombre} ya puede entrar como ${ROL[u.rol].nombre.toLowerCase()}, con el correo ${u.email}.`);
    } catch (error) {
      setFallo(mensajeDe(error, "No se pudo crear el usuario. Inténtelo de nuevo."));
    }
  }

  return (
    <Lado titulo="Nuevo usuario" onCerrar={() => onCerrar(null)}>
      <form ref={formulario} className="admin-form" onSubmit={(e) => void enviar(e)} noValidate>
        <div className="admin-campo">
          <label htmlFor="nuevo-nombre">Nombre completo</label>
          <input ref={primero} autoComplete="off" {...campo("nombre")} />
          <ErrorCampo id="nuevo-nombre-error" mensaje={errores.nombre} />
        </div>
        <div className="admin-duo">
          <div className="admin-campo">
            <label htmlFor="nuevo-rut">RUT</label>
            <input className="num" autoComplete="off" spellCheck={false} placeholder="12.345.678-5" {...campo("rut")} />
            <ErrorCampo id="nuevo-rut-error" mensaje={errores.rut} />
          </div>
          <label>
            Rol
            <select value={v.rol} onChange={(e) => setV({ ...v, rol: e.target.value as Rol })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROL[r].nombre}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-campo">
          <label htmlFor="nuevo-email">Correo (con él inicia sesión)</label>
          <input type="email" autoComplete="off" spellCheck={false} {...campo("email")} />
          <ErrorCampo id="nuevo-email-error" mensaje={errores.email} />
        </div>
        <div className="admin-campo">
          <label htmlFor="nuevo-contrasena">Contraseña inicial</label>
          <input type="password" autoComplete="new-password" {...campo("contrasena")} />
          <ErrorCampo id="nuevo-contrasena-error" mensaje={errores.contrasena} />
        </div>
        <p className="hint">{ROL[v.rol].puede} Al menos 10 caracteres de contraseña; la persona la cambia después en Configuración.</p>
        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
        <div className="acciones">
          <button type="submit" className="btn prim" disabled={crear.isPending}>
            {crear.isPending ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </Lado>
  );
}

/** Editar: nombre, rol y si está activo; y, aparte, una contraseña nueva. */
function EditarUsuario({ usuario, esUsted, onCerrar }: { usuario: Usuario; esUsted: boolean; onCerrar: (mensaje: string | null) => void }) {
  const editar = useEditarUsuario();
  const contrasena = useRestablecerContrasena();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [clave, setClave] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const [falloClave, setFalloClave] = useState<string | null>(null);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setFallo(null);
    const cambios = {
      ...(nombre.trim() !== usuario.nombre ? { nombre } : {}),
      ...(rol !== usuario.rol ? { rol } : {}),
      ...(activo !== usuario.activo ? { activo } : {}),
    };
    if (Object.keys(cambios).length === 0) {
      onCerrar(null);
      return;
    }
    try {
      const u = await editar.mutateAsync({ id: usuario.id, cambios });
      onCerrar(
        u.activo
          ? `Guardado: ${u.nombre}, ${ROL[u.rol].nombre.toLowerCase()}.`
          : `${u.nombre} quedó inactivo: sus sesiones se cerraron y ya no puede entrar.`,
      );
    } catch (error) {
      setFallo(mensajeDe(error, "No se pudo guardar. Inténtelo de nuevo."));
    }
  }

  async function fijarClave(e: FormEvent) {
    e.preventDefault();
    setFalloClave(null);
    if (clave.length < 10) {
      setFalloClave("La contraseña debe tener al menos 10 caracteres");
      return;
    }
    try {
      await contrasena.mutateAsync({ id: usuario.id, contrasena: clave });
      onCerrar(`Contraseña nueva para ${usuario.nombre}: sus sesiones abiertas se cerraron.`);
    } catch (error) {
      setFalloClave(mensajeDe(error, "No se pudo fijar la contraseña. Inténtelo de nuevo."));
    }
  }

  return (
    <Lado titulo={usuario.nombre} onCerrar={() => onCerrar(null)}>
      <form className="admin-form" onSubmit={(e) => void guardar(e)}>
        <p className="admin-dato">
          {usuario.email}
          <Sep />
          RUT <span className="num">{rutConPuntos(usuario.rut)}</span>
        </p>
        <label>
          Nombre completo
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Rol
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            disabled={esUsted}
            aria-describedby={esUsted ? "usted-nota" : undefined}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL[r].nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} disabled={esUsted} />
          Activo: puede iniciar sesión
        </label>
        {esUsted && (
          <p id="usted-nota" className="hint">
            Es su propia cuenta: no puede quitarse el rol de administrador ni desactivarse.
          </p>
        )}
        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
        <div className="acciones">
          <button type="submit" className="btn prim" disabled={editar.isPending}>
            {editar.isPending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>

      <form className="admin-form admin-clave" onSubmit={(e) => void fijarClave(e)} noValidate>
        <div className="admin-campo">
          <label htmlFor="clave-nueva">Contraseña nueva</label>
          <input
            id="clave-nueva"
            type="password"
            autoComplete="new-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            aria-invalid={falloClave ? true : undefined}
            aria-describedby={falloClave ? "clave-error" : "clave-nota"}
          />
          <ErrorCampo id="clave-error" mensaje={falloClave ?? undefined} />
        </div>
        <p id="clave-nota" className="hint">
          Al fijarla se cierran sus sesiones abiertas.
        </p>
        <div className="acciones">
          <button type="submit" className="btn" disabled={contrasena.isPending || clave === ""}>
            {contrasena.isPending ? "Fijando…" : "Fijar contraseña"}
          </button>
        </div>
      </form>
    </Lado>
  );
}
