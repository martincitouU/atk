// Nueva operación: el "widget de cambio" de DESIGN.md (Swap Input Card).
//
// Arriba se escribe la divisa; abajo aparecen los pesos que calcula la API
// mientras se escribe (POST /api/operaciones/previsualizar, 300 ms después
// de la última tecla). El front no calcula ningún monto.
//
// Al registrar queda como BORRADOR y se va a su detalle, donde se confirma.
// El mismo formulario edita un borrador (/operaciones/:id/editar): la API
// lo recalcula con la pizarra vigente.

import { ArrowDown, Search, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { useCrearBorrador, useEditarBorrador, type EntradaOperacionJson } from "../../api/acciones.ts";
import { esNoExiste, mensajeDe } from "../../api/cliente.ts";
import { MINIMO_BUSQUEDA, useCatalogo, useClientes, useMonedaBase, useMonedas, useOperacion, usePizarra, usePrevisualizacion } from "../../api/consultas.ts";
import type { MedioPago, OperacionListada, TipoOperacion, Turno } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { PastillaDivisa, SelectorDivisa } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, ErrorDeCarga } from "../../componentes/Estados.tsx";
import { Monto, Tasa } from "../../componentes/Monto.tsx";
import { Pagina } from "../../componentes/Pagina.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { useDemorado } from "../../lib/demora.ts";
import { formatearHora, hoy, instanteDeHora } from "../../lib/fechas.ts";
import { errorEnFormulario, reglaMonto } from "../../lib/formularios.ts";
import { formatearConSimbolo, formatearMonto, formatearTasa, leerMonto, leerTasa } from "../../lib/montos.ts";
import { MEDIO_PAGO, TIPO_DTE } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import { NoEncontrada } from "../NoEncontrada.tsx";
import css from "./NuevaOperacion.module.css";

const TIPOS = [
  { valor: "VENTA", texto: "Venta" },
  { valor: "COMPRA", texto: "Compra" },
] as const;

const MEDIOS = (Object.keys(MEDIO_PAGO) as MedioPago[]).map((valor) => ({ valor, texto: MEDIO_PAGO[valor] }));

/** Lo que se escribe, tal como se ve ("150,25"). Se convierte al enviar. */
type Valores = {
  tipo: TipoOperacion;
  monedaCodigo: string;
  monto: string;
  medioPago: MedioPago;
  tipoDte: string;
  folio: string;
  proposito: string;
  tasaPreferencial: string;
  horaReal: string;
  observacion: string;
};

type ClienteElegido = { id: number; nombre: string; detalle: string };

export function NuevaOperacion() {
  return <FormularioOperacion />;
}

/** /operaciones/:id/editar: solo un borrador, y solo de quien lo registró. */
export function EditarOperacion() {
  const id = Number(useParams().id);
  const { usuario } = usePersonal();
  const consulta = useOperacion(id);
  const monedas = useMonedas();

  if (!Number.isInteger(id) || id <= 0 || esNoExiste(consulta.error)) return <NoEncontrada />;
  if (consulta.isError) return <ErrorDeCarga error={consulta.error} alReintentar={() => void consulta.refetch()} />;
  if (consulta.isPending || !monedas) return <Cargando texto="Cargando el borrador…" />;

  const op = consulta.data;
  if (op.estado !== "BORRADOR" || op.usuarioId !== usuario.id) {
    return (
      <Pagina angosta>
        <EncabezadoPagina titulo={`Operación N° ${op.id}`} volver={{ a: `/operaciones/${op.id}`, texto: "Volver a la operación" }} />
        <Aviso tono="atencion" titulo="Esta operación no se puede editar">
          Solo se edita un borrador, y solo quien lo registró. Una operación confirmada se reversa.
        </Aviso>
      </Pagina>
    );
  }
  const divisa = monedas.get(op.monedaCodigo);
  return <FormularioOperacion borrador={op} decimales={divisa?.decimales ?? 2} decimalesTasa={divisa?.decimalesTasa ?? 2} />;
}

