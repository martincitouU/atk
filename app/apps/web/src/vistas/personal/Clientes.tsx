// Clientes: fichas (RF-17) y cuentas del portal por verificar.
//
// Verificar una cuenta es la regla clave del portal: el cajero revisa el
// carnet EN PERSONA y la cuenta se enlaza con la ficha del mismo RUT. Sin
// eso, cualquiera podría registrarse con un RUT ajeno y ver sus operaciones.
//
// Si no hay ficha con el RUT de la cuenta, la API no deja verificar: se
// ofrece crearla con el RUT y el nombre ya escritos (van en el estado de la
// navegación, no en la dirección: son datos personales).

import { zodResolver } from "@hookform/resolvers/zod";
import { entradaCliente, rutValido } from "@atk/shared";
import { Plus, Search, UserCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { z } from "zod";
import { useCrearCliente, useEditarCliente, useRechazarCuenta, useVerificarCuenta } from "../../api/acciones.ts";
import { ErrorApi, esNoExiste, mensajeDe } from "../../api/cliente.ts";
import { MINIMO_BUSQUEDA, useCatalogo, useCliente, useClientes, useCuentasCliente } from "../../api/consultas.ts";
import type { CategoriaCliente, CuentaCliente, FichaCliente, TipoDocumento } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, ConDatos, ErrorDeCarga, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Columnas, Datos, Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { formatearPorcentaje } from "../../lib/montos.ts";
import { errorEnFormulario } from "../../lib/formularios.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ESTADO_CUENTA, TIPO_DOCUMENTO } from "../../lib/textos.ts";
import { NoEncontrada } from "../NoEncontrada.tsx";
import css from "./Personal.module.css";

export function Clientes() {
  const pendientes = useCuentasCliente("PENDIENTE").data?.length ?? 0;
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
  const clientes = useClientes(texto);
  const buscando = texto.trim().length >= MINIMO_BUSQUEDA;

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
        {!buscando ? (
          <p className={css.indicacion}>Escribe al menos {MINIMO_BUSQUEDA} letras o números del nombre o del documento.</p>
        ) : (
          <ConDatos consulta={clientes} cargando="Buscando…">
            {(lista) =>
              lista.length === 0 ? (
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
                    {lista.map((c) => (
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
              )
            }
          </ConDatos>
        )}
      </Tarjeta>
    </>
  );
}

// ---- Cuentas del portal --------------------------------------------------------------

export function CuentasWeb() {
  const [ver, setVer] = useState<"PENDIENTE" | "TODAS">("PENDIENTE");
  const cuentas = useCuentasCliente(ver === "PENDIENTE" ? "PENDIENTE" : undefined);
  const [verificando, setVerificando] = useState<CuentaCliente | null>(null);
  const [rechazando, setRechazando] = useState<CuentaCliente | null>(null);

  return (
    <>
      <Aviso tono="info" titulo="Verifica siempre en persona">
        Pide el carnet y revisa que el RUT y el nombre coincidan. La cuenta se enlaza con la ficha del mismo RUT: si el cliente no tiene ficha, créala antes.
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
        <ConDatos consulta={cuentas}>
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo={ver === "PENDIENTE" ? "No hay cuentas por verificar" : "Todavía no hay cuentas"}>
                Cuando un cliente se registre en el portal, aparecerá aquí.
              </Vacio>
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
            )
          }
        </ConDatos>
      </Tarjeta>

      <DialogoVerificar cuenta={verificando} alCerrar={() => setVerificando(null)} />
      <DialogoRechazar cuenta={rechazando} alCerrar={() => setRechazando(null)} />
    </>
  );
}

/** El cajero confirma que revisó el carnet. Sin ficha con ese RUT, ofrece crearla. */
function DialogoVerificar({ cuenta, alCerrar }: { cuenta: CuentaCliente | null; alCerrar: () => void }) {
  const verificar = useVerificarCuenta();
  const navegar = useNavigate();
  const cerrar = () => {
    verificar.reset();
    alCerrar();
  };
  const sinFicha = verificar.error instanceof ErrorApi && verificar.error.codigo === "SIN_FICHA";

  return (
    <Dialogo
      abierto={cuenta !== null}
      alCerrar={cerrar}
      titulo={`Verificar a ${cuenta?.nombre ?? ""}`}
      descripcion={`Confirma que revisaste el carnet y que el RUT ${formatearRut(cuenta?.rut ?? "")} es suyo. Queda registrado quién verificó y cuándo.`}
      acciones={
        <>
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton variante="primario" cargando={verificar.isPending} onClick={() => cuenta && verificar.mutate(cuenta.id, { onSuccess: cerrar })}>
            Sí, revisé el carnet
          </Boton>
        </>
      }
    >
      {verificar.isError && (
        <Aviso
          tono="error"
          acciones={
            sinFicha && cuenta ? (
              <Boton tamano="chico" onClick={() => navegar("/clientes/nuevo", { state: { rut: cuenta.rut, nombre: cuenta.nombre } })}>
                Crear la ficha
              </Boton>
            ) : undefined
          }
        >
          {mensajeDe(verificar.error)}
        </Aviso>
      )}
    </Dialogo>
  );
}

function DialogoRechazar({ cuenta, alCerrar }: { cuenta: CuentaCliente | null; alCerrar: () => void }) {
  const rechazar = useRechazarCuenta();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ motivo: string }>({ defaultValues: { motivo: "" } });
  const cerrar = () => {
    reset();
    rechazar.reset();
    alCerrar();
  };
  const alEnviar = handleSubmit(async ({ motivo }) => {
    if (!cuenta) return;
    try {
      await rechazar.mutateAsync({ id: cuenta.id, motivo: motivo.trim() });
      cerrar();
    } catch {
      // el mensaje queda en rechazar.error
    }
  });

  return (
    <Dialogo
      abierto={cuenta !== null}
      alCerrar={cerrar}
      titulo={`Rechazar la cuenta de ${cuenta?.nombre ?? ""}`}
      descripcion="El cliente verá el motivo en su portal."
      acciones={
        <>
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" form="rechazar-cuenta" variante="primario" cargando={isSubmitting}>
            Rechazar cuenta
          </Boton>
        </>
      }
    >
      <form id="rechazar-cuenta" className={css.formulario} onSubmit={alEnviar} noValidate>
        {rechazar.isError && <Aviso tono="error">{mensajeDe(rechazar.error)}</Aviso>}
        <AreaTexto
          etiqueta="Motivo"
          placeholder="El carnet no coincide con el RUT registrado"
          error={errors.motivo?.message}
          {...register("motivo", { validate: (m) => m.trim() !== "" || "Escribe el motivo del rechazo" })}
        />
      </form>
    </Dialogo>
  );
}

