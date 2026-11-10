// Pizarra: las tasas vigentes de cada divisa (GET /api/pizarra). Compra y
// venta se leen desde la casa: "Compra" es lo que paga la casa por la divisa.
// El admin publica tasas nuevas (POST /api/cotizaciones). El formulario
// parte con los valores vigentes de la divisa: lo común es mover solo la
// referencia. Cambiar un margen crea una regla nueva; las operaciones
// conservan la suya.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { usePublicarTasa } from "../../api/acciones.ts";
import { useCatalogo, usePizarra } from "../../api/consultas.ts";
import type { FilaPizarra, TipoMargen } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { Boton } from "../../componentes/Boton.tsx";
import { Entrada, FilaCampos, Seleccion } from "../../componentes/Campo.tsx";
import { IconoDivisa } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Grilla, Pagina } from "../../componentes/Pagina.tsx";
import { Segmentado } from "../../componentes/Segmentado.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { errorEnFormulario } from "../../lib/formularios.ts";
import { formatearPorcentaje, formatearTasa, leerTasa } from "../../lib/montos.ts";
import { usePersonal } from "../../sesion/Sesion.tsx";
import css from "./Pizarra.module.css";

export function Pizarra() {
  const { usuario } = usePersonal();
  const pizarra = usePizarra();

  return (
    <Pagina>
      <EncabezadoPagina titulo="Pizarra" descripcion="Tasas vigentes en pesos por unidad. Compra y venta, desde la casa." />
      <ConDatos consulta={pizarra} cargando="Cargando la pizarra…">
        {(filas) =>
          filas.length === 0 ? (
            <Vacio titulo="La casa todavía no tiene divisas">Se configuran al inicializar la casa de cambio.</Vacio>
          ) : (
            <Grilla minimo={260}>
              {filas.map((fila) => (
                <TarjetaDivisa key={fila.monedaCodigo} fila={fila} />
              ))}
            </Grilla>
          )
        }
      </ConDatos>
      {usuario.rol === "ADMIN" && pizarra.data && <Publicar filas={pizarra.data} />}
    </Pagina>
  );
}

function TarjetaDivisa({ fila }: { fila: FilaPizarra }) {
  const sinTasa = fila.compraE6 === null;
  const margen = (valor: string | null) =>
    valor === null ? "—" : fila.tipoMargen === "MONTO_FIJO" ? `$ ${formatearTasa(valor, fila.decimalesTasa)}` : formatearPorcentaje(valor);

  return (
    <article className={css.divisa}>
      <header className={css.cabecera}>
        <IconoDivisa codigo={fila.monedaCodigo} tamano={36} />
        <div className={css.nombres}>
          <h2 className={css.codigo}>{fila.monedaCodigo}</h2>
          <p className={css.nombre}>{fila.nombre}</p>
        </div>
        {sinTasa ? <Etiqueta>Sin tasa</Etiqueta> : fila.vencida ? <Etiqueta tono="error">Vencida</Etiqueta> : <Etiqueta tono="vivo">Vigente</Etiqueta>}
      </header>

      <dl className={css.precios}>
        <div>
          <dt>Compra</dt>
          <dd className="num">{fila.compraE6 ? formatearTasa(fila.compraE6, fila.decimalesTasa) : "—"}</dd>
        </div>
        <div>
          <dt>Venta</dt>
          <dd className="num">{fila.ventaE6 ? formatearTasa(fila.ventaE6, fila.decimalesTasa) : "—"}</dd>
        </div>
      </dl>

      <p className={css.pie}>
        Referencia {fila.referenciaE6 ? formatearTasa(fila.referenciaE6, fila.decimalesTasa) : "—"} · Margen {margen(fila.margenCompraE6)} /{" "}
        {margen(fila.margenVentaE6)}
      </p>
      {fila.vigenteDesde && <p className={css.pie}>Publicada el {formatearFechaHora(fila.vigenteDesde)}</p>}
    </article>
  );
}

type ValoresPublicacion = { monedaCodigo: string; referencia: string; tipoMargen: TipoMargen; margenCompra: string; margenVenta: string };

/** Los valores vigentes de una divisa, como se escriben ("940,00", "1,5"). */
function valoresVigentes(fila: FilaPizarra | undefined, monedaCodigo: string): ValoresPublicacion {
  const tipoMargen = fila?.tipoMargen ?? "PORCENTAJE";
  const margen = (valor: string | null | undefined) => (valor ? formatearTasa(valor, tipoMargen === "PORCENTAJE" ? 0 : (fila?.decimalesTasa ?? 2)) : "");
  return {
    monedaCodigo,
    referencia: fila?.referenciaE6 ? formatearTasa(fila.referenciaE6, fila.decimalesTasa) : "",
    tipoMargen,
    margenCompra: margen(fila?.margenCompraE6),
    margenVenta: margen(fila?.margenVentaE6),
  };
}

