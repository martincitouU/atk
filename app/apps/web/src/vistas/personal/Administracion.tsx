// Administración (solo ADMIN): el personal (RF-14), las categorías de
// fidelización (RF-18) y la auditoría.
//
// La API no deja que el admin se desactive ni se quite el rol a sí mismo:
// aquí esas opciones ni siquiera aparecen para su propia fila.

import { zodResolver } from "@hookform/resolvers/zod";
import { cambiosUsuario, entradaContrasena, entradaUsuario } from "@atk/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Outlet } from "react-router";
import { z } from "zod";
import { useCrearCategoria, useCrearUsuario, useEditarUsuario, useRestablecerContrasena } from "../../api/acciones.ts";
import { mensajeDe } from "../../api/cliente.ts";
import { useAuditoria, useCatalogo, useNombres, useUsuarios, type FiltrosAuditoria } from "../../api/consultas.ts";
import type { AccionAuditoria, CategoriaCliente, Rol, Sucursal, Usuario } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Columnas, Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { errorEnFormulario } from "../../lib/formularios.ts";
import { formatearPorcentaje, leerTasa } from "../../lib/montos.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ACCION_AUDITORIA, ROL, TABLA_AUDITADA } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import css from "./Personal.module.css";

export function Administracion() {
  return (
    <Pagina>
      <EncabezadoPagina titulo="Administración" descripcion="El personal de la casa, la fidelización y el registro de todo lo que se hace." />
      <Pestanas
        etiqueta="Secciones de administración"
        pestanas={[
          { a: "/administracion/usuarios", texto: "Personal" },
          { a: "/administracion/fidelizacion", texto: "Fidelización" },
          { a: "/administracion/auditoria", texto: "Auditoría" },
        ]}
      />
      <Outlet />
    </Pagina>
  );
}

// ---- Personal ----------------------------------------------------------------

/** Sucursal elegida en un select: "" es todas (null). */
const aSucursal = (valor: unknown) => (valor === "" || valor === null || valor === undefined ? null : Number(valor));

export function Usuarios() {
  const usuarios = useUsuarios();
  const catalogo = useCatalogo();
  const { usuario: yo } = usePersonal();
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [conClave, setConClave] = useState<Usuario | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const sucursales = catalogo.data?.sucursales ?? [];
  const sucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const terminar = (mensaje: string) => {
    setListo(mensaje);
    setCreando(false);
    setEditando(null);
    setConClave(null);
  };

  return (
    <>
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      <div className={css.acciones}>
        <Boton variante="primario" icono={<Plus size={18} aria-hidden />} onClick={() => setCreando(true)}>
          Nuevo usuario
        </Boton>
      </div>
      <Tarjeta sinRelleno>
        <ConDatos consulta={usuarios}>
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="No hay usuarios" />
            ) : (
              <Tabla etiqueta="Personal">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>RUT</th>
                    <th>Rol</th>
                    <th>Sucursal</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map((u) => (
                    <tr key={u.id}>
                      <td>{u.nombre}</td>
                      <td>{u.email}</td>
                      <td>{formatearRut(u.rut)}</td>
                      <td>
                        <Etiqueta tono={u.rol === "ADMIN" ? "fuerte" : "neutro"}>{ROL[u.rol]}</Etiqueta>
                      </td>
                      <td>{u.sucursalId ? sucursal.get(u.sucursalId) : "Todas"}</td>
                      <td>{u.activo ? "Activo" : <Etiqueta tono="error">Inactivo</Etiqueta>}</td>
                      <td>
                        <div className={css.accionesFila}>
                          <Boton variante="texto" tamano="chico" onClick={() => setEditando(u)} aria-label={`Editar a ${u.nombre}`}>
                            Editar
                          </Boton>
                          <Boton variante="texto" tamano="chico" onClick={() => setConClave(u)} aria-label={`Contraseña de ${u.nombre}`}>
                            Contraseña
                          </Boton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )
          }
        </ConDatos>
      </Tarjeta>

      <Dialogo
        abierto={creando}
        alCerrar={() => setCreando(false)}
        titulo="Nuevo usuario"
        descripcion="Podrá iniciar sesión con este correo y la contraseña inicial. Después la cambia desde su perfil."
        acciones={
          <>
            <Boton onClick={() => setCreando(false)}>Cancelar</Boton>
            <Boton type="submit" form="nuevo-usuario" variante="primario">
              Crear usuario
            </Boton>
          </>
        }
      >
        <FormularioNuevoUsuario sucursales={sucursales} alCrear={(u) => terminar(`${u.nombre} ya puede iniciar sesión con su correo.`)} />
      </Dialogo>

      <Dialogo
        abierto={editando !== null}
        alCerrar={() => setEditando(null)}
        titulo={`Editar a ${editando?.nombre ?? ""}`}
        descripcion="Desactivar a alguien cierra sus sesiones: deja de entrar, pero lo que hizo se sigue mostrando."
        acciones={
          <>
            <Boton onClick={() => setEditando(null)}>Cancelar</Boton>
            <Boton type="submit" form="editar-usuario" variante="primario">
              Guardar cambios
            </Boton>
          </>
        }
      >
        {editando && (
          <FormularioEditarUsuario
            usuario={editando}
            esUnoMismo={editando.id === yo.id}
            sucursales={sucursales}
            alGuardar={(u) => terminar(`Cambios de ${u.nombre} guardados.`)}
          />
        )}
      </Dialogo>

      <Dialogo
        abierto={conClave !== null}
        alCerrar={() => setConClave(null)}
        titulo={`Nueva contraseña para ${conClave?.nombre ?? ""}`}
        descripcion="Sus sesiones se cierran: entra de nuevo con esta contraseña y después la cambia desde su perfil."
        acciones={
          <>
            <Boton onClick={() => setConClave(null)}>Cancelar</Boton>
            <Boton type="submit" form="restablecer-clave" variante="primario">
              Restablecer contraseña
            </Boton>
          </>
        }
      >
        {conClave && <FormularioContrasena usuario={conClave} alGuardar={() => terminar(`Contraseña de ${conClave.nombre} restablecida.`)} />}
      </Dialogo>
    </>
  );
}

