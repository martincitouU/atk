import { entradaCliente } from "@atk/shared";
import { aBigint, type Cliente, type CuentaCliente, type EntradaCliente } from "../api/esquemas.ts";
import { formatearMonto } from "@atk/shared/dinero";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircleIcon, CurrencyCircleDollarIcon, MagnifyingGlassIcon, PlusIcon, UserCheckIcon, XIcon } from "@phosphor-icons/react";
import { Fragment, useDeferredValue, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { ErrorNegocio } from "../api/cliente.ts";
import { useCliente, useClientes, useGuardarCliente, useParametros } from "../api/consultas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { useCinta, type GrupoCinta } from "../componentes/Cinta.tsx";
import { ErrorCampo } from "../componentes/ErrorCampo.tsx";
import { Kbd } from "../componentes/Kbd.tsx";
import { Sep } from "../componentes/Sep.tsx";
import { DATOS_DE_EJEMPLO, nombrePais, rutConPuntos } from "../comun.ts";
import "../estilos/clientes.css";
import { CuentasPendientes } from "./CuentasPendientes.tsx";

// ---------------------------------------------------------------------------
// Datos de la ficha

const TIPOS_DOCUMENTO = { RUT: "RUT", PASAPORTE: "Pasaporte", DNI: "DNI", OTRO: "Otro" } as const;

/** El servicio guarda el RUT sin puntos ("11111111-1"); en pantalla va con ellos: "11.111.111-1". */
function numeroDe(c: Pick<Cliente, "tipoDocumento" | "numeroDocumento">): string {
  return c.tipoDocumento === "RUT" ? rutConPuntos(c.numeroDocumento) : c.numeroDocumento;
}

/** «RUT 11.111.111-1», «Pasaporte AAB123456». */
const documentoDe = (c: Pick<Cliente, "tipoDocumento" | "numeroDocumento">) => `${TIPOS_DOCUMENTO[c.tipoDocumento]} ${numeroDe(c)}`;

/** Un RUT escrito con puntos se busca sin ellos, como lo guarda el servicio. */
const paraBuscar = (q: string) => (/^[\d.]+(-[\dkK]?)?$/.test(q.trim()) ? q.replace(/\./g, "") : q);

/** Los países que más pasan por la ventanilla de Coyhaique, para sugerir el código. */
const PAISES = ["CL", "AR", "US", "DE", "FR", "ES", "GB", "IT", "NL", "CH", "IL", "BR", "UY", "PE", "BO", "CO", "MX", "CA", "AU", "CN", "JP"];

const codigoPais = (campo: string) =>
  z
    .string()
    .trim()
    .regex(/^([A-Za-z]{2})?$/, `${campo}: use el código de 2 letras (CL, AR, DE…)`)
    .nullable();

/**
 * entradaCliente de @atk/shared (el de la API), con lo que el formulario puede revisar antes
 * de enviar: los dos datos sin los que el servicio no guarda (DATO_FALTANTE)
 * y el formato del código de país (PAIS_INVALIDO). El RUT lo valida el
 * servicio (RUT_INVALIDO) y su mensaje se muestra tal cual.
 */
const Formulario = entradaCliente.extend({
  numeroDocumento: z.string().trim().min(1, "Indique el número de documento"),
  nombre: z.string().trim().min(1, "Indique el nombre del cliente"),
  nacionalidad: codigoPais("Nacionalidad"),
  paisResidencia: codigoPais("País de residencia"),
});
type Valores = z.input<typeof Formulario>;

/** Lo que el formulario muestra: los textos opcionales vacíos como "". */
function valoresDe(c: Cliente | null): Valores {
  return {
    tipoDocumento: c?.tipoDocumento ?? "RUT",
    numeroDocumento: c ? numeroDe(c) : "",
    nombre: c?.nombre ?? "",
    nacionalidad: c?.nacionalidad ?? "",
    oficio: c?.oficio ?? "",
    paisResidencia: c?.paisResidencia ?? "",
    domicilio: c?.domicilio ?? "",
    telefono: c?.telefono ?? "",
    email: c?.email ?? "",
    relacionPermanente: c?.relacionPermanente ?? false,
    categoriaId: c?.categoriaId ?? null,
  };
}

/** Lo que se envía: los textos vacíos como null y los países en mayúscula. */
function entradaDe(v: Valores): EntradaCliente {
  const texto = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
  return {
    tipoDocumento: v.tipoDocumento,
    numeroDocumento: v.numeroDocumento.trim(),
    nombre: v.nombre.trim(),
    nacionalidad: texto(v.nacionalidad)?.toUpperCase() ?? null,
    oficio: texto(v.oficio),
    paisResidencia: texto(v.paisResidencia)?.toUpperCase() ?? null,
    domicilio: texto(v.domicilio),
    telefono: texto(v.telefono),
    email: texto(v.email),
    relacionPermanente: v.relacionPermanente,
    categoriaId: v.categoriaId ?? null,
  };
}

type CampoUaf = "nacionalidad" | "oficio" | "paisResidencia" | "domicilio" | "contacto";

/**
 * Lo que le falta a la ficha mientras se escribe. Repite la regla de
 * faltantesFicha (servicio de clientes): la tabla usa los `faltantes` que
 * devuelve el servidor; el formulario, esta, para marcar cada campo al vuelo.
 */
function faltanParaUaf(v: Partial<Valores>): Set<CampoUaf> {
  const vacio = (s: string | null | undefined) => !s?.trim();
  const faltan = new Set<CampoUaf>();
  if (vacio(v.nacionalidad)) faltan.add("nacionalidad");
  if (vacio(v.oficio)) faltan.add("oficio");
  if (vacio(v.paisResidencia)) faltan.add("paisResidencia");
  if (vacio(v.domicilio)) faltan.add("domicilio");
  if (vacio(v.telefono) && vacio(v.email)) faltan.add("contacto");
  return faltan;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// La pantalla

/** El id de `?id=`: un entero positivo, o nada. */
function idDe(texto: string | null): number | null {
  const n = Number(texto);
  return texto && Number.isInteger(n) && n > 0 ? n : null;
}

/** Lo último que se guardó, para el aviso de confirmación. */
type Guardado = { id: number; nombre: string; nueva: boolean };

/**
 * Clientes: el buscador y la tabla de fichas, y al lado la ficha para crear o
 * completar. La ficha abierta vive en la URL: `/clientes?nuevo=1` (el «Crear
 * ficha» de la Ventanilla) abre una nueva y `/clientes?id=<id>` (el
 * «Completar la ficha» de la Ventanilla) la de ese cliente. Al guardar la
 * ficha con que se llegó, ofrece volver a la Ventanilla.
 */
export function Clientes() {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  /** La ficha con que se llegó: «nueva», el id de un cliente o ninguna. */
  const [origen] = useState<"nueva" | number | null>(() => (params.get("nuevo") === "1" ? "nueva" : idDe(params.get("id"))));
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [q, setQ] = useState("");
  const buscado = useDeferredValue(q);
  const clientes = useClientes(paraBuscar(buscado));
  const umbral = useParametros().data?.umbralFichaClienteUsd;

  const nueva = params.get("nuevo") === "1";
  const id = nueva ? null : idDe(params.get("id"));
  const ficha = useCliente(id);

  function abrirNueva() {
    setGuardado(null);
    setParams({ nuevo: "1" }, { replace: true });
  }

  /** Una cuenta del portal sin ficha: la ficha nueva, con su RUT y su nombre. */
  function crearDesdeCuenta(cuenta: CuentaCliente) {
    setGuardado(null);
    setParams({ nuevo: "1", rut: cuenta.rut, nombre: cuenta.nombre }, { replace: true });
  }

  /** El cliente de la tabla ya está en mano: la ficha abre sin esperar la consulta. */
  function abrir(c: Cliente) {
    qc.setQueryData(["cliente", c.id], c);
    setParams({ id: String(c.id) }, { replace: true });
  }

  function elegir(c: Cliente) {
    setGuardado(null);
    abrir(c);
  }

  function cerrar() {
    setParams({}, { replace: true });
  }

  function alGuardar(c: Cliente, eraNueva: boolean) {
    abrir(c);
    setGuardado({ id: c.id, nombre: c.nombre, nueva: eraNueva });
  }

  const conVuelta = (g: Guardado) => (origen === "nueva" ? g.nueva : g.id === origen);
  // La API busca solo con texto (q es obligatorio). Sin búsqueda, la tabla
  // muestra la ficha abierta, si hay una, para que se vea su estado.
  const sinBuscar = buscado.trim() === "";
  const consulta = sinBuscar ? { isError: false, error: null, data: id !== null && ficha.data ? [ficha.data] : [], isFetching: false } : clientes;
  const lista = clientes.data ?? [];
  const incompletas = lista.filter((c) => c.faltantes.length > 0).length;
  const aviso = guardado && <AvisoGuardado guardado={guardado} conVuelta={conVuelta(guardado)} />;

  // La cinta de Clientes: lo mismo que el cartel y los paneles
  const buscar = useRef<HTMLInputElement>(null);
  const cuentas = useRef<HTMLDivElement>(null);
  const navegar = useNavigate();
  const grupos: GrupoCinta[] = [
    {
      nombre: "Fichas",
      comandos: [
        { id: "nueva", etiqueta: "Nueva ficha", Icono: PlusIcon, grande: true, alPulsar: abrirNueva },
        { id: "buscar", etiqueta: "Buscar", Icono: MagnifyingGlassIcon, alPulsar: () => buscar.current?.focus() },
        { id: "cerrar", etiqueta: "Cerrar la ficha", Icono: XIcon, deshabilitado: !nueva && id === null, alPulsar: cerrar },
      ],
    },
    {
      nombre: "Portal de clientes",
      comandos: [
        {
          id: "cuentas",
          etiqueta: "Cuentas por verificar",
          Icono: UserCheckIcon,
          grande: true,
          alPulsar: () => {
            cuentas.current?.scrollIntoView({ block: "nearest" });
            cuentas.current?.querySelector<HTMLElement>("button")?.focus();
          },
        },
      ],
      nota: ["Se verifican con el carnet"],
    },
    {
      nombre: "Ir a",
      comandos: [
        {
          id: "ventanilla",
          etiqueta: "Ventanilla",
          Icono: CurrencyCircleDollarIcon,
          tecla: "F1",
          grande: true,
          alPulsar: () => void navegar("/ventanilla"),
        },
      ],
    },
  ];
  useCinta(grupos);

  let panel: ReactNode;
  if (nueva) {
    // Desde una cuenta del portal sin ficha: el RUT y el nombre ya escritos
    const inicial = { numeroDocumento: params.get("rut") ?? "", nombre: params.get("nombre") ?? "" };
    panel = (
      <FichaCliente
        key={`nueva-${inicial.numeroDocumento}`}
        cliente={null}
        inicial={inicial}
        onGuardado={alGuardar}
        onCerrar={cerrar}
        avisoGuardado={aviso}
      />
    );
  } else if (id !== null && ficha.data) {
    panel = <FichaCliente key={`cliente-${id}`} cliente={ficha.data} onGuardado={alGuardar} onCerrar={cerrar} avisoGuardado={aviso} />;
  } else if (id !== null) {
    panel = <FichaEsperando consulta={ficha} onCerrar={cerrar} />;
  } else {
    panel = <GuiaFicha umbral={umbral} />;
  }

  return (
    <div className="clientes">
      <header className="cartel-seccion">
        <div className="cartel-seccion-in">
          <div className="cartel-titulo">
            <h1>Clientes</h1>
            <p>
              Fichas para la UAF
              {DATOS_DE_EJEMPLO && (
                <>
                  <Sep />
                  <span className="sint">datos de ejemplo</span>
                </>
              )}
            </p>
          </div>
          <div className="clientes-herramientas">
            <label className="clientes-buscar">
              <span className="oculto">Buscar cliente</span>
              <MagnifyingGlassIcon size={18} weight="bold" aria-hidden="true" />
              <input
                ref={buscar}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre o documento"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="button" className="btn-cartel" onClick={abrirNueva}>
              <PlusIcon size={16} weight="bold" aria-hidden="true" />
              Nueva ficha
            </button>
          </div>
        </div>
      </header>

      <div className="clientes-trabajo">
        <div className="clientes-col">
          <div ref={cuentas} className="clientes-cuentas">
            <CuentasPendientes onCrearFicha={crearDesdeCuenta} />
          </div>
          <section className="panel clientes-lista" aria-labelledby="clientes-lista-titulo">
            <header>
              <h2 id="clientes-lista-titulo">Fichas</h2>
              {!sinBuscar && clientes.isSuccess && (
                <p className="hint">
                  {plural(lista.length, "cliente", "clientes")}
                  {incompletas > 0 && (
                    <>
                      <Sep />
                      {incompletas} con la ficha incompleta
                    </>
                  )}
                </p>
              )}
            </header>
            <TablaClientes consulta={consulta} buscado={buscado.trim()} elegido={id} onElegir={elegir} onNueva={abrirNueva} />
            {!sinBuscar && lista.length >= 20 && (
              <p className="clientes-nota">Se muestran los primeros 20: afine la búsqueda por nombre o documento.</p>
            )}
          </section>
        </div>

        {panel}
      </div>
    </div>
  );
}

/** La ficha pedida por `?id=` mientras llega, o si ese cliente no existe. */
function FichaEsperando({ consulta, onCerrar }: { consulta: ReturnType<typeof useCliente>; onCerrar: () => void }) {
  return (
    <section className="panel clientes-ficha" aria-labelledby="clientes-ficha-espera" aria-busy={consulta.isPending || undefined}>
      <header>
        <h2 id="clientes-ficha-espera">Ficha del cliente</h2>
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar la ficha">
          <XIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </header>
      {consulta.isError ? (
        <div className="clientes-estado">
          <Aviso tono="error" rol="alert">
            {consulta.error instanceof ErrorNegocio ? consulta.error.message : "No se pudo abrir la ficha."}
          </Aviso>
        </div>
      ) : (
        <div className="clientes-ficha-espera" aria-hidden="true">
          {["40%", "100%", "100%", "70%", "100%"].map((ancho, i) => (
            <span key={i} className="esqueleto" style={{ width: ancho }} />
          ))}
        </div>
      )}
    </section>
  );
}

/** La confirmación de lo guardado; toma el foco, porque la ficha nueva se vuelve a montar. */
function AvisoGuardado({ guardado, conVuelta }: { guardado: Guardado; conVuelta: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="clientes-guardado" role="status" tabIndex={-1} ref={ref}>
      <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
      <p>
        {guardado.nueva ? "Ficha creada" : "Ficha guardada"}: <b>{guardado.nombre}</b>.
      </p>
      {conVuelta && (
        <Link to="/ventanilla" className="clientes-volver">
          Volver a la Ventanilla <Kbd>F1</Kbd>
        </Link>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// La tabla

function TablaClientes({
  consulta,
  buscado,
  elegido,
  onElegir,
  onNueva,
}: {
  consulta: Pick<ReturnType<typeof useClientes>, "isError" | "error" | "data" | "isFetching">;
  buscado: string;
  elegido: number | null;
  onElegir: (c: Cliente) => void;
  onNueva: () => void;
}) {
  if (consulta.isError) {
    const mensaje = consulta.error instanceof ErrorNegocio ? consulta.error.message : "No se pudieron cargar los clientes.";
    return (
      <div className="clientes-estado">
        <Aviso tono="error" rol="alert">
          {mensaje}
        </Aviso>
      </div>
    );
  }

  const lista = consulta.data;
  if (lista && lista.length === 0) {
    return (
      <div className="clientes-vacio">
        <p>{buscado ? `Ningún cliente coincide con «${buscado}».` : "Escriba un nombre o un documento para buscar la ficha."}</p>
        <button type="button" className="btn" onClick={onNueva}>
          <PlusIcon size={16} weight="bold" aria-hidden="true" />
          Crear una ficha nueva
        </button>
      </div>
    );
  }

  return (
    <div className="clientes-tabla">
      <table aria-labelledby="clientes-lista-titulo" aria-busy={consulta.isFetching || undefined}>
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col" className="clientes-col-doc">
              Documento
            </th>
            <th scope="col">Ficha para la UAF</th>
          </tr>
        </thead>
        <tbody>
          {lista
            ? lista.map((c) => (
                // El clic en cualquier parte de la fila es un atajo del ratón; con teclado, el botón del nombre.
                <tr key={c.id} className={c.id === elegido ? "elegido" : undefined} onClick={() => onElegir(c)}>
                  <td>
                    <button
                      type="button"
                      className="clientes-nombre"
                      aria-current={c.id === elegido ? "true" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onElegir(c);
                      }}
                    >
                      {c.nombre}
                    </button>
                    <span className="clientes-doc-movil num">{documentoDe(c)}</span>
                    {c.relacionPermanente && <span className="clientes-permanente">Relación permanente</span>}
                  </td>
                  <td className="clientes-col-doc">
                    <span className="clientes-doc">{TIPOS_DOCUMENTO[c.tipoDocumento]}</span> <span className="num">{numeroDe(c)}</span>
                  </td>
                  <td>
                    {c.faltantes.length === 0 ? (
                      <span className="est ok">Completa</span>
                    ) : (
                      <>
                        <span className="est obra">Falta para la UAF</span>
                        <span className="clientes-faltan">
                          {c.faltantes.map((f, i) => (
                            <Fragment key={f}>
                              {i > 0 && <Sep />}
                              {f}
                            </Fragment>
                          ))}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              ))
            : [0, 1, 2].map((i) => (
                <tr key={i} aria-hidden="true">
                  <td>
                    <span className="esqueleto" style={{ width: "70%" }} />
                  </td>
                  <td className="clientes-col-doc">
                    <span className="esqueleto" style={{ width: "60%" }} />
                  </td>
                  <td>
                    <span className="esqueleto" style={{ width: "40%" }} />
                  </td>
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El panel sin ficha abierta: qué pide la UAF

function GuiaFicha({ umbral }: { umbral: string | undefined }) {
  const desde = umbral ? `US$ ${formatearMonto(aBigint(umbral), 0)}` : "el umbral de la UAF";
  return (
    <section className="panel clientes-guia" aria-labelledby="clientes-guia-titulo">
      <header>
        <h2 id="clientes-guia-titulo">Ficha del cliente</h2>
      </header>
      <div className="clientes-guia-cuerpo">
        <p>Elija un cliente de la lista para revisar o completar su ficha, o cree una con «Nueva ficha».</p>
        <p>Desde {desde}, y en toda operación de un cliente con relación permanente, la UAF exige estos siete datos:</p>
        <ol className="clientes-siete">
          <li>Tipo y número de documento</li>
          <li>Nombre completo</li>
          <li>Nacionalidad</li>
          <li>Oficio o profesión</li>
          <li>País de residencia</li>
          <li>Domicilio</li>
          <li>Contacto: teléfono o email</li>
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// La ficha: crear o completar

function Falta({ id, visible }: { id: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="clientes-falta" id={id}>
      Falta para la UAF
    </span>
  );
}

/** Los ids de aria-describedby que existen. */
const describir = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

function FichaCliente({
  cliente,
  inicial,
  onGuardado,
  onCerrar,
  avisoGuardado,
}: {
  cliente: Cliente | null;
  /** Lo que la ficha nueva trae escrito (el RUT y el nombre de una cuenta del portal). */
  inicial?: Pick<Valores, "numeroDocumento" | "nombre">;
  onGuardado: (c: Cliente, eraNueva: boolean) => void;
  onCerrar: () => void;
  avisoGuardado: ReactNode;
}) {
  const id = useId();
  const guardar = useGuardarCliente();
  const [fallo, setFallo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Valores, unknown, z.output<typeof Formulario>>({
    resolver: zodResolver(Formulario),
    defaultValues: { ...valoresDe(cliente), ...(cliente === null ? inicial : undefined) },
  });

  const valores = useWatch({ control });
  const faltan = faltanParaUaf(valores);
  const tipo = valores.tipoDocumento ?? "RUT";

  const enviar = handleSubmit(async (datos) => {
    setFallo(null);
    try {
      const respuesta = await guardar.mutateAsync({ id: cliente?.id, datos: entradaDe(datos) });
      reset(valoresDe(respuesta));
      onGuardado(respuesta, cliente === null);
    } catch (error) {
      if (error instanceof ErrorNegocio && (error.codigo === "RUT_INVALIDO" || error.codigo === "CLIENTE_DUPLICADO")) {
        setError("numeroDocumento", { type: "server", message: error.message }, { shouldFocus: true });
      } else {
        setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo guardar la ficha. Inténtelo de nuevo.");
      }
    }
  });

  const campo = (nombre: string) => `${id}-${nombre}`;
  const pais = (codigo: string | null | undefined) => (codigo ? nombrePais(codigo) : null);
  const titulo = cliente ? cliente.nombre : "Nueva ficha";

  return (
    <section className="panel clientes-ficha" aria-labelledby={campo("titulo")}>
      <header>
        <h2 id={campo("titulo")}>{titulo}</h2>
        {faltan.size === 0 ? (
          <span className="est ok">Completa</span>
        ) : (
          <span className="est obra">{faltan.size === 1 ? "Falta 1 dato" : `Faltan ${faltan.size} datos`} para la UAF</span>
        )}
        <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar la ficha">
          <XIcon size={18} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <form noValidate onSubmit={enviar}>
        {!isDirty && avisoGuardado}

        <div className="clientes-duo clientes-duo-doc">
          <div className="clientes-campo">
            <label htmlFor={campo("tipo")}>Tipo de documento</label>
            <select id={campo("tipo")} {...register("tipoDocumento")}>
              {Object.entries(TIPOS_DOCUMENTO).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </div>
          <div className="clientes-campo">
            <label htmlFor={campo("doc")}>Número de documento</label>
            <input
              id={campo("doc")}
              className="num"
              autoComplete="off"
              spellCheck={false}
              placeholder={tipo === "RUT" ? "Ej.: 12.345.678-5" : undefined}
              aria-invalid={errors.numeroDocumento ? true : undefined}
              aria-describedby={describir(errors.numeroDocumento && campo("doc-error"))}
              {...register("numeroDocumento")}
            />
            <ErrorCampo id={campo("doc-error")} mensaje={errors.numeroDocumento?.message} />
          </div>
        </div>

        <div className="clientes-campo">
          <label htmlFor={campo("nombre")}>Nombre completo</label>
          <input
            id={campo("nombre")}
            autoComplete="off"
            aria-invalid={errors.nombre ? true : undefined}
            aria-describedby={describir(errors.nombre && campo("nombre-error"))}
            {...register("nombre")}
          />
          <ErrorCampo id={campo("nombre-error")} mensaje={errors.nombre?.message} />
        </div>

        <div className="clientes-duo">
          <div className="clientes-campo">
            <div className="clientes-rotulo">
              <label htmlFor={campo("nac")}>Nacionalidad</label>
              <Falta id={campo("nac-falta")} visible={faltan.has("nacionalidad")} />
            </div>
            <input
              id={campo("nac")}
              className="clientes-pais"
              list={campo("paises")}
              maxLength={2}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.nacionalidad ? true : undefined}
              aria-describedby={describir(
                faltan.has("nacionalidad") && campo("nac-falta"),
                errors.nacionalidad ? campo("nac-error") : campo("nac-pais"),
              )}
              {...register("nacionalidad")}
            />
            {errors.nacionalidad ? (
              <ErrorCampo id={campo("nac-error")} mensaje={errors.nacionalidad.message} />
            ) : (
              <p className="clientes-ayuda" id={campo("nac-pais")}>
                {pais(valores.nacionalidad) ?? "Código de 2 letras"}
              </p>
            )}
          </div>
          <div className="clientes-campo">
            <div className="clientes-rotulo">
              <label htmlFor={campo("res")}>País de residencia</label>
              <Falta id={campo("res-falta")} visible={faltan.has("paisResidencia")} />
            </div>
            <input
              id={campo("res")}
              className="clientes-pais"
              list={campo("paises")}
              maxLength={2}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errors.paisResidencia ? true : undefined}
              aria-describedby={describir(
                faltan.has("paisResidencia") && campo("res-falta"),
                errors.paisResidencia ? campo("res-error") : campo("res-pais"),
              )}
              {...register("paisResidencia")}
            />
            {errors.paisResidencia ? (
              <ErrorCampo id={campo("res-error")} mensaje={errors.paisResidencia.message} />
            ) : (
              <p className="clientes-ayuda" id={campo("res-pais")}>
                {pais(valores.paisResidencia) ?? "Código de 2 letras"}
              </p>
            )}
          </div>
          <datalist id={campo("paises")}>
            {PAISES.map((c) => (
              <option key={c} value={c}>
                {nombrePais(c)}
              </option>
            ))}
          </datalist>
        </div>

        <div className="clientes-campo">
          <div className="clientes-rotulo">
            <label htmlFor={campo("oficio")}>Oficio o profesión</label>
            <Falta id={campo("oficio-falta")} visible={faltan.has("oficio")} />
          </div>
          <input
            id={campo("oficio")}
            autoComplete="off"
            aria-describedby={describir(faltan.has("oficio") && campo("oficio-falta"))}
            {...register("oficio")}
          />
        </div>

        <div className="clientes-campo">
          <div className="clientes-rotulo">
            <label htmlFor={campo("dom")}>Domicilio</label>
            <Falta id={campo("dom-falta")} visible={faltan.has("domicilio")} />
          </div>
          <input
            id={campo("dom")}
            autoComplete="off"
            placeholder="Calle, número y ciudad"
            aria-describedby={describir(faltan.has("domicilio") && campo("dom-falta"))}
            {...register("domicilio")}
          />
        </div>

        <fieldset className="clientes-contacto" aria-describedby={describir(faltan.has("contacto") && campo("contacto-falta"))}>
          <legend>
            <span>Contacto: teléfono o email</span>
            <Falta id={campo("contacto-falta")} visible={faltan.has("contacto")} />
          </legend>
          <div className="clientes-duo">
            <div className="clientes-campo">
              <label htmlFor={campo("tel")}>Teléfono</label>
              <input id={campo("tel")} type="tel" inputMode="tel" autoComplete="off" placeholder="Ej.: +56 9 1234 5678" {...register("telefono")} />
            </div>
            <div className="clientes-campo">
              <label htmlFor={campo("email")}>Email</label>
              <input id={campo("email")} type="email" inputMode="email" autoComplete="off" spellCheck={false} {...register("email")} />
            </div>
          </div>
        </fieldset>

        <label className="clientes-permanente-campo">
          <input type="checkbox" {...register("relacionPermanente")} />
          <span>
            <b>Relación permanente con la casa</b>
            La UAF exige su ficha completa en toda operación, sin importar el monto.
          </span>
        </label>

        {fallo && (
          <Aviso tono="error" rol="alert">
            {fallo}
          </Aviso>
        )}

        <div className="clientes-acciones">
          <button type="submit" className="btn prim" disabled={isSubmitting}>
            {isSubmitting ? "Guardando…" : cliente ? "Guardar ficha" : "Crear ficha"}
          </button>
          <button type="button" className="btn" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </form>
    </section>
  );
}
