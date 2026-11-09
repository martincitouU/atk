import { aBigint, type Catalogo, type FilaPizarra, type Moneda, type Parametros } from "../api/esquemas.ts";
import { formatearMonto, potencia10 } from "@atk/shared/dinero";
import { ClockCounterClockwiseIcon, CurrencyCircleDollarIcon, LockSimpleIcon, UsersIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { ErrorNegocio } from "../api/cliente.ts";
import { useCatalogo, useParametros, usePizarra } from "../api/consultas.ts";
import { usePuede } from "../api/permisos.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { useCinta } from "../componentes/Cinta.tsx";
import { Divisa } from "../componentes/Divisa.tsx";
import { Sep } from "../componentes/Sep.tsx";
import "../estilos/clientes.css";
import { montoDivisa } from "./Ventanilla/comun.ts";

/** Un billete en su unidad: 10000n (centavos de USD) → «100»; con fracción, «0,50». */
function billete(valor: string, decimales: number): string {
  const v = aBigint(valor);
  const unidad = potencia10(decimales);
  return v % unidad === 0n ? formatearMonto(v / unidad, 0) : formatearMonto(v, decimales);
}

const siNo = (v: boolean) => (v ? "Sí" : "No");

/** «720 min» → «720 min (12 h)». */
function minutos(n: number): string {
  if (n < 60 || n % 60 !== 0) return `${n} min`;
  return `${n} min (${n / 60} h)`;
}

function mensajeDe(error: unknown, otro: string): string {
  return error instanceof ErrorNegocio ? error.message : otro;
}

/** Cada parámetro: qué es, su valor y para qué sirve, en el idioma de la ventanilla. */
function filasParametros(p: Parametros, catalogo: Catalogo | undefined): { nombre: string; valor: string; para: string }[] {
  const usd = (monto: string) => `US$ ${formatearMonto(aBigint(monto), 0)}`;
  const cajas = catalogo?.cajas.map((c) => c.nombre).join(", ");
  return [
    {
      nombre: "Ficha del cliente",
      valor: `desde ${usd(p.umbralFichaClienteUsd)}`,
      para: "Desde este equivalente en dólares, la operación exige identificar al cliente (UAF).",
    },
    {
      nombre: "Reporte de operaciones en efectivo",
      valor: `sobre ${usd(p.umbralRoeUsd)}`,
      para: "Las operaciones sobre este monto entran al ROE de la UAF.",
    },
    {
      nombre: "Vigencia de la pizarra",
      valor: minutos(p.vigenciaCotizacionMinutos),
      para: "Pasado este tiempo, una cotización vence y no se puede operar en esa divisa.",
    },
    {
      nombre: "Folio del DTE al confirmar",
      valor: p.folioObligatorioAlConfirmar ? "Obligatorio" : "Opcional",
      para: "Si confirmar una operación exige el tipo (41 o 34) y el folio del documento tributario.",
    },
    {
      nombre: "Reverso",
      valor: p.reversoRequiereSupervisor ? "Solo supervisor o admin" : "Cualquier cajero",
      para: "Quién puede reversar una operación confirmada.",
    },
    {
      nombre: "Saldo negativo en caja",
      valor: p.permitirSaldoNegativo ? "Permitido" : "No permitido",
      para: "Si una venta puede dejar una divisa bajo cero en la caja.",
    },
    {
      nombre: "Cierre de sesión",
      valor: `tras ${minutos(p.sesionInactividadMinutos)} sin actividad`,
      para: "La sesión se cierra sola y vuelve a la pantalla de entrada.",
    },
    { nombre: "Zona horaria", valor: p.zonaHoraria, para: "Define dónde empieza y termina el día de la casa." },
    ...(cajas ? [{ nombre: "Cajas", valor: cajas, para: "Las cajas habilitadas para abrir turno." }] : []),
  ];
}

function Panel({ titulo, id, nota, children }: { titulo: string; id: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel config-panel" aria-labelledby={id}>
      <header>
        <h2 id={id}>{titulo}</h2>
        {nota && <p className="hint">{nota}</p>}
      </header>
      {children}
    </section>
  );
}

function Esqueleto({ filas }: { filas: number }) {
  return (
    <div className="config-esqueleto" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <span key={i} className="esqueleto" style={{ width: `${80 - i * 9}%` }} />
      ))}
    </div>
  );
}