const reglaTasa =
  (opciones: { cero?: boolean } = {}) =>
  (texto: string) => {
    if (!texto.trim()) return "Escribe el valor";
    const valor = leerTasa(texto);
    if (valor === null) return "Escribe el número con coma para los decimales, por ejemplo 1,5";
    return opciones.cero || BigInt(valor) > 0n || "Debe ser mayor que cero";
  };

function Publicar({ filas }: { filas: FilaPizarra[] }) {
  const { data: catalogo } = useCatalogo();
  const publicar = usePublicarTasa();
  const [listo, setListo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const primera = filas[0]?.monedaCodigo ?? "";
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError: marcar,
    formState: { errors, isSubmitting },
  } = useForm<ValoresPublicacion>({ defaultValues: valoresVigentes(filas[0], primera) });
  const tipoMargen = watch("tipoMargen");
  const sufijo = tipoMargen === "PORCENTAJE" ? "%" : "CLP";

  const alEnviar = handleSubmit(async (v) => {
    setListo(null);
    setError(null);
    try {
      await publicar.mutateAsync({
        monedaCodigo: v.monedaCodigo,
        referenciaE6: leerTasa(v.referencia) ?? "",
        tipoMargen: v.tipoMargen,
        margenCompraE6: leerTasa(v.margenCompra) ?? "",
        margenVentaE6: leerTasa(v.margenVenta) ?? "",
      });
      setListo(`Tasa de ${v.monedaCodigo} publicada: la pizarra ya cambió.`);
    } catch (e) {
      setError(
        errorEnFormulario(e, marcar, [], {
          nombres: { referenciaE6: "referencia", margenCompraE6: "margenCompra", margenVentaE6: "margenVenta" },
          porCodigo: { REFERENCIA_INVALIDA: "referencia" },
        }),
      );
    }
  });

  return (
    <Tarjeta
      titulo="Publicar una tasa"
      descripcion="La pizarra se calcula con la referencia y los márgenes. Cambiar un margen crea una regla nueva: las operaciones conservan la suya."
    >
      {listo && <Aviso tono="exito">{listo}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}
      <form className={css.formulario} onSubmit={alEnviar} noValidate>
        <FilaCampos>
          <Seleccion
            etiqueta="Divisa"
            {...register("monedaCodigo", {
              // Al cambiar de divisa, se parte de sus valores vigentes
              onChange: (e: { target: { value: string } }) =>
                reset(
                  valoresVigentes(
                    filas.find((f) => f.monedaCodigo === e.target.value),
                    e.target.value,
                  ),
                ),
            })}
          >
            {catalogo?.divisas.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.codigo} · {d.nombre}
              </option>
            ))}
          </Seleccion>
          <Entrada
            etiqueta="Tasa de referencia"
            inputMode="decimal"
            placeholder="940,00"
            sufijo="CLP"
            error={errors.referencia?.message}
            {...register("referencia", { validate: reglaTasa() })}
          />
        </FilaCampos>
        <div className={css.grupo}>
          <span className={css.etiquetaGrupo}>Tipo de margen</span>
          <Segmentado
            etiqueta="Tipo de margen"
            opciones={[
              { valor: "PORCENTAJE", texto: "Porcentaje" },
              { valor: "MONTO_FIJO", texto: "Monto fijo" },
            ]}
            valor={tipoMargen}
            alCambiar={(valor) => setValue("tipoMargen", valor)}
          />
        </div>
        <FilaCampos>
          <Entrada
            etiqueta="Margen de compra"
            inputMode="decimal"
            placeholder="1,5"
            sufijo={sufijo}
            error={errors.margenCompra?.message}
            {...register("margenCompra", { validate: reglaTasa({ cero: true }) })}
          />
          <Entrada
            etiqueta="Margen de venta"
            inputMode="decimal"
            placeholder="1,5"
            sufijo={sufijo}
            error={errors.margenVenta?.message}
            {...register("margenVenta", { validate: reglaTasa({ cero: true }) })}
          />
        </FilaCampos>
        <div className={css.acciones}>
          <Boton type="submit" variante="primario" cargando={isSubmitting}>
            Publicar tasa
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
