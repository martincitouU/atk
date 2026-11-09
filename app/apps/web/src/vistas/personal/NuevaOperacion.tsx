// Nueva operación: el "widget de cambio" de DESIGN.md (Swap Input Card).
//
// Arriba se escribe la divisa; abajo aparecen los pesos que calcula la API
// (POST /api/operaciones/previsualizar). El front no calcula ningún monto.
// Al registrar queda como BORRADOR: se revisa y después se confirma.
//
// Por ahora lee las divisas y la pizarra. En F3 se conecta el cálculo
// (previsualizar) y el registro, con react-hook-form y los esquemas zod
// de @atk/shared (entradaOperacion).

import { ArrowDown, Search, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { mensajeDe } from "../../api/cliente.ts";
import { MINIMO_BUSQUEDA, useCatalogo, useClientes, useMonedaBase, usePizarra } from "../../api/consultas.ts";
import type { MedioPago, TipoOperacion } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { PastillaDivisa, SelectorDivisa } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Tasa } from "../../componentes/Monto.tsx";
import { Pagina } from "../../componentes/Pagina.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearHora } from "../../lib/fechas.ts";
import { formatearConSimbolo, formatearMonto } from "../../lib/montos.ts";
import { MEDIO_PAGO, TIPO_DTE } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import css from "./NuevaOperacion.module.css";

const TIPOS = [
  { valor: "VENTA", texto: "Venta" },
  { valor: "COMPRA", texto: "Compra" },
] as const;

const MEDIOS = (Object.keys(MEDIO_PAGO) as MedioPago[]).map((valor) => ({ valor, texto: MEDIO_PAGO[valor] }));

