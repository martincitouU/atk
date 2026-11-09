// Caja: el turno de la persona (abrir, ingresos y retiros, libro de caja,
// cierre con arqueo) y los gastos. Supervisores y admin ven además los
// turnos abiertos y pueden registrar ajustes.
//
// ESQUELETO (F1): los formularios no guardan; el cierre muestra un arqueo
// de ejemplo.

import { Lock } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";
import { nombreUsuario, useCatalogo, useGastos, useMovimientos, useOrdenMonedas, useSaldos, useTurnosAbiertos } from "../../api/consultas.ts";
import type { MedioPago, Turno } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { DivisaCompacta } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { GrillaIndicadores, Indicador } from "../../componentes/Indicador.tsx";
import { Monto } from "../../componentes/Monto.tsx";
import { Columnas, Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import * as ejemplo from "../../ejemplo/datos.ts";
import { formatearDia, formatearHora, hoy } from "../../lib/fechas.ts";
import { ESTADO_GASTO, MEDIO_PAGO, TIPO_MOVIMIENTO } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import css from "./Personal.module.css";

export function Caja() {
  return (
    <Pagina>
      <EncabezadoPagina titulo="Caja" descripcion="El dinero de tu turno: saldos, movimientos, cierre y gastos." />
      <Pestanas
        etiqueta="Secciones de la caja"
        pestanas={[
          { a: "/caja", texto: "Turno", fin: true },
          { a: "/caja/gastos", texto: "Gastos" },
        ]}
      />
      <Outlet />
    </Pagina>
  );
}

// ---- Turno -------------------------------------------------------------------

export function TurnoYCaja() {
  const { usuario, turnoAbierto } = usePersonal();
  const esSupervisor = usuario.rol !== "CAJERO";

  return (
    <>
      {turnoAbierto ? <TurnoAbierto turno={turnoAbierto} /> : <AbrirTurno />}
      {esSupervisor && <VistaSupervisor />}
    </>
  );
}

function AbrirTurno() {
  const { data: catalogo } = useCatalogo();
  return (
    <Tarjeta elevada titulo="Abre tu turno" descripcion="Elige la caja. Después registra el fondo inicial de cada moneda como un ingreso.">
      <form className={css.abrirTurno} onSubmit={(e) => e.preventDefault()}>
        <Seleccion etiqueta="Caja" defaultValue={catalogo?.cajas[0]?.id}>
          {catalogo?.cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Seleccion>
        <Boton type="submit" variante="primario">
          Abrir turno
        </Boton>
      </form>
    </Tarjeta>
  );
}

function TurnoAbierto({ turno }: { turno: Turno }) {
  const { data: catalogo } = useCatalogo();
  const saldos = useSaldos(turno.cajaId);
  const movimientos = useMovimientos(turno.id);
  const ordenar = useOrdenMonedas();
  const [cerrando, setCerrando] = useState(false);
  const caja = catalogo?.cajas.find((c) => c.id === turno.cajaId);

  return (
    <>
      <Tarjeta elevada>
        <div className={css.turno}>
          <div className={css.turnoTexto}>
            <Etiqueta tono="vivo">Turno abierto</Etiqueta>
            <p className={css.turnoTitulo}>
              {caja?.nombre ?? `Caja ${turno.cajaId}`}, desde las {formatearHora(turno.abiertoEn)}
            </p>
          </div>
          <Boton icono={<Lock size={18} aria-hidden />} onClick={() => setCerrando(true)}>
            Cerrar turno
          </Boton>
        </div>
      </Tarjeta>

      <section className={css.seccion} aria-labelledby="titulo-saldos">
        <h2 id="titulo-saldos" className={css.seccionTitulo}>
          Saldos de la caja
        </h2>
        {saldos.isPending ? (
          <Cargando />
        ) : (
          <GrillaIndicadores>
            {ordenar(saldos.data ?? []).map((s) => (
              <Indicador key={s.monedaCodigo} etiqueta={s.monedaCodigo} valor={<Monto valor={s.saldo} moneda={s.monedaCodigo} />} />
            ))}
          </GrillaIndicadores>
        )}
      </section>

      <Columnas lateral={<IngresoORetiro />}>
        <Tarjeta titulo="Libro de caja del turno" sinRelleno>
          {movimientos.isPending ? (
            <Cargando />
          ) : !movimientos.data?.length ? (
            <Vacio titulo="Sin movimientos todavía">Registra el fondo inicial para empezar.</Vacio>
          ) : (
            <Tabla etiqueta="Libro de caja">
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th>Moneda</th>
                  <th className="num">Monto</th>
                  <th className="num">Saldo</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.data.map((m) => (
                  <tr key={m.id}>
                    <td>{formatearHora(m.creadoEn)}</td>
                    <td>{TIPO_MOVIMIENTO[m.tipo]}</td>
                    <td>{m.monedaCodigo}</td>
                    <td className="num">
                      <Monto valor={m.monto} moneda={m.monedaCodigo} sinSimbolo />
                    </td>
                    <td className="num">
                      <Monto valor={m.saldoPost} moneda={m.monedaCodigo} sinSimbolo />
                    </td>
                    <td className="ajustable">{m.descripcion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </Columnas>

      <CerrarTurno abierto={cerrando} alCerrar={() => setCerrando(false)} monedas={ordenar(saldos.data ?? []).map((s) => s.monedaCodigo)} />
    </>
  );
}

function IngresoORetiro() {
  const { data: catalogo } = useCatalogo();
  const [tipo, setTipo] = useState<"INGRESO" | "RETIRO">("INGRESO");
  const monedas = ["CLP", ...(catalogo?.divisas.map((d) => d.codigo) ?? [])];

  return (
    <Tarjeta titulo="Ingreso o retiro" descripcion="Fondo inicial, reposición o retiro de dinero, con su motivo.">
      <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
        <Segmentado
          etiqueta="Tipo de movimiento"
          opciones={[
            { valor: "INGRESO", texto: "Ingreso" },
            { valor: "RETIRO", texto: "Retiro" },
          ]}
          valor={tipo}
          alCambiar={setTipo}
          anchoCompleto
        />
        <FilaCampos>
          <Seleccion etiqueta="Moneda" defaultValue="CLP">
            {monedas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Monto" inputMode="decimal" placeholder="0" />
        </FilaCampos>
        <Entrada etiqueta="Motivo" placeholder="Fondo inicial" />
        {tipo === "INGRESO" && <Entrada etiqueta="Costo por unidad (opcional)" inputMode="decimal" ayuda="Para divisas. Si se deja vacío, se usa la tasa de referencia vigente." />}
        <Boton type="submit" anchoCompleto>
          Registrar {tipo === "INGRESO" ? "ingreso" : "retiro"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

/** Cierre: se cuenta el dinero de cada moneda y el sistema muestra las diferencias. */
function CerrarTurno({ abierto, alCerrar, monedas }: { abierto: boolean; alCerrar: () => void; monedas: string[] }) {
  const [cerrado, setCerrado] = useState(false);
  const salir = () => {
    setCerrado(false);
    alCerrar();
  };

  if (cerrado) {
    return (
      <Dialogo abierto={abierto} alCerrar={salir} titulo="Arqueo del turno" descripcion="Las diferencias no se corrigen solas: un supervisor registra el ajuste." acciones={<Boton onClick={salir}>Listo</Boton>}>
        <Tabla etiqueta="Arqueo">
          <thead>
            <tr>
              <th>Moneda</th>
              <th className="num">Sistema</th>
              <th className="num">Contado</th>
              <th className="num">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {ejemplo.arqueo.map((a) => (
              <tr key={a.monedaCodigo}>
                <td>{a.monedaCodigo}</td>
                <td className="num">
                  <Monto valor={a.saldoSistema} moneda={a.monedaCodigo} sinSimbolo />
                </td>
                <td className="num">
                  <Monto valor={a.saldoContado} moneda={a.monedaCodigo} sinSimbolo />
                </td>
                <td className="num">{a.diferencia === "0" ? "—" : <Monto valor={a.diferencia} moneda={a.monedaCodigo} sinSimbolo />}</td>
              </tr>
            ))}
          </tbody>
        </Tabla>
      </Dialogo>
    );
  }

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={salir}
      titulo="Cerrar turno"
      descripcion="Cuenta el dinero de cada moneda y escribe el total. No se puede cerrar con borradores pendientes."
      acciones={
        <>
          <Boton onClick={salir}>Cancelar</Boton>
          <Boton variante="primario" onClick={() => setCerrado(true)}>
            Cerrar turno
          </Boton>
        </>
      }
    >
      <div className={css.formulario}>
        {monedas.map((m) => (
          <Entrada key={m} etiqueta={`Contado en ${m}`} inputMode="decimal" placeholder="0" sufijo={m} />
        ))}
      </div>
    </Dialogo>
  );
}

function VistaSupervisor() {
  const turnos = useTurnosAbiertos();
  const saldos = useSaldos();
  const { data: catalogo } = useCatalogo();

  return (
    <section className={css.seccion} aria-labelledby="titulo-casa">
      <h2 id="titulo-casa" className={css.seccionTitulo}>
        Todas las cajas
      </h2>
      <Columnas
        lateral={
          <Tarjeta titulo="Ajuste de caja" descripcion="Corrige una diferencia del arqueo. Monto con signo: -1.000 resta.">
            <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
              <FilaCampos>
                <Seleccion etiqueta="Caja">
                  {catalogo?.cajas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </Seleccion>
                <Seleccion etiqueta="Moneda" defaultValue="CLP">
                  {["CLP", ...(catalogo?.divisas.map((d) => d.codigo) ?? [])].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Seleccion>
              </FilaCampos>
              <Entrada etiqueta="Monto" inputMode="decimal" placeholder="-1.000" />
              <AreaTexto etiqueta="Motivo" placeholder="Diferencia del arqueo del turno 5" />
              <Boton type="submit">Registrar ajuste</Boton>
            </form>
          </Tarjeta>
        }
      >
        <Tarjeta titulo="Turnos abiertos" sinRelleno>
          {turnos.isPending ? (
            <Cargando />
          ) : !turnos.data?.length ? (
            <Vacio titulo="No hay turnos abiertos" />
          ) : (
            <Tabla etiqueta="Turnos abiertos">
              <thead>
                <tr>
                  <th>Caja</th>
                  <th>Cajero</th>
                  <th>Desde</th>
                </tr>
              </thead>
              <tbody>
                {turnos.data.map((t) => (
                  <tr key={t.turno.id}>
                    <td>{t.cajaNombre}</td>
                    <td>{t.usuarioNombre}</td>
                    <td>{formatearHora(t.turno.abiertoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
        <Tarjeta titulo="Saldos por caja" sinRelleno>
          {saldos.isPending ? (
            <Cargando />
          ) : (
            <Tabla etiqueta="Saldos por caja">
              <thead>
                <tr>
                  <th>Caja</th>
                  <th>Moneda</th>
                  <th className="num">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {saldos.data?.map((s) => (
                  <tr key={`${s.cajaId}-${s.monedaCodigo}`}>
                    <td>{s.cajaNombre}</td>
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
    </section>
  );
}

// ---- Gastos ------------------------------------------------------------------

const MEDIOS = Object.keys(MEDIO_PAGO) as MedioPago[];

export function Gastos() {
  const { usuario, turnoAbierto } = usePersonal();
  const { data: catalogo } = useCatalogo();
  const gastos = useGastos();
  const esAdmin = usuario.rol === "ADMIN";
  const esSupervisor = usuario.rol !== "CAJERO";
  const categoria = new Map(catalogo?.categoriasGasto.map((c) => [c.id, c.nombre]));

  return (
    <Columnas
      lateral={
        <Tarjeta titulo="Registrar gasto" descripcion="En efectivo sale de la caja de tu turno. Otros medios, solo el admin.">
          {!turnoAbierto && !esAdmin && <Aviso tono="atencion">Necesitas un turno abierto para registrar gastos en efectivo.</Aviso>}
          <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
            <Seleccion etiqueta="Categoría">
              {catalogo?.categoriasGasto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Seleccion>
            <Entrada etiqueta="Descripción" placeholder="Rollos de papel para boletas" />
            <FilaCampos>
              <Entrada etiqueta="Monto" inputMode="numeric" placeholder="0" sufijo="CLP" />
              <Seleccion etiqueta="Medio de pago" defaultValue="EFECTIVO">
                {MEDIOS.map((m) => (
                  <option key={m} value={m} disabled={m !== "EFECTIVO" && !esAdmin}>
                    {MEDIO_PAGO[m]}
                  </option>
                ))}
              </Seleccion>
            </FilaCampos>
            <FilaCampos>
              <Entrada etiqueta="Fecha" type="date" defaultValue={hoy()} />
              <Entrada etiqueta="Documento" placeholder="Boleta 1234" />
            </FilaCampos>
            <Boton type="submit" variante="primario">
              Registrar gasto
            </Boton>
          </form>
        </Tarjeta>
      }
    >
      <Tarjeta titulo="Gastos" sinRelleno>
        {gastos.isPending ? (
          <Cargando />
        ) : !gastos.data?.length ? (
          <Vacio titulo="No hay gastos registrados" />
        ) : (
          <Tabla etiqueta="Gastos">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th className="num">Monto</th>
                <th>Pago</th>
                <th>Registró</th>
                <th>Estado</th>
                {esSupervisor && <th aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {gastos.data.map((g) => (
                <tr key={g.id}>
                  <td>{formatearDia(g.fecha)}</td>
                  <td>{categoria.get(g.categoriaId) ?? "—"}</td>
                  <td className="ajustable">{g.descripcion}</td>
                  <td className="num">
                    <Monto valor={g.monto} moneda="CLP" />
                  </td>
                  <td>{MEDIO_PAGO[g.medioPago]}</td>
                  <td>{nombreUsuario(g.usuarioId)}</td>
                  <td>
                    <Etiqueta tono={ESTADO_GASTO[g.estado].tono}>{ESTADO_GASTO[g.estado].texto}</Etiqueta>
                  </td>
                  {esSupervisor && (
                    <td>
                      {g.estado === "VIGENTE" && (
                        <Boton variante="texto" tamano="chico">
                          Reversar
                        </Boton>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabla>
        )}
      </Tarjeta>
    </Columnas>
  );
}