// ---- Ficha de un cliente ------------------------------------------------------------

export function DetalleCliente() {
  const id = Number(useParams().id);
  const consulta = useCliente(id);
  const { data: catalogo } = useCatalogo();

  if (!Number.isInteger(id) || id <= 0 || esNoExiste(consulta.error)) return <NoEncontrada />;
  if (consulta.isError) return <ErrorDeCarga error={consulta.error} alReintentar={() => void consulta.refetch()} />;
  if (consulta.isPending) return <Cargando texto="Cargando la ficha…" />;
  const cliente = consulta.data;

  const categoria = catalogo?.categoriasCliente.find((c) => c.id === cliente.categoriaId);
  return (
    <Pagina>
      <EncabezadoPagina
        titulo={cliente.nombre}
        descripcion={`${TIPO_DOCUMENTO[cliente.tipoDocumento]} ${cliente.tipoDocumento === "RUT" ? formatearRut(cliente.numeroDocumento) : cliente.numeroDocumento}`}
        volver={{ a: "/clientes", texto: "Clientes" }}
        acciones={<EnlaceBoton to={`/clientes/${cliente.id}/editar`}>Editar ficha</EnlaceBoton>}
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

// ---- Nueva ficha y editar ------------------------------------------------------

/** Vacío en un campo opcional es "sin dato" (null), como lo guarda la API. */
const vacioANull = (valor: unknown) => (typeof valor === "string" && valor.trim() === "" ? null : valor);

// El mismo esquema que valida la API, y el RUT revisado antes de enviar
const esquemaCliente = entradaCliente.superRefine((c, ctx) => {
  if (c.tipoDocumento === "RUT" && !rutValido(c.numeroDocumento)) {
    ctx.addIssue({ code: "custom", path: ["numeroDocumento"], message: "RUT inválido: revisa el número y el dígito verificador" });
  }
});

type ValoresCliente = z.input<typeof esquemaCliente>;
const CAMPOS_CLIENTE = [
  "tipoDocumento",
  "numeroDocumento",
  "nombre",
  "nacionalidad",
  "oficio",
  "paisResidencia",
  "domicilio",
  "telefono",
  "email",
  "categoriaId",
] as const satisfies readonly (keyof ValoresCliente)[];

export function NuevoCliente() {
  const catalogo = useCatalogo();
  const crear = useCrearCliente();
  const navegar = useNavigate();
  // Desde una cuenta del portal sin ficha: el RUT y el nombre ya escritos
  const desdeCuenta = useLocation().state as { rut?: string; nombre?: string } | null;
  return (
    <Pagina angosta>
      <EncabezadoPagina
        titulo="Nuevo cliente"
        descripcion="Los datos que pide la UAF. Puedes completarlos después."
        volver={{ a: "/clientes", texto: "Clientes" }}
      />
      {desdeCuenta?.rut && <Aviso tono="info">Después de guardar la ficha, vuelve a Cuentas del portal para verificar la cuenta.</Aviso>}
      <ConDatos consulta={catalogo}>
        {(datos) => (
          <FormularioCliente
            categorias={datos.categoriasCliente}
            inicial={{
              tipoDocumento: "RUT",
              numeroDocumento: desdeCuenta?.rut ?? "",
              nombre: desdeCuenta?.nombre ?? "",
              relacionPermanente: false,
              categoriaId: null,
            }}
            textoGuardar="Guardar cliente"
            cancelarA="/clientes"
            guardar={async (entrada) => {
              const creado = await crear.mutateAsync(entrada);
              navegar(`/clientes/${creado.id}`);
            }}
          />
        )}
      </ConDatos>
    </Pagina>
  );
}

export function EditarCliente() {
  const id = Number(useParams().id);
  const consulta = useCliente(id);
  const catalogo = useCatalogo();
  const editar = useEditarCliente(id);
  const navegar = useNavigate();

  if (!Number.isInteger(id) || id <= 0 || esNoExiste(consulta.error)) return <NoEncontrada />;
  if (consulta.isError) return <ErrorDeCarga error={consulta.error} alReintentar={() => void consulta.refetch()} />;
  if (consulta.isPending) return <Cargando texto="Cargando la ficha…" />;
  const cliente = consulta.data;

  return (
    <Pagina angosta>
      <EncabezadoPagina titulo={`Editar ficha de ${cliente.nombre}`} volver={{ a: `/clientes/${id}`, texto: "Volver a la ficha" }} />
      <ConDatos consulta={catalogo}>
        {(datos) => (
          <FormularioCliente
            categorias={datos.categoriasCliente}
            inicial={valoresDeFicha(cliente)}
            textoGuardar="Guardar cambios"
            cancelarA={`/clientes/${id}`}
            guardar={async (entrada) => {
              await editar.mutateAsync(entrada);
              navegar(`/clientes/${id}`);
            }}
          />
        )}
      </ConDatos>
    </Pagina>
  );
}

function valoresDeFicha(c: FichaCliente): ValoresCliente {
  return {
    tipoDocumento: c.tipoDocumento,
    numeroDocumento: c.tipoDocumento === "RUT" ? formatearRut(c.numeroDocumento) : c.numeroDocumento,
    nombre: c.nombre,
    nacionalidad: c.nacionalidad,
    oficio: c.oficio,
    paisResidencia: c.paisResidencia,
    domicilio: c.domicilio,
    telefono: c.telefono,
    email: c.email,
    relacionPermanente: c.relacionPermanente,
    categoriaId: c.categoriaId,
  };
}

function FormularioCliente({
  categorias,
  inicial,
  textoGuardar,
  cancelarA,
  guardar,
}: {
  categorias: CategoriaCliente[];
  inicial: ValoresCliente;
  textoGuardar: string;
  cancelarA: string;
  guardar: (entrada: z.output<typeof esquemaCliente>) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<ValoresCliente, unknown, z.output<typeof esquemaCliente>>({ resolver: zodResolver(esquemaCliente), defaultValues: inicial });
  const opcional = { setValueAs: vacioANull };

  const alEnviar = handleSubmit(async (entrada) => {
    setError(null);
    try {
      await guardar(entrada);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, CAMPOS_CLIENTE, {
          porCodigo: { CLIENTE_DUPLICADO: "numeroDocumento", RUT_INVALIDO: "numeroDocumento", CATEGORIA_INVALIDA: "categoriaId" },
        }),
      );
    }
  });

  return (
    <Tarjeta>
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <FilaCampos>
          <Seleccion etiqueta="Tipo de documento" error={errors.tipoDocumento?.message} {...register("tipoDocumento")}>
            {(Object.keys(TIPO_DOCUMENTO) as TipoDocumento[]).map((t) => (
              <option key={t} value={t}>
                {TIPO_DOCUMENTO[t]}
              </option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Número de documento" placeholder="12.345.678-5" error={errors.numeroDocumento?.message} {...register("numeroDocumento")} />
        </FilaCampos>
        <Entrada etiqueta="Nombre completo" autoComplete="off" error={errors.nombre?.message} {...register("nombre")} />
        <FilaCampos>
          <Entrada
            etiqueta="Nacionalidad"
            placeholder="CL"
            maxLength={2}
            ayuda="Código de 2 letras: CL, AR, BR…"
            error={errors.nacionalidad?.message}
            {...register("nacionalidad", opcional)}
          />
          <Entrada
            etiqueta="País de residencia"
            placeholder="CL"
            maxLength={2}
            error={errors.paisResidencia?.message}
            {...register("paisResidencia", opcional)}
          />
        </FilaCampos>
        <Entrada etiqueta="Oficio o profesión" error={errors.oficio?.message} {...register("oficio", opcional)} />
        <Entrada etiqueta="Domicilio" error={errors.domicilio?.message} {...register("domicilio", opcional)} />
        <FilaCampos>
          <Entrada etiqueta="Teléfono" type="tel" error={errors.telefono?.message} {...register("telefono", opcional)} />
          <Entrada etiqueta="Correo" type="email" error={errors.email?.message} {...register("email", opcional)} />
        </FilaCampos>
        <Seleccion
          etiqueta="Categoría de fidelización"
          error={errors.categoriaId?.message}
          {...register("categoriaId", { setValueAs: (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v)) })}
        >
          <option value="">Sin categoría</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({formatearPorcentaje(c.descuentoMargenPctE6)} menos de margen)
            </option>
          ))}
        </Seleccion>
        <label className={css.casilla}>
          <input type="checkbox" {...register("relacionPermanente")} />
          Relación permanente con la casa (siempre exige ficha completa)
        </label>
        <div className={css.acciones}>
          <EnlaceBoton to={cancelarA}>Cancelar</EnlaceBoton>
          <Boton type="submit" variante="primario" cargando={isSubmitting}>
            {textoGuardar}
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
