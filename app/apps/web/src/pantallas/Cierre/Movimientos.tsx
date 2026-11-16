import { aBigint, type Gasto } from "../../api/esquemas.ts";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { ErrorNegocio } from "../../api/cliente.ts";
import {
  useAjustarCaja,
  useCatalogo,
  useCategoriasGasto,
  useGastos,
  useMovimientoCaja,
  useRegistrarGasto,
  useReversarGasto,
  useSesion,
} from "../../api/consultas.ts";
import { usePuede } from "../../api/permisos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Kbd } from "../../componentes/Kbd.tsx";
import { Sep, separar } from "../../componentes/Sep.tsx";
import { conSimbolo, montoEn, pesos } from "../../comun.ts";
import type { MonedaCatalogo } from "./Conteo.tsx";
import { leerMonto } from "./conteo.ts";

export type Tipo = "GASTO" | "RETIRO" | "INGRESO" | "AJUSTE";
type Medio = Gasto["medioPago"];

const TIPOS: readonly (readonly [Tipo, string])[] = [
  ["GASTO", "Gasto"],
  ["RETIRO", "Retiro"],
  ["INGRESO", "Ingreso"],
  ["AJUSTE", "Ajuste"],
];

/** Un ajuste corrige el arqueo: lo que faltó se resta del saldo del sistema; lo que sobró, se suma. */
type Sentido = "FALTA" | "SOBRA";

const MEDIOS: readonly (readonly [Medio, string])[] = [
  ["EFECTIVO", "Efectivo"],
  ["TRANSFERENCIA", "Transferencia"],
  ["TARJETA", "Tarjeta"],
];

const MEDIO = Object.fromEntries(MEDIOS) as Record<Medio, string>;

export type MovimientosApi = {
  /** «Gasto», «Retiro», «Ingreso» o «Ajuste» de la cinta: elige el tipo y lleva el foco al primer campo. */
  elegir: (tipo: Tipo) => void;
};

/** Gastos, retiros e ingresos de la caja: el formulario corto y los gastos del día. */
export function Movimientos({ hoy, ref }: { hoy: string; ref?: Ref<MovimientosApi> }) {
  return (
    <div className="cierre-movs">
      <Formulario ref={ref} />
      <GastosDelDia hoy={hoy} />
    </div>
  );
}

type Errores = Partial<Record<"categoria" | "monto" | "descripcion", string>>;