function Divisas({ catalogo, pizarra }: { catalogo: Catalogo; pizarra: FilaPizarra[] | undefined }) {
  const filas = new Map((pizarra ?? []).map((f) => [f.monedaCodigo, f]));
  const base: Moneda = catalogo.monedaBase;
  return (
    <div className="config-tabla">
      <table aria-labelledby="config-divisas">
        <thead>
          <tr>
            <th scope="col">Divisa</th>
            <th scope="col" className="config-col-extra">
              Nombre
            </th>
            <th scope="col" className="config-col-extra">
              Símbolo
            </th>
            <th scope="col" className="r">
              Decimales
            </th>
            <th scope="col" className="r">
              Decimales de la tasa
            </th>
            <th scope="col" className="r">
              Monto mínimo
            </th>
          </tr>
        </thead>
        <tbody>
          {catalogo.divisas.map((d) => {
            const fila = filas.get(d.codigo);
            return (
              <tr key={d.codigo}>
                <td>
                  <Divisa codigo={d.codigo} />
                </td>
                <td className="config-col-extra">{d.nombre}</td>
                <td className="num config-col-extra">{d.simbolo}</td>
                <td className="r num">{d.decimales}</td>
                <td className="r num">{fila ? fila.decimalesTasa : "—"}</td>
                <td className="r num">{fila ? montoDivisa(fila.montoMinimo, fila) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>
              Moneda base: <b>{base.codigo}</b>
              <Sep />
              {base.nombre} ({base.simbolo}), {base.decimales === 0 ? "sin decimales" : `${base.decimales} decimales`}. Las tasas se publican en pesos
              por unidad.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Denominaciones({ catalogo }: { catalogo: Catalogo }) {
  const monedas = [...catalogo.divisas, catalogo.monedaBase];
  return (
    <ul className="config-denominaciones">
      {monedas.map((m) => {
        const valores = catalogo.denominaciones[m.codigo] ?? [];
        return (
          <li key={m.codigo}>
            <Divisa codigo={m.codigo} />
            {valores.length > 0 ? (
              <ul className="config-billetes" aria-label={`Billetes de ${m.nombre}`}>
                {valores.map((v) => (
                  <li key={v} className="num">
                    {billete(v, m.decimales)}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="hint">Sin denominaciones</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Configuración, en solo lectura: divisas, denominaciones y parámetros de la
 * instalación. Editarlos (RF-22 y RF-24) espera su backend.
 */
export function Configuracion() {
  const catalogo = useCatalogo();
  const pizarra = usePizarra();
  const parametros = useParametros();
  const navegar = useNavigate();
  const admin = usePuede()("administrar");

  // Solo lectura: la cinta dice por qué y lleva a lo que sí se puede hacer
  useCinta([
    { nombre: "Configuración", comandos: [], nota: ["Solo lectura", "Se cambia con el equipo de ATK"] },
    ...(admin
      ? [
          {
            nombre: "Administración",
            comandos: [
              { id: "usuarios", etiqueta: "Usuarios", Icono: UsersIcon, grande: true, alPulsar: () => void navegar("/usuarios") },
              { id: "auditoria", etiqueta: "Auditoría", Icono: ClockCounterClockwiseIcon, grande: true, alPulsar: () => void navegar("/auditoria") },
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
  ]);

  return (
    <div className="config">
      <header className="cartel-seccion gris">
        <div className="cartel-seccion-in">
          <div className="cartel-titulo">
            <h1>Configuración</h1>
            <p>Divisas, billetes y reglas de la casa</p>
          </div>
          <p className="config-lectura">
            <LockSimpleIcon size={16} weight="bold" aria-hidden="true" />
            Solo lectura
          </p>
        </div>
      </header>

      <Aviso tono="advertencia" className="config-aviso">
        La configuración se cambia, por ahora, con el equipo de ATK.
      </Aviso>

      <Panel titulo="Divisas" id="config-divisas">
        {catalogo.isError ? (
          <div className="clientes-estado">
            <Aviso tono="error" rol="alert">
              {mensajeDe(catalogo.error, "No se pudo cargar el catálogo de divisas.")}
            </Aviso>
          </div>
        ) : catalogo.data ? (
          <Divisas catalogo={catalogo.data} pizarra={pizarra.data} />
        ) : (
          <Esqueleto filas={3} />
        )}
      </Panel>

      <div className="config-dos">
        <Panel titulo="Parámetros" id="config-parametros">
          {parametros.isError ? (
            <div className="clientes-estado">
              <Aviso tono="error" rol="alert">
                {mensajeDe(parametros.error, "No se pudieron cargar los parámetros.")}
              </Aviso>
            </div>
          ) : parametros.data ? (
            <dl className="config-parametros">
              {filasParametros(parametros.data, catalogo.data).map((f) => (
                <div key={f.nombre}>
                  <dt>{f.nombre}</dt>
                  <dd className="config-valor">{f.valor}</dd>
                  <dd className="config-para">{f.para}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <Esqueleto filas={6} />
          )}
        </Panel>

        <Panel titulo="Denominaciones" id="config-denominaciones" nota="Ayuda para contar la caja en el cierre">
          {catalogo.isError ? (
            <div className="clientes-estado">
              <Aviso tono="error" rol="alert">
                {mensajeDe(catalogo.error, "No se pudieron cargar las denominaciones.")}
              </Aviso>
            </div>
          ) : catalogo.data ? (
            <Denominaciones catalogo={catalogo.data} />
          ) : (
            <Esqueleto filas={4} />
          )}
        </Panel>
      </div>
    </div>
  );
}
