import { aBigint, type FilaPizarra, type Operacion } from "../../api/esquemas.ts";
import { formatearMonto } from "@atk/shared/dinero";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent as TeclaReact } from "react";
import { ErrorNegocio } from "../../api/cliente.ts";
import { useCatalogo, useLibroDelDia, useParametros, usePizarra, useReversar, useSaldos, useSesion } from "../../api/consultas.ts";
import { usePuede } from "../../api/permisos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Divisa } from "../../componentes/Divisa.tsx";
import { Kbd } from "../../componentes/Kbd.tsx";
import { Sep } from "../../componentes/Sep.tsx";
import { esCampoDeTexto, hora, montoDivisa, pesos, tasa, TIPO } from "./comun.ts";

const ESTADO = {
  CONFIRMADA: { texto: "Confirmada", clase: "ok" },
  BORRADOR: { texto: "Borrador", clase: "obra" },
  REVERSADA: { texto: "Reversada", clase: "rev" },
} as const;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Totales del pie: compras, ventas y margen de las confirmadas del libro (el Resumen no trae los pesos). */
function totales(ops: Operacion[]) {
  let compras = 0n;
  let ventas = 0n;
  let margen = 0n;
  for (const op of ops) {
    if (op.estado !== "CONFIRMADA") continue;
    if (op.tipo === "COMPRA") compras += aBigint(op.montoBase);
    else ventas += aBigint(op.montoBase);
    margen += op.margenBruto === null ? 0n : aBigint(op.margenBruto);
  }
  return { compras, ventas, margen };
}

