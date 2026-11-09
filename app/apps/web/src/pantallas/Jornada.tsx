import { aBigint, type FilaPizarra, type Moneda, type Operacion } from "../api/esquemas.ts";
import { convertirABase, formatearMonto } from "@atk/shared/dinero";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CalendarBlankIcon,
  CalendarCheckIcon,
  CashRegisterIcon,
  CurrencyCircleDollarIcon,
} from "@phosphor-icons/react";
import { useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ErrorNegocio } from "../api/cliente.ts";
import { useCatalogo, useLibroDelDia, useParametros, usePizarra, useResumen } from "../api/consultas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { useCinta, type GrupoCinta } from "../componentes/Cinta.tsx";
import { Divisa } from "../componentes/Divisa.tsx";
import { Sep } from "../componentes/Sep.tsx";
import { conSimbolo, DATOS_DE_EJEMPLO, diaLargo, fechaEn, hora, pesos, TIPO, useAhora, ZONA_CASA } from "../comun.ts";
import "../estilos/jornada.css";

type MonedaInfo = Pick<Moneda, "codigo" | "nombre" | "simbolo" | "decimales">;

const ESTADO = {
  CONFIRMADA: { texto: "Confirmada", clase: "ok" },
  BORRADOR: { texto: "Borrador", clase: "obra" },
  REVERSADA: { texto: "Reversada", clase: "rev" },
} as const;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La Jornada, pensada para el teléfono: el día elegido, los saldos de la caja
 * por moneda, el margen y los gastos, y las operaciones. Su color de función
 * es el café de los letreros de turismo. En el PC lleva la estructura de
 * escritorio (vuelta 3): cinta, paneles con barra de título y filas compactas.
 */
