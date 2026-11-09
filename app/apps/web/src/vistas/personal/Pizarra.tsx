// Pizarra: las tasas vigentes de cada divisa (GET /api/pizarra). Compra y
// venta se leen desde la casa: "Compra" es lo que paga la casa por la divisa.
// El admin publica tasas nuevas (POST /api/cotizaciones; el formulario se
// conecta en F3).

import { useState } from "react";
import { useCatalogo, usePizarra } from "../../api/consultas.ts";
import type { FilaPizarra, TipoMargen } from "../../api/tipos.ts";
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
import { formatearPorcentaje, formatearTasa } from "../../lib/montos.ts";
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
      {usuario.rol === "ADMIN" && <Publicar />}
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

function Publicar() {
  const { data: catalogo } = useCatalogo();
  const [tipoMargen, setTipoMargen] = useState<TipoMargen>("PORCENTAJE");
  const sufijo = tipoMargen === "PORCENTAJE" ? "%" : "CLP";

  return (
    <Tarjeta
      titulo="Publicar una tasa"
      descripcion="La pizarra se calcula con la referencia y los márgenes. Cambiar un margen crea una regla nueva: las operaciones conservan la suya."
    >
      <form className={css.formulario} onSubmit={(e) => e.preventDefault()}>
        <FilaCampos>
          <Seleccion etiqueta="Divisa">
            {catalogo?.divisas.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.codigo} · {d.nombre}
              </option>
            ))}
          </Seleccion>
          <Entrada etiqueta="Tasa de referencia" inputMode="decimal" placeholder="940,00" sufijo="CLP" />
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
            alCambiar={setTipoMargen}
          />
        </div>
        <FilaCampos>
          <Entrada etiqueta="Margen de compra" inputMode="decimal" placeholder="1,5" sufijo={sufijo} />
          <Entrada etiqueta="Margen de venta" inputMode="decimal" placeholder="1,5" sufijo={sufijo} />
        </FilaCampos>
        <div className={css.acciones}>
          <Boton type="submit" variante="primario">
            Publicar tasa
          </Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
