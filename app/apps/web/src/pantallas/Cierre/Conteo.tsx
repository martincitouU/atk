import { aBigint, type Moneda, type Operacion, type Turno } from "../../api/esquemas.ts";
import { formatearMonto } from "@atk/shared/dinero";
import { ArrowRightIcon, CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent as TeclaReact, type Ref } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { ErrorNegocio } from "../../api/cliente.ts";
import { useCatalogo, useCerrarTurno, useEliminarBorrador, useLibroDelDia, useSaldos } from "../../api/consultas.ts";
import type { Cierre as RespuestaCierre } from "../../api/esquemas.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Divisa } from "../../componentes/Divisa.tsx";
import { Kbd } from "../../componentes/Kbd.tsx";
import { Sep } from "../../componentes/Sep.tsx";
import { conSimbolo, hora, montoDivisa, TIPO } from "../../comun.ts";
import { billete, conteoVacio, leerConteo, subtotal, type Conteo, type Lectura } from "./conteo.ts";

export type MonedaCatalogo = Pick<Moneda, "codigo" | "nombre" | "simbolo" | "decimales">;

/** «ARS, EUR y CLP». */
function enumerar(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

// ---------------------------------------------------------------------------
// El conteo en curso sobrevive a cambiar de sección (F1 y volver): se guarda
// en sessionStorage por turno y se borra al cerrar.

const ConteosGuardados = z.record(
  z.string(),
  z.object({
    modo: z.enum(["billetes", "total"]),
    cantidades: z.record(z.string(), z.string()),
    sueltos: z.string(),
    total: z.string(),
  }),
);

const claveConteo = (turnoId: number) => `atk.cierre.conteo.${turnoId}`;

function useConteos(turnoId: number) {
  const clave = claveConteo(turnoId);
  const [conteos, setConteos] = useState<Record<string, Conteo>>(() => {
    try {
      const guardado = ConteosGuardados.safeParse(JSON.parse(sessionStorage.getItem(clave) ?? "{}"));
      return guardado.success ? guardado.data : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(clave, JSON.stringify(conteos));
    } catch {
      // sin almacenamiento (modo privado): el conteo vive solo en pantalla
    }
  }, [clave, conteos]);
  return [conteos, setConteos] as const;
}

// ---------------------------------------------------------------------------

export type ConteoApi = {
  /** «Cerrar turno» de la cinta: cierra si todo está listo; si no, lleva a la barra que dice qué falta. */
  cerrar: () => void;
  /** «Contar billetes»: el foco en el primer campo de la moneda elegida. */
  contar: () => void;
  /** «Elegir divisa»: el foco en la grilla del conteo, para moverse con ↑/↓. */
  elegir: () => void;
};

/**
 * Con turno: los borradores que bloquean el cierre, la grilla del conteo por
 * moneda (las divisas y los pesos), el conteo por billete de la moneda
 * elegida y la barra que cierra el turno (vuelta 3: como una planilla con su
 * panel de detalle).
 */
export function ConteoTurno({
  turno,
  zona,
  onCerrado,
  ref,
}: {
  turno: Turno;
  zona: string;
  onCerrado: (cierre: RespuestaCierre) => void;
  ref?: Ref<ConteoApi>;
}) {
  const { data: catalogo } = useCatalogo();
  const saldos = useSaldos(turno.cajaId);
  const libro = useLibroDelDia();
  const cerrar = useCerrarTurno();
  const [conteos, setConteos] = useConteos(turno.id);
  const [fallo, setFallo] = useState<string | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [enfocar, setEnfocar] = useState(0);
  const idEstado = useId();
  const idGrilla = useId();
  const contar = useRef<HTMLDivElement>(null);
  const grilla = useRef<HTMLTableElement>(null);
  const barra = useRef<HTMLParagraphElement>(null);
  const cerrarRef = useRef<() => void>(() => undefined);

  // Al elegir otra moneda desde el teclado o la cinta, el foco va a su primer campo
  useEffect(() => {
    if (enfocar === 0) return;
    const campo = contar.current?.querySelector<HTMLInputElement>("input");
    campo?.focus();
    campo?.select();
  }, [enfocar]);

  useImperativeHandle(
    ref,
    () => ({
      cerrar: () => cerrarRef.current(),
      contar: () => setEnfocar((n) => n + 1),
      elegir: () => grilla.current?.focus(),
    }),
    [],
  );

  if (!catalogo) {
    return (
      <div className="arqueos" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="arqueo esperando">
            <span className="esqueleto" style={{ width: "50%" }} />
            <span className="esqueleto" />
            <span className="esqueleto" />
          </div>
        ))}
      </div>
    );
  }

  const monedas: MonedaCatalogo[] = [...catalogo.divisas, catalogo.monedaBase];
  const denominaciones = (codigo: string) => (catalogo.denominaciones[codigo] ?? []).map(aBigint);
  const teoricos = new Map((saldos.data ?? []).map((s) => [s.monedaCodigo, aBigint(s.saldo)]));
  const lecturas = monedas.map((m) => ({
    moneda: m,
    lectura: leerConteo(conteos[m.codigo] ?? conteoVacio(), denominaciones(m.codigo), m.decimales),
  }));
  const sinContar = lecturas.filter((l) => l.lectura.estado === "sin-contar").map((l) => l.moneda.codigo);
  const invalidas = lecturas.filter((l) => l.lectura.estado === "invalido").map((l) => l.moneda.codigo);
  const borradores = (libro.data ?? []).filter((o) => o.estado === "BORRADOR");
  const listo = sinContar.length === 0 && invalidas.length === 0 && borradores.length === 0;

  const descuadres = saldos.data
    ? lecturas.filter((l) => l.lectura.estado === "contado" && l.lectura.monto !== (teoricos.get(l.moneda.codigo) ?? 0n)).length
    : null;
  const contadas = lecturas.filter((l) => l.lectura.estado === "contado").length;
  const codigoElegido = monedas.some((m) => m.codigo === elegida) ? (elegida as string) : (monedas[0]?.codigo ?? "");
  const actual = lecturas.find((l) => l.moneda.codigo === codigoElegido);

  let estado: string;
  if (borradores.length > 0) estado = `Antes de cerrar: ${plural(borradores.length, "borrador pendiente", "borradores pendientes")} (arriba).`;
  else if (invalidas.length > 0) estado = `Revise el conteo de ${enumerar(invalidas)}: hay un monto que no se entiende.`;
  else if (sinContar.length > 0) estado = `Falta contar ${enumerar(sinContar)}.`;
  else if (descuadres === null || descuadres === 0) estado = "Todo contado. Al cerrar, el arqueo queda guardado tal cual.";
  else estado = `Todo contado, con diferencia en ${plural(descuadres, "moneda", "monedas")}. Al cerrar, el arqueo queda guardado tal cual.`;

  function cambiar(codigo: string, conteo: Conteo) {
    setFallo(null);
    setConteos((antes) => ({ ...antes, [codigo]: conteo }));
  }

  async function cerrarTurno() {
    if (!listo || cerrar.isPending) return;
    const conteo: Record<string, string> = {};
    for (const { moneda, lectura } of lecturas) {
      if (lectura.estado === "contado") conteo[moneda.codigo] = lectura.monto.toString();
    }
    setFallo(null);
    try {
      const respuesta = await cerrar.mutateAsync({ turnoId: turno.id, conteo });
      try {
        sessionStorage.removeItem(claveConteo(turno.id));
      } catch {
        // nada que borrar
      }
      onCerrado(respuesta);
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo cerrar el turno. Inténtelo de nuevo.");
    }
  }

  // «Cerrar turno» desde la cinta: lo mismo que el botón, o la barra que dice qué falta
  cerrarRef.current = () => {
    if (listo) void cerrarTurno();
    else barra.current?.focus();
  };

  // Enter en un campo del conteo pasa al siguiente; en el último, a la moneda que sigue:
  // se cuenta fila por fila sin soltar el teclado.
  function alPulsar(e: TeclaReact<HTMLDivElement>) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const campos = [...e.currentTarget.querySelectorAll<HTMLInputElement>("input")];
    const siguiente = campos[campos.indexOf(e.target) + 1];
    if (siguiente) {
      siguiente.focus();
      siguiente.select();
      return;
    }
    const proxima = monedas[monedas.findIndex((m) => m.codigo === codigoElegido) + 1];
    if (proxima) {
      setElegida(proxima.codigo);
      setEnfocar((n) => n + 1);
    }
  }

  // ↑/↓ en la grilla: la moneda elegida; Enter, a contar sus billetes
  function alPulsarGrilla(e: TeclaReact<HTMLTableElement>) {
    const i = monedas.findIndex((m) => m.codigo === codigoElegido);
    let siguiente: MonedaCatalogo | undefined;
    if (e.key === "ArrowDown") siguiente = monedas[Math.min(monedas.length - 1, i + 1)];
    else if (e.key === "ArrowUp") siguiente = monedas[Math.max(0, i - 1)];
    else if (e.key === "Enter") {
      e.preventDefault();
      setEnfocar((n) => n + 1);
      return;
    } else return;
    e.preventDefault();
    if (siguiente) setElegida(siguiente.codigo);
  }

  return (
    <>
      <Borradores ops={borradores} monedas={monedas} zona={zona} />

      <div className="conteo-mesa">
        <section className="panel conteo-resumen" aria-labelledby="conteo-titulo">
          <header>
            <h2 id="conteo-titulo">Conteo por divisa</h2>
            <span className="hint">
              {contadas} de {monedas.length} contadas
              {descuadres !== null && descuadres > 0 && (
                <>
                  <Sep />
                  {plural(descuadres, "no cuadra", "no cuadran")}
                </>
              )}
              <span className="solo-teclado">
                <Sep />
                <Kbd>↑↓</Kbd> elige
                <Sep />
                <Kbd>Enter</Kbd> cuenta
              </span>
            </span>
          </header>
          {saldos.isError && (
            <Aviso tono="advertencia" rol="status">
              <p>
                Sin el saldo del sistema: {saldos.error instanceof ErrorNegocio ? saldos.error.message : "no se pudo leer."} La diferencia se calcula
                al cerrar.
              </p>
            </Aviso>
          )}
          <table
            ref={grilla}
            role="grid"
            aria-labelledby="conteo-titulo"
            aria-readonly="true"
            tabIndex={0}
            aria-activedescendant={`${idGrilla}-${codigoElegido}`}
            onKeyDown={alPulsarGrilla}
          >
            <thead>
              <tr>
                <th scope="col">Divisa</th>
                <th scope="col" className="r">
                  En sistema
                </th>
                <th scope="col" className="r">
                  Contado
                </th>
                <th scope="col" className="r">
                  Diferencia
                </th>
              </tr>
            </thead>
            <tbody>
              {lecturas.map(({ moneda, lectura }) => {
                const teorico = saldos.isSuccess ? (teoricos.get(moneda.codigo) ?? 0n) : null;
                const contado = lectura.estado === "contado" ? lectura.monto : null;
                return (
                  <tr
                    key={moneda.codigo}
                    id={`${idGrilla}-${moneda.codigo}`}
                    aria-selected={moneda.codigo === codigoElegido}
                    className={contado !== null && teorico !== null && contado !== teorico ? "descuadra" : undefined}
                    onClick={() => setElegida(moneda.codigo)}
                  >
                    <td>
                      <button
                        type="button"
                        className="conteo-elegir"
                        aria-label={`Contar ${moneda.codigo}`}
                        onClick={() => setElegida(moneda.codigo)}
                      >
                        <i aria-hidden="true" style={{ background: `var(--${moneda.codigo.toLowerCase()}, var(--neutro))` }} />
                        <b>{moneda.codigo}</b>
                        <span>{moneda.nombre}</span>
                      </button>
                    </td>
                    <td className="r num">{teorico === null ? "—" : conSimbolo(teorico, moneda)}</td>
                    <td className="r num">
                      {contado !== null ? (
                        conSimbolo(contado, moneda)
                      ) : (
                        <span className="sin">{lectura.estado === "invalido" ? "Revise el monto" : "Sin contar"}</span>
                      )}
                    </td>
                    <td className="r">
                      {contado !== null && teorico !== null ? (
                        <Diferencia diferencia={contado - teorico} moneda={moneda} />
                      ) : (
                        <span className="sin">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="conteo-detalle" ref={contar} onKeyDown={alPulsar}>
          {actual && (
            <BloqueConteo
              key={actual.moneda.codigo}
              moneda={actual.moneda}
              denominaciones={denominaciones(actual.moneda.codigo)}
              conteo={conteos[actual.moneda.codigo] ?? conteoVacio()}
              lectura={actual.lectura}
              teorico={saldos.isSuccess ? (teoricos.get(actual.moneda.codigo) ?? 0n) : null}
              onCambiar={(c) => cambiar(actual.moneda.codigo, c)}
            />
          )}
        </div>

        <div className="cierre-barra">
          <p id={idEstado} ref={barra} tabIndex={-1} className={`cierre-estado${listo ? " listo" : ""}`} role="status">
            {estado}
          </p>
          <button
            type="button"
            className="btn prim"
            disabled={!listo || cerrar.isPending}
            aria-describedby={idEstado}
            onClick={() => void cerrarTurno()}
          >
            {cerrar.isPending ? "Cerrando…" : "Cerrar turno"}
          </button>
          {fallo && (
            <Aviso tono="error" rol="alert" className="cierre-fallo">
              <p>{fallo}</p>
            </Aviso>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Un bloque por moneda: cantidad × billete (o el total de una vez), y lo contado contra el sistema. */
function BloqueConteo({
  moneda,
  denominaciones,
  conteo,
  lectura,
  teorico,
  onCambiar,
}: {
  moneda: MonedaCatalogo;
  denominaciones: bigint[];
  conteo: Conteo;
  lectura: Lectura;
  /** El saldo del sistema en la caja del turno (/api/saldos); null mientras no se sabe. */
  teorico: bigint | null;
  onCambiar: (c: Conteo) => void;
}) {
  const id = useId();
  const contado = lectura.estado === "contado" ? lectura.monto : null;
  const diferencia = contado !== null && teorico !== null ? contado - teorico : null;

  return (
    <section className={`arqueo${lectura.estado === "invalido" ? " invalido" : ""}`} aria-labelledby={`${id}-t`}>
      <header>
        <h3 id={`${id}-t`}>
          <i aria-hidden="true" style={{ background: `var(--${moneda.codigo.toLowerCase()}, var(--neutro))` }} />
          {moneda.codigo} <span>{moneda.nombre}</span>
        </h3>
        <span className="hint">Contar billetes</span>
      </header>

      {conteo.modo === "billetes" ? (
        <div className="arqueo-filas">
          {denominaciones.map((d) => {
            const cantidad = conteo.cantidades[d.toString()] ?? "";
            const parcial = subtotal(cantidad, d);
            const rotulo = `${moneda.simbolo} ${billete(d, moneda.decimales)}`.trim();
            return (
              <div className="billete" key={d.toString()}>
                <input
                  className="num"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  aria-label={`Cantidad de billetes de ${rotulo}`}
                  value={cantidad}
                  onChange={(e) => onCambiar({ ...conteo, cantidades: { ...conteo.cantidades, [d.toString()]: e.target.value.replace(/\D/g, "") } })}
                />
                <span className="por" aria-hidden="true">
                  ×
                </span>
                <span className="den">{rotulo}</span>
                <output className={parcial === null ? "num nada" : "num"}>
                  {parcial === null ? "—" : formatearMonto(parcial, moneda.decimales)}
                </output>
              </div>
            );
          })}
          <label className="sueltos">
            Monedas y sueltos
            <input
              className="num"
              inputMode="decimal"
              autoComplete="off"
              value={conteo.sueltos}
              aria-invalid={lectura.estado === "invalido" && conteo.sueltos.trim() !== "" ? true : undefined}
              onChange={(e) => onCambiar({ ...conteo, sueltos: e.target.value })}
            />
          </label>
          <button type="button" className="enlace modo" onClick={() => onCambiar({ ...conteo, modo: "total" })}>
            Ingresar el total sin contar billetes
          </button>
        </div>
      ) : (
        <div className="arqueo-filas">
          <label className="total">
            Total contado en {moneda.codigo}
            <input
              className="num"
              inputMode="decimal"
              autoComplete="off"
              value={conteo.total}
              aria-invalid={lectura.estado === "invalido" ? true : undefined}
              onChange={(e) => onCambiar({ ...conteo, total: e.target.value })}
            />
          </label>
          <button type="button" className="enlace modo" onClick={() => onCambiar({ ...conteo, modo: "billetes" })}>
            Contar por billete
          </button>
        </div>
      )}

      <dl className="arqueo-totales">
        <dt>Contado</dt>
        <dd className={contado !== null ? "num" : "sin"}>
          {contado !== null ? conSimbolo(contado, moneda) : lectura.estado === "invalido" ? "Revise el monto" : "Sin contar"}
        </dd>
        <dt>En sistema</dt>
        <dd className={teorico !== null ? "num" : "sin"}>{teorico === null ? "—" : conSimbolo(teorico, moneda)}</dd>
        {/* La diferencia es una franja de lado a lado (gris mientras falta contar) que se nombra sola */}
        <dt className="oculto">Diferencia</dt>
        <dd className="franja">
          {diferencia !== null ? (
            <Diferencia diferencia={diferencia} moneda={moneda} />
          ) : (
            <span className="dif pendiente">
              Diferencia <b>—</b>
            </span>
          )}
        </dd>
      </dl>
    </section>
  );
}

/** Verde si cuadra; amarillo de advertencia, con su signo y «Sobra» o «Falta», si no. */
export function Diferencia({ diferencia, moneda }: { diferencia: bigint; moneda: Pick<Moneda, "simbolo" | "decimales"> }) {
  if (diferencia === 0n) {
    return (
      <span className="dif cuadra">
        <CheckCircleIcon size={15} weight="bold" aria-hidden="true" />
        Cuadra
      </span>
    );
  }
  return (
    <span className="dif descuadre">
      <WarningIcon size={15} weight="bold" aria-hidden="true" />
      {diferencia > 0n ? "Sobra" : "Falta"}
      <b className="num">{(diferencia > 0n ? "+" : "") + conSimbolo(diferencia, moneda)}</b>
    </span>
  );
}

// ---------------------------------------------------------------------------

/**
 * Los borradores del día bloquean el cierre (BORRADORES_PENDIENTES): se
 * confirman en la Ventanilla o se eliminan aquí. Queda montado sin borradores
 * para que el aviso de «eliminado» siga a la vista.
 */
function Borradores({ ops, monedas, zona }: { ops: Operacion[]; monedas: MonedaCatalogo[]; zona: string }) {
  const eliminar = useEliminarBorrador();
  const [nota, setNota] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);
  const porCodigo = new Map(monedas.map((m) => [m.codigo, m]));

  async function eliminarBorrador(op: Operacion) {
    setNota(null);
    try {
      await eliminar.mutateAsync(op.id);
      setNota({ tono: "ok", texto: `Eliminado el borrador de las ${hora(op.realizadaEn, zona)}.` });
    } catch (error) {
      setNota({ tono: "error", texto: error instanceof ErrorNegocio ? error.message : "No se pudo eliminar el borrador." });
    }
  }

  if (ops.length === 0) {
    return nota?.tono === "ok" ? (
      <p className="hecho" role="status">
        <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />
        {nota.texto} No quedan borradores.
      </p>
    ) : null;
  }

  return (
    <Aviso tono="advertencia" className="cierre-borradores">
      <p>
        <b>{ops.length === 1 ? "Hay 1 borrador sin confirmar." : `Hay ${ops.length} borradores sin confirmar.`}</b> El turno no se cierra con
        borradores: confírmelos en la Ventanilla o elimínelos.
      </p>
      <ul className="borradores">
        {ops.map((op) => {
          const h = hora(op.realizadaEn, zona);
          return (
            <li key={op.id}>
              <span className="num">{h}</span>
              <span>{TIPO[op.tipo]}</span>
              <Divisa codigo={op.monedaCodigo} />
              <span className="num">{montoDivisa(op.montoDivisa, porCodigo.get(op.monedaCodigo))}</span>
              <span className="est obra">Borrador</span>
              <span className="borrador-acciones">
                <Link to="/ventanilla" className="enlace">
                  Confirmar en la Ventanilla
                  <ArrowRightIcon size={14} weight="bold" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  className="enlace"
                  disabled={eliminar.isPending}
                  aria-label={`Eliminar el borrador de las ${h}`}
                  onClick={() => void eliminarBorrador(op)}
                >
                  Eliminar
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {nota?.tono === "error" && <p role="alert">{nota.texto}</p>}
      {nota?.tono === "ok" && <p role="status">{nota.texto}</p>}
    </Aviso>
  );
}
