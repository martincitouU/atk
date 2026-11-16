import { aBigint } from "../../api/esquemas.ts";
import {
  ArrowsDownUpIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  HandDepositIcon,
  HandWithdrawIcon,
  LockKeyIcon,
  MoneyIcon,
  ReceiptIcon,
  ScalesIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorNegocio } from "../../api/cliente.ts";
import { useAbrirTurno, useCatalogo, useParametros, useSesion } from "../../api/consultas.ts";
import { usePuede } from "../../api/permisos.ts";
import type { Cierre as RespuestaCierre } from "../../api/esquemas.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { useCinta, type GrupoCinta } from "../../componentes/Cinta.tsx";
import { Sep, separar } from "../../componentes/Sep.tsx";
import { conSimbolo, DATOS_DE_EJEMPLO, diaLargo, fechaEn, hora, useAhora, ZONA_CASA } from "../../comun.ts";
import "../../estilos/cierre.css";
import { ConteoTurno, Diferencia, type ConteoApi, type MonedaCatalogo } from "./Conteo.tsx";
import { Movimientos, type MovimientosApi } from "./Movimientos.tsx";

/**
 * El Cierre del día: abrir el turno, contar la caja por denominación y
 * cerrarlo; y los gastos, retiros e ingresos de la caja. Su color de función
 * es el amarillo de advertencia, el de los descuadres.
 */
export function Cierre() {
  const sesion = useSesion();
  const { data: parametros } = useParametros();
  const zona = parametros?.zonaHoraria ?? ZONA_CASA;
  const hoy = fechaEn(useAhora(60_000), zona);
  const [ultimo, setUltimo] = useState<RespuestaCierre | null>(null);
  const turno = sesion.data?.turno ?? null;
  const conteo = useRef<ConteoApi>(null);
  const movimientos = useRef<MovimientosApi>(null);
  const navegar = useNavigate();
  const puedeAjustar = usePuede()("ajustarCaja");

  // La cinta del Cierre: llama a lo mismo que los botones de la pantalla
  const grupos: GrupoCinta[] = [
    {
      nombre: "Turno",
      comandos: turno
        ? [{ id: "cerrar", etiqueta: "Cerrar turno", Icono: LockKeyIcon, grande: true, tono: "verde", alPulsar: () => conteo.current?.cerrar() }]
        : [],
      nota: turno ? [`Abierto desde ${hora(turno.abiertoEn, zona)}`, `Caja ${turno.cajaId}`] : ["Sin turno abierto"],
    },
    {
      nombre: "Movimientos de caja",
      comandos: [
        { id: "gasto", etiqueta: "Gasto", Icono: ReceiptIcon, grande: true, alPulsar: () => movimientos.current?.elegir("GASTO") },
        { id: "retiro", etiqueta: "Retiro", Icono: HandWithdrawIcon, grande: true, alPulsar: () => movimientos.current?.elegir("RETIRO") },
        { id: "ingreso", etiqueta: "Ingreso", Icono: HandDepositIcon, grande: true, alPulsar: () => movimientos.current?.elegir("INGRESO") },
        ...(puedeAjustar
          ? [{ id: "ajuste", etiqueta: "Ajuste", Icono: ScalesIcon, grande: true, alPulsar: () => movimientos.current?.elegir("AJUSTE") }]
          : []),
      ],
    },
    ...(turno
      ? [
          {
            nombre: "Conteo",
            comandos: [
              { id: "contar", etiqueta: "Contar billetes", Icono: MoneyIcon, grande: true, alPulsar: () => conteo.current?.contar() },
              { id: "elegir", etiqueta: "Elegir divisa", Icono: ArrowsDownUpIcon, tecla: "↑↓", alPulsar: () => conteo.current?.elegir() },
            ],
          },
        ]
      : []),
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
      ],
    },
  ];
  useCinta(grupos);

  return (
    <div className="cierre">
      <header className="cierre-letrero">
        <div className="cierre-letrero-in">
          <h1>Cierre del día</h1>
          <p className="cierre-dia">
            {diaLargo(hoy)}
            {DATOS_DE_EJEMPLO && (
              <>
                <Sep />
                <span className="sint">datos de ejemplo</span>
              </>
            )}
          </p>
          <p className="cierre-turno">
            {sesion.data
              ? separar(
                  turno
                    ? `Caja ${turno.cajaId} · turno abierto desde las ${hora(turno.abiertoEn, zona)} · ${sesion.data.usuario.nombre}`
                    : `Sin turno abierto · ${sesion.data.usuario.nombre}`,
                )
              : " "}
          </p>
        </div>
      </header>

      {sesion.isPending && (
        <div className="cierre-esperando" aria-busy="true">
          <span className="esqueleto" style={{ width: "40%" }} />
        </div>
      )}
      {sesion.isError && (
        <Aviso tono="error" rol="alert">
          <p>{sesion.error instanceof ErrorNegocio ? sesion.error.message : "No se pudo leer la sesión."}</p>
        </Aviso>
      )}
      {sesion.isSuccess &&
        (turno ? (
          <ConteoTurno ref={conteo} turno={turno} zona={zona} onCerrado={setUltimo} />
        ) : (
          <>
            {ultimo && <ArqueoCerrado cierre={ultimo} zona={zona} />}
            <AbrirTurno />
          </>
        ))}

      <Movimientos ref={movimientos} hoy={hoy} />

      <p className="cierre-nota">Las diferencias no se ajustan solas: un supervisor o el administrador registra un «Ajuste», junto a los gastos.</p>
    </div>
  );
}

