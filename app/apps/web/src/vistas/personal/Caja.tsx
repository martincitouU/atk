// Caja: el turno de la persona (abrir, ingresos y retiros, libro de caja,
// cierre con arqueo) y los gastos. Supervisores y admin ven además los
// turnos abiertos y pueden registrar ajustes.
//
// El cierre responde el arqueo (sistema, contado, diferencia). Se muestra
// arriba de la vista aunque el turno ya esté cerrado: las diferencias no se
// corrigen solas, un supervisor registra el ajuste.

import { Lock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Outlet } from "react-router";
import {
  useAbrirTurno,
  useAjusteCaja,
  useCerrarTurno,
  useMovimientoCaja,
  useRegistrarGasto,
  useReversarGasto,
  type ResultadoCierre,
} from "../../api/acciones.ts";
import { mensajeDe } from "../../api/cliente.ts";
import {
  useCasa,
  useCatalogo,
  useGastos,
  useMonedaBase,
  useMonedas,
  useMovimientos,
  useNombres,
  useOrdenMonedas,
  useSaldos,
  useTurnosAbiertos,
  type FiltrosGastos,
} from "../../api/consultas.ts";
import type { EstadoGasto, Gasto, MedioPago, Saldo, Turno } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { AreaTexto, Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { Dialogo } from "../../componentes/Dialogo.tsx";
import { DivisaCompacta } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { Cargando, ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { GrillaIndicadores, Indicador } from "../../componentes/Indicador.tsx";
import { Monto } from "../../componentes/Monto.tsx";
import { Columnas, Pagina } from "../../componentes/Pagina.tsx";
import { Pestanas } from "../../componentes/Pestanas.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tabla } from "../../componentes/Tabla.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearDia, formatearHora, hoy, inicioDelMes } from "../../lib/fechas.ts";
import { errorEnFormulario, reglaMonto } from "../../lib/formularios.ts";
import { leerMonto, leerMontoConSigno, leerTasa } from "../../lib/montos.ts";
import { ESTADO_GASTO, MEDIO_PAGO, TIPO_MOVIMIENTO } from "../../lib/textos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import css from "./Personal.module.css";

/** Monedas para elegir en un formulario: la base y las divisas que se operan. */
function useMonedasDeCaja(): string[] {
  const { data } = useCasa();
  return [data?.monedaBase?.codigo ?? "CLP", ...(data?.divisas.filter((d) => d.activa).map((d) => d.codigo) ?? [])];
}

/** Decimales de una moneda (2 mientras no llega /api/casa). */
function useDecimales() {
  const monedas = useMonedas();
  return (codigo: string) => monedas?.get(codigo)?.decimales ?? 2;
}

const MOTIVO_OBLIGATORIO = (texto: string) => texto.trim() !== "" || "Escribe el motivo";

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
  // El arqueo del turno recién cerrado (el turno ya no está abierto)
  const [cierre, setCierre] = useState<ResultadoCierre | null>(null);

  return (
    <>
      {cierre && <Arqueo cierre={cierre} alTerminar={() => setCierre(null)} />}
      {turnoAbierto ? (
        <TurnoAbierto turno={turnoAbierto} alCerrar={setCierre} />
      ) : (
        <AbrirTurno titulo="Abre tu turno" descripcion="Elige la caja. Después registra el fondo inicial de cada moneda como un ingreso." />
      )}
      {esSupervisor && <VistaSupervisor />}
    </>
  );
}

