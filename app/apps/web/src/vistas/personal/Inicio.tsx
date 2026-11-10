// Inicio del personal. Todos ven su turno y la pizarra; supervisores y
// admin ven además cómo va el día en la casa (GET /api/resumen, RF-16),
// pensado también para revisarlo desde el teléfono.

import { ArrowRight, Plus, Wallet } from "lucide-react";
import { Link } from "react-router";
import { useCatalogo, useMonedaBase, useOperaciones, useOrdenMonedas, usePizarra, useResumen } from "../../api/consultas.ts";
import type { Turno } from "../../api/tipos.ts";
import { EnlaceBoton } from "../../componentes/Boton.tsx";
import { DivisaCompacta } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { GrillaIndicadores, Indicador } from "../../componentes/Indicador.tsx";
import { Monto, Tasa } from "../../componentes/Monto.tsx";
import { Columnas, Grilla, Pagina } from "../../componentes/Pagina.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearDia, formatearHora, hoy } from "../../lib/fechas.ts";
import { ESTADO_OPERACION, TIPO_OPERACION } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import { AbrirTurno } from "./Caja.tsx";
import css from "./Personal.module.css";

export function Inicio() {
  const { usuario, turnoAbierto } = usePersonal();
  const veElDia = usuario.rol !== "CAJERO";

  return (
    <Pagina>
      <EncabezadoPagina titulo={`Hola, ${usuario.nombre.split(" ")[0]}`} descripcion={formatearDia(hoy())} />
      <MiTurno turno={turnoAbierto} />
      {veElDia && <ElDia />}
      {turnoAbierto ? (
        <Columnas lateral={<PizarraBreve />}>
          <UltimasDelTurno turnoId={turnoAbierto.id} />
        </Columnas>
      ) : (
        <Grilla minimo={360}>
          <PizarraBreve />
        </Grilla>
      )}
    </Pagina>
  );
}

/** El turno de la persona: abrirlo o, si ya está abierto, operar. Lleva el único botón magenta. */
function MiTurno({ turno }: { turno: Turno | null }) {
  const catalogo = useCatalogo();
  const cajas = catalogo.data?.cajas ?? [];

  if (turno) {
    const caja = cajas.find((c) => c.id === turno.cajaId);
    return (
      <Tarjeta elevada>
        <div className={css.turno}>
          <div className={css.turnoTexto}>
            <Etiqueta tono="vivo">Turno abierto</Etiqueta>
            <p className={css.turnoTitulo}>
              {caja?.nombre ?? `Caja ${turno.cajaId}`}, desde las {formatearHora(turno.abiertoEn)}
            </p>
          </div>
          <div className={css.turnoAcciones}>
            <EnlaceBoton to="/caja" icono={<Wallet size={18} aria-hidden />}>
              Ver caja
            </EnlaceBoton>
            <EnlaceBoton to="/operaciones/nueva" variante="primario" icono={<Plus size={18} aria-hidden />}>
              Nueva operación
            </EnlaceBoton>
          </div>
        </div>
      </Tarjeta>
    );
  }

  return <AbrirTurno titulo="No tienes un turno abierto" descripcion="Para operar, abre un turno en una caja. Después registra el fondo inicial." />;
}

