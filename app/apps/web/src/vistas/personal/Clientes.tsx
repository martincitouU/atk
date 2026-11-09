// Clientes: fichas (RF-17) y cuentas del portal por verificar.
//
// Verificar una cuenta es la regla clave del portal: el cajero revisa el
// carnet EN PERSONA y la cuenta se enlaza con la ficha del mismo RUT. Sin
// eso, cualquiera podría registrarse con un RUT ajeno y ver sus operaciones.
//
// ESQUELETO (F1): los formularios y los botones de verificar no guardan.

import { Plus, Search, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link, Outlet, useParams } from "react-router";
import { useCatalogo, useCliente, useClientes, useCuentasCliente } from "../../api/consultas.ts";
import type { CuentaCliente, TipoDocumento } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Columnas, Datos, Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { formatearPorcentaje } from "../../lib/montos.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ESTADO_CUENTA, TIPO_DOCUMENTO } from "../../lib/textos.ts";
import { NoEncontrada } from "../NoEncontrada.tsx";
import css from "./Personal.module.css";

export function Clientes() {
  const cuentas = useCuentasCliente();
  const pendientes = cuentas.data?.filter((c) => c.estado === "PENDIENTE").length ?? 0;
  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Fichas para la UAF y cuentas del portal."
        acciones={
          <EnlaceBoton to="/clientes/nuevo" icono={<Plus size={18} aria-hidden />}>
            Nuevo cliente
          </EnlaceBoton>
        }
      />
      <Pestanas
        etiqueta="Secciones de clientes"
        pestanas={[
          { a: "/clientes", texto: "Fichas", fin: true },
          { a: "/clientes/cuentas", texto: pendientes ? `Cuentas del portal (${pendientes} por verificar)` : "Cuentas del portal" },
        ]}
      />
      <Outlet />
    </Pagina>
  );
}

// ---- Fichas -------------------------------------------------------------------