/** Sin turno: abrirlo en una caja (el selector se oculta si hay una sola). */
function AbrirTurno() {
  const { data: catalogo } = useCatalogo();
  const abrir = useAbrirTurno();
  const [elegida, setElegida] = useState<number | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const cajas = catalogo?.cajas ?? [];
  const cajaId = elegida ?? cajas[0]?.id ?? null;
  const unica = cajas.length === 1 ? cajas[0] : undefined;

  async function abrirTurno() {
    if (cajaId === null || abrir.isPending) return;
    setFallo(null);
    try {
      await abrir.mutateAsync(cajaId);
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo abrir el turno. Inténtelo de nuevo.");
    }
  }

  return (
    <section className="panel cierre-abrir" aria-labelledby="abrir-titulo">
      <header>
        <h2 id="abrir-titulo">Abrir turno</h2>
      </header>
      <div className="cierre-abrir-cuerpo">
        <p>No hay un turno abierto. Ábralo para operar en la Ventanilla; al final del día, la caja se cuenta aquí.</p>
        <div className="cierre-abrir-fila">
          {cajas.length > 1 && (
            <label>
              Caja
              <select value={cajaId ?? ""} onChange={(e) => setElegida(Number(e.target.value))}>
                {cajas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn prim" disabled={cajaId === null || abrir.isPending} onClick={() => void abrirTurno()}>
            {abrir.isPending ? "Abriendo…" : unica ? `Abrir turno en ${unica.nombre}` : "Abrir turno"}
          </button>
        </div>
        {fallo && (
          <Aviso tono="error" rol="alert">
            <p>{fallo}</p>
          </Aviso>
        )}
      </div>
    </section>
  );
}

/** Lo que quedó guardado al cerrar: el arqueo por moneda, con su diferencia. */
function ArqueoCerrado({ cierre, zona }: { cierre: RespuestaCierre; zona: string }) {
  const { data: catalogo } = useCatalogo();
  const monedas = new Map<string, MonedaCatalogo>(catalogo ? [catalogo.monedaBase, ...catalogo.divisas].map((m) => [m.codigo, m]) : []);
  const conDiferencia = cierre.arqueo.filter((f) => f.diferencia !== "0").length;
  return (
    <section className="panel cierre-cerrado" aria-labelledby="cerrado-titulo">
      <header>
        <h2 id="cerrado-titulo">
          <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
          <span>
            Turno cerrado{cierre.turno.cerradoEn ? ` a las ${hora(cierre.turno.cerradoEn, zona)}` : ""}
            <Sep />
            Caja {cierre.turno.cajaId}
          </span>
        </h2>
        <span className="hint">
          {conDiferencia === 0 ? "Todo cuadra" : `${conDiferencia} ${conDiferencia === 1 ? "moneda" : "monedas"} con diferencia`}
        </span>
      </header>
      <table>
        <thead>
          <tr>
            <th scope="col">Moneda</th>
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
          {cierre.arqueo.map((f) => {
            const m = monedas.get(f.monedaCodigo) ?? { codigo: f.monedaCodigo, nombre: f.monedaCodigo, simbolo: "", decimales: f.decimales };
            return (
              <tr key={f.monedaCodigo}>
                <th scope="row">{f.monedaCodigo}</th>
                <td className="r num">{montoCon(f.saldoSistema, m)}</td>
                <td className="r num">{montoCon(f.saldoContado, m)}</td>
                <td className="r">
                  <Diferencia diferencia={aBigint(f.diferencia)} moneda={m} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const montoCon = (monto: string, m: MonedaCatalogo) => conSimbolo(aBigint(monto), m);