type ValoresNuevo = z.input<typeof entradaUsuario>;

function FormularioNuevoUsuario({ sucursales, alCrear }: { sucursales: Sucursal[]; alCrear: (u: Usuario) => void }) {
  const crear = useCrearUsuario();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: marcar,
    formState: { errors },
  } = useForm<ValoresNuevo, unknown, z.output<typeof entradaUsuario>>({
    resolver: zodResolver(entradaUsuario),
    defaultValues: { nombre: "", rut: "", email: "", rol: "CAJERO", sucursalId: null, contrasena: "" },
  });

  const alEnviar = handleSubmit(async (entrada) => {
    setError(null);
    try {
      alCrear(await crear.mutateAsync(entrada));
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, ["nombre", "rut", "email", "rol", "sucursalId", "contrasena"], {
          porCodigo: { USUARIO_DUPLICADO: "rut", CORREO_EN_USO: "email" },
        }),
      );
    }
  });

  return (
    <form id="nuevo-usuario" className={css.formulario} onSubmit={alEnviar} noValidate>
      {error && <Aviso tono="error">{error}</Aviso>}
      <Entrada etiqueta="Nombre" error={errors.nombre?.message} {...register("nombre")} />
      <FilaCampos>
        <Entrada etiqueta="RUT" placeholder="12.345.678-5" error={errors.rut?.message} {...register("rut")} />
        <Seleccion etiqueta="Rol" {...register("rol")}>
          {(Object.keys(ROL) as Rol[]).map((r) => (
            <option key={r} value={r}>
              {ROL[r]}
            </option>
          ))}
        </Seleccion>
      </FilaCampos>
      <Entrada etiqueta="Correo" type="email" error={errors.email?.message} {...register("email")} />
      <Seleccion etiqueta="Sucursal" {...register("sucursalId", { setValueAs: aSucursal })}>
        <option value="">Todas</option>
        {sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Seleccion>
      <Entrada
        etiqueta="Contraseña inicial"
        type="password"
        autoComplete="new-password"
        ayuda="Mínimo 10 caracteres."
        error={errors.contrasena?.message}
        {...register("contrasena")}
      />
    </form>
  );
}

type ValoresEdicion = { nombre: string; rol: Rol; sucursalId: number | null; activo: boolean };

