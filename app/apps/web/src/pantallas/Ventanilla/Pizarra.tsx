import { aBigint, type FilaPizarra } from "../../api/esquemas.ts";
import { calcularPrecios, formatearTasa, leerDecimal } from "@atk/shared/dinero";
import { WarningDiamondIcon, XIcon } from "@phosphor-icons/react";
import { Fragment, useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import { ErrorNegocio } from "../../api/cliente.ts";
import { usePizarra, usePublicarCotizacion, useSesion } from "../../api/consultas.ts";
import { puede } from "../../api/permisos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Sep } from "../../componentes/Sep.tsx";
import { DATOS_DE_EJEMPLO, hora, tasa, useAhora } from "./comun.ts";

// ---------------------------------------------------------------------------
// Lo visto: la tasa que cambió queda encendida hasta que Rolando la mira. Se
// recuerda por divisa + vigencia (una cotización nueva vuelve a encender) y
// dura la sesión de la pestaña: cambiar de sección no la vuelve a prender.

const CLAVE_VISTAS = "atk.pizarra.vistas";

function leerVistas(): Set<string> {
  try {
    const guardado = sessionStorage.getItem(CLAVE_VISTAS);
    return new Set(guardado ? (JSON.parse(guardado) as string[]) : []);
  } catch {
    return new Set();
  }
}

function guardarVistas(vistas: Set<string>): void {
  try {
    sessionStorage.setItem(CLAVE_VISTAS, JSON.stringify([...vistas].slice(-40)));
  } catch {
    // sin almacenamiento (ventana privada): se recuerda solo mientras la pantalla está abierta
  }
}

const claveDe = (f: FilaPizarra) => `${f.monedaCodigo}@${f.vigenteDesde ?? ""}`;

/** «hace 2 min», «hace 1 h 5 min», «recién». */
function haceCuanto(desde: Date, ahora: Date): string {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - desde.getTime()) / 60_000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`;
}

/** Qué cambió respecto de la cotización anterior: «venta antes 949,00» (una parte por tasa). */
function antes(f: FilaPizarra): string[] {
  const partes: string[] = [];
  if (f.compraAnteriorE6 != null && f.compraAnteriorE6 !== f.compraE6) partes.push(`compra antes ${tasa(f.compraAnteriorE6, f.decimalesTasa)}`);
  if (f.ventaAnteriorE6 != null && f.ventaAnteriorE6 !== f.ventaE6) partes.push(`venta antes ${tasa(f.ventaAnteriorE6, f.decimalesTasa)}`);
  return partes;
}

// ---------------------------------------------------------------------------

export type PizarraApi = {
  /** «Actualizar pizarra» (cinta): abre el formulario si el rol puede publicar. */
  actualizar: () => void;
};

export function Pizarra({ ref }: { ref?: Ref<PizarraApi> }) {
  const pizarra = usePizarra();
  const { data: sesion } = useSesion();
  const ahora = useAhora();
  const [vistas, setVistas] = useState(leerVistas);
  const [actualizando, setActualizando] = useState(false);
  const filas = pizarra.data ?? [];
  const puedePublicar = puede(sesion?.usuario.rol, "publicarPizarra") && filas.length > 0;

  useImperativeHandle(ref, () => ({ actualizar: () => puedePublicar && setActualizando(true) }), [puedePublicar]);

  function alternar(clave: string) {
    setVistas((previas) => {
      const nuevas = new Set(previas);
      if (nuevas.has(clave)) nuevas.delete(clave);
      else nuevas.add(clave);
      guardarVistas(nuevas);
      return nuevas;
    });
  }

  const ultima = filas.reduce<string | null>((max, f) => (f.vigenteDesde && (!max || f.vigenteDesde > max) ? f.vigenteDesde : max), null);

  return (
    <section className="letrero" aria-labelledby="pizarra-titulo">
      <div className="letrero-in">
        <div className="letrero-cab">
          <h2 id="pizarra-titulo">
            Pizarra
            <span className="letrero-unidad">
              <Sep />
              pesos por unidad
            </span>
          </h2>
          <div className="letrero-acc">
            <p className="vig">
              {ultima ? `Vigente desde ${hora(ultima)}` : "Sin cotizaciones"}
              {DATOS_DE_EJEMPLO && (
                <>
                  <Sep />
                  <span className="sint">datos de ejemplo</span>
                </>
              )}
            </p>
            {puedePublicar && (
              <button type="button" className="btn-letrero" onClick={() => setActualizando(true)}>
                Actualizar pizarra
              </button>
            )}
          </div>
        </div>

        {pizarra.isError ? (
          <p className="letrero-error" role="alert">
            {pizarra.error instanceof ErrorNegocio ? pizarra.error.message : "No se pudo leer la pizarra."}
          </p>
        ) : (
          <table className="tasas">
            <thead>
              <tr>
                <th scope="col">Divisa</th>
                <th scope="col" className="r">
                  Compra
                </th>
                <th scope="col" className="r">
                  Venta
                </th>
                <th scope="col" className="col-cambio">
                  Cambio
                </th>
              </tr>
            </thead>
            <tbody aria-busy={pizarra.isPending}>
              {pizarra.isPending
                ? [0, 1, 2].map((i) => (
                    <tr key={i} className="esperando">
                      <td colSpan={4}>
                        <span className="esqueleto" style={{ width: "40%" }} />
                      </td>
                    </tr>
                  ))
                : filas.map((f) => (
                    <Destino key={f.monedaCodigo} fila={f} ahora={ahora} vista={vistas.has(claveDe(f))} onMirar={() => alternar(claveDe(f))} />
                  ))}
            </tbody>
          </table>
        )}
      </div>
      {actualizando && <ActualizarPizarra filas={filas} onCerrar={() => setActualizando(false)} />}
    </section>
  );
}

/** Una fila de la pizarra: la divisa, sus dos tasas y si cambió (o está vencida). */
function Destino({ fila: f, ahora, vista, onMirar }: { fila: FilaPizarra; ahora: Date; vista: boolean; onMirar: () => void }) {
  const vencida = f.vencida || f.compraE6 === null;
  const cambio = vencida ? [] : antes(f);
  const cambiada = cambio.length > 0 && f.vigenteDesde;

  // La tasa que cambió: un botón de alternar en su celda. Encendida hasta que se mira (clic o Enter).
  function alPulsar(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onMirar();
    }
  }

  return (
    <tr className={vencida ? "vencida" : cambiada ? `cambio${vista ? " vista" : ""}` : undefined}>
      <th scope="row">
        <i className="dest-punto" aria-hidden="true" style={{ background: `var(--${f.monedaCodigo.toLowerCase()}-letrero, #fff)` }} />
        <span className="cod">{f.monedaCodigo}</span>
        <span className="nom">{f.nombre}</span>
      </th>
      <td className="r cifra num">{tasa(f.compraE6, f.decimalesTasa)}</td>
      <td className="r cifra num">{tasa(f.ventaE6, f.decimalesTasa)}</td>
      <td className="col-cambio">
        {vencida ? (
          <span className="aviso-dest">
            <WarningDiamondIcon size={15} weight="bold" aria-hidden="true" />
            {f.compraE6 === null ? "Sin cotización" : "Vencida"}
            <Sep />
            actualice la pizarra
          </span>
        ) : cambiada ? (
          <button
            type="button"
            className="aviso-dest cambio-btn"
            aria-pressed={vista}
            title={vista ? "Vista: clic para volver a encenderla" : "Clic o Enter para marcarla como vista"}
            onClick={onMirar}
            onKeyDown={alPulsar}
          >
            <WarningDiamondIcon size={15} weight="bold" aria-hidden="true" />
            <span className="oculto">{f.monedaCodigo}: </span>
            Cambió {haceCuanto(new Date(f.vigenteDesde as string), ahora)}
            {cambio.map((parte) => (
              <Fragment key={parte}>
                <Sep />
                {parte}
              </Fragment>
            ))}
          </button>
        ) : (
          <span className="sin-cambio">Sin cambios{f.vigenteDesde ? ` desde las ${hora(f.vigenteDesde)}` : ""}</span>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Actualizar pizarra: referencia y márgenes por divisa (publicarCotizacion).

type Regla = { referencia: string; tipoMargen: "PORCENTAJE" | "MONTO_FIJO"; compra: string; venta: string };

/** Un E6 para escribirlo en un campo: sin miles y con coma («943,5»). */
const aCampo = (e6: string | null | undefined) => (e6 == null ? "" : formatearTasa(aBigint(e6), 0).replaceAll(".", ""));

/** Lo escrito → E6. Los puntos son de miles (convención chilena); la coma, decimal. */
const leerE6 = (texto: string) => leerDecimal(texto.replaceAll(".", ""), 6);

function reglaDe(f: FilaPizarra): Regla {
  return {
    referencia: aCampo(f.referenciaE6),
    tipoMargen: f.tipoMargen ?? "PORCENTAJE",
    compra: aCampo(f.margenCompraE6),
    venta: aCampo(f.margenVentaE6),
  };
}

type Lectura =
  | { ok: true; referenciaE6: bigint; margenCompraE6: bigint; margenVentaE6: bigint; compraE6: bigint; ventaE6: bigint }
  | { ok: false; motivo: string };

function leerRegla(r: Regla, decimalesTasa: number): Lectura {
  let referenciaE6: bigint, margenCompraE6: bigint, margenVentaE6: bigint;
  try {
    referenciaE6 = leerE6(r.referencia);
    margenCompraE6 = leerE6(r.compra);
    margenVentaE6 = leerE6(r.venta);
  } catch {
    return { ok: false, motivo: "Escriba números, con coma para los decimales" };
  }
  try {
    const precios = calcularPrecios(referenciaE6, { tipoMargen: r.tipoMargen, margenCompraE6, margenVentaE6 }, decimalesTasa);
    return { ok: true, referenciaE6, margenCompraE6, margenVentaE6, ...precios };
  } catch (error) {
    return { ok: false, motivo: (error as Error).message };
  }
}

const cambiada = (r: Regla, f: FilaPizarra) => {
  const original = reglaDe(f);
  return r.referencia !== original.referencia || r.tipoMargen !== original.tipoMargen || r.compra !== original.compra || r.venta !== original.venta;
};

function ActualizarPizarra({ filas, onCerrar }: { filas: FilaPizarra[]; onCerrar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const publicar = usePublicarCotizacion();
  const [reglas, setReglas] = useState<Record<string, Regla>>(() => Object.fromEntries(filas.map((f) => [f.monedaCodigo, reglaDe(f)])));
  const [fallo, setFallo] = useState<{ codigo: string; mensaje: string } | null>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    // jsdom no tiene showModal: ahí basta con abrirlo
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    return () => {
      if (typeof d.close === "function" && d.open) d.close();
    };
  }, []);

  const cambiadas = filas.filter((f) => {
    const r = reglas[f.monedaCodigo];
    return r !== undefined && cambiada(r, f);
  });
  const lecturas = new Map(filas.map((f) => [f.monedaCodigo, leerRegla(reglas[f.monedaCodigo] ?? reglaDe(f), f.decimalesTasa)]));
  const invalidas = cambiadas.some((f) => !lecturas.get(f.monedaCodigo)?.ok);

  function editar(codigo: string, cambio: Partial<Regla>) {
    setReglas((previas) => {
      const actual = previas[codigo];
      return actual ? { ...previas, [codigo]: { ...actual, ...cambio } } : previas;
    });
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setFallo(null);
    for (const f of cambiadas) {
      const r = reglas[f.monedaCodigo];
      const l = lecturas.get(f.monedaCodigo);
      if (!r || !l?.ok) return;
      try {
        await publicar.mutateAsync({
          monedaCodigo: f.monedaCodigo,
          referenciaE6: l.referenciaE6.toString(),
          tipoMargen: r.tipoMargen,
          margenCompraE6: l.margenCompraE6.toString(),
          margenVentaE6: l.margenVentaE6.toString(),
        });
      } catch (error) {
        setFallo({ codigo: f.monedaCodigo, mensaje: error instanceof ErrorNegocio ? error.message : "No se pudo publicar." });
        return;
      }
    }
    onCerrar();
  }

  return (
    <dialog
      ref={dialogo}
      className="dialogo-pizarra"
      aria-labelledby={titulo}
      onCancel={(e) => {
        e.preventDefault();
        onCerrar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCerrar();
        }
      }}
    >
      <form onSubmit={enviar}>
        <header className="dialogo-cab">
          <div>
            <h2 id={titulo}>Actualizar pizarra</h2>
            <p className="hint">Referencia y margen de cada divisa. Al publicar, la cotización vigente se cierra y la nueva rige desde ahora.</p>
          </div>
          <button type="button" className="cerrar" onClick={onCerrar} aria-label="Cerrar">
            <XIcon size={18} weight="bold" aria-hidden="true" />
          </button>
        </header>

        <div className="reglas">
          {filas.map((f) => {
            const r = reglas[f.monedaCodigo] ?? reglaDe(f);
            const l = lecturas.get(f.monedaCodigo);
            const unidad = r.tipoMargen === "PORCENTAJE" ? "%" : "$";
            return (
              <fieldset key={f.monedaCodigo} className="regla">
                <legend>
                  <span className="divisa">
                    <i aria-hidden="true" style={{ background: `var(--${f.monedaCodigo.toLowerCase()}, var(--neutro))` }} />
                    {f.monedaCodigo}
                  </span>{" "}
                  {f.nombre}
                </legend>
                <label>
                  Referencia
                  <input
                    className="num"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.referencia}
                    onChange={(e) => editar(f.monedaCodigo, { referencia: e.target.value })}
                  />
                </label>
                <label>
                  Margen en
                  <select
                    value={r.tipoMargen}
                    onChange={(e) => editar(f.monedaCodigo, { tipoMargen: e.target.value === "MONTO_FIJO" ? "MONTO_FIJO" : "PORCENTAJE" })}
                  >
                    <option value="PORCENTAJE">Porcentaje</option>
                    <option value="MONTO_FIJO">Pesos</option>
                  </select>
                </label>
                <label>
                  Margen compra ({unidad})
                  <input
                    className="num"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.compra}
                    onChange={(e) => editar(f.monedaCodigo, { compra: e.target.value })}
                  />
                </label>
                <label>
                  Margen venta ({unidad})
                  <input
                    className="num"
                    inputMode="decimal"
                    autoComplete="off"
                    value={r.venta}
                    onChange={(e) => editar(f.monedaCodigo, { venta: e.target.value })}
                  />
                </label>
                <output className={`queda${l?.ok ? "" : " mal"}`}>
                  {l?.ok ? (
                    <>
                      Quedará <b className="num">{formatearTasa(l.compraE6, f.decimalesTasa)}</b> compra
                      <Sep />
                      <b className="num">{formatearTasa(l.ventaE6, f.decimalesTasa)}</b> venta
                    </>
                  ) : (
                    (l?.motivo ?? "")
                  )}
                </output>
              </fieldset>
            );
          })}
        </div>

        {fallo && (
          <Aviso tono="error" rol="alert" className="dialogo-fallo">
            <p>
              <b>{fallo.codigo}:</b> {fallo.mensaje}
            </p>
          </Aviso>
        )}

        <footer className="dialogo-pie">
          <button type="button" className="btn" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="btn prim" disabled={cambiadas.length === 0 || invalidas || publicar.isPending}>
            {publicar.isPending ? "Publicando…" : cambiadas.length > 1 ? `Publicar ${cambiadas.length} divisas` : "Publicar"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
