// Lista de operaciones con filtros (GET /api/operaciones), de la más
// reciente a la más antigua. Cada fila lleva a su detalle.

import { useState } from "react";
import { Link } from "react-router";
import { useCasa, useDecimalesTasa, useMonedaBase, useNombres, useOperaciones, type FiltrosOperaciones } from "../../api/consultas.ts";
import type { EstadoOperacion } from "../../api/tipos.ts";
import { Entrada, Seleccion } from "../../componentes/Campo.tsx";
import { DivisaCompacta } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Monto, Tasa } from "../../componentes/Monto.tsx";
import { Pagina } from "../../componentes/Pagina.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { ESTADO_OPERACION, MEDIO_PAGO, TIPO_OPERACION } from "../../lib/textos.ts";
import css from "./Personal.module.css";

/** Cuántas se muestran: las más recientes. Para ver más atrás, se filtra por fecha. */
const LIMITE = 200;

export function Operaciones() {
  const [filtros, setFiltros] = useState<FiltrosOperaciones>({});
  const casa = useCasa();
  const operaciones = useOperaciones({ ...filtros, limite: LIMITE });
  const decimalesTasa = useDecimalesTasa();
  const monedaBase = useMonedaBase();
  const nombre = useNombres();

  return (
    <Pagina>
      <EncabezadoPagina titulo="Operaciones" descripcion="Compras y ventas de divisas, de la más reciente a la más antigua." />

      <Tarjeta>
        <div className={css.filtros}>
          <Seleccion
            etiqueta="Estado"
            value={filtros.estado ?? ""}
            onChange={(e) => setFiltros({ ...filtros, estado: (e.target.value || undefined) as EstadoOperacion | undefined })}
          >
            <option value="">Todos</option>
            {(Object.keys(ESTADO_OPERACION) as EstadoOperacion[]).map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_OPERACION[estado].texto}
              </option>
            ))}
          </Seleccion>
          <Seleccion
            etiqueta="Divisa"
            value={filtros.monedaCodigo ?? ""}
            onChange={(e) => setFiltros({ ...filtros, monedaCodigo: e.target.value || undefined })}
          >
            <option value="">Todas</option>
            {casa.data?.divisas.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.codigo} · {d.nombre}
              </option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Desde" type="date" value={filtros.desde ?? ""} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value || undefined })} />
          <Entrada etiqueta="Hasta" type="date" value={filtros.hasta ?? ""} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value || undefined })} />
        </div>
      </Tarjeta>

      <Tarjeta sinRelleno>
        <ConDatos consulta={operaciones} cargando="Cargando operaciones…">
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="No hay operaciones con estos filtros">Prueba con otro estado, divisa o rango de fechas.</Vacio>
            ) : (
              <>
                <Tabla etiqueta="Operaciones">
                  <thead>
                    <tr>
                      <th>N°</th>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Divisa</th>
                      <th className="num">Monto</th>
                      <th className="num">Tasa</th>
                      <th className="num">Pesos</th>
                      <th>Pago</th>
                      <th>Cliente</th>
                      <th>Registró</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link to={`/operaciones/${o.id}`}>{o.id}</Link>
                        </td>
                        <td>{formatearFechaHora(o.realizadaEn)}</td>
                        <td>{TIPO_OPERACION[o.tipo]}</td>
                        <td>
                          <DivisaCompacta codigo={o.monedaCodigo} />
                        </td>
                        <td className="num">
                          <Monto valor={o.montoDivisa} moneda={o.monedaCodigo} />
                        </td>
                        <td className="num">
                          <Tasa valorE6={o.tasaAplicadaE6} decimales={decimalesTasa(o.monedaCodigo)} />
                        </td>
                        <td className="num">
                          <Monto valor={o.montoBase} moneda={monedaBase} />
                        </td>
                        <td>{MEDIO_PAGO[o.medioPago]}</td>
                        <td className="ajustable">{o.clienteNombre ?? "—"}</td>
                        <td>{nombre(o.usuarioId)}</td>
                        <td>
                          <Etiqueta tono={ESTADO_OPERACION[o.estado].tono}>{ESTADO_OPERACION[o.estado].texto}</Etiqueta>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
                {lista.length === LIMITE && <p className={css.notaTabla}>Se muestran las {LIMITE} más recientes. Para ver más atrás, filtra por fecha.</p>}
              </>
            )
          }
        </ConDatos>
      </Tarjeta>
    </Pagina>
  );
}
