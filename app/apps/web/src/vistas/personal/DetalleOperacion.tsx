// Detalle de una operación (GET /api/operaciones/:id) y lo que se puede
// hacer con ella según su estado y el rol:
//
//   BORRADOR    confirmar, editar o eliminar (quien la registró);
//               autorizar la tasa preferencial (supervisor o admin)
//   CONFIRMADA  reversar con motivo (supervisor o admin)
//   REVERSADA   nada: se muestra el motivo
//
// Los botones abren sus diálogos; las acciones se conectan con la API en F3.

import { ArrowDown } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { esNoExiste } from "../../api/cliente.ts";
import { useCatalogo, useDecimalesTasa, useMonedaBase, useNombres, useOperacion } from "../../api/consultas.ts";
import type { OperacionListada } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { AreaTexto } from "../../componentes/Campo.tsx";
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

      {op.estado === "REVERSADA" && (
        <Aviso tono="error" titulo={`Reversada por ${nombre(op.reversadaPor)}${op.reversadaEn ? ` el ${formatearFechaHora(op.reversadaEn)}` : ""}`}>
          Motivo: {op.motivoReverso}
        </Aviso>
      )}

      <Columnas lateral={<Acciones op={op} />}>
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
function Acciones({ op }: { op: OperacionListada }) {
  const { usuario } = usePersonal();
  const nombre = useNombres();
  const [reversando, setReversando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const esSupervisor = usuario.rol !== "CAJERO";
  const esPropia = op.usuarioId === usuario.id;
  const faltaAutorizar = op.esPreferencial && op.autorizadoPor === null;

  if (op.estado === "REVERSADA") return null;

  if (op.estado === "BORRADOR") {
    return (
      <Tarjeta
        titulo="Borrador"
        descripcion="Al confirmar se recalcula con la pizarra vigente: si cambió desde el borrador, no se confirma y hay que revisarlo."
      >
        <div className={css.botones}>
          {faltaAutorizar && esSupervisor && <Boton variante="suave">Autorizar tasa preferencial</Boton>}
          {esPropia ? (
            <>
              <Boton variante="primario" disabled={faltaAutorizar}>
                Confirmar operación
              </Boton>
              <Boton>Editar</Boton>
              <Boton variante="texto" onClick={() => setEliminando(true)}>
                Eliminar borrador
              </Boton>
            </>
          ) : (
            <p className={css.nota}>Solo quien registró el borrador ({nombre(op.usuarioId)}) puede confirmarlo, editarlo o eliminarlo.</p>
          )}
        </div>
        <Dialogo
          abierto={eliminando}
          alCerrar={() => setEliminando(false)}
          titulo="¿Eliminar este borrador?"
          descripcion="Un borrador no movió la caja: se puede eliminar sin dejar rastro en ella."
          acciones={
            <>
              <Boton onClick={() => setEliminando(false)}>Cancelar</Boton>
              <Boton variante="primario">Eliminar</Boton>
            </>
          }
        />
      </Tarjeta>
    );
  }

  // CONFIRMADA
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
      <Dialogo
        abierto={reversando}
        alCerrar={() => setReversando(false)}
        titulo={`Reversar la operación N° ${op.id}`}
        descripcion="Queda registrado quién la reversó, cuándo y por qué. Solo se puede con el turno de la operación abierto."
        acciones={
          <>
            <Boton onClick={() => setReversando(false)}>Cancelar</Boton>
            <Boton variante="primario">Reversar</Boton>
          </>
        }
      >
        <AreaTexto etiqueta="Motivo" placeholder="Por ejemplo: el cliente se arrepintió antes de retirarse" required />
      </Dialogo>
    </Tarjeta>
  );
}