export function NuevaOperacion() {
  const { turnoAbierto } = usePersonal();
  const catalogo = useCatalogo();
  const pizarra = usePizarra();
  const monedaBase = useMonedaBase();

  const [tipo, setTipo] = useState<TipoOperacion>("VENTA");
  const [elegida, setMoneda] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");

  const divisas = catalogo.data?.divisas ?? [];
  // La primera de la pizarra hasta que se elija otra
  const moneda = elegida ?? divisas[0]?.codigo ?? "";
  const divisa = divisas.find((d) => d.codigo === moneda);
  const fila = pizarra.data?.find((f) => f.monedaCodigo === moneda);
  const umbralUsd = catalogo.data?.parametros.umbralFichaClienteUsd ?? "5000";

  return (
    <Pagina>
      <EncabezadoPagina
        titulo="Nueva operación"
        descripcion="Se registra como borrador. La caja se mueve recién al confirmar."
        volver={{ a: "/operaciones", texto: "Operaciones" }}
      />

      {!turnoAbierto && (
        <Aviso tono="atencion" titulo="Necesitas un turno abierto para operar" acciones={<Link to="/caja">Abrir turno</Link>}>
          Las operaciones quedan registradas en la caja de tu turno.
        </Aviso>
      )}

      <form className={css.operar} onSubmit={(e) => e.preventDefault()}>
        {/* ---- El widget: divisa arriba, pesos abajo ---- */}
        <Tarjeta elevada className={css.widget}>
          <Segmentado etiqueta="Tipo de operación" opciones={TIPOS} valor={tipo} alCambiar={setTipo} anchoCompleto />
          <p className={css.explicacion}>
            {tipo === "VENTA" ? "La casa vende divisa: el cliente la recibe y paga en pesos." : "La casa compra divisa: el cliente la entrega y recibe pesos."}
          </p>

          <div className={css.panelEntrada}>
            <label htmlFor="monto-divisa" className={css.etiquetaPanel}>
              {tipo === "VENTA" ? "El cliente recibe" : "El cliente entrega"}
            </label>
            <div className={css.filaPanel}>
              <input
                id="monto-divisa"
                className={`${css.montoGrande} num`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
              <SelectorDivisa opciones={divisas} valor={moneda} alCambiar={setMoneda} />
            </div>
            {divisa && (
              <p className={css.ayudaPanel}>
                Mínimo {formatearConSimbolo(divisa.montoMinimo, divisa.decimales, divisa.simbolo)} · Escribe los decimales con coma
              </p>
            )}
          </div>

          <div className={css.flecha} aria-hidden>
            <ArrowDown size={18} />
          </div>

          <div className={css.panelSalida}>
            <span className={css.etiquetaPanel}>{tipo === "VENTA" ? "El cliente paga" : "El cliente recibe"}</span>
            <div className={css.filaPanel}>
              {/* Los pesos los calcula la API (previsualizar, en F3) */}
              <output className={`${css.montoGrande} num`} htmlFor="monto-divisa" aria-live="polite">
                —
              </output>
              <PastillaDivisa codigo={monedaBase} />
            </div>
          </div>

          {fila && (
            <dl className={css.detalle}>
              <div>
                <dt>Pizarra</dt>
                <dd>
                  <Tasa valorE6={tipo === "VENTA" ? fila.ventaE6 : fila.compraE6} decimales={fila.decimalesTasa} /> por {moneda}
                </dd>
              </div>
              {fila.vigenteDesde && (
                <div>
                  <dt>Vigente desde</dt>
                  <dd>{fila.vencida ? "vencida: hay que publicar una tasa nueva" : `las ${formatearHora(fila.vigenteDesde)}`}</dd>
                </div>
              )}
            </dl>
          )}
        </Tarjeta>

        {/* ---- Los datos de la operación ---- */}
        <Tarjeta titulo="Datos de la operación">
          <div className={css.campos}>
            <div className={css.grupo}>
              <span className={css.etiquetaGrupo}>Medio de pago de los pesos</span>
              <Segmentado etiqueta="Medio de pago de los pesos" opciones={MEDIOS} valor={medio} alCambiar={setMedio} anchoCompleto />
              <p className={css.notaGrupo}>La divisa siempre es efectivo. Solo el efectivo mueve los pesos de la caja.</p>
            </div>

            <BuscarCliente umbralUsd={umbralUsd} />

            <FilaCampos>
              <Seleccion etiqueta="Documento" defaultValue="41">
                {Object.entries(TIPO_DTE).map(([codigo, nombre]) => (
                  <option key={codigo} value={codigo}>
                    {nombre} ({codigo})
                  </option>
                ))}
              </Seleccion>
              <Entrada etiqueta="Folio" inputMode="numeric" placeholder="1017" ayuda="Se exige para confirmar." />
            </FilaCampos>

            <Entrada etiqueta="Propósito" placeholder="Viaje, ahorro, comercio…" ayuda="Obligatorio cuando se exige ficha." />

            <details className={css.avanzadas}>
              <summary>Opciones avanzadas</summary>
              <div className={css.campos}>
                <Entrada
                  etiqueta="Tasa preferencial"
                  inputMode="decimal"
                  placeholder={fila?.ventaE6 ? "Igual a la pizarra" : ""}
                  ayuda="Si difiere de la pizarra, un supervisor debe autorizarla antes de confirmar."
                />
                <Entrada etiqueta="Hora real (registro diferido)" type="time" ayuda="Si la operación ocurrió antes, durante el mismo día del turno." />
                <AreaTexto etiqueta="Observación" />
              </div>
            </details>

            <Boton type="submit" variante="primario" anchoCompleto disabled={!turnoAbierto}>
              Registrar borrador
            </Boton>
          </div>
        </Tarjeta>
      </form>
    </Pagina>
  );
}

/** Busca un cliente por nombre o documento y lo deja elegido. */
function BuscarCliente({ umbralUsd }: { umbralUsd: string }) {
  const [texto, setTexto] = useState("");
  const [elegido, setElegido] = useState<{ id: number; nombre: string; documento: string } | null>(null);
  const resultados = useClientes(texto);

  if (elegido) {
    return (
      <div className={css.grupo}>
        <span className={css.etiquetaGrupo}>Cliente</span>
        <div className={css.clienteElegido}>
          <div>
            <p>{elegido.nombre}</p>
            <p className={css.notaGrupo}>{elegido.documento}</p>
          </div>
          <button type="button" className={css.quitar} onClick={() => setElegido(null)} aria-label={`Quitar a ${elegido.nombre}`}>
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
        ayuda={`Opcional. Obligatorio desde US$ ${formatearMonto(umbralUsd, 0)} (UAF).`}
      />
      {texto.trim().length >= MINIMO_BUSQUEDA && (
        <ul className={css.resultados}>
          {resultados.isPending ? (
            <li className={css.sinResultados}>Buscando…</li>
          ) : resultados.isError ? (
            <li className={css.sinResultados}>{mensajeDe(resultados.error)}</li>
          ) : resultados.data.length ? (
            resultados.data.map((c) => (
              <li key={c.id}>
                <button type="button" className={css.resultado} onClick={() => setElegido({ id: c.id, nombre: c.nombre, documento: c.numeroDocumento })}>
                  <span>{c.nombre}</span>
                  <span className={css.notaGrupo}>
                    {c.numeroDocumento}
                    {c.faltantesUaf.length > 0 && " · ficha incompleta"}
                  </span>
                </button>
              </li>
            ))
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
