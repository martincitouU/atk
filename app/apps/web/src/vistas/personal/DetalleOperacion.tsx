// Detalle de una operación (GET /api/operaciones/:id) y lo que se puede
// hacer con ella según su estado y el rol:
//
//   BORRADOR    confirmar, editar o eliminar (quien la registró);
//               autorizar la tasa preferencial (supervisor o admin)
//   CONFIRMADA  reversar con motivo (supervisor o admin)
//   REVERSADA   nada: se muestra el motivo
//
// Confirmar mueve la caja y no se deshace (solo se reversa): por eso pide
// confirmación y muestra los montos. Si la pizarra cambió desde el borrador,
// la API no confirma; se recalcula y el cajero revisa los montos nuevos con
// el cliente antes de confirmar.

import { ArrowDown } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { useAutorizarTasa, useConfirmarOperacion, useEditarBorrador, useEliminarBorrador, useReversarOperacion } from "../../api/acciones.ts";
import { ErrorApi, esNoExiste, mensajeDe } from "../../api/cliente.ts";
import { useCatalogo, useDecimalesTasa, useMonedaBase, useNombres, useOperacion } from "../../api/consultas.ts";
import type { OperacionListada } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton, EnlaceBoton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { PastillaDivisa } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, ErrorDeCarga } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Monto, Tasa } from "../../componentes/Monto.tsx";
import { Columnas, Datos, Pagina } from "../../componentes/Pagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { ESTADO_OPERACION, MEDIO_PAGO, TIPO_DTE, TIPO_OPERACION } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import { NoEncontrada } from "../NoEncontrada.tsx";
import css from "./DetalleOperacion.module.css";

export function DetalleOperacion() {
  const id = Number(useParams().id);
  const consulta = useOperacion(id);
  const nombre = useNombres();
  // Lo que acaba de pasar (confirmada, reversada...): las acciones cambian con el estado
  const [listo, setListo] = useState<string | null>(null);

  if (!Number.isInteger(id) || id <= 0 || esNoExiste(consulta.error)) return <NoEncontrada />;
  if (consulta.isError) return <ErrorDeCarga error={consulta.error} alReintentar={() => void consulta.refetch()} />;
  if (consulta.isPending) return <Cargando texto="Cargando la operación…" />;
  const op = consulta.data;

  const estado = ESTADO_OPERACION[op.estado];
  return (
    <Pagina>
      <EncabezadoPagina
        titulo={`${TIPO_OPERACION[op.tipo]} N° ${op.id}`}
        descripcion={
          <span className={css.subtitulo}>
            <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>
            {formatearFechaHora(op.realizadaEn)}
            {op.registroDiferido && " · registro diferido"}
          </span>
        }
        volver={{ a: "/operaciones", texto: "Operaciones" }}
      />

      {listo && <Aviso tono="exito">{listo}</Aviso>}

      {op.estado === "REVERSADA" && (
        <Aviso tono="error" titulo={`Reversada por ${nombre(op.reversadaPor)}${op.reversadaEn ? ` el ${formatearFechaHora(op.reversadaEn)}` : ""}`}>
          Motivo: {op.motivoReverso}
        </Aviso>
      )}

      <Columnas lateral={<Acciones op={op} alTerminar={setListo} />}>
        <Resumen op={op} />
        <Tarjeta titulo="Detalle">
          <DatosOperacion op={op} />
        </Tarjeta>
      </Columnas>
    </Pagina>
  );
}

/** Lo que entregó y recibió el cliente, como en el widget de operar. */
function Resumen({ op }: { op: OperacionListada }) {
  const monedaBase = useMonedaBase();
  const divisa = { etiqueta: op.tipo === "VENTA" ? "El cliente recibió" : "El cliente entregó", monto: op.montoDivisa, moneda: op.monedaCodigo };
  const pesos = { etiqueta: op.tipo === "VENTA" ? "El cliente pagó" : "El cliente recibió", monto: op.montoBase, moneda: monedaBase };
  return (
    <Tarjeta elevada>
      <div className={css.resumen}>
        {[divisa, pesos].map((lado, i) => (
          <div key={lado.etiqueta + i} className={css.lado}>
            <span className={css.etiquetaLado}>{lado.etiqueta}</span>
            <div className={css.filaLado}>
              <span className={css.montoLado}>
                <Monto valor={lado.monto} moneda={lado.moneda} sinSimbolo />
              </span>
              <PastillaDivisa codigo={lado.moneda} />
            </div>
          </div>
        ))}
        <span className={css.flecha} aria-hidden>
          <ArrowDown size={16} />
        </span>
      </div>
    </Tarjeta>
  );
}

