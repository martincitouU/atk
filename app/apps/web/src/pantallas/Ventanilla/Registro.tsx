import { aBigint, Operacion, type Cliente, type EntradaOperacion, type Vista } from "../../api/esquemas.ts";
import { formatearMonto, potencia10 } from "@atk/shared/dinero";
import { CheckCircleIcon, WarningIcon } from "@phosphor-icons/react";
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type Ref } from "react";
import { Link } from "react-router";
import { z } from "zod";
import { ErrorNegocio } from "../../api/cliente.ts";
import {
  useCatalogo,
  useCliente,
  useClientes,
  useConfirmar,
  useCrearOperacion,
  useEditarBorrador,
  useParametros,
  usePizarra,
  useVistaPrevia,
} from "../../api/consultas.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Kbd } from "../../componentes/Kbd.tsx";
import { Sep, separar } from "../../componentes/Sep.tsx";
import { borradorVacio, limpiarMonto, montoMinimo, teclear, verMonto, type Borrador, type MedioPago } from "../../teclado/registro.ts";

/** El largo de una cifra de la placa: el CSS la achica para que quepa en una línea (ventanilla.css, .placa b). */
const cifras = (texto: string) => ({ "--cifras": texto.length }) as CSSProperties;
import { esActivable, esCampoDeTexto, hora, montoDivisa, montoEn, pesos, tasa, TIPO } from "./comun.ts";

/** Lo que la Ventanilla le pide al registro desde el libro. */
export type RegistroApi = {
  /** Trae un borrador del libro al registro para completarlo (el folio) y confirmarlo. */
  retomar: (op: Operacion) => void;
};

type ClienteElegido = { id: number; nombre: string | null; documento: string | null; faltantes: string[] };

const MEDIOS: readonly (readonly [MedioPago, string])[] = [
  ["EFECTIVO", "Efectivo"],
  ["TRANSFERENCIA", "Transferencia"],
  ["TARJETA", "Tarjeta"],
];

const DOCUMENTO: Record<Cliente["tipoDocumento"], string> = { RUT: "RUT", PASAPORTE: "Pasaporte", DNI: "DNI", OTRO: "Doc." };
const documentoDe = (c: Cliente) => `${DOCUMENTO[c.tipoDocumento]} ${c.numeroDocumento}`;

// ---------------------------------------------------------------------------
// Lo que se está registrando sobrevive a ir a «Crear ficha» o «Completar la
// ficha» y volver (como el conteo del Cierre): se guarda en sessionStorage,
// validado al leerlo, y se borra al quedar vacío el registro (al confirmar,
// al dejar borrador o con Esc). Va también el borrador ya guardado, para que
// al volver se confirme ese y no se cree otro.

const CLAVE_REGISTRO = "atk.ventanilla.registro";

const RegistroGuardado = z.object({
  tipo: z.enum(["COMPRA", "VENTA"]),
  moneda: z.string().regex(/^[A-Z]{3}$/),
  monto: z.string().regex(/^\d*(,\d*)?$/),
  medioPago: z.enum(["EFECTIVO", "TRANSFERENCIA", "TARJETA"]),
  folio: z.string().regex(/^\d{0,10}$/),
  cliente: z.object({ id: z.number().int().positive(), nombre: z.string().nullable(), documento: z.string().nullable() }).nullable(),
  proposito: z.string(),
  pendiente: Operacion.nullable(),
});
type RegistroGuardado = z.infer<typeof RegistroGuardado>;

function leerRegistro(): RegistroGuardado | null {
  try {
    const guardado = RegistroGuardado.safeParse(JSON.parse(sessionStorage.getItem(CLAVE_REGISTRO) ?? "null"));
    return guardado.success ? guardado.data : null;
  } catch {
    return null;
  }
}

function guardarRegistro(r: RegistroGuardado): void {
  const vacio = !r.monto && !r.folio && r.medioPago === "EFECTIVO" && r.cliente === null && !r.proposito && r.pendiente === null;
  try {
    if (vacio) sessionStorage.removeItem(CLAVE_REGISTRO);
    else sessionStorage.setItem(CLAVE_REGISTRO, JSON.stringify(r));
  } catch {
    // sin almacenamiento (ventana privada): el registro vive solo en pantalla
  }
}