export function Libro({ onRetomar }: { onRetomar: (op: Operacion) => void }) {
  const libro = useLibroDelDia();
  const pizarra = usePizarra();
  const { data: sesion } = useSesion();
  const puedeReversar = usePuede()("reversar");
  // La caja en pesos es la de la caja del turno (todos los roles), no la suma de la casa
  const saldos = useSaldos(sesion?.turno?.cajaId);
  const { data: catalogo } = useCatalogo();
  const { data: parametros } = useParametros();
  const zona = parametros?.zonaHoraria;
  const base = catalogo?.monedaBase ?? { codigo: "CLP", decimales: 0 };
  const filas = new Map<string, FilaPizarra>((pizarra.data ?? []).map((f) => [f.monedaCodigo, f]));
  const ops = libro.data ?? [];

  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [reverso, setReverso] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const grilla = useRef<HTMLTableElement>(null);
  const idGrilla = useId();
  const idFila = (id: number) => `${idGrilla}-op-${id}`;

  const elegida = ops.find((o) => o.id === seleccion) ?? null;
  const enReverso = ops.find((o) => o.id === reverso && o.estado === "CONFIRMADA") ?? null;
  const borradores = ops.filter((o) => o.estado === "BORRADOR").length;
  const { compras, ventas, margen } = totales(ops);
  const cajaPesos = saldos.data?.find((s) => s.monedaCodigo === base.codigo);

  function elegir(id: number) {
    setSeleccion(id);
    setNota("");
    document.getElementById(idFila(id))?.scrollIntoView?.({ block: "nearest" });
  }

  /** R: abre el reverso de la fila elegida, si es una confirmada. */
  function pedirReverso() {
    if (!puedeReversar) {
      setNota("Reversar una operación es del supervisor o del administrador.");
      return;
    }
    if (!elegida) {
      setNota("Elija una operación del libro (clic o ↑/↓) y pulse R.");
      return;
    }
    if (elegida.estado !== "CONFIRMADA") {
      setNota(elegida.estado === "BORRADOR" ? "Un borrador no se reversa: se confirma o se deja." : "Esa operación ya está reversada.");
      return;
    }
    setNota("");
    setReverso(elegida.id);
  }

  function cerrarReverso(hecho: Operacion | null) {
    setReverso(null);
    if (hecho) setNota(`Reversada la ${TIPO[hecho.tipo].toLowerCase()} de las ${hora(hecho.realizadaEn, zona)}.`);
    grilla.current?.focus();
  }

  // ↑/↓ con el foco en el libro: la fila elegida (no la divisa del registro).
  function alPulsarGrilla(e: TeclaReact<HTMLTableElement>) {
    if (ops.length === 0) return;
    const i = ops.findIndex((o) => o.id === seleccion);
    let siguiente: Operacion | undefined;
    if (e.key === "ArrowDown") siguiente = ops[Math.min(ops.length - 1, i + 1)];
    else if (e.key === "ArrowUp") siguiente = ops[Math.max(0, i - 1)];
    else if (e.key === "Home") siguiente = ops[0];
    else if (e.key === "End") siguiente = ops.at(-1);
    else if (e.key === "Enter" && elegida?.estado === "BORRADOR") {
      e.preventDefault();
      e.stopPropagation();
      onRetomar(elegida);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
    if (siguiente) elegir(siguiente.id);
  }

  // R en cualquier parte de la Ventanilla (salvo en otro campo de texto que no sea el monto).
  const alPulsar = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== "r") return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el?.closest("dialog, [data-teclado-propio]")) return;
    if (esCampoDeTexto(el) && !el?.matches("[data-monto]")) return;
    e.preventDefault();
    pedirReverso();
  };
  const alPulsarRef = useRef(alPulsar);
  useLayoutEffect(() => {
    alPulsarRef.current = alPulsar;
  });
  useEffect(() => {
    const oyente = (e: KeyboardEvent) => alPulsarRef.current(e);
    window.addEventListener("keydown", oyente);
    return () => window.removeEventListener("keydown", oyente);
  }, []);

  return (
    <section className="panel libro" aria-labelledby="libro-titulo">
      <header>
        <h2 id="libro-titulo">Libro del día</h2>
        <span className="hint">
          {libro.isSuccess && (
            <>
              {plural(ops.length, "operación", "operaciones")}
              {borradores > 0 && (
                <>
                  <Sep />
                  {plural(borradores, "borrador", "borradores")}
                </>
              )}
              {puedeReversar && <Sep />}
            </>
          )}
          {puedeReversar && (
            <>
              <Kbd>R</Kbd> reversar la seleccionada
            </>
          )}
        </span>
      </header>

      <p className="nota-libro" role="status">
        {nota}
      </p>

      {enReverso && <PanelReverso op={enReverso} fila={filas.get(enReverso.monedaCodigo)} zona={zona} onCerrar={cerrarReverso} />}

      <div className="libro-tabla">
        <table
          ref={grilla}
          role="grid"
          aria-labelledby="libro-titulo"
          aria-readonly="true"
          tabIndex={0}
          aria-activedescendant={elegida ? idFila(elegida.id) : undefined}
          onKeyDown={alPulsarGrilla}
          onFocus={(e) => {
            if (e.target === e.currentTarget && seleccion === null && ops[0]) setSeleccion(ops[0].id);
          }}
        >
          <thead>
            <tr>
              <th scope="col" className="col-hora">
                Hora
              </th>
              <th scope="col" className="col-tipo">
                Tipo
              </th>
              <th scope="col">Divisa</th>
              <th scope="col" className="r">
                Monto
              </th>
              <th scope="col" className="r col-tasa">
                Tasa
              </th>
              <th scope="col" className="r">
                Pesos
              </th>
              <th scope="col" className="col-folio">
                Folio
              </th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {libro.isPending &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
                    <td key={j} className={["col-hora", "col-tipo", "", "", "col-tasa", "", "col-folio", ""][j] || undefined}>
                      <span className="esqueleto" />
                    </td>
                  ))}
                </tr>
              ))}
            {libro.isError && (
              <tr>
                <td colSpan={8}>
                  <Aviso tono="error" rol="alert">
                    <p>{libro.error instanceof ErrorNegocio ? libro.error.message : "No se pudo leer el libro."}</p>
                    <p>
                      <button type="button" className="enlace" onClick={() => void libro.refetch()}>
                        Reintentar
                      </button>
                    </p>
                  </Aviso>
                </td>
              </tr>
            )}
            {libro.isSuccess && ops.length === 0 && (
              <tr>
                <td colSpan={8} className="vacio">
                  Todavía no hay operaciones hoy. Registre la primera con <Kbd>C</Kbd> o <Kbd>V</Kbd>, la divisa y el monto.
                </td>
              </tr>
            )}
            {ops.map((op) => {
              const f = filas.get(op.monedaCodigo);
              const estado = ESTADO[op.estado];
              const h = hora(op.realizadaEn, zona);
              const alClic = () => {
                elegir(op.id);
                grilla.current?.focus({ preventScroll: true });
              };
              const clases = [op.estado === "REVERSADA" ? "reversada" : op.estado === "BORRADOR" ? "borrador" : "", op.motivoReverso ? "con-motivo" : ""];
              return (
                <Fragment key={op.id}>
                  <tr
                    id={idFila(op.id)}
                    aria-selected={op.id === seleccion}
                    className={clases.filter(Boolean).join(" ") || undefined}
                    onClick={alClic}
                  >
                    <td className="num col-hora">{h}</td>
                    <td className="col-tipo">{TIPO[op.tipo]}</td>
                    <td>
                      <Divisa codigo={op.monedaCodigo} />
                      {/* En el teléfono, la hora y el tipo van bajo la divisa (sus columnas se ocultan) */}
                      <span className="solo-movil">
                        {TIPO[op.tipo]}
                        <Sep />
                        {h}
                      </span>
                    </td>
                    <td className="r num m">{formatearMonto(aBigint(op.montoDivisa), f?.decimales ?? 2)}</td>
                    <td className="r num col-tasa">{tasa(op.tasaAplicadaE6, f?.decimalesTasa ?? 2)}</td>
                    <td className="r num">
                      <span className="m">{formatearMonto(aBigint(op.montoBase), base.decimales)}</span>
                      {op.motivoReverso && (
                        <span className="motivo" title={op.motivoReverso}>
                          {op.motivoReverso}
                        </span>
                      )}
                    </td>
                    <td className="num col-folio">{op.folioDte ?? "—"}</td>
                    <td>
                      <span className={`est ${estado.clase}`}>{estado.texto}</span>
                      {op.estado === "BORRADOR" && (
                        <button
                          type="button"
                          className="enlace retomar"
                          aria-label={`Confirmar el borrador de las ${h}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetomar(op);
                          }}
                        >
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* En el teléfono, el motivo del reverso baja a su propia línea bajo la fila, entero.
                      Es solo la vista: el lector de pantalla lo lee en la fila, en la celda de los pesos. */}
                  {op.motivoReverso && (
                    <tr className="fila-motivo" aria-hidden="true" onClick={alClic}>
                      <td colSpan={8}>{op.motivoReverso}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl className="pie">
        <div>
          <dt>Compras</dt>
          <dd className="num">{libro.isSuccess ? pesos(compras, base.decimales) : "—"}</dd>
        </div>
        <div>
          <dt>Ventas</dt>
          <dd className="num">{libro.isSuccess ? pesos(ventas, base.decimales) : "—"}</dd>
        </div>
        <div>
          <dt>Margen del día</dt>
          <dd className="num">{libro.isSuccess ? pesos(margen, base.decimales) : "—"}</dd>
        </div>
        <div>
          <dt>Caja en pesos</dt>
          <dd className="num">{cajaPesos ? pesos(aBigint(cajaPesos.saldo), cajaPesos.decimales) : "—"}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * El reverso, en un panel aparte dentro del libro (no un modal): la fila sigue
 * a la vista y lo demás sigue usable. Sin motivo no se reversa.
 */
function PanelReverso({
  op,
  fila,
  zona,
  onCerrar,
}: {
  op: Operacion;
  fila: FilaPizarra | undefined;
  zona: string | undefined;
  onCerrar: (hecho: Operacion | null) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const reversar = useReversar();
  const texto = useRef<HTMLTextAreaElement>(null);
  const titulo = useId();

  useEffect(() => texto.current?.focus(), []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpio = motivo.trim();
    if (!limpio || reversar.isPending) return;
    setFallo(null);
    try {
      onCerrar(await reversar.mutateAsync({ id: op.id, motivo: limpio }));
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo reversar. Inténtelo de nuevo.");
    }
  }

  return (
    <aside
      className="reverso"
      aria-labelledby={titulo}
      data-teclado-propio=""
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCerrar(null);
        }
      }}
    >
      <h3 id={titulo}>
        Reversar la {TIPO[op.tipo].toLowerCase()} de las {hora(op.realizadaEn, zona)}
      </h3>
      <dl className="reverso-datos">
        <div>
          <dt>Monto</dt>
          <dd className="num">{montoDivisa(op.montoDivisa, fila)}</dd>
        </div>
        <div>
          <dt>Pesos</dt>
          <dd className="num">{pesos(aBigint(op.montoBase))}</dd>
        </div>
        <div>
          <dt>Folio</dt>
          <dd className="num">{op.folioDte ?? "—"}</dd>
        </div>
      </dl>
      <form onSubmit={enviar}>
        <label>
          Motivo del reverso
          <textarea ref={texto} required rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Monto mal digitado, cliente se arrepintió…" />
        </label>
        <p className="hint">La caja vuelve a como estaba antes de la operación. El reverso queda en la auditoría con su motivo.</p>
        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
        <div className="acciones">
          <button type="submit" className="btn peligro" disabled={!motivo.trim() || reversar.isPending}>
            {reversar.isPending ? "Reversando…" : "Reversar"}
          </button>
          <button type="button" className="btn" onClick={() => onCerrar(null)}>
            Cancelar <Kbd aria-hidden="true">Esc</Kbd>
          </button>
        </div>
      </form>
    </aside>
  );
}