function DatosOperacion({ op }: { op: OperacionListada }) {
  const catalogo = useCatalogo();
  const nombre = useNombres();
  const monedaBase = useMonedaBase();
  const decimalesTasa = useDecimalesTasa()(op.monedaCodigo);
  const caja = catalogo.data?.cajas.find((c) => c.id === op.cajaId);

  return (
    <Datos
      filas={[
        {
          etiqueta: "Tasa aplicada",
          valor: (
            <>
              <Tasa valorE6={op.tasaAplicadaE6} decimales={decimalesTasa} />
              {op.esPreferencial && " (preferencial)"}
            </>
          ),
        },
        { etiqueta: "Tasa de referencia", valor: <Tasa valorE6={op.tasaReferenciaE6} decimales={decimalesTasa} /> },
        { etiqueta: "Margen bruto", valor: op.margenBruto ? <Monto valor={op.margenBruto} moneda={monedaBase} /> : "—" },
        { etiqueta: "Equivalente en USD", valor: op.equivalenteUsd ? <Monto valor={op.equivalenteUsd} moneda="USD" /> : "—" },
        { etiqueta: "Pago de los pesos", valor: MEDIO_PAGO[op.medioPago] },
        { etiqueta: "Documento", valor: op.tipoDte ? `${TIPO_DTE[op.tipoDte]} N° ${op.folioDte}` : "Sin documento" },
        {
          etiqueta: "Cliente",
          valor: op.clienteId ? <Link to={`/clientes/${op.clienteId}`}>{op.clienteNombre ?? `Cliente ${op.clienteId}`}</Link> : "Sin identificar",
        },
        { etiqueta: "Propósito", valor: op.proposito ?? "—" },
        { etiqueta: "Caja", valor: caja?.nombre ?? `Caja ${op.cajaId}` },
        { etiqueta: "Registró", valor: `${nombre(op.usuarioId)}, ${formatearFechaHora(op.registradaEn)}` },
        { etiqueta: "Confirmó", valor: op.confirmadaEn ? `${nombre(op.confirmadaPor)}, ${formatearFechaHora(op.confirmadaEn)}` : "—" },
        { etiqueta: "Observación", valor: op.observacion ?? "—" },
      ]}
    />
  );
}

/** Acciones según el estado y el rol. Una sola acción magenta: la que sigue. */
function Acciones({ op, alTerminar }: { op: OperacionListada; alTerminar: (mensaje: string) => void }) {
  const { usuario } = usePersonal();
  const esSupervisor = usuario.rol !== "CAJERO";
  if (op.estado === "REVERSADA") return null;
  if (op.estado === "BORRADOR") return <AccionesBorrador op={op} esPropia={op.usuarioId === usuario.id} esSupervisor={esSupervisor} alTerminar={alTerminar} />;
  return <AccionesConfirmada op={op} esSupervisor={esSupervisor} alTerminar={alTerminar} />;
}

function AccionesBorrador({
  op,
  esPropia,
  esSupervisor,
  alTerminar,
}: {
  op: OperacionListada;
  esPropia: boolean;
  esSupervisor: boolean;
  alTerminar: (mensaje: string) => void;
}) {
  const nombre = useNombres();
  const navegar = useNavigate();
  const autorizar = useAutorizarTasa(op.id);
  const eliminar = useEliminarBorrador(op.id);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const faltaAutorizar = op.esPreferencial && op.autorizadoPor === null;

  return (
    <Tarjeta titulo="Borrador" descripcion="Al confirmar se recalcula con la pizarra vigente: si cambió desde el borrador, no se confirma y hay que revisarlo.">
      {autorizar.isError && <Aviso tono="error">{mensajeDe(autorizar.error)}</Aviso>}
      <div className={css.botones}>
        {faltaAutorizar &&
          (esSupervisor ? (
            <Boton
              variante="suave"
              cargando={autorizar.isPending}
              onClick={() => autorizar.mutate(undefined, { onSuccess: () => alTerminar("Tasa preferencial autorizada: ya se puede confirmar.") })}
            >
              Autorizar tasa preferencial
            </Boton>
          ) : (
            <p className={css.nota}>La tasa preferencial necesita la autorización de un supervisor antes de confirmar.</p>
          ))}
        {esPropia ? (
          <>
            <Boton variante="primario" disabled={faltaAutorizar} onClick={() => setConfirmando(true)}>
              Confirmar operación
            </Boton>
            <EnlaceBoton to={`/operaciones/${op.id}/editar`}>Editar</EnlaceBoton>
            <Boton variante="texto" onClick={() => setEliminando(true)}>
              Eliminar borrador
            </Boton>
          </>
        ) : (
          <p className={css.nota}>Solo quien registró el borrador ({nombre(op.usuarioId)}) puede confirmarlo, editarlo o eliminarlo.</p>
        )}
      </div>

      <DialogoConfirmar
        op={op}
        abierto={confirmando}
        alCerrar={() => setConfirmando(false)}
        alConfirmar={() => alTerminar("Operación confirmada: la caja ya se movió.")}
      />

      <Dialogo
        abierto={eliminando}
        alCerrar={() => setEliminando(false)}
        titulo="¿Eliminar este borrador?"
        descripcion="Un borrador no movió la caja: se puede eliminar sin dejar rastro en ella."
        acciones={
          <>
            <Boton onClick={() => setEliminando(false)}>Cancelar</Boton>
            <Boton variante="primario" cargando={eliminar.isPending} onClick={() => eliminar.mutate(undefined, { onSuccess: () => navegar("/operaciones") })}>
              Eliminar
            </Boton>
          </>
        }
      >
        {eliminar.isError && <Aviso tono="error">{mensajeDe(eliminar.error)}</Aviso>}
      </Dialogo>
    </Tarjeta>
  );
}

