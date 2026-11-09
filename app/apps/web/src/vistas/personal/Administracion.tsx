// Administración (solo ADMIN): el personal (RF-14) y la auditoría.
//
// Lee de la API; crear y editar usuarios se conecta en F3.

import { Plus } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";
import { useAuditoria, useCatalogo, useNombres, useUsuarios, type FiltrosAuditoria } from "../../api/consultas.ts";
import type { AccionAuditoria, Rol } from "../../api/tipos.ts";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ACCION_AUDITORIA, ROL, TABLA_AUDITADA } from "../../lib/textos.ts";
import css from "./Personal.module.css";

export function Administracion() {
  return (
    <Pagina>
      <EncabezadoPagina titulo="Administración" descripcion="El personal de la casa y el registro de todo lo que se hace." />
      <Pestanas
        etiqueta="Secciones de administración"
        pestanas={[
          { a: "/administracion/usuarios", texto: "Personal" },
          { a: "/administracion/auditoria", texto: "Auditoría" },
        ]}
      />
      <Outlet />
    </Pagina>
  );
}

// ---- Personal ----------------------------------------------------------------

export function Usuarios() {
  const usuarios = useUsuarios();
  const { data: catalogo } = useCatalogo();
  const [creando, setCreando] = useState(false);
  const sucursal = new Map(catalogo?.sucursales.map((s) => [s.id, s.nombre]));

  return (
    <>
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
                          <Boton variante="texto" tamano="chico">
                            Editar
                          </Boton>
                          <Boton variante="texto" tamano="chico">
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
            <Boton variante="primario">Crear usuario</Boton>
          </>
        }
      >
        <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
          <Entrada etiqueta="Nombre" />
          <FilaCampos>
            <Entrada etiqueta="RUT" placeholder="12.345.678-5" />
            <Seleccion etiqueta="Rol" defaultValue="CAJERO">
              {(Object.keys(ROL) as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {ROL[r]}
                </option>
              ))}
            </Seleccion>
          </FilaCampos>
          <Entrada etiqueta="Correo" type="email" />
          <Seleccion etiqueta="Sucursal" defaultValue="">
            <option value="">Todas</option>
            {catalogo?.sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Contraseña inicial" type="password" autoComplete="new-password" ayuda="Mínimo 10 caracteres." />
        </form>
      </Dialogo>
    </>
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