function Formulario({ ref }: { ref?: Ref<MovimientosApi> }) {
  const { data: catalogo } = useCatalogo();
  const categorias = useCategoriasGasto();
  const registrar = useRegistrarGasto();
  // Un gasto por transferencia o tarjeta lo registra solo el admin (gastos.ts)
  const medios = usePuede()("gastoSinEfectivo") ? MEDIOS : MEDIOS.filter(([valor]) => valor === "EFECTIVO");
  const mover = useMovimientoCaja();
  const ajustar = useAjustarCaja();
  // El ajuste es del supervisor o del admin (caja.ts); al cajero no se le muestra
  const tipos = usePuede()("ajustarCaja") ? TIPOS : TIPOS.filter(([t]) => t !== "AJUSTE");
  const { data: sesion } = useSesion();
  const [tipo, setTipo] = useState<Tipo>("GASTO");
  const [sentido, setSentido] = useState<Sentido>("FALTA");
  const [cajaElegida, setCajaElegida] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [medio, setMedio] = useState<Medio>("EFECTIVO");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState("");
  const id = useId();
  const campos = useRef<HTMLFormElement>(null);

  const base: MonedaCatalogo = catalogo?.monedaBase ?? { codigo: "CLP", nombre: "Peso chileno", simbolo: "$", decimales: 0 };
  const monedas: MonedaCatalogo[] = catalogo ? [catalogo.monedaBase, ...catalogo.divisas] : [base];
  // Un gasto es siempre en pesos; un retiro o un ingreso, en la moneda que se elija.
  const moneda = tipo === "GASTO" ? base : (monedas.find((m) => m.codigo === codigo) ?? base);
  // La caja del ajuste: la elegida, la del turno abierto o la primera
  const cajas = catalogo?.cajas ?? [];
  const cajaId = cajaElegida ?? (sesion?.turno?.estado === "ABIERTO" ? sesion.turno.cajaId : null) ?? cajas[0]?.id ?? null;
  const ocupado = registrar.isPending || mover.isPending || ajustar.isPending;
  const nombre = TIPOS.find(([t]) => t === tipo)?.[1] ?? "Gasto";

  function elegirTipo(t: Tipo) {
    setTipo(t);
    setErrores({});
    setFallo(null);
  }

  useImperativeHandle(
    ref,
    () => ({
      elegir(t: Tipo) {
        elegirTipo(t);
        // Después de dibujar los campos del tipo elegido
        requestAnimationFrame(() => campos.current?.querySelector<HTMLElement>(".mov-campos select, .mov-campos input")?.focus());
      },
    }),
    [],
  );

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setHecho("");
    setFallo(null);
    const valor = monto.trim() ? leerMonto(monto, moneda.decimales) : null;
    const nuevos: Errores = {};
    if (tipo === "GASTO" && !categoriaId) nuevos.categoria = "Elija la categoría del gasto.";
    if (!monto.trim()) nuevos.monto = "Indique el monto.";
    else if (valor === null)
      nuevos.monto =
        moneda.decimales > 0 ? `Escriba el monto con coma decimal, hasta ${moneda.decimales} decimales.` : "Escriba el monto sin decimales.";
    if (!descripcion.trim()) nuevos.descripcion = tipo === "GASTO" ? "Describa el gasto." : `Indique el motivo del ${nombre.toLowerCase()}.`;
    setErrores(nuevos);
    const primero = (["categoria", "monto", "descripcion"] as const).find((k) => nuevos[k]);
    if (primero || valor === null) {
      campos.current?.querySelector<HTMLElement>(`[data-campo="${primero}"]`)?.focus();
      return;
    }

    try {
      if (tipo === "GASTO") {
        const g = await registrar.mutateAsync({
          categoriaId: Number(categoriaId),
          descripcion: descripcion.trim(),
          monto: valor.toString(),
          medioPago: medio,
        });
        const categoria = categorias.data?.find((c) => c.id === g.categoriaId)?.nombre;
        setHecho(`Gasto registrado: ${pesos(aBigint(g.monto), base.decimales)}${categoria ? ` · ${categoria}` : ""}.`);
      } else if (tipo === "AJUSTE") {
        if (cajaId === null) return;
        const conSigno = sentido === "FALTA" ? -valor : valor;
        const m = await ajustar.mutateAsync({ cajaId, monedaCodigo: moneda.codigo, monto: conSigno.toString(), motivo: descripcion.trim() });
        const caja = cajas.find((c) => c.id === cajaId)?.nombre ?? `Caja ${cajaId}`;
        setHecho(`Ajuste registrado en ${caja}: ${conSimbolo(conSigno, moneda)}. El sistema queda en ${conSimbolo(aBigint(m.saldoPost), moneda)}.`);
      } else {
        const m = await mover.mutateAsync({ tipo, monedaCodigo: moneda.codigo, monto: valor.toString(), motivo: descripcion.trim() });
        setHecho(`${nombre} registrado: ${conSimbolo(valor, moneda)}. Quedan en caja ${conSimbolo(aBigint(m.saldoPost), moneda)}.`);
      }
      setMonto("");
      setDescripcion("");
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo registrar. Inténtelo de nuevo.");
    }
  }

  const error = (campo: keyof Errores) => (errores[campo] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${campo}` } : {});

  return (
    <section className="panel cierre-form" aria-labelledby={`${id}-t`}>
      <header>
        <h2 id={`${id}-t`}>Gastos, retiros e ingresos</h2>
        <span className="hint">{tipo === "AJUSTE" ? "De la caja elegida" : "De la caja del turno"}</span>
      </header>
      <form ref={campos} onSubmit={(e) => void enviar(e)} noValidate>
        <div className="seg mov-tipo" role="group" aria-label="Tipo de movimiento">
          {tipos.map(([t, texto]) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => elegirTipo(t)}>
              {texto}
            </button>
          ))}
        </div>

        <div className="mov-campos">
          {tipo === "GASTO" ? (
            <>
              <label>
                Categoría
                <select data-campo="categoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} {...error("categoria")}>
                  <option value="">Elija…</option>
                  {(categorias.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {errores.categoria && (
                  <span className="campo-error" id={`${id}-categoria`}>
                    {errores.categoria}
                  </span>
                )}
              </label>
              <label>
                Medio de pago
                <select value={medio} onChange={(e) => setMedio(e.target.value as Medio)}>
                  {medios.map(([valor, texto]) => (
                    <option key={valor} value={valor}>
                      {texto}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label>
              Moneda
              <select value={moneda.codigo} onChange={(e) => setCodigo(e.target.value)}>
                {monedas.map((m) => (
                  <option key={m.codigo} value={m.codigo}>
                    {m.codigo} – {m.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tipo === "AJUSTE" && (
            <>
              <label>
                En el arqueo
                <select value={sentido} onChange={(e) => setSentido(e.target.value as Sentido)}>
                  <option value="FALTA">Faltó: se resta</option>
                  <option value="SOBRA">Sobró: se suma</option>
                </select>
              </label>
              {cajas.length > 1 && (
                <label>
                  Caja
                  <select value={cajaId ?? ""} onChange={(e) => setCajaElegida(Number(e.target.value))}>
                    {cajas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className={tipo === "GASTO" ? "mov-monto ancho" : "mov-monto"}>
            {moneda.codigo === base.codigo ? "Monto en pesos" : montoEn(moneda.codigo)}
            <input
              data-campo="monto"
              className="num"
              inputMode="decimal"
              autoComplete="off"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              {...error("monto")}
            />
            {errores.monto && (
              <span className="campo-error" id={`${id}-monto`}>
                {errores.monto}
              </span>
            )}
          </label>
        </div>

        <label>
          {tipo === "GASTO" ? "Descripción" : "Motivo"}
          <input
            data-campo="descripcion"
            autoComplete="off"
            placeholder={
              tipo === "GASTO"
                ? "Resma de papel, flete, cuenta de luz…"
                : tipo === "RETIRO"
                  ? "Depósito en el banco…"
                  : tipo === "AJUSTE"
                    ? "Descuadre del arqueo de la tarde…"
                    : "Fondo de la mañana…"
            }
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            {...error("descripcion")}
          />
          {errores.descripcion && (
            <span className="campo-error" id={`${id}-descripcion`}>
              {errores.descripcion}
            </span>
          )}
        </label>

        <p className="hint">
          {tipo === "GASTO"
            ? medio === "EFECTIVO"
              ? "Un gasto en efectivo sale de la caja del turno."
              : "Un gasto por transferencia o tarjeta no toca la caja: lo registra el administrador."
            : tipo === "RETIRO"
              ? "El retiro sale de la caja del turno, con su motivo."
              : tipo === "AJUSTE"
                ? "Alinea el saldo del sistema con lo contado en el arqueo. Queda en la auditoría con su motivo."
                : "El ingreso entra a la caja del turno, con su motivo."}
        </p>

        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
        <div className="acciones">
          <button type="submit" className="btn" disabled={ocupado}>
            {ocupado ? "Registrando…" : `Registrar ${nombre.toLowerCase()}`}
          </button>
        </div>
        <p className="hecho" role="status">
          {hecho && (
            <>
              <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />
              <span>{separar(hecho)}</span>
            </>
          )}
        </p>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Los gastos del día, con «Reversar gasto» (con motivo) en los vigentes. */
function GastosDelDia({ hoy }: { hoy: string }) {
  const puedeReversar = usePuede()("reversar");
  const gastos = useGastos(hoy);
  const categorias = useCategoriasGasto();
  const [reverso, setReverso] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const lista = gastos.data ?? [];
  const nombreCategoria = (id: number) => categorias.data?.find((c) => c.id === id)?.nombre ?? "Gasto";
  const vigentes = lista.filter((g) => g.estado === "VIGENTE");
  const total = vigentes.reduce((suma, g) => suma + aBigint(g.monto), 0n);
  const enReverso = lista.find((g) => g.id === reverso && g.estado === "VIGENTE") ?? null;
  const volverA = useRef<HTMLElement | null>(null);

  function cerrarReverso(hecho: Gasto | null) {
    setReverso(null);
    if (hecho) setNota(`Reversado el gasto «${hecho.descripcion}»${hecho.medioPago === "EFECTIVO" ? ": el dinero volvió a la caja" : ""}.`);
    volverA.current?.focus();
  }

  return (
    <section className="panel cierre-gastos" aria-labelledby="gastos-titulo">
      <header>
        <h2 id="gastos-titulo">Gastos de hoy</h2>
        {gastos.isSuccess && (
          <span className="hint">
            {vigentes.length === 1 ? "1 vigente" : `${vigentes.length} vigentes`}
            <Sep />
            <span className="num">{pesos(total)}</span>
          </span>
        )}
      </header>
      <p className="nota-libro" role="status">
        {nota}
      </p>

      {enReverso && <ReversoGasto gasto={enReverso} categoria={nombreCategoria(enReverso.categoriaId)} onCerrar={cerrarReverso} />}

      {gastos.isPending && (
        <ul className="gastos-lista" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i}>
              <span className="esqueleto" style={{ width: "60%" }} />
            </li>
          ))}
        </ul>
      )}
      {gastos.isError && (
        <div className="cierre-gastos-cuerpo">
          <Aviso tono="error" rol="alert">
            <p>{gastos.error instanceof ErrorNegocio ? gastos.error.message : "No se pudieron leer los gastos."}</p>
            <p>
              <button type="button" className="enlace" onClick={() => void gastos.refetch()}>
                Reintentar
              </button>
            </p>
          </Aviso>
        </div>
      )}
      {gastos.isSuccess && lista.length === 0 && (
        <p className="vacio">Hoy no hay gastos. Se registran a la izquierda: categoría, monto, medio y descripción.</p>
      )}
      {lista.length > 0 && (
        <ul className="gastos-lista">
          {lista.map((g) => (
            <li key={g.id} className={g.estado === "REVERSADO" ? "reversado" : undefined}>
              <span className="gasto-cat">{nombreCategoria(g.categoriaId)}</span>
              <span className="gasto-monto num">{pesos(aBigint(g.monto))}</span>
              <span className="gasto-desc">{g.descripcion}</span>
              <span className="gasto-pie">
                {MEDIO[g.medioPago]}
                {g.estado === "REVERSADO" ? (
                  <>
                    <span className="est rev">Reversado</span>
                    {g.motivoReverso && <span className="motivo">{g.motivoReverso}</span>}
                  </>
                ) : (
                  puedeReversar && (
                    <button
                      type="button"
                      className="enlace"
                      aria-label={`Reversar el gasto «${g.descripcion}»`}
                      onClick={(e) => {
                        volverA.current = e.currentTarget;
                        setNota("");
                        setReverso(g.id);
                      }}
                    >
                      Reversar gasto
                    </button>
                  )
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** El reverso de un gasto: el mismo panel aparte que el de la Ventanilla. Sin motivo no se reversa. */
function ReversoGasto({ gasto, categoria, onCerrar }: { gasto: Gasto; categoria: string; onCerrar: (hecho: Gasto | null) => void }) {
  const [motivo, setMotivo] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const reversar = useReversarGasto();
  const texto = useRef<HTMLTextAreaElement>(null);
  const titulo = useId();

  useEffect(() => texto.current?.focus(), []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpio = motivo.trim();
    if (!limpio || reversar.isPending) return;
    setFallo(null);
    try {
      onCerrar(await reversar.mutateAsync({ id: gasto.id, motivo: limpio }));
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo reversar. Inténtelo de nuevo.");
    }
  }

  return (
    <aside
      className="reverso"
      aria-labelledby={titulo}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCerrar(null);
        }
      }}
    >
      <h3 id={titulo}>Reversar el gasto</h3>
      <dl className="reverso-datos">
        <div>
          <dt>Categoría</dt>
          <dd>{categoria}</dd>
        </div>
        <div>
          <dt>Monto</dt>
          <dd className="num">{pesos(aBigint(gasto.monto))}</dd>
        </div>
        <div>
          <dt>Medio</dt>
          <dd>{MEDIO[gasto.medioPago]}</dd>
        </div>
      </dl>
      <form onSubmit={(e) => void enviar(e)}>
        <label>
          Motivo del reverso
          <textarea
            ref={texto}
            required
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Se registró dos veces, el monto era otro…"
          />
        </label>
        <p className="hint">
          {gasto.medioPago === "EFECTIVO" ? "El dinero vuelve a la caja del turno. " : ""}El reverso queda en la auditoría con su motivo.
        </p>
        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
        <div className="acciones">
          <button type="submit" className="btn peligro" disabled={!motivo.trim() || reversar.isPending}>
            {reversar.isPending ? "Reversando…" : "Reversar gasto"}
          </button>
          <button type="button" className="btn" onClick={() => onCerrar(null)}>
            Cancelar <Kbd aria-hidden="true">Esc</Kbd>
          </button>
        </div>
      </form>
    </aside>
  );
}