/** El valor, 150 ms después de que deja de cambiar (la vista previa no se pide a cada tecla). */
function useRetrasado<T>(valor: T, ms: number): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}

/** Un error cualquiera como ErrorNegocio, para mostrar su mensaje tal cual. */
const comoErrorNegocio = (error: unknown) =>
  error instanceof ErrorNegocio ? error : new ErrorNegocio("ERROR", "No se pudo completar la operación. Inténtelo de nuevo.");

/** ¿La operación guardada ya es lo que dice el registro? Si no, hay que editarla antes de confirmar. */
function mismaOperacion(op: Operacion, e: EntradaOperacion): boolean {
  return (
    op.tipo === e.tipo &&
    op.monedaCodigo === e.monedaCodigo &&
    op.montoDivisa === e.montoDivisa &&
    op.medioPago === (e.medioPago ?? "EFECTIVO") &&
    op.folioDte === (e.folioDte ?? null) &&
    op.clienteId === (e.clienteId ?? null) &&
    !e.proposito
  );
}

export function Registro({ ref }: { ref?: Ref<RegistroApi> }) {
  const pizarra = usePizarra();
  const filas = useMemo(() => pizarra.data ?? [], [pizarra.data]);
  const codigos = useMemo(() => filas.map((f) => f.monedaCodigo), [filas]);
  const { data: catalogo } = useCatalogo();
  const { data: parametros } = useParametros();
  const decimalesBase = catalogo?.monedaBase.decimales ?? 0;
  const zona = parametros?.zonaHoraria;

  // Lo que se estaba registrando antes de salir a Clientes (o nada).
  const [guardado] = useState(leerRegistro);

  // El borrador vive en estado y en una ref: el teclado lee la ref, así dos
  // teclas seguidas antes de un render no se pisan.
  const [borrador, setBorrador] = useState<Borrador>(() =>
    guardado
      ? { tipo: guardado.tipo, moneda: guardado.moneda, monto: guardado.monto, medioPago: guardado.medioPago, folio: guardado.folio, esperaDivisa: false }
      : borradorVacio("USD"),
  );
  const borradorRef = useRef(borrador);
  const cambiar = (b: Borrador) => {
    borradorRef.current = b;
    setBorrador(b);
  };

  const [cliente, setCliente] = useState<ClienteElegido | null>(() => (guardado?.cliente ? { ...guardado.cliente, faltantes: [] } : null));
  const [proposito, setProposito] = useState(guardado?.proposito ?? "");
  /** El borrador ya guardado de este registro: el que se intentó confirmar o el que se retomó del libro. */
  const [pendiente, setPendiente] = useState<Operacion | null>(guardado?.pendiente ?? null);
  const pendienteRef = useRef<Operacion | null>(pendiente);
  const fijarPendiente = (op: Operacion | null) => {
    pendienteRef.current = op;
    setPendiente(op);
  };

  // La ficha del cliente elegido, al día: al volver de completarla ya no falta nada.
  const ficha = useCliente(cliente?.id);
  const clienteAlDia: ClienteElegido | null =
    cliente && ficha.data?.id === cliente.id
      ? { id: cliente.id, nombre: ficha.data.nombre, documento: documentoDe(ficha.data), faltantes: ficha.data.faltantes }
      : cliente;

  useEffect(() => {
    guardarRegistro({
      tipo: borrador.tipo,
      moneda: borrador.moneda,
      monto: borrador.monto,
      medioPago: borrador.medioPago,
      folio: borrador.folio,
      cliente: cliente && { id: cliente.id, nombre: cliente.nombre, documento: cliente.documento },
      proposito,
      pendiente,
    });
  }, [borrador.tipo, borrador.moneda, borrador.monto, borrador.medioPago, borrador.folio, cliente, proposito, pendiente]);
  const [fallo, setFallo] = useState<ErrorNegocio | null>(null);
  const [hecho, setHecho] = useState("");
  const [enfocar, setEnfocar] = useState<{ campo: "monto" | "folio"; vez: number } | null>(null);
  const enCurso = useRef(false);

  const montoRef = useRef<HTMLInputElement>(null);
  const folioRef = useRef<HTMLInputElement>(null);

  const crear = useCrearOperacion();
  const confirmarOp = useConfirmar();
  const editar = useEditarBorrador();
  const ocupado = crear.isPending || confirmarOp.isPending || editar.isPending;

  // Si la divisa del borrador no está en la pizarra, la primera que haya.
  useEffect(() => {
    const primera = codigos[0];
    if (primera && !codigos.includes(borradorRef.current.moneda)) cambiar({ ...borradorRef.current, moneda: primera });
  }, [codigos]);

  useEffect(() => {
    if (enfocar) (enfocar.campo === "folio" ? folioRef : montoRef).current?.focus();
  }, [enfocar]);

  // Con mouse y teclado (el PC de la ventanilla), el foco parte en el monto; en el teléfono, no abre el teclado solo.
  useEffect(() => {
    if (window.matchMedia?.("(pointer: fine)").matches) montoRef.current?.focus();
  }, []);

  const fila = filas.find((f) => f.monedaCodigo === borrador.moneda);
  const decimales = fila?.decimales ?? 2;
  const monto = montoMinimo(borrador, decimales);
  const hayMonto = /[1-9]/.test(borrador.monto);

  // La vista previa: solo con un monto válido, 150 ms después de la última tecla.
  const consulta = useMemo<EntradaOperacion | null>(
    () =>
      monto === null
        ? null
        : { tipo: borrador.tipo, monedaCodigo: borrador.moneda, montoDivisa: monto.toString(), medioPago: borrador.medioPago, clienteId: cliente?.id ?? null },
    [borrador.tipo, borrador.moneda, monto, borrador.medioPago, cliente?.id],
  );
  const consultaRetrasada = useRetrasado(consulta, 150);
  const vista = useVistaPrevia(consulta === null ? null : consultaRetrasada);
  const datos = consulta === null ? undefined : vista.data;
  const desfasada = consulta !== null && (consulta !== consultaRetrasada || vista.isPlaceholderData);
  const errorVista = consulta !== null && consulta === consultaRetrasada && vista.error instanceof ErrorNegocio ? vista.error.message : null;

  let bloqueo: string | null = null;
  if (!fila) bloqueo = pizarra.isPending ? "Cargando la pizarra…" : "Elija una divisa";
  else if (fila.compraE6 === null || fila.ventaE6 === null) bloqueo = `${fila.monedaCodigo} no tiene cotización: actualice la pizarra`;
  else if (fila.vencida) bloqueo = `La cotización de ${fila.monedaCodigo} está vencida: actualice la pizarra antes de operar`;
  else if (hayMonto && monto === null)
    bloqueo = decimales === 0 ? `${fila.monedaCodigo} se opera sin decimales` : `${fila.monedaCodigo} admite hasta ${decimales} decimales`;

  // Un borrador retomado se confirma con la pizarra de ahora: si su tasa era otra, se dice antes.
  const tasaVista = datos?.tasaAplicadaE6;
  const recalculo =
    pendiente && tasaVista && fila && pendiente.tasaAplicadaE6 !== tasaVista && pendiente.monedaCodigo === borrador.moneda && pendiente.tipo === borrador.tipo
      ? `El borrador se registró a ${tasa(pendiente.tasaAplicadaE6, fila.decimalesTasa)}; se confirmará a ${tasa(tasaVista, fila.decimalesTasa)}, la tasa de la placa.`
      : null;

  /** La entrada completa del registro (con folio, cliente y propósito), o null si el monto no sirve. */
  function entradaCompleta(): EntradaOperacion | null {
    const b = borradorRef.current;
    const f = filas.find((x) => x.monedaCodigo === b.moneda);
    const m = f ? montoMinimo(b, f.decimales) : null;
    if (!f || m === null) return null;
    const folio = b.folio ? Number(b.folio) : null;
    const motivo = proposito.trim();
    return {
      tipo: b.tipo,
      monedaCodigo: b.moneda,
      montoDivisa: m.toString(),
      medioPago: b.medioPago,
      clienteId: cliente?.id ?? null,
      // Un folio va siempre con su tipo de documento: boleta exenta (41)
      tipoDte: folio === null ? null : 41,
      folioDte: folio,
      ...(motivo ? { proposito: motivo } : {}),
    };
  }

  /** Guarda el registro como borrador: lo crea o, si ya existe y cambió, lo edita. */
  async function guardar(entrada: EntradaOperacion): Promise<Operacion> {
    const actual = pendienteRef.current;
    if (actual) {
      if (mismaOperacion(actual, entrada)) return actual;
      const editado = await editar.mutateAsync({ id: actual.id, cambios: entrada });
      fijarPendiente(editado);
      return editado;
    }
    const creado = await crear.mutateAsync(entrada);
    fijarPendiente(creado);
    return creado;
  }

  function terminar(texto: string) {
    const b = borradorRef.current;
    cambiar(borradorVacio(b.moneda, b.tipo));
    setCliente(null);
    setProposito("");
    fijarPendiente(null);
    setFallo(null);
    setHecho(texto);
    setEnfocar({ campo: "monto", vez: Date.now() });
  }

  function describir(op: Operacion): string {
    const f = filas.find((x) => x.monedaCodigo === op.monedaCodigo);
    return `${montoDivisa(op.montoDivisa, f)} · ${pesos(aBigint(op.montoBase), decimalesBase)}${op.folioDte ? ` · folio ${op.folioDte}` : ""}`;
  }

  /** Enter: guarda y confirma de una vez. Si algo falla, el mensaje va tal cual y lo escrito se queda. */
  async function confirmar() {
    if (enCurso.current || bloqueo) return;
    const entrada = entradaCompleta();
    if (!entrada) return;
    enCurso.current = true;
    setFallo(null);
    setHecho("");
    try {
      const op = await guardar(entrada);
      const confirmada = await confirmarOp.mutateAsync(op.id);
      terminar(`${TIPO[confirmada.tipo]} confirmada · ${describir(confirmada)}`);
    } catch (error) {
      setFallo(comoErrorNegocio(error));
    } finally {
      enCurso.current = false;
    }
  }

  /** B: solo guarda el borrador; queda en el libro para confirmarlo después. */
  async function dejarBorrador() {
    if (enCurso.current) return;
    const entrada = entradaCompleta();
    if (!entrada) return;
    enCurso.current = true;
    setFallo(null);
    try {
      const op = await guardar(entrada);
      terminar(`Borrador guardado en el libro · ${describir(op)}`);
    } catch (error) {
      setFallo(comoErrorNegocio(error));
    } finally {
      enCurso.current = false;
    }
  }

  /** PIZARRA_CAMBIO: recalcula el borrador con la pizarra vigente y vuelve a confirmar. */
  async function recalcular() {
    const actual = pendienteRef.current;
    if (!actual || enCurso.current) return;
    enCurso.current = true;
    setFallo(null);
    try {
      const editado = await editar.mutateAsync({ id: actual.id, cambios: {} });
      fijarPendiente(editado);
      const confirmada = await confirmarOp.mutateAsync(editado.id);
      terminar(`${TIPO[confirmada.tipo]} confirmada · ${describir(confirmada)}`);
    } catch (error) {
      setFallo(comoErrorNegocio(error));
    } finally {
      enCurso.current = false;
    }
  }

  /** Esc: vacía el registro. Un borrador retomado sigue en el libro. */
  function limpiar(b: Borrador = borradorVacio(borradorRef.current.moneda, borradorRef.current.tipo)) {
    cambiar(b);
    setCliente(null);
    setProposito("");
    fijarPendiente(null);
    setFallo(null);
    setHecho("");
  }

  useImperativeHandle(
    ref,
    () => ({
      retomar(op: Operacion) {
        const f = filas.find((x) => x.monedaCodigo === op.monedaCodigo);
        cambiar({
          tipo: op.tipo,
          moneda: op.monedaCodigo,
          monto: formatearMonto(aBigint(op.montoDivisa), f?.decimales ?? 2).replaceAll(".", ""),
          medioPago: op.medioPago,
          folio: op.folioDte?.toString() ?? "",
          esperaDivisa: false,
        });
        setCliente(op.clienteId === null ? null : { id: op.clienteId, nombre: null, documento: null, faltantes: [] });
        setProposito("");
        fijarPendiente(op);
        setFallo(null);
        setHecho("");
        setEnfocar({ campo: op.folioDte === null ? "folio" : "monto", vez: Date.now() });
      },
    }),
    [filas],
  );

  // El teclado: un solo oyente en la ventana, que lee siempre la última versión de esta función.
  const alPulsar = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el?.closest("dialog, [data-teclado-propio]")) return;
    const b = borradorRef.current;
    const enMonto = el === montoRef.current;
    const enFolio = el === folioRef.current;

    // En otro campo, las teclas son de ese campo. En el folio y el medio de pago
    // valen Enter (confirmar) y Esc (limpiar); en el folio, también ↑/↓.
    if (!enMonto && esCampoDeTexto(el)) {
      const enSelect = el instanceof HTMLSelectElement;
      const vale = e.key === "Enter" || e.key === "Escape" || (enFolio && (e.key === "ArrowUp" || e.key === "ArrowDown"));
      if (!((enFolio || enSelect) && vale)) return;
    }
    // Enter y Espacio sobre un botón o enlace los activan a ellos; las flechas en un radio, el radio.
    if (esActivable(el) && (e.key === "Enter" || e.key === " ")) return;
    if (el instanceof HTMLInputElement && el.type === "radio" && e.key.startsWith("Arrow")) return;
    // En el campo del monto, escribir y borrar es nativo (respeta el cursor); onChange lo limpia.
    if (enMonto && !b.esperaDivisa && (/^\d$/.test(e.key) || e.key === "," || e.key === "Backspace")) return;

    if (e.key === "Enter" && (enMonto || enFolio)) e.preventDefault(); // sin envío implícito del formulario
    const { borrador: siguiente, accion } = teclear(b, e.key, codigos);
    if (siguiente === b && accion === undefined) return;
    e.preventDefault();
    if (accion === "LIMPIAR") limpiar(siguiente);
    else if (siguiente !== b) {
      cambiar(siguiente);
      if (siguiente.monto !== b.monto) setHecho("");
    }
    if (accion === "CONFIRMAR") void confirmar();
    if (accion === "BORRADOR") void dejarBorrador();
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

  function enviar(e: FormEvent) {
    e.preventDefault();
    void confirmar();
  }

  const tasaPlaca = datos
    ? tasa(datos.tasaAplicadaE6, fila?.decimalesTasa ?? 2)
    : fila
      ? tasa(borrador.tipo === "COMPRA" ? fila.compraE6 : fila.ventaE6, fila.decimalesTasa)
      : "—";
  const totalPlaca = datos ? pesos(aBigint(datos.montoBase), decimalesBase) : "—";
  const margenPlaca = datos ? pesos(aBigint(datos.margenBruto), decimalesBase) : "—";
  const nota = bloqueo ?? errorVista ?? recalculo;
  const sucio = borrador.monto !== "" || borrador.folio !== "" || pendiente !== null || cliente !== null;
  const usd = filas.find((f) => f.monedaCodigo === "USD");

  return (
    <section className="panel registro" aria-labelledby="registro-titulo">
      <header>
        <h2 id="registro-titulo">{pendiente ? `Borrador de las ${hora(pendiente.realizadaEn, zona)}` : "Nueva operación"}</h2>
        {sucio ? (
          <span className="hint">
            <button type="button" className="enlace" onClick={() => limpiar()}>
              {pendiente ? "Soltar" : "Limpiar"}
            </button>{" "}
            <Kbd>Esc</Kbd>
          </span>
        ) : (
          <span className="hint">
            <Kbd>C</Kbd> compra
            <Sep />
            <Kbd>V</Kbd> venta
          </span>
        )}
      </header>

      <form onSubmit={enviar} noValidate>
        <div className="seg" role="group" aria-label="Tipo de operación">
          {(["COMPRA", "VENTA"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={borrador.tipo === t} onClick={() => cambiar({ ...borradorRef.current, tipo: t, esperaDivisa: false })}>
              {TIPO[t]} <Kbd aria-hidden="true">{t === "COMPRA" ? "C" : "V"}</Kbd>
            </button>
          ))}
        </div>

        <fieldset className="campo-divisa">
          <legend>
            Divisa
            {borrador.esperaDivisa && (
              <span className="espera">
                <Sep />
                pulse {codigos.length > 1 ? `1–${Math.min(codigos.length, 9)}` : "1"}
              </span>
            )}
          </legend>
          <div className="divisas">
            {filas.map((f, i) => (
              <label key={f.monedaCodigo} className={`div${borrador.moneda === f.monedaCodigo ? " elegida" : ""}`}>
                <input
                  type="radio"
                  name="divisa"
                  className="oculto"
                  value={f.monedaCodigo}
                  checked={borrador.moneda === f.monedaCodigo}
                  onChange={() => cambiar({ ...borradorRef.current, moneda: f.monedaCodigo, esperaDivisa: false })}
                />
                <i aria-hidden="true" style={{ background: `var(--${f.monedaCodigo.toLowerCase()}, var(--neutro))` }} />
                {f.monedaCodigo}
                {i < 9 && <Kbd aria-hidden="true">{i + 1}</Kbd>}
              </label>
            ))}
          </div>
        </fieldset>

        <label>
          {montoEn(borrador.moneda)}
          <input
            ref={montoRef}
            className="monto num"
            data-monto=""
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={decimales > 0 ? `0,${"0".repeat(decimales)}` : "0"}
            value={verMonto(borrador.monto)}
            aria-invalid={hayMonto && monto === null}
            aria-describedby={nota ? "registro-nota" : undefined}
            onChange={(e) => {
              cambiar({ ...borradorRef.current, monto: limpiarMonto(e.target.value), esperaDivisa: false });
              setHecho("");
            }}
            // Al salir, el monto se lee con sus decimales («450» → «450,00»); al volver, se sueltan los ceros para seguir escribiendo
            onBlur={() => {
              const b = borradorRef.current;
              const m = montoMinimo(b, decimales);
              if (m !== null && decimales > 0) cambiar({ ...b, monto: formatearMonto(m, decimales).replaceAll(".", "") });
            }}
            onFocus={() => {
              const b = borradorRef.current;
              if (/,0*$/.test(b.monto)) cambiar({ ...b, monto: b.monto.replace(/,0*$/, "") });
            }}
          />
        </label>

        <div className="duo">
          <label>
            Folio boleta (41)
            <input
              ref={folioRef}
              className="num"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={borrador.folio}
              onChange={(e) => cambiar({ ...borradorRef.current, folio: e.target.value.replace(/\D/g, "") })}
            />
          </label>
          <label>
            Medio de pago
            <select value={borrador.medioPago} onChange={(e) => cambiar({ ...borradorRef.current, medioPago: e.target.value as MedioPago })}>
              {MEDIOS.map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={`placa${desfasada ? " desfasada" : ""}`} role="group" aria-label="Vista previa" aria-live="polite" aria-busy={desfasada}>
          <div>
            <span>Tasa</span>
            <b className="num" style={cifras(tasaPlaca)}>{tasaPlaca}</b>
          </div>
          <div className="total">
            <span>{borrador.tipo === "VENTA" ? "Cliente paga" : "Cliente recibe"}</span>
            <b className="num" style={cifras(totalPlaca)}>{totalPlaca}</b>
          </div>
          <div>
            <span>Margen</span>
            <b className="num" style={cifras(margenPlaca)}>{margenPlaca}</b>
          </div>
        </div>

        <p id="registro-nota" className="nota-placa" role="status">
          {nota && (
            <>
              <WarningIcon size={15} weight="bold" aria-hidden="true" />
              {nota}
            </>
          )}
        </p>

        {consulta !== null && (datos?.requiereFicha || cliente !== null) && (
          <FichaUaf
            vista={datos}
            umbral={parametros?.umbralFichaClienteUsd}
            decimalesUsd={usd?.decimales ?? 2}
            cliente={clienteAlDia}
            onCliente={setCliente}
            proposito={proposito}
            onProposito={setProposito}
          />
        )}

        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo.message}</p>
            {pendiente && fallo.codigo !== "PIZARRA_CAMBIO" && (
              <p className="hint">Quedó en el libro como borrador de las {hora(pendiente.realizadaEn, zona)}.</p>
            )}
            {fallo.codigo === "PIZARRA_CAMBIO" && pendiente && (
              <p>
                <button type="button" className="btn" onClick={() => void recalcular()} disabled={ocupado}>
                  Recalcular
                </button>
              </p>
            )}
          </Aviso>
        )}

        <div className="acciones">
          <button type="submit" className="btn prim" disabled={ocupado || bloqueo !== null || !hayMonto} aria-describedby={nota ? "registro-nota" : undefined}>
            {ocupado ? "Confirmando…" : "Confirmar"} <Kbd aria-hidden="true">Enter</Kbd>
          </button>
          <button type="button" className="btn" disabled={ocupado || monto === null} onClick={() => void dejarBorrador()}>
            Borrador <Kbd aria-hidden="true">B</Kbd>
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