/** Los valores del formulario a partir de un borrador (para editarlo). */
function valoresDe(op: OperacionListada, decimales: number, decimalesTasa: number): Valores {
  return {
    tipo: op.tipo,
    monedaCodigo: op.monedaCodigo,
    monto: formatearMonto(op.montoDivisa, decimales),
    medioPago: op.medioPago,
    tipoDte: String(op.tipoDte ?? 41),
    folio: op.folioDte ? String(op.folioDte) : "",
    proposito: op.proposito ?? "",
    tasaPreferencial: op.esPreferencial ? formatearTasa(op.tasaAplicadaE6, decimalesTasa) : "",
    horaReal: op.registroDiferido ? formatearHora(op.realizadaEn) : "",
    observacion: op.observacion ?? "",
  };
}

const VACIO: Valores = {
  tipo: "VENTA",
  monedaCodigo: "",
  monto: "",
  medioPago: "EFECTIVO",
  tipoDte: "41",
  folio: "",
  proposito: "",
  tasaPreferencial: "",
  horaReal: "",
  observacion: "",
};

/**
 * Lo que afecta el precio, para pedir el cálculo (la categoría del cliente
 * cambia el margen; la hora real, la pizarra que se usa). Null si el monto
 * todavía no es válido.
 */
function entradaDelCalculo(v: Valores, moneda: string, decimales: number, clienteId: number | null, diaTurno: string): EntradaOperacionJson | null {
  const montoDivisa = leerMonto(v.monto, decimales);
  if (!moneda || montoDivisa === null || BigInt(montoDivisa) <= 0n) return null;
  const conTasa = v.tasaPreferencial.trim() !== "";
  const tasa = conTasa ? leerTasa(v.tasaPreferencial) : null;
  if (conTasa && (tasa === null || BigInt(tasa) <= 0n)) return null;
  return {
    tipo: v.tipo,
    monedaCodigo: moneda,
    montoDivisa,
    medioPago: v.medioPago,
    clienteId,
    tasaSolicitadaE6: tasa,
    realizadaEn: v.horaReal ? instanteDeHora(diaTurno, v.horaReal) : null,
  };
}