export function Jornada() {
  const { data: parametros } = useParametros();
  const zona = parametros?.zonaHoraria ?? ZONA_CASA;
  const hoy = fechaEn(useAhora(60_000), zona);
  const [busqueda, setBusqueda] = useSearchParams();
  const pedida = busqueda.get("fecha");
  const fecha = pedida && FECHA.test(pedida) && pedida <= hoy ? pedida : hoy;
  const esHoy = fecha === hoy;

  const resumen = useResumen(fecha);
  const libro = useLibroDelDia(fecha);
  const { data: catalogo } = useCatalogo();
  const { data: pizarra } = usePizarra();

  function cambiarDia(nueva: string) {
    if (!FECHA.test(nueva)) return;
    setBusqueda(nueva === hoy ? {} : { fecha: nueva }, { replace: true });
  }

  const monedas: MonedaInfo[] = catalogo ? [...catalogo.divisas, catalogo.monedaBase] : [];
  const base = catalogo?.monedaBase ?? { codigo: "CLP", decimales: 0 };
  const borradores = resumen.data?.borradoresPendientes;
  const campoFecha = useRef<HTMLInputElement>(null);
  const navegar = useNavigate();

  // La cinta (en el PC): lo mismo que el letrero y los enlaces de la pantalla
  const grupos: GrupoCinta[] = [
    {
      nombre: "Día",
      comandos: [
        { id: "hoy", etiqueta: "Hoy", Icono: CalendarCheckIcon, grande: true, deshabilitado: esHoy, alPulsar: () => cambiarDia(hoy) },
        { id: "otro", etiqueta: "Otro día", Icono: CalendarBlankIcon, alPulsar: () => campoFecha.current?.focus() },
        {
          id: "actualizar",
          etiqueta: "Actualizar",
          Icono: ArrowsClockwiseIcon,
          alPulsar: () => {
            void resumen.refetch();
            void libro.refetch();
          },
        },
      ],
      nota: esHoy ? undefined : [diaLargo(fecha)],
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
        { id: "cierre", etiqueta: "Cierre del día", Icono: CashRegisterIcon, tecla: "F2", grande: true, alPulsar: () => void navegar("/cierre") },
      ],
    },
  ];
  useCinta(grupos);

  return (
    <div className="jornada">
      <header className="jornada-letrero">
        <div className="jornada-letrero-in">
          <div className="jornada-titulo">
            <h1>Jornada</h1>
            <p className="jornada-dia">
              {esHoy ? (
                <>
                  Hoy
                  <Sep />
                  {diaLargo(fecha)}
                </>
              ) : (
                diaLargo(fecha)
              )}
              {DATOS_DE_EJEMPLO && (
                <>
                  <Sep />
                  <span className="sint">datos de ejemplo</span>
                </>
              )}
            </p>
          </div>
          <div className="jornada-fecha">
            <label>
              Ver otro día
              <input ref={campoFecha} type="date" value={fecha} max={hoy} onChange={(e) => cambiarDia(e.target.value)} />
            </label>
            {!esHoy && (
              <button type="button" className="btn-letrero" onClick={() => cambiarDia(hoy)}>
                Volver a hoy
              </button>
            )}
          </div>
        </div>
      </header>

      {resumen.isError && (
        <Aviso tono="error" rol="alert">
          <p>{resumen.error instanceof ErrorNegocio ? resumen.error.message : "No se pudo leer el resumen de la jornada."}</p>
          <p>
            <button type="button" className="enlace" onClick={() => void resumen.refetch()}>
              Reintentar
            </button>
          </p>
        </Aviso>
      )}

      <div className="jornada-cuerpo">
        <div className="jornada-col">
          <Link to="/ventanilla" className={`jornada-borradores${borradores ? " hay" : ""}`}>
            <span>
              Borradores pendientes: <b className="num">{borradores ?? "—"}</b>
            </span>
            <span className="ir">
              Ventanilla
              <ArrowRightIcon size={16} weight="bold" aria-hidden="true" />
            </span>
          </Link>

          <Saldos saldos={resumen.data?.saldos} monedas={monedas} pizarra={pizarra} base={catalogo?.monedaBase} esHoy={esHoy} />

          <section className="jornada-bloque" aria-labelledby="dia-titulo">
            <h2 id="dia-titulo">{esHoy ? "El día" : "Ese día"}</h2>
            <dl className="jornada-cifras">
              <div>
                <dt>Margen del día</dt>
                <dd className="num">{resumen.data ? pesos(aBigint(resumen.data.margenBruto), base.decimales) : <span className="esqueleto" />}</dd>
              </div>
              <div>
                <dt>Gastos</dt>
                <dd className="num">{resumen.data ? pesos(aBigint(resumen.data.gastosTotal), base.decimales) : <span className="esqueleto" />}</dd>
              </div>
              <div className="ancho">
                <dt>Operaciones</dt>
                <dd>
                  {resumen.data ? (
                    <>
                      {resumen.data.confirmadas} {resumen.data.confirmadas === 1 ? "confirmada" : "confirmadas"}
                      <Sep />
                      {resumen.data.reversadas} {resumen.data.reversadas === 1 ? "reversada" : "reversadas"}
                    </>
                  ) : (
                    <span className="esqueleto" />
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <Operaciones libro={libro} monedas={monedas} zona={zona} esHoy={esHoy} baseDecimales={base.decimales} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Los saldos por moneda, en filas grandes. La barra de la proporción en pesos
 * (a la referencia de la pizarra) aparece solo si aporta: con dos o más
 * monedas con saldo y todas las referencias publicadas.
 */
function Saldos({
  saldos,
  monedas,
  pizarra,
  base,
  esHoy,
}: {
  saldos: { monedaCodigo: string; decimales: number; saldo: string }[] | undefined;
  monedas: MonedaInfo[];
  pizarra: FilaPizarra[] | undefined;
  base: MonedaInfo | undefined;
  esHoy: boolean;
}) {
  const porCodigo = new Map((saldos ?? []).map((s) => [s.monedaCodigo, aBigint(s.saldo)]));
  const referencias = new Map((pizarra ?? []).map((f) => [f.monedaCodigo, f.referenciaE6]));
  const filas = monedas.filter((m) => porCodigo.has(m.codigo)).map((m) => ({ moneda: m, saldo: porCodigo.get(m.codigo) ?? 0n }));

  // El valor en pesos de cada saldo, al más cercano (es una estimación, no un precio)
  const enPesos = new Map<string, bigint>();
  for (const { moneda, saldo } of filas) {
    if (base && moneda.codigo === base.codigo) {
      enPesos.set(moneda.codigo, saldo);
      continue;
    }
    const ref = referencias.get(moneda.codigo);
    if (ref == null || !base) continue;
    enPesos.set(
      moneda.codigo,
      convertirABase({
        montoDivisa: saldo,
        decimalesDivisa: moneda.decimales,
        tasaE6: aBigint(ref),
        decimalesBase: base.decimales,
        redondeo: "CERCANO",
      }),
    );
  }
  const positivos = filas.filter((f) => f.saldo > 0n);
  const total = positivos.reduce((suma, f) => suma + (enPesos.get(f.moneda.codigo) ?? 0n), 0n);
  const conBarra = base !== undefined && positivos.length >= 2 && positivos.every((f) => enPesos.has(f.moneda.codigo)) && total > 0n;

  return (
    <section className="jornada-bloque" aria-labelledby="saldos-titulo">
      <h2 id="saldos-titulo">
        Saldos en caja <span className="hint">{esHoy ? "ahora" : "de ahora, no del día elegido"}</span>
      </h2>
      {saldos === undefined ? (
        <ul className="saldos" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <li key={i}>
              <span className="esqueleto" style={{ width: "70%" }} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="saldos">
          {filas.map(({ moneda, saldo }) => {
            const valor = enPesos.get(moneda.codigo);
            const milesimas = conBarra && valor !== undefined && saldo > 0n ? Number((valor * 1000n) / total) : null;
            const color = `var(--${moneda.codigo.toLowerCase()}, var(--neutro))`;
            return (
              <li key={moneda.codigo}>
                <span className="saldo-cod">
                  <i aria-hidden="true" style={{ background: color }} />
                  {moneda.codigo}
                </span>
                <span className="saldo-nom">{moneda.nombre}</span>
                <b className="saldo-monto num">{conSimbolo(saldo, moneda)}</b>
                {milesimas !== null && valor !== undefined && base && (
                  <>
                    <span className="saldo-eq">
                      {moneda.codigo !== base.codigo && (
                        <>
                          ≈ {pesos(valor, base.decimales)}
                          <Sep />
                        </>
                      )}
                      {Math.round(milesimas / 10)}&nbsp;%
                    </span>
                    <span className="saldo-barra" aria-hidden="true">
                      <i style={{ width: `${milesimas / 10}%`, background: color }} />
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {saldos !== undefined && conBarra && (
        <p className="saldos-nota">El % es la parte de la caja valorizada en pesos, a la referencia de la pizarra.</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function Operaciones({
  libro,
  monedas,
  zona,
  esHoy,
  baseDecimales,
}: {
  libro: ReturnType<typeof useLibroDelDia>;
  monedas: MonedaInfo[];
  zona: string;
  esHoy: boolean;
  baseDecimales: number;
}) {
  const ops: Operacion[] = libro.data ?? [];
  const decimales = new Map(monedas.map((m) => [m.codigo, m.decimales]));

  return (
    <section className="jornada-bloque jornada-ops" aria-labelledby="ops-titulo">
      <h2 id="ops-titulo">
        {esHoy ? "Operaciones de hoy" : "Operaciones del día"}
        {libro.isSuccess && <span className="hint">{ops.length}</span>}
      </h2>
      {libro.isPending && (
        <ul className="ops" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <span className="esqueleto" style={{ width: "80%" }} />
            </li>
          ))}
        </ul>
      )}
      {libro.isError && (
        <Aviso tono="error" rol="alert">
          <p>{libro.error instanceof ErrorNegocio ? libro.error.message : "No se pudieron leer las operaciones."}</p>
        </Aviso>
      )}
      {libro.isSuccess && ops.length === 0 && (
        <p className="vacio">{esHoy ? "Todavía no hay operaciones hoy." : "Ese día no hay operaciones registradas."}</p>
      )}
      {ops.length > 0 && (
        <ul className="ops">
          {ops.map((op) => {
            const estado = ESTADO[op.estado];
            return (
              <li key={op.id} className={op.estado === "REVERSADA" ? "reversada" : op.estado === "BORRADOR" ? "borrador" : undefined}>
                <span className="op-divisa">
                  <Divisa codigo={op.monedaCodigo} />
                  <b className="num op-monto">{formatearMonto(aBigint(op.montoDivisa), decimales.get(op.monedaCodigo) ?? 2)}</b>
                </span>
                <span className={`est ${estado.clase}`}>{estado.texto}</span>
                <span className="op-pie">
                  <span className="num">{hora(op.realizadaEn, zona)}</span>
                  <Sep />
                  {TIPO[op.tipo]}
                  <Sep />
                  <span className="num op-pesos">{pesos(aBigint(op.montoBase), baseDecimales)}</span>
                </span>
                {op.motivoReverso && <span className="op-motivo">{op.motivoReverso}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