/** El aviso de la UAF: desde el umbral (o con un cliente permanente) la operación exige ficha y propósito. */
function FichaUaf({
  vista,
  umbral,
  decimalesUsd,
  cliente,
  onCliente,
  proposito,
  onProposito,
}: {
  vista: Vista | undefined;
  umbral: string | undefined;
  decimalesUsd: number;
  cliente: ClienteElegido | null;
  onCliente: (c: ClienteElegido | null) => void;
  proposito: string;
  onProposito: (p: string) => void;
}) {
  const [q, setQ] = useState("");
  const buscando = q.trim().length >= 2;
  const clientes = useClientes(buscando ? q : "");
  const lista = buscando ? (clientes.data ?? []).slice(0, 5) : [];

  const umbralUsd = aBigint(umbral ?? "5000");
  const porMonto = vista ? aBigint(vista.equivalenteUsd) >= umbralUsd * potencia10(decimalesUsd) : true;
  const titulo = !vista?.requiereFicha
    ? "Cliente de la operación"
    : porMonto
      ? `Desde US$ ${formatearMonto(umbralUsd, 0)} la UAF exige la ficha del cliente`
      : "Cliente con relación permanente: la UAF exige su ficha completa";

  return (
    <Aviso tono="advertencia" className="ficha">
      <p className="ficha-titulo">{titulo}</p>
      {cliente ? (
        <div className="cliente-elegido">
          <p>
            <b>{cliente.nombre ?? `Cliente N.º ${cliente.id}`}</b>
            {cliente.documento && (
              <span className="doc">
                <Sep />
                {cliente.documento}
              </span>
            )}{" "}
            <button type="button" className="enlace" onClick={() => onCliente(null)}>
              Cambiar
            </button>
          </p>
          {cliente.faltantes.length > 0 && (
            <p className="falta">
              Ficha incompleta: falta {cliente.faltantes.join(", ")}.{" "}
              <Link to={`/clientes?id=${cliente.id}`} className="completar-ficha">
                Completar la ficha
              </Link>
            </p>
          )}
        </div>
      ) : (
        <>
          <label>
            Buscar cliente
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o documento" autoComplete="off" />
          </label>
          {lista.length > 0 && (
            <ul className="resultados" aria-label="Clientes encontrados">
              {lista.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="resultado"
                    onClick={() => {
                      onCliente({ id: c.id, nombre: c.nombre, documento: documentoDe(c), faltantes: c.faltantes });
                      setQ("");
                    }}
                  >
                    <b>{c.nombre}</b>
                    <span className="doc">{documentoDe(c)}</span>
                    {c.faltantes.length > 0 && <span className="falta">Ficha incompleta</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {buscando && clientes.isSuccess && !clientes.isPlaceholderData && lista.length === 0 && (
            <p className="hint">Ningún cliente coincide con «{q.trim()}».</p>
          )}
        </>
      )}
      <label>
        Propósito de la operación
        <input value={proposito} onChange={(e) => onProposito(e.target.value)} placeholder="Turismo, ahorro, pago a un proveedor…" autoComplete="off" />
      </label>
      <p>
        <Link to="/clientes?nuevo=1" className="crear-ficha">
          Crear ficha
        </Link>
      </p>
    </Aviso>
  );
}