function FormularioOperacion({
  borrador,
  decimales: decimalesBorrador,
  decimalesTasa = 2,
}: {
  borrador?: OperacionListada;
  decimales?: number;
  decimalesTasa?: number;
}) {
  const { turnoAbierto } = usePersonal();
  const catalogo = useCatalogo();
  const pizarra = usePizarra();
  const monedaBase = useMonedaBase();
  const monedas = useMonedas();
  const navegar = useNavigate();
  const crear = useCrearBorrador();
  const editar = useEditarBorrador(borrador?.id ?? 0);

  const [cliente, setCliente] = useState<ClienteElegido | null>(() =>
    borrador?.clienteId ? { id: borrador.clienteId, nombre: borrador.clienteNombre ?? `Cliente ${borrador.clienteId}`, detalle: "" } : null,
  );
  const [errorCliente, setErrorCliente] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({ defaultValues: borrador ? valoresDe(borrador, decimalesBorrador ?? 2, decimalesTasa) : VACIO });

  const valores = watch();
  const divisas = catalogo.data?.divisas ?? [];
  // La primera de la pizarra hasta que se elija otra
  const moneda = valores.monedaCodigo || divisas[0]?.codigo || "";
  const divisa = monedas?.get(moneda);
  const decimales = divisa?.decimales ?? 2;
  const fila = pizarra.data?.find((f) => f.monedaCodigo === moneda);
  const umbralUsd = catalogo.data?.parametros.umbralFichaClienteUsd ?? "5000";
  // El mínimo de la divisa, solo si la casa definió uno (0 = sin mínimo)
  const minimo = divisas.find((d) => d.codigo === moneda && BigInt(d.montoMinimo) > 0n);
  // Registro diferido: la hora real es del día en que se abrió el turno
  const turno: Turno | null = turnoAbierto;
  const diaTurno = hoy(undefined, turno ? new Date(turno.abiertoEn) : new Date());

  // El cálculo se pide al terminar de escribir
  const paraCalcular = turno ? entradaDelCalculo(valores, moneda, decimales, cliente?.id ?? null, diaTurno) : null;
  const demorada = useDemorado(JSON.stringify(paraCalcular));
  const previa = usePrevisualizacion(JSON.parse(demorada) as EntradaOperacionJson | null);
  const calculo = paraCalcular && previa.data && !previa.isError ? previa.data : null;
  const exigeFicha = calculo?.requiereFicha ?? false;

  const alEnviar = handleSubmit(async (v) => {
    setError(null);
    setErrorCliente(null);
    const base = entradaDelCalculo(v, moneda, decimales, cliente?.id ?? null, diaTurno);
    if (!base) return setError("Revisa el monto y la tasa.");
    // Desde el umbral, la UAF exige cliente y propósito: se pide antes de guardar
    let falta = false;
    if (exigeFicha && !cliente) {
      setErrorCliente(`Desde US$ ${formatearMonto(umbralUsd, 0)} hay que identificar al cliente (UAF).`);
      falta = true;
    }
    if (exigeFicha && !v.proposito.trim()) {
      marcar("proposito", { message: "Indica el propósito: lo exige la UAF desde este monto." });
      falta = true;
    }
    if (falta) return;

    const folio = v.folio.trim() ? Number(v.folio) : null;
    const entrada: EntradaOperacionJson = {
      ...base,
      proposito: v.proposito.trim() || null,
      tipoDte: folio ? (Number(v.tipoDte) as 34 | 41) : null,
      folioDte: folio,
      observacion: v.observacion.trim() || null,
    };
    try {
      const op = borrador ? await editar.mutateAsync(entrada) : await crear.mutateAsync(entrada);
      navegar(`/operaciones/${op.id}`);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, ["proposito", "observacion"], {
          nombres: { montoDivisa: "monto", folioDte: "folio", tipoDte: "folio", tasaSolicitadaE6: "tasaPreferencial", realizadaEn: "horaReal" },
          porCodigo: {
            MONTO_INVALIDO: "monto",
            FOLIO_DUPLICADO: "folio",
            DTE_INCOMPLETO: "folio",
            DTE_INVALIDO: "folio",
            TASA_INVALIDA: "tasaPreferencial",
            DIFERIDO_FUTURO: "horaReal",
            FECHA_INVALIDA: "horaReal",
            FALTA_PROPOSITO: "proposito",
          },
        }),
      );
    }
  });

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={borrador ? `Editar borrador N° ${borrador.id}` : "Nueva operación"}
        descripcion={borrador ? "Al guardar se recalcula con la pizarra vigente." : "Se registra como borrador. La caja se mueve recién al confirmar."}
        volver={borrador ? { a: `/operaciones/${borrador.id}`, texto: "Volver a la operación" } : { a: "/operaciones", texto: "Operaciones" }}
      />

      {!turno && (
        <Aviso tono="atencion" titulo="Necesitas un turno abierto para operar" acciones={<Link to="/caja">Abrir turno</Link>}>
          Las operaciones quedan registradas en la caja de tu turno.
        </Aviso>
      )}

      <form className={css.operar} onSubmit={alEnviar} noValidate>
        {/* ---- El widget: divisa arriba, pesos abajo ---- */}
        <Tarjeta elevada className={css.widget}>
          <Segmentado etiqueta="Tipo de operación" opciones={TIPOS} valor={valores.tipo} alCambiar={(tipo) => setValue("tipo", tipo)} anchoCompleto />
          <p className={css.explicacion}>
            {valores.tipo === "VENTA"
              ? "La casa vende divisa: el cliente la recibe y paga en pesos."
              : "La casa compra divisa: el cliente la entrega y recibe pesos."}
          </p>

          <div className={css.panelEntrada}>
            <label htmlFor="monto-divisa" className={css.etiquetaPanel}>
              {valores.tipo === "VENTA" ? "El cliente recibe" : "El cliente entrega"}
            </label>
            <div className={css.filaPanel}>
              <input
                id="monto-divisa"
                className={`${css.montoGrande} num`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                aria-invalid={errors.monto ? true : undefined}
                aria-describedby="monto-divisa-ayuda"
                {...register("monto", { validate: reglaMonto(decimales) })}
              />
              <SelectorDivisa opciones={divisas} valor={moneda} alCambiar={(codigo) => setValue("monedaCodigo", codigo)} />
            </div>
            <p id="monto-divisa-ayuda" className={errors.monto ? css.errorPanel : css.ayudaPanel}>
              {errors.monto?.message ??
                (minimo
                  ? `Mínimo ${formatearConSimbolo(minimo.montoMinimo, minimo.decimales, minimo.simbolo)} · Escribe los decimales con coma`
                  : "Escribe los decimales con coma")}
            </p>
          </div>

          <div className={css.flecha} aria-hidden>
            <ArrowDown size={18} />
          </div>

          <div className={css.panelSalida}>
            <span className={css.etiquetaPanel}>{valores.tipo === "VENTA" ? "El cliente paga" : "El cliente recibe"}</span>
            <div className={css.filaPanel}>
              <output className={`${css.montoGrande} num`} htmlFor="monto-divisa" aria-live="polite">
                {calculo ? <Monto valor={calculo.montoBase} moneda={monedaBase} sinSimbolo /> : "—"}
              </output>
              <PastillaDivisa codigo={monedaBase} />
            </div>
          </div>

          {paraCalcular && previa.isError && (
            <Aviso tono="error" titulo="No se puede calcular">
              {mensajeDe(previa.error)}
            </Aviso>
          )}

          {(calculo || fila) && (
            <dl className={css.detalle}>
              {calculo ? (
                <div>
                  <dt>Tasa</dt>
                  <dd>
                    <Tasa valorE6={calculo.tasaAplicadaE6} decimales={divisa?.decimalesTasa ?? 2} /> por {moneda}
                    {calculo.esPreferencial && " (preferencial)"}
                  </dd>
                </div>
              ) : (
                fila && (
                  <div>
                    <dt>Pizarra</dt>
                    <dd>
                      <Tasa valorE6={valores.tipo === "VENTA" ? fila.ventaE6 : fila.compraE6} decimales={fila.decimalesTasa} /> por {moneda}
                    </dd>
                  </div>
                )
              )}
              {calculo && (
                <div>
                  <dt>Equivale a</dt>
                  <dd>
                    <Monto valor={calculo.equivalenteUsd} moneda="USD" />
                  </dd>
                </div>
              )}
              {fila?.vigenteDesde && (
                <div>
                  <dt>Pizarra</dt>
                  <dd>{fila.vencida ? "vencida: hay que publicar una tasa nueva" : `vigente desde las ${formatearHora(fila.vigenteDesde)}`}</dd>
                </div>
              )}
            </dl>
          )}

          {exigeFicha && (
            <Aviso tono="atencion" titulo="Requiere ficha del cliente (UAF)">
              Desde US$ {formatearMonto(umbralUsd, 0)} hay que identificar al cliente con su ficha completa e indicar el propósito.
            </Aviso>
          )}
          {calculo?.esPreferencial && <Aviso tono="info">La tasa preferencial necesita la autorización de un supervisor antes de confirmar.</Aviso>}
        </Tarjeta>

        {/* ---- Los datos de la operación ---- */}
        <Tarjeta titulo="Datos de la operación">
          <div className={css.campos}>
            {error && <Aviso tono="error">{error}</Aviso>}

            <div className={css.grupo}>
              <span className={css.etiquetaGrupo}>Medio de pago de los pesos</span>
              <Segmentado
                etiqueta="Medio de pago de los pesos"
                opciones={MEDIOS}
                valor={valores.medioPago}
                alCambiar={(medio) => setValue("medioPago", medio)}
                anchoCompleto
              />
              <p className={css.notaGrupo}>La divisa siempre es efectivo. Solo el efectivo mueve los pesos de la caja.</p>
            </div>

            <BuscarCliente
              umbralUsd={umbralUsd}
              elegido={cliente}
              alElegir={(c) => {
                setCliente(c);
                setErrorCliente(null);
              }}
              error={errorCliente}
              exigido={exigeFicha}
            />

            <FilaCampos>
              <Seleccion etiqueta="Documento" {...register("tipoDte")}>
                {Object.entries(TIPO_DTE).map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {nombre} ({codigo})
                  </option>
                ))}
              </Seleccion>
              <Entrada
                etiqueta="Folio"
                inputMode="numeric"
                placeholder="1017"
                ayuda="Se puede escribir al confirmar."
                error={errors.folio?.message}
                {...register("folio", { validate: (f) => !f.trim() || /^[1-9]\d{0,9}$/.test(f.trim()) || "El folio es un número entero" })}
              />
            </FilaCampos>

            <Entrada
              etiqueta="Propósito"
              placeholder="Viaje, ahorro, comercio…"
              ayuda={exigeFicha ? "Obligatorio desde este monto (UAF)." : "Obligatorio cuando se exige ficha."}
              error={errors.proposito?.message}
              {...register("proposito")}
            />

            <details className={css.avanzadas} open={Boolean(borrador?.esPreferencial || borrador?.registroDiferido) || undefined}>
              <summary>Opciones avanzadas</summary>
              <div className={css.campos}>
                <Entrada
                  etiqueta="Tasa preferencial"
                  inputMode="decimal"
                  placeholder="Igual a la pizarra"
                  ayuda="Si difiere de la pizarra, un supervisor debe autorizarla antes de confirmar."
                  error={errors.tasaPreferencial?.message}
                  {...register("tasaPreferencial", {
                    validate: (t) => {
                      if (!t.trim()) return true;
                      const tasa = leerTasa(t);
                      return (tasa !== null && BigInt(tasa) > 0n) || "Escribe la tasa con coma, por ejemplo 950,50";
                    },
                  })}
                />
                <Entrada
                  etiqueta="Hora real (registro diferido)"
                  type="time"
                  ayuda="Si la operación ocurrió antes, durante el mismo día del turno."
                  error={errors.horaReal?.message}
                  {...register("horaReal")}
                />
                <AreaTexto etiqueta="Observación" error={errors.observacion?.message} {...register("observacion")} />
              </div>
            </details>

            <Boton type="submit" variante="primario" anchoCompleto disabled={!turno} cargando={isSubmitting}>
              {borrador ? "Guardar cambios" : "Registrar borrador"}
            </Boton>
            {borrador && (
              <EnlaceBoton to={`/operaciones/${borrador.id}`} variante="texto" anchoCompleto>
                Cancelar
              </EnlaceBoton>
            )}
          </div>
        </Tarjeta>
      </form>
    </Pagina>
  );
}