/**
 * Confirmar: muestra lo que se va a cobrar o pagar y, si falta, pide el
 * folio de la boleta (en la práctica se emite al final).
 *
 * Guardar el folio recalcula el borrador: si con eso cambian los montos (la
 * pizarra cambió), no se confirma y se muestran los nuevos para revisarlos.
 */
function DialogoConfirmar({ op, abierto, alCerrar, alConfirmar }: { op: OperacionListada; abierto: boolean; alCerrar: () => void; alConfirmar: () => void }) {
  const editar = useEditarBorrador(op.id);
  const confirmar = useConfirmarOperacion(op.id);
  const monedaBase = useMonedaBase();
  const decimalesTasa = useDecimalesTasa()(op.monedaCodigo);
  const [error, setError] = useState<ErrorApi | Error | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const faltaFolio = op.folioDte === null;
  const {
    register,
    handleSubmit,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<{ tipoDte: string; folio: string }>({ defaultValues: { tipoDte: "41", folio: "" } });

  const cerrar = () => {
    setError(null);
    setAviso(null);
    alCerrar();
  };

  const alEnviar = handleSubmit(async ({ tipoDte, folio }) => {
    setError(null);
    setAviso(null);
    try {
      if (faltaFolio) {
        const conFolio = await editar.mutateAsync({ tipoDte: Number(tipoDte) as 34 | 41, folioDte: Number(folio) });
        if (conFolio.montoBase !== op.montoBase || conFolio.tasaAplicadaE6 !== op.tasaAplicadaE6) {
          setAviso("La pizarra cambió desde el borrador: el folio quedó guardado y los montos se recalcularon. Revísalos con el cliente y confirma de nuevo.");
          return;
        }
      }
      await confirmar.mutateAsync();
      alConfirmar();
      cerrar();
    } catch (e) {
      if (e instanceof ErrorApi && ["FOLIO_DUPLICADO", "DTE_INVALIDO", "DTE_INCOMPLETO"].includes(e.codigo)) marcar("folio", { message: e.message });
      else setError(e instanceof Error ? e : new Error(mensajeDe(e)));
    }
  });

  const recalcular = async () => {
    setError(null);
    try {
      await editar.mutateAsync({});
      setAviso("Montos recalculados con la pizarra vigente. Revísalos con el cliente antes de confirmar.");
    } catch (e) {
      setError(e instanceof Error ? e : new Error(mensajeDe(e)));
    }
  };

  const codigo = error instanceof ErrorApi ? error.codigo : null;
  return (
    <Dialogo
      abierto={abierto}
      alCerrar={cerrar}
      titulo={`Confirmar la operación N° ${op.id}`}
      descripcion="Mueve la caja y no se deshace: si hay un error, un supervisor la reversa."
      acciones={
        <>
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" form={`confirmar-${op.id}`} variante="primario" cargando={isSubmitting}>
            Confirmar
          </Boton>
        </>
      }
    >
      <form id={`confirmar-${op.id}`} className={css.formularioDialogo} onSubmit={alEnviar} noValidate>
        <p>
          {op.tipo === "VENTA" ? "El cliente recibe" : "El cliente entrega"} <Monto valor={op.montoDivisa} moneda={op.monedaCodigo} />{" "}
          {op.tipo === "VENTA" ? "y paga" : "y recibe"}{" "}
          <strong>
            <Monto valor={op.montoBase} moneda={monedaBase} />
          </strong>
          , a <Tasa valorE6={op.tasaAplicadaE6} decimales={decimalesTasa} /> por {op.monedaCodigo}.
        </p>
        {aviso && <Aviso tono="atencion">{aviso}</Aviso>}
        {error && (
          <Aviso
            tono="error"
            acciones={
              codigo === "PIZARRA_CAMBIO" ? (
                <Boton tamano="chico" cargando={editar.isPending} onClick={() => void recalcular()}>
                  Recalcular
                </Boton>
              ) : (codigo === "FICHA_INCOMPLETA" || codigo === "FALTA_PROPOSITO") && op.clienteId ? (
                <Link to={codigo === "FICHA_INCOMPLETA" ? `/clientes/${op.clienteId}` : `/operaciones/${op.id}/editar`}>
                  {codigo === "FICHA_INCOMPLETA" ? "Ver la ficha" : "Editar"}
                </Link>
              ) : undefined
            }
          >
            {error.message}
          </Aviso>
        )}
        {faltaFolio && (
          <FilaCampos>
            <Seleccion etiqueta="Documento" {...register("tipoDte")}>
              {Object.entries(TIPO_DTE).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto} ({valor})
                </option>
              ))}
            </Seleccion>
            <Entrada
              etiqueta="Folio"
              inputMode="numeric"
              autoComplete="off"
              error={errors.folio?.message}
              {...register("folio", {
                validate: (f) =>
                  f.trim() === "" ? "Escribe el folio de la boleta o factura" : /^[1-9]\d{0,9}$/.test(f.trim()) || "El folio es un número entero",
              })}
            />
          </FilaCampos>
        )}
      </form>
    </Dialogo>
  );
}