/** Abrir el turno en una caja. Lo usan Caja e Inicio; es el botón magenta de la vista. */
export function AbrirTurno({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  const catalogo = useCatalogo();
  return (
    <Tarjeta elevada titulo={titulo} descripcion={descripcion}>
      <ConDatos consulta={catalogo}>{(datos) => <FormularioAbrirTurno cajas={datos.cajas} />}</ConDatos>
    </Tarjeta>
  );
}

function FormularioAbrirTurno({ cajas }: { cajas: { id: number; nombre: string }[] }) {
  const abrir = useAbrirTurno();
  const { register, handleSubmit } = useForm<{ cajaId: string }>({ defaultValues: { cajaId: String(cajas[0]?.id ?? "") } });

  if (cajas.length === 0) return <Aviso tono="atencion">La casa no tiene cajas activas.</Aviso>;
  return (
    <>
      {abrir.isError && <Aviso tono="error">{mensajeDe(abrir.error)}</Aviso>}
      <form className={css.abrirTurno} onSubmit={handleSubmit(({ cajaId }) => abrir.mutate({ cajaId: Number(cajaId) }))}>
        <Seleccion etiqueta="Caja" {...register("cajaId")}>
          {cajas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Seleccion>
        <Boton type="submit" variante="primario" cargando={abrir.isPending}>
          Abrir turno
        </Boton>
      </form>
    </>
  );
}

function TurnoAbierto({ turno, alCerrar }: { turno: Turno; alCerrar: (cierre: ResultadoCierre) => void }) {
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
          <Boton icono={<Lock size={18} aria-hidden />} onClick={() => setCerrando(true)} disabled={!saldos.data}>
            Cerrar turno
          </Boton>
        </div>
      </Tarjeta>

      <section className={css.seccion} aria-labelledby="titulo-saldos">
        <h2 id="titulo-saldos" className={css.seccionTitulo}>
          Saldos de la caja
        </h2>
        <ConDatos consulta={saldos}>
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="La caja está vacía">Registra el fondo inicial de cada moneda como un ingreso.</Vacio>
            ) : (
              <GrillaIndicadores>
                {ordenar(lista).map((s) => (
                  <Indicador key={s.monedaCodigo} etiqueta={s.monedaCodigo} valor={<Monto valor={s.saldo} moneda={s.monedaCodigo} />} />
                ))}
              </GrillaIndicadores>
            )
          }
        </ConDatos>
      </section>

      <Columnas lateral={<IngresoORetiro />}>
        <Tarjeta titulo="Libro de caja del turno" sinRelleno>
          <ConDatos consulta={movimientos}>
            {(lista) =>
              lista.length === 0 ? (
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
                    {lista.map((m) => (
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
              )
            }
          </ConDatos>
        </Tarjeta>
      </Columnas>

      {saldos.data && <CerrarTurno turno={turno} saldos={ordenar(saldos.data)} abierto={cerrando} alCancelar={() => setCerrando(false)} alCerrar={alCerrar} />}
    </>
  );
}

type ValoresMovimiento = { tipo: "INGRESO" | "RETIRO"; moneda: string; monto: string; motivo: string; costo: string };

function IngresoORetiro() {
  const monedas = useMonedasDeCaja();
  const monedaBase = useMonedaBase();
  const decimalesDe = useDecimales();
  const movimiento = useMovimientoCaja();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<ValoresMovimiento>({ defaultValues: { tipo: "INGRESO", moneda: monedaBase, monto: "", motivo: "", costo: "" } });

  const tipo = watch("tipo");
  const moneda = watch("moneda") || monedaBase;
  const conCosto = tipo === "INGRESO" && moneda !== monedaBase;

  const alEnviar = handleSubmit(async (v) => {
    setListo(null);
    setError(null);
    try {
      await movimiento.mutateAsync({
        tipo: v.tipo,
        monedaCodigo: moneda,
        monto: leerMonto(v.monto, decimalesDe(moneda)) ?? "",
        motivo: v.motivo.trim(),
        costoE6: conCosto && v.costo.trim() ? leerTasa(v.costo) : null,
      });
      reset({ ...v, monto: "", motivo: "", costo: "" });
      setListo(`${v.tipo === "INGRESO" ? "Ingreso" : "Retiro"} registrado.`);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, ["monto", "motivo"], {
          nombres: { costoE6: "costo" },
          porCodigo: { MONTO_INVALIDO: "monto", SALDO_INSUFICIENTE: "monto", FALTA_MOTIVO: "motivo", TASA_INVALIDA: "costo" },
        }),
      );
    }
  });

  return (
    <Tarjeta titulo="Ingreso o retiro" descripcion="Fondo inicial, reposición o retiro de dinero, con su motivo.">
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Segmentado
          etiqueta="Tipo de movimiento"
          opciones={[
            { valor: "INGRESO", texto: "Ingreso" },
            { valor: "RETIRO", texto: "Retiro" },
          ]}
          valor={tipo}
          alCambiar={(valor) => setValue("tipo", valor)}
          anchoCompleto
        />
        <FilaCampos>
          <Seleccion etiqueta="Moneda" {...register("moneda")}>
            {monedas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Seleccion>
          <Entrada
            etiqueta="Monto"
            inputMode="decimal"
            placeholder="0"
            sufijo={moneda}
            error={errors.monto?.message}
            {...register("monto", { validate: (texto) => reglaMonto(decimalesDe(moneda))(texto) })}
          />
        </FilaCampos>
        <Entrada etiqueta="Motivo" placeholder="Fondo inicial" error={errors.motivo?.message} {...register("motivo", { validate: MOTIVO_OBLIGATORIO })} />
        {conCosto && (
          <Entrada
            etiqueta="Costo por unidad (opcional)"
            inputMode="decimal"
            ayuda="En pesos por unidad. Si se deja vacío, se usa la tasa de referencia vigente."
            error={errors.costo?.message}
            {...register("costo", {
              validate: (texto) =>
                !texto.trim() || (leerTasa(texto) !== null && BigInt(leerTasa(texto) ?? "0") > 0n) || "Escribe el costo con coma, por ejemplo 940,50",
            })}
          />
        )}
        <Boton type="submit" anchoCompleto cargando={isSubmitting}>
          Registrar {tipo === "INGRESO" ? "ingreso" : "retiro"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

/**
 * Cierre: se cuenta el dinero de cada moneda con saldo. La API compara con
 * el sistema y responde el arqueo; no deja cerrar con borradores pendientes.
 */
function CerrarTurno({
  turno,
  saldos,
  abierto,
  alCancelar,
  alCerrar,
}: {
  turno: Turno;
  saldos: Saldo[];
  abierto: boolean;
  alCancelar: () => void;
  alCerrar: (cierre: ResultadoCierre) => void;
}) {
  const cerrar = useCerrarTurno(turno.id);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ conteo: Record<string, string> }>({ defaultValues: { conteo: {} } });

  const alEnviar = handleSubmit(async ({ conteo }) => {
    try {
      const enDigitos = Object.fromEntries(saldos.map((s) => [s.monedaCodigo, leerMonto(conteo[s.monedaCodigo] ?? "", s.decimales) ?? ""]));
      alCerrar(await cerrar.mutateAsync({ conteo: enDigitos }));
    } catch {
      // el mensaje queda en cerrar.error
    }
  });

  return (
    <Dialogo
      abierto={abierto}
      alCerrar={() => {
        cerrar.reset();
        alCancelar();
      }}
      titulo="Cerrar turno"
      descripcion="Cuenta el dinero de cada moneda y escribe el total. No se puede cerrar con borradores pendientes."
      acciones={
        <>
          <Boton onClick={alCancelar}>Cancelar</Boton>
          <Boton type="submit" form="cerrar-turno" variante="primario" cargando={isSubmitting}>
            Cerrar turno
          </Boton>
        </>
      }
    >
      <form id="cerrar-turno" className={css.formulario} onSubmit={alEnviar} noValidate>
        {cerrar.isError && <Aviso tono="error">{mensajeDe(cerrar.error)}</Aviso>}
        {saldos.length === 0 && <p className={css.nota}>La caja no tiene saldos: se cierra sin conteo.</p>}
        {saldos.map((s) => (
          <Entrada
            key={s.monedaCodigo}
            etiqueta={`Contado en ${s.monedaCodigo}`}
            inputMode="decimal"
            placeholder="0"
            sufijo={s.monedaCodigo}
            error={errors.conteo?.[s.monedaCodigo]?.message}
            {...register(`conteo.${s.monedaCodigo}`, { validate: reglaMonto(s.decimales, { mayorQueCero: false }) })}
          />
        ))}
      </form>
    </Dialogo>
  );
}

/** El arqueo del turno recién cerrado. */
function Arqueo({ cierre, alTerminar }: { cierre: ResultadoCierre; alTerminar: () => void }) {
  const ordenar = useOrdenMonedas();
  const conDiferencias = cierre.arqueo.some((a) => a.diferencia !== "0");
  return (
    <Tarjeta elevada titulo="Turno cerrado: arqueo" acciones={<Boton onClick={alTerminar}>Listo</Boton>} sinRelleno>
      <div className={css.avisoTarjeta}>
        {conDiferencias ? (
          <Aviso tono="atencion" titulo="Hay diferencias">
            No se corrigen solas: un supervisor registra el ajuste con su motivo.
          </Aviso>
        ) : (
          <Aviso tono="exito">El conteo cuadra con el sistema.</Aviso>
        )}
      </div>
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
          {ordenar(cierre.arqueo).map((a) => (
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
    </Tarjeta>
  );
}

function VistaSupervisor() {
  const turnos = useTurnosAbiertos();
  const saldos = useSaldos();
  const catalogo = useCatalogo();
  const ordenar = useOrdenMonedas();

  return (
    <section className={css.seccion} aria-labelledby="titulo-casa">
      <h2 id="titulo-casa" className={css.seccionTitulo}>
        Todas las cajas
      </h2>
      <Columnas
        lateral={
          <Tarjeta titulo="Ajuste de caja" descripcion="Corrige una diferencia del arqueo. Monto con signo: -1.000 resta.">
            <ConDatos consulta={catalogo}>{(datos) => <FormularioAjuste cajas={datos.cajas} />}</ConDatos>
          </Tarjeta>
        }
      >
        <Tarjeta titulo="Turnos abiertos" sinRelleno>
          <ConDatos consulta={turnos}>
            {(lista) =>
              lista.length === 0 ? (
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
                    {lista.map((t) => (
                      <tr key={t.turno.id}>
                        <td>{t.cajaNombre}</td>
                        <td>{t.usuarioNombre}</td>
                        <td>{formatearHora(t.turno.abiertoEn)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabla>
              )
            }
          </ConDatos>
        </Tarjeta>
        <Tarjeta titulo="Saldos por caja" sinRelleno>
          <ConDatos consulta={saldos}>
            {(lista) =>
              lista.length === 0 ? (
                <Vacio titulo="Todavía no hay dinero en las cajas" />
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
                    {/* Por caja y, dentro de cada una, en el orden de la pizarra */}
                    {ordenar(lista)
                      .sort((a, b) => a.cajaId - b.cajaId)
                      .map((s) => (
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
              )
            }
          </ConDatos>
        </Tarjeta>
      </Columnas>
    </section>
  );
}

type ValoresAjuste = { cajaId: string; moneda: string; monto: string; motivo: string };

function FormularioAjuste({ cajas }: { cajas: { id: number; nombre: string }[] }) {
  const monedas = useMonedasDeCaja();
  const monedaBase = useMonedaBase();
  const decimalesDe = useDecimales();
  const ajuste = useAjusteCaja();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<ValoresAjuste>({ defaultValues: { cajaId: String(cajas[0]?.id ?? ""), moneda: monedaBase, monto: "", motivo: "" } });
  const moneda = watch("moneda") || monedaBase;

  const alEnviar = handleSubmit(async (v) => {
    setListo(null);
    setError(null);
    try {
      await ajuste.mutateAsync({
        cajaId: Number(v.cajaId),
        monedaCodigo: moneda,
        monto: leerMontoConSigno(v.monto, decimalesDe(moneda)) ?? "",
        motivo: v.motivo.trim(),
      });
      reset({ ...v, monto: "", motivo: "" });
      setListo("Ajuste registrado.");
    } catch (e) {
      setError(errorEnFormulario(e, marcar, ["monto", "motivo"], { porCodigo: { MONTO_INVALIDO: "monto", FALTA_MOTIVO: "motivo" } }));
    }
  });

  return (
    <>
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <FilaCampos>
          <Seleccion etiqueta="Caja" {...register("cajaId")}>
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Seleccion>
          <Seleccion etiqueta="Moneda" {...register("moneda")}>
            {monedas.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Seleccion>
        </FilaCampos>
        <Entrada
          etiqueta="Monto"
          inputMode="decimal"
          placeholder="-1.000"
          sufijo={moneda}
          error={errors.monto?.message}
          {...register("monto", { validate: (texto) => reglaMonto(decimalesDe(moneda), { conSigno: true, mayorQueCero: false })(texto) })}
        />
        <AreaTexto
          etiqueta="Motivo"
          placeholder="Diferencia del arqueo del turno 5"
          error={errors.motivo?.message}
          {...register("motivo", { validate: MOTIVO_OBLIGATORIO })}
        />
        <Boton type="submit" cargando={isSubmitting}>
          Registrar ajuste
        </Boton>
      </form>
    </>
  );
}

// ---- Gastos ------------------------------------------------------------------

const MEDIOS = Object.keys(MEDIO_PAGO) as MedioPago[];

export function Gastos() {
  const { usuario } = usePersonal();
  const { data: catalogo } = useCatalogo();
  // Por defecto, los del mes en curso
  const [filtros, setFiltros] = useState<FiltrosGastos>(() => ({ desde: inicioDelMes(hoy()), hasta: hoy() }));
  const [reversando, setReversando] = useState<Gasto | null>(null);
  const gastos = useGastos(filtros);
  const nombre = useNombres();
  const monedaBase = useMonedaBase();
  const esSupervisor = usuario.rol !== "CAJERO";
  const categoria = new Map(catalogo?.categoriasGasto.map((c) => [c.id, c.nombre]));

  return (
    <Columnas lateral={<RegistrarGasto />}>
      <Tarjeta>
        <div className={css.filtros}>
          <Entrada etiqueta="Desde" type="date" value={filtros.desde ?? ""} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value || undefined })} />
          <Entrada etiqueta="Hasta" type="date" value={filtros.hasta ?? ""} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value || undefined })} />
          <Seleccion
            etiqueta="Estado"
            value={filtros.estado ?? ""}
            onChange={(e) => setFiltros({ ...filtros, estado: (e.target.value || undefined) as EstadoGasto | undefined })}
          >
            <option value="">Todos</option>
            {(Object.keys(ESTADO_GASTO) as EstadoGasto[]).map((estado) => (
              <option key={estado} value={estado}>
                {ESTADO_GASTO[estado].texto}
              </option>
            ))}
          </Seleccion>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Gastos" sinRelleno>
        <ConDatos consulta={gastos} cargando="Cargando gastos…">
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="No hay gastos con estos filtros">Prueba con otro rango de fechas.</Vacio>
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
                  {lista.map((g) => (
                    <tr key={g.id}>
                      <td>{formatearDia(g.fecha)}</td>
                      <td>{categoria.get(g.categoriaId) ?? "—"}</td>
                      <td className="ajustable">{g.descripcion}</td>
                      <td className="num">
                        <Monto valor={g.monto} moneda={monedaBase} />
                      </td>
                      <td>{MEDIO_PAGO[g.medioPago]}</td>
                      <td>{nombre(g.usuarioId)}</td>
                      <td>
                        <Etiqueta tono={ESTADO_GASTO[g.estado].tono}>{ESTADO_GASTO[g.estado].texto}</Etiqueta>
                      </td>
                      {esSupervisor && (
                        <td>
                          {g.estado === "VIGENTE" && (
                            <Boton variante="texto" tamano="chico" onClick={() => setReversando(g)}>
                              Reversar
                            </Boton>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            )
          }
        </ConDatos>
      </Tarjeta>
      <ReversarGasto gasto={reversando} alCerrar={() => setReversando(null)} />
    </Columnas>
  );
}

type ValoresGasto = { categoriaId: string; descripcion: string; monto: string; medioPago: MedioPago; fecha: string; documento: string };

function RegistrarGasto() {
  const { usuario, turnoAbierto } = usePersonal();
  const catalogo = useCatalogo();
  const esAdmin = usuario.rol === "ADMIN";
  return (
    <Tarjeta titulo="Registrar gasto" descripcion="En efectivo sale de la caja de tu turno. Otros medios, solo el admin.">
      {!turnoAbierto && !esAdmin && <Aviso tono="atencion">Necesitas un turno abierto para registrar gastos en efectivo.</Aviso>}
      <ConDatos consulta={catalogo}>{(datos) => <FormularioGasto categorias={datos.categoriasGasto} esAdmin={esAdmin} />}</ConDatos>
    </Tarjeta>
  );
}

function FormularioGasto({ categorias, esAdmin }: { categorias: { id: number; nombre: string }[]; esAdmin: boolean }) {
  const monedaBase = useMonedaBase();
  const decimales = useDecimales()(monedaBase);
  const registrar = useRegistrarGasto();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valoresIniciales = (): ValoresGasto => ({
    categoriaId: String(categorias[0]?.id ?? ""),
    descripcion: "",
    monto: "",
    medioPago: "EFECTIVO",
    fecha: hoy(),
    documento: "",
  });
  const {
    register,
    handleSubmit,
    reset,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<ValoresGasto>({ defaultValues: valoresIniciales() });

  const alEnviar = handleSubmit(async (v) => {
    setListo(null);
    setError(null);
    try {
      await registrar.mutateAsync({
        categoriaId: Number(v.categoriaId),
        descripcion: v.descripcion.trim(),
        monto: leerMonto(v.monto, decimales) ?? "",
        medioPago: v.medioPago,
        fecha: v.fecha || undefined,
        documento: v.documento.trim() || null,
      });
      reset(valoresIniciales());
      setListo("Gasto registrado.");
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, ["descripcion", "monto", "fecha", "documento"], {
          porCodigo: { FALTA_DESCRIPCION: "descripcion", MONTO_INVALIDO: "monto", SALDO_INSUFICIENTE: "monto", FECHA_FUTURA: "fecha", FECHA_INVALIDA: "fecha" },
        }),
      );
    }
  });

  return (
    <>
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <Seleccion etiqueta="Categoría" {...register("categoriaId")}>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Seleccion>
        <Entrada
          etiqueta="Descripción"
          placeholder="Rollos de papel para boletas"
          error={errors.descripcion?.message}
          {...register("descripcion", { validate: (t) => t.trim() !== "" || "Describe el gasto" })}
        />
        <FilaCampos>
          <Entrada
            etiqueta="Monto"
            inputMode="numeric"
            placeholder="0"
            sufijo={monedaBase}
            error={errors.monto?.message}
            {...register("monto", { validate: reglaMonto(decimales) })}
          />
          <Seleccion etiqueta="Medio de pago" {...register("medioPago")}>
            {MEDIOS.map((m) => (
              <option key={m} value={m} disabled={m !== "EFECTIVO" && !esAdmin}>
                {MEDIO_PAGO[m]}
              </option>
            ))}
          </Seleccion>
        </FilaCampos>
        <FilaCampos>
          <Entrada etiqueta="Fecha" type="date" max={hoy()} error={errors.fecha?.message} {...register("fecha")} />
          <Entrada etiqueta="Documento" placeholder="Boleta 1234" error={errors.documento?.message} {...register("documento")} />
        </FilaCampos>
        <Boton type="submit" variante="primario" cargando={isSubmitting}>
          Registrar gasto
        </Boton>
      </form>
    </>
  );
}

function ReversarGasto({ gasto, alCerrar }: { gasto: Gasto | null; alCerrar: () => void }) {
  const reversar = useReversarGasto();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<{ motivo: string }>({ defaultValues: { motivo: "" } });

  const cerrar = () => {
    reset();
    reversar.reset();
    alCerrar();
  };

  const alEnviar = handleSubmit(async ({ motivo }) => {
    if (!gasto) return;
    try {
      await reversar.mutateAsync({ id: gasto.id, motivo: motivo.trim() });
      cerrar();
    } catch {
      // el mensaje queda en reversar.error
    }
  });

  return (
    <Dialogo
      abierto={gasto !== null}
      alCerrar={cerrar}
      titulo="Reversar gasto"
      descripcion={gasto ? `${gasto.descripcion}. Si salió de la caja, el dinero vuelve a ella. Queda registrado quién lo reversó y por qué.` : undefined}
      acciones={
        <>
          <Boton onClick={cerrar}>Cancelar</Boton>
          <Boton type="submit" form="reversar-gasto" variante="primario" cargando={isSubmitting}>
            Reversar gasto
          </Boton>
        </>
      }
    >
      {gasto ? (
        <form id="reversar-gasto" className={css.formulario} onSubmit={alEnviar} noValidate>
          {reversar.isError && <Aviso tono="error">{mensajeDe(reversar.error)}</Aviso>}
          <AreaTexto etiqueta="Motivo" error={errors.motivo?.message} {...register("motivo", { validate: MOTIVO_OBLIGATORIO })} />
        </form>
      ) : (
        <Cargando />
      )}
    </Dialogo>
  );
}
