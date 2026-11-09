// Administración (solo ADMIN): el personal (RF-14) y la auditoría.
//
// ESQUELETO (F1): crear o editar usuarios no guarda.

import { Plus } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";
import { nombreUsuario, useAuditoria, useCatalogo, useUsuarios } from "../../api/consultas.ts";
import type { Rol } from "../../api/tipos.ts";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ROL } from "../../lib/textos.ts";
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
  const { data: usuarios, isPending } = useUsuarios();
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
        {isPending ? (
          <Cargando />
        ) : !usuarios?.length ? (
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
              {usuarios.map((u) => (
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
        )}
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
  const { data: registros, isPending } = useAuditoria();

  return (
    <>
      <Tarjeta>
        <div className={css.filtros}>
          <Seleccion etiqueta="Tabla" defaultValue="">
            <option value="">Todas</option>
            <option value="operacion">Operaciones</option>
            <option value="cotizacion">Cotizaciones</option>
            <option value="turno">Turnos</option>
            <option value="gasto">Gastos</option>
            <option value="usuario">Usuarios</option>
          </Seleccion>
          <Entrada etiqueta="Desde" type="date" />
          <Entrada etiqueta="Hasta" type="date" />
        </div>
      </Tarjeta>
      <Tarjeta sinRelleno>
        {isPending ? (
          <Cargando />
        ) : !registros?.length ? (
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
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>{formatearFechaHora(r.registradoEn)}</td>
                  <td>{nombreUsuario(r.usuarioId)}</td>
                  <td>
                    <Etiqueta>{r.accion}</Etiqueta>
                  </td>
                  <td>
                    {r.tabla} #{r.registroId}
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
        )}
      </Tarjeta>
    </>
  );
}