function FormularioEditarUsuario({
  usuario,
  esUnoMismo,
  sucursales,
  alGuardar,
}: {
  usuario: Usuario;
  esUnoMismo: boolean;
  sucursales: Sucursal[];
  alGuardar: (u: Usuario) => void;
}) {
  const editar = useEditarUsuario();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: marcar,
    formState: { errors },
  } = useForm<ValoresEdicion>({
    resolver: zodResolver(cambiosUsuario.required()),
    defaultValues: { nombre: usuario.nombre, rol: usuario.rol, sucursalId: usuario.sucursalId, activo: usuario.activo },
  });

  const alEnviar = handleSubmit(async (v) => {
    setError(null);
    // Para uno mismo no se envían el rol ni el estado: la API no deja cambiarlos
    const cambios = esUnoMismo ? { nombre: v.nombre, sucursalId: v.sucursalId } : v;
    try {
      alGuardar(await editar.mutateAsync({ id: usuario.id, cambios }));
    } catch (e) {
      setError(errorEnFormulario(e, marcar, ["nombre", "rol", "sucursalId", "activo"]));
    }
  });

  return (
    <form id="editar-usuario" className={css.formulario} onSubmit={alEnviar} noValidate>
      {error && <Aviso tono="error">{error}</Aviso>}
      <Entrada etiqueta="Nombre" error={errors.nombre?.message} {...register("nombre")} />
      <FilaCampos>
        {/* El rol propio no se cambia: se muestra, sin campo (su valor sigue siendo el actual) */}
        {esUnoMismo ? (
          <Entrada etiqueta="Rol" value={ROL[usuario.rol]} readOnly />
        ) : (
          <Seleccion etiqueta="Rol" {...register("rol")}>
            {(Object.keys(ROL) as Rol[]).map((r) => (
              <option key={r} value={r}>
                {ROL[r]}
              </option>
            ))}
          </Seleccion>
        )}
        <Seleccion etiqueta="Sucursal" {...register("sucursalId", { setValueAs: aSucursal })}>
          <option value="">Todas</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </Seleccion>
      </FilaCampos>
      {esUnoMismo ? (
        <p className={css.nota}>No puedes cambiar tu propio rol ni desactivarte: lo hace otro administrador.</p>
      ) : (
        <label className={css.casilla}>
          <input type="checkbox" {...register("activo")} />
          Activo (puede iniciar sesión)
        </label>
      )}
    </form>
  );
}

function FormularioContrasena({ usuario, alGuardar }: { usuario: Usuario; alGuardar: () => void }) {
  const restablecer = useRestablecerContrasena();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ contrasena: string }>({ resolver: zodResolver(entradaContrasena), defaultValues: { contrasena: "" } });

  const alEnviar = handleSubmit(async ({ contrasena }) => {
    try {
      await restablecer.mutateAsync({ id: usuario.id, contrasena });
      alGuardar();
    } catch {
      // el mensaje queda en restablecer.error
    }
  });

  return (
    <form id="restablecer-clave" className={css.formulario} onSubmit={alEnviar} noValidate>
      {restablecer.isError && <Aviso tono="error">{mensajeDe(restablecer.error)}</Aviso>}
      <Entrada
        etiqueta="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        ayuda="Mínimo 10 caracteres. Dísela en persona, no por escrito."
        error={errors.contrasena?.message}
        {...register("contrasena")}
      />
    </form>
  );
}

// ---- Fidelización ---------------------------------------------------------------

/**
 * Categorías de fidelización (RF-18): cuánto se reduce el margen a sus
 * clientes, igual en todas las divisas. Se asignan en la ficha del cliente.
 */
export function Fidelizacion() {
  const catalogo = useCatalogo();
  return (
    <Columnas lateral={<NuevaCategoria />}>
      <Tarjeta titulo="Categorías" sinRelleno>
        <ConDatos consulta={catalogo}>
          {({ categoriasCliente }: { categoriasCliente: CategoriaCliente[] }) =>
            categoriasCliente.length === 0 ? (
              <Vacio titulo="Todavía no hay categorías">Crea una para premiar a los clientes frecuentes con un margen menor.</Vacio>
            ) : (
              <Tabla etiqueta="Categorías de fidelización">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="num">Descuento del margen</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriasCliente.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nombre}</td>
                      <td className="num">{formatearPorcentaje(c.descuentoMargenPctE6)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )
          }
        </ConDatos>
      </Tarjeta>
    </Columnas>
  );
}