export function Fichas() {
  const [texto, setTexto] = useState("");
  const { data: clientes, isPending } = useClientes(texto);

  return (
    <>
      <div className={css.busqueda}>
        <Entrada
          etiqueta="Buscar cliente"
          type="search"
          placeholder="Nombre o número de documento"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          sufijo={<Search size={16} aria-hidden />}
        />
      </div>
      <Tarjeta sinRelleno>
        {isPending ? (
          <Cargando />
        ) : !clientes?.length ? (
          <Vacio titulo="Sin resultados" accion={<EnlaceBoton to="/clientes/nuevo">Crear cliente</EnlaceBoton>}>
            No hay clientes con ese nombre o documento.
          </Vacio>
        ) : (
          <Tabla etiqueta="Clientes">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Documento</th>
                <th>Nacionalidad</th>
                <th>Ficha UAF</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/clientes/${c.id}`}>{c.nombre}</Link>
                  </td>
                  <td>
                    {TIPO_DOCUMENTO[c.tipoDocumento]} {c.tipoDocumento === "RUT" ? formatearRut(c.numeroDocumento) : c.numeroDocumento}
                  </td>
                  <td>{c.nacionalidad ?? "—"}</td>
                  <td>{c.faltantesUaf.length ? <Etiqueta tono="atencion">Incompleta</Etiqueta> : <Etiqueta>Completa</Etiqueta>}</td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </>
  );
}

// ---- Cuentas del portal --------------------------------------------------------------

export function CuentasWeb() {
  const [ver, setVer] = useState<"PENDIENTE" | "TODAS">("PENDIENTE");
  const { data: cuentas, isPending } = useCuentasCliente();
  const [verificando, setVerificando] = useState<CuentaCliente | null>(null);
  const [rechazando, setRechazando] = useState<CuentaCliente | null>(null);
  const lista = cuentas?.filter((c) => ver === "TODAS" || c.estado === "PENDIENTE");

  return (
    <>
      <Aviso tono="info" titulo="Verifica siempre en persona">
        Pide el carnet y revisa que el RUT y el nombre coincidan. La cuenta se enlaza con la ficha del mismo RUT: si el cliente no tiene ficha, créala
        antes.
      </Aviso>
      <Segmentado
        etiqueta="Qué cuentas ver"
        opciones={[
          { valor: "PENDIENTE", texto: "Por verificar" },
          { valor: "TODAS", texto: "Todas" },
        ]}
        valor={ver}
        alCambiar={setVer}
      />
      <Tarjeta sinRelleno>
        {isPending ? (
          <Cargando />
        ) : !lista?.length ? (
          <Vacio titulo="No hay cuentas por verificar">Cuando un cliente se registre en el portal, aparecerá aquí.</Vacio>
        ) : (
          <Tabla etiqueta="Cuentas del portal">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>RUT</th>
                <th>Registrada</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{formatearRut(c.rut)}</td>
                  <td>{formatearFechaHora(c.creadaEn)}</td>
                  <td>
                    <Etiqueta tono={ESTADO_CUENTA[c.estado].tono}>{ESTADO_CUENTA[c.estado].texto}</Etiqueta>
                  </td>
                  <td>
                    {c.estado === "PENDIENTE" && (
                      <div className={css.accionesFila}>
                        <Boton variante="suave" tamano="chico" icono={<UserCheck size={16} aria-hidden />} onClick={() => setVerificando(c)}>
                          Verificar
                        </Boton>
                        <Boton variante="texto" tamano="chico" onClick={() => setRechazando(c)}>
                          Rechazar
                        </Boton>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>

      <Dialogo
        abierto={verificando !== null}
        alCerrar={() => setVerificando(null)}
        titulo={`Verificar a ${verificando?.nombre ?? ""}`}
        descripcion={`Confirma que revisaste el carnet y que el RUT ${formatearRut(verificando?.rut ?? "")} es suyo. Queda registrado quién verificó y cuándo.`}
        acciones={
          <>
            <Boton onClick={() => setVerificando(null)}>Cancelar</Boton>
            <Boton variante="primario">Sí, revisé el carnet</Boton>
          </>
        }
      />
      <Dialogo
        abierto={rechazando !== null}
        alCerrar={() => setRechazando(null)}
        titulo={`Rechazar la cuenta de ${rechazando?.nombre ?? ""}`}
        descripcion="El cliente verá el motivo en su portal."
        acciones={
          <>
            <Boton onClick={() => setRechazando(null)}>Cancelar</Boton>
            <Boton variante="primario">Rechazar cuenta</Boton>
          </>
        }
      >
        <AreaTexto etiqueta="Motivo" placeholder="El carnet no coincide con el RUT registrado" />
      </Dialogo>
    </>
  );
}

// ---- Ficha de un cliente ------------------------------------------------------------

export function DetalleCliente() {
  const id = Number(useParams().id);
  const { data: cliente, isPending } = useCliente(id);
  const { data: catalogo } = useCatalogo();

  if (isPending) return <Cargando texto="Cargando la ficha…" />;
  if (!cliente) return <NoEncontrada />;

  const categoria = catalogo?.categoriasCliente.find((c) => c.id === cliente.categoriaId);
  return (
    <Pagina>
      <EncabezadoPagina
        titulo={cliente.nombre}
        descripcion={`${TIPO_DOCUMENTO[cliente.tipoDocumento]} ${cliente.tipoDocumento === "RUT" ? formatearRut(cliente.numeroDocumento) : cliente.numeroDocumento}`}
        volver={{ a: "/clientes", texto: "Clientes" }}
        acciones={<Boton>Editar ficha</Boton>}
      />
      {cliente.faltantesUaf.length > 0 && (
        <Aviso tono="atencion" titulo="Ficha incompleta para la UAF">
          Falta: {cliente.faltantesUaf.join(", ")}. Se exige completa para operaciones desde US$ 5.000.
        </Aviso>
      )}
      <Columnas
        lateral={
          <Tarjeta titulo="Fidelización">
            <p>{categoria ? `${categoria.nombre}: ${formatearPorcentaje(categoria.descuentoMargenPctE6)} menos de margen` : "Sin categoría"}</p>
            <p className={css.nota}>{cliente.relacionPermanente ? "Relación permanente: siempre exige ficha." : "Sin relación permanente."}</p>
          </Tarjeta>
        }
      >
        <Tarjeta titulo="Ficha">
          <Datos
            filas={[
              { etiqueta: "Nacionalidad", valor: cliente.nacionalidad ?? "—" },
              { etiqueta: "Oficio o profesión", valor: cliente.oficio ?? "—" },
              { etiqueta: "País de residencia", valor: cliente.paisResidencia ?? "—" },
              { etiqueta: "Domicilio", valor: cliente.domicilio ?? "—" },
              { etiqueta: "Teléfono", valor: cliente.telefono ?? "—" },
              { etiqueta: "Correo", valor: cliente.email ?? "—" },
              { etiqueta: "Creada", valor: formatearFechaHora(cliente.creadoEn) },
              { etiqueta: "Actualizada", valor: formatearFechaHora(cliente.actualizadoEn) },
            ]}
          />
        </Tarjeta>
      </Columnas>
    </Pagina>
  );
}

// ---- Nuevo cliente ------------------------------------------------------------

export function NuevoCliente() {
  const { data: catalogo } = useCatalogo();
  return (
    <Pagina angosta>
      <EncabezadoPagina titulo="Nuevo cliente" descripcion="Los datos que pide la UAF. Puedes completarlos después." volver={{ a: "/clientes", texto: "Clientes" }} />
      <Tarjeta>
        <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
          <FilaCampos>
            <Seleccion etiqueta="Tipo de documento" defaultValue="RUT">
              {(Object.keys(TIPO_DOCUMENTO) as TipoDocumento[]).map((t) => (
                <option key={t} value={t}>
                  {TIPO_DOCUMENTO[t]}
                </option>
              ))}
            </Seleccion>
            <Entrada etiqueta="Número de documento" placeholder="12.345.678-5" />
          </FilaCampos>
          <Entrada etiqueta="Nombre completo" autoComplete="off" />
          <FilaCampos>
            <Entrada etiqueta="Nacionalidad" placeholder="CL" maxLength={2} ayuda="Código de 2 letras: CL, AR, BR…" />
            <Entrada etiqueta="País de residencia" placeholder="CL" maxLength={2} />
          </FilaCampos>
          <Entrada etiqueta="Oficio o profesión" />
          <Entrada etiqueta="Domicilio" />
          <FilaCampos>
            <Entrada etiqueta="Teléfono" type="tel" />
            <Entrada etiqueta="Correo" type="email" />
          </FilaCampos>
          <Seleccion etiqueta="Categoría de fidelización" defaultValue="">
            <option value="">Sin categoría</option>
            {catalogo?.categoriasCliente.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Seleccion>
          <label className={css.casilla}>
            <input type="checkbox" />
            Relación permanente con la casa (siempre exige ficha completa)
          </label>
          <div className={css.acciones}>
            <EnlaceBoton to="/clientes">Cancelar</EnlaceBoton>
            <Boton type="submit" variante="primario">
              Guardar cliente
            </Boton>
          </div>
        </form>
      </Tarjeta>
    </Pagina>
  );
}