function AccionesConfirmada({ op, esSupervisor, alTerminar }: { op: OperacionListada; esSupervisor: boolean; alTerminar: (mensaje: string) => void }) {
  const [reversando, setReversando] = useState(false);
  if (!esSupervisor) {
    return (
      <Tarjeta titulo="Confirmada">
        <p className={css.nota}>Una operación confirmada no se modifica. Si hay un error, un supervisor puede reversarla.</p>
      </Tarjeta>
    );
  }
  return (
    <Tarjeta titulo="Confirmada" descripcion="No se modifica. Si hubo un error, se reversa: la caja recibe los movimientos inversos.">
      <Boton onClick={() => setReversando(true)}>Reversar operación</Boton>
      <DialogoReversar
        op={op}
        abierto={reversando}
        alCerrar={() => setReversando(false)}
        alReversar={() => alTerminar("Operación reversada: la caja recibió los movimientos inversos.")}
      />
    </Tarjeta>
  );
}

function DialogoReversar({ op, abierto, alCerrar, alReversar }: { op: OperacionListada; abierto: boolean; alCerrar: () => void; alReversar: () => void }) {
  const reversar = useReversarOperacion(op.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ motivo: string }>({ defaultValues: { motivo: "" } });

  const cerrar = () => {
    reset();
    reversar.reset();
    alCerrar();
  };

  const alEnviar = handleSubmit(async ({ motivo }) => {
    try {
      await reversar.mutateAsync({ motivo: motivo.trim() });
      alReversar();
      cerrar();
    } catch {
      // el mensaje queda en reversar.error
    }
  });

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={cerrar}
      titulo={`Reversar la operación N° ${op.id}`}
      descripcion="Queda registrado quién la reversó, cuándo y por qué. Solo se puede con el turno de la operación abierto."
      acciones={
        <>
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" form={`reversar-${op.id}`} variante="primario" cargando={isSubmitting}>
            Reversar
          </Boton>
        </>
      }
    >
      <form id={`reversar-${op.id}`} className={css.formularioDialogo} onSubmit={alEnviar} noValidate>
        {reversar.isError && <Aviso tono="error">{mensajeDe(reversar.error)}</Aviso>}
        <AreaTexto
          etiqueta="Motivo"
          placeholder="Por ejemplo: el cliente se arrepintió antes de retirarse"
          error={errors.motivo?.message}
          {...register("motivo", { validate: (m) => m.trim() !== "" || "Escribe el motivo del reverso" })}
        />
      </form>
    </Dialogo>
  );
}