/** Busca un cliente por nombre o documento y lo deja elegido. */
function BuscarCliente({
  umbralUsd,
  elegido,
  alElegir,
  error,
  exigido,
}: {
  umbralUsd: string;
  elegido: ClienteElegido | null;
  alElegir: (cliente: ClienteElegido | null) => void;
  error: string | null;
  exigido: boolean;
}) {
  const [texto, setTexto] = useState("");
  const resultados = useClientes(texto);

  if (elegido) {
    return (
      <div className={css.grupo}>
        <span className={css.etiquetaGrupo}>Cliente</span>
        <div className={css.clienteElegido}>
          <div>
            <p>{elegido.nombre}</p>
            {elegido.detalle && <p className={css.notaGrupo}>{elegido.detalle}</p>}
          </div>
          <button type="button" className={css.quitar} onClick={() => alElegir(null)} aria-label={`Quitar a ${elegido.nombre}`}>
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={css.grupo}>
      <Entrada
        etiqueta="Cliente"
        type="search"
        placeholder="Nombre o documento"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        sufijo={<Search size={16} aria-hidden />}
        error={error ?? undefined}
        ayuda={exigido ? "Obligatorio desde este monto (UAF)." : `Opcional. Obligatorio desde US$ ${formatearMonto(umbralUsd, 0)} (UAF).`}
      />
      {texto.trim().length >= MINIMO_BUSQUEDA && (
        <ul className={css.resultados}>
          {resultados.isPending ? (
            <li className={css.sinResultados}>Buscando…</li>
          ) : resultados.isError ? (
            <li className={css.sinResultados}>{mensajeDe(resultados.error)}</li>
          ) : resultados.data.length ? (
            resultados.data.map((c) => {
              const detalle = `${c.numeroDocumento}${c.faltantesUaf.length > 0 ? " · ficha incompleta" : ""}`;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={css.resultado}
                    onClick={() => {
                      alElegir({ id: c.id, nombre: c.nombre, detalle });
                      setTexto("");
                    }}
                  >
                    <span>{c.nombre}</span>
                    <span className={css.notaGrupo}>{detalle}</span>
                  </button>
                </li>
              );
            })
          ) : (
            <li className={css.sinResultados}>
              Sin resultados. <Link to="/clientes/nuevo">Crear cliente</Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