/** Cifras del día para supervisores y admin. */
function ElDia() {
  const resumen = useResumen();
  const ordenar = useOrdenMonedas();
  const monedaBase = useMonedaBase();

  return (
    <section className={css.seccion} aria-labelledby="titulo-dia">
      <div className={css.seccionCabecera}>
        <h2 id="titulo-dia" className={css.seccionTitulo}>
          Hoy en la casa
        </h2>
        <EnlaceBoton to="/operaciones" variante="texto" tamano="chico">
          Ver operaciones <ArrowRight size={16} aria-hidden />
        </EnlaceBoton>
      </div>
      <ConDatos consulta={resumen} cargando="Cargando el resumen del día…">
        {(dia) => (
          <>
            <GrillaIndicadores>
              <Indicador
                etiqueta="Margen bruto del día"
                valor={<Monto valor={dia.margen.bruto} moneda={monedaBase} />}
                detalle="Se actualiza con cada operación"
                enVivo
              />
              <Indicador
                etiqueta="Operaciones confirmadas"
                valor={dia.operaciones.confirmadas}
                detalle={
                  dia.operaciones.reversadas ? `${dia.operaciones.reversadas} ${dia.operaciones.reversadas === 1 ? "reversada" : "reversadas"}` : "Sin reversos"
                }
              />
              <Indicador
                etiqueta="Gastos"
                valor={<Monto valor={dia.gastos.total} moneda={monedaBase} />}
                detalle={`${dia.gastos.cantidad} ${dia.gastos.cantidad === 1 ? "registrado" : "registrados"}`}
              />
              <Indicador etiqueta="Borradores sin confirmar" valor={dia.borradoresPendientes} detalle="Se cierran antes del arqueo" />
            </GrillaIndicadores>

            <Columnas
              lateral={
                <Tarjeta titulo="Turnos abiertos">
                  {dia.turnosAbiertos.length === 0 ? (
                    <p className={css.secundario}>Ninguno por ahora.</p>
                  ) : (
                    <ul className={css.lista}>
                      {dia.turnosAbiertos.map((t) => (
                        <li key={t.turno.id} className={css.filaLista}>
                          <span>
                            {t.cajaNombre} · {t.usuarioNombre}
                          </span>
                          <span className={css.secundario}>desde {formatearHora(t.turno.abiertoEn)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Tarjeta>
              }
            >
              <Tarjeta titulo="Saldos de la casa" descripcion="Suma de todas las cajas" sinRelleno>
                {dia.saldos.totales.length === 0 ? (
                  <Vacio titulo="Todavía no hay dinero en las cajas">Aparece cuando se registra el fondo inicial de un turno.</Vacio>
                ) : (
                  <Tabla etiqueta="Saldos por moneda">
                    <thead>
                      <tr>
                        <th>Moneda</th>
                        <th className="num">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenar(dia.saldos.totales).map((s) => (
                        <tr key={s.monedaCodigo}>
                          <td>
                            <DivisaCompacta codigo={s.monedaCodigo} />
                          </td>
                          <td className="num">
                            <Monto valor={s.saldo} moneda={s.monedaCodigo} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabla>
                )}
              </Tarjeta>
            </Columnas>
          </>
        )}
      </ConDatos>
    </section>
  );
}

function PizarraBreve() {
  const pizarra = usePizarra();
  return (
    <Tarjeta
      titulo="Pizarra"
      acciones={
        <EnlaceBoton to="/pizarra" variante="texto" tamano="chico">
          Ver <ArrowRight size={16} aria-hidden />
        </EnlaceBoton>
      }
      sinRelleno
    >
      <ConDatos consulta={pizarra}>
        {(filas) => (
          <Tabla etiqueta="Pizarra vigente">
            <thead>
              <tr>
                <th>Divisa</th>
                <th className="num">Compra</th>
                <th className="num">Venta</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.monedaCodigo}>
                  <td>
                    <span className={css.divisaConEstado}>
                      <DivisaCompacta codigo={f.monedaCodigo} />
                      {f.vencida && <Etiqueta tono="error">Vencida</Etiqueta>}
                    </span>
                  </td>
                  <td className="num">
                    <Tasa valorE6={f.compraE6} decimales={f.decimalesTasa} />
                  </td>
                  <td className="num">
                    <Tasa valorE6={f.ventaE6} decimales={f.decimalesTasa} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </ConDatos>
    </Tarjeta>
  );
}

function UltimasDelTurno({ turnoId }: { turnoId: number }) {
  const operaciones = useOperaciones({ turnoId, limite: 5 });
  const monedaBase = useMonedaBase();
  return (
    <Tarjeta
      titulo="Últimas operaciones del turno"
      acciones={
        <EnlaceBoton to="/operaciones" variante="texto" tamano="chico">
          Ver todas <ArrowRight size={16} aria-hidden />
        </EnlaceBoton>
      }
      sinRelleno
    >
      <ConDatos consulta={operaciones}>
        {(lista) =>
          lista.length === 0 ? (
            <Vacio titulo="Todavía no hay operaciones en este turno" />
          ) : (
            <Tabla etiqueta="Últimas operaciones del turno">
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th className="num">Divisa</th>
                  <th className="num">Pesos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link to={`/operaciones/${o.id}`}>{o.id}</Link>
                    </td>
                    <td>{formatearHora(o.realizadaEn)}</td>
                    <td>{TIPO_OPERACION[o.tipo]}</td>
                    <td className="num">
                      <Monto valor={o.montoDivisa} moneda={o.monedaCodigo} />
                    </td>
                    <td className="num">
                      <Monto valor={o.montoBase} moneda={monedaBase} />
                    </td>
                    <td>
                      <Etiqueta tono={ESTADO_OPERACION[o.estado].tono}>{ESTADO_OPERACION[o.estado].texto}</Etiqueta>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )
        }
      </ConDatos>
    </Tarjeta>
  );
}