function NuevaCategoria() {
  const crear = useCrearCategoria();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<{ nombre: string; descuento: string }>({ defaultValues: { nombre: "", descuento: "" } });

  const alEnviar = handleSubmit(async ({ nombre, descuento }) => {
    setListo(null);
    setError(null);
    try {
      await crear.mutateAsync({ nombre: nombre.trim(), descuentoMargenPctE6: leerTasa(descuento) ?? "" });
      reset();
      setListo(`Categoría ${nombre.trim()} creada.`);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, ["nombre"], {
          nombres: { descuentoMargenPctE6: "descuento" },
          porCodigo: { CATEGORIA_DUPLICADA: "nombre", DESCUENTO_INVALIDO: "descuento" },
        }),
      );
    }
  });

  return (
    <Tarjeta titulo="Nueva categoría" descripcion="Por ejemplo, Frecuente con 30 %: a sus clientes se les cobra un 30 % menos de margen.">
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Entrada etiqueta="Nombre" error={errors.nombre?.message} {...register("nombre", { validate: (t) => t.trim() !== "" || "Escribe el nombre" })} />
        <Entrada
          etiqueta="Descuento del margen"
          inputMode="decimal"
          placeholder="30"
          sufijo="%"
          error={errors.descuento?.message}
          {...register("descuento", {
            validate: (t) => {
              const valor = leerTasa(t);
              if (valor === null) return "Escribe el porcentaje, por ejemplo 30 o 12,5";
              return (BigInt(valor) > 0n && BigInt(valor) <= 100_000_000n) || "Debe estar entre 0 % y 100 %";
            },
          })}
        />
        <Boton type="submit" variante="primario" cargando={isSubmitting}>
          Crear categoría
        </Boton>
      </form>
    </Tarjeta>
  );
}

// ---- Auditoría ----------------------------------------------------------------

export function Auditoria() {
  const [filtros, setFiltros] = useState<FiltrosAuditoria>({});
  const registros = useAuditoria(filtros);
  const nombre = useNombres();

  return (
    <>
      <Tarjeta>
        <div className={css.filtros}>
          <Seleccion etiqueta="Qué" value={filtros.tabla ?? ""} onChange={(e) => setFiltros({ ...filtros, tabla: e.target.value || undefined })}>
            <option value="">Todo</option>
            {Object.entries(TABLA_AUDITADA).map(([tabla, texto]) => (
              <option key={tabla} value={tabla}>
                {texto}
              </option>
            ))}
          </Seleccion>
          <Seleccion
            etiqueta="Acción"
            value={filtros.accion ?? ""}
            onChange={(e) => setFiltros({ ...filtros, accion: (e.target.value || undefined) as AccionAuditoria | undefined })}
          >
            <option value="">Todas</option>
            {(Object.keys(ACCION_AUDITORIA) as AccionAuditoria[]).map((accion) => (
              <option key={accion} value={accion}>
                {ACCION_AUDITORIA[accion]}
              </option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Desde" type="date" value={filtros.desde ?? ""} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value || undefined })} />
          <Entrada etiqueta="Hasta" type="date" value={filtros.hasta ?? ""} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value || undefined })} />
        </div>
      </Tarjeta>
      <Tarjeta sinRelleno>
        <ConDatos consulta={registros} cargando="Cargando la auditoría…">
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="Sin registros con estos filtros" />
            ) : (
              <Tabla etiqueta="Auditoría">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Quién</th>
                    <th>Acción</th>
                    <th>Registro</th>
                    <th>Motivo</th>
                    <th>Cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id}>
                      <td>{formatearFechaHora(r.registradoEn)}</td>
                      <td>{nombre(r.usuarioId)}</td>
                      <td>
                        <Etiqueta>{ACCION_AUDITORIA[r.accion]}</Etiqueta>
                      </td>
                      <td>
                        {TABLA_AUDITADA[r.tabla] ?? r.tabla} N° {r.registroId}
                      </td>
                      <td className="ajustable">{r.motivo ?? "—"}</td>
                      <td className="ajustable">
                        <details>
                          <summary className={css.nota}>Ver</summary>
                          <pre className={css.nota}>{JSON.stringify({ antes: r.datosAntes, despues: r.datosDespues }, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )
          }
        </ConDatos>
      </Tarjeta>
    </>
  );
}
