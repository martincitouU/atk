// Portal del cliente: solo lectura de lo suyo (GET /api/mi/operaciones y
// /api/mi/ficha). Mientras la cuenta no está verificada, solo ve qué hacer.
//
// Las operaciones se cuentan desde el cliente: si la casa VENDIÓ dólares,
// el cliente los COMPRÓ.

import { Clock, IdCard, ShieldCheck } from "lucide-react";
import { useDecimalesTasa, useMiFicha, useMisOperaciones, useMonedaBase } from "../../api/consultas.ts";
import type { CuentaYo } from "../../api/tipos.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { IconoDivisa } from "../../componentes/Divisa.tsx";
import { EncabezadoPagina } from "../../componentes/EncabezadoPagina.tsx";
import { ConDatos, Vacio } from "../../componentes/Estados.tsx";
import { Etiqueta } from "../../componentes/Etiqueta.tsx";
import { Monto, Tasa } from "../../componentes/Monto.tsx";
import { Columnas, Datos, Pagina } from "../../componentes/Pagina.tsx";
import { Tarjeta } from "../../componentes/Tarjeta.tsx";
import { formatearFechaHora } from "../../lib/fechas.ts";
import { formatearRut } from "../../lib/rut.ts";
import { ESTADO_CUENTA, MEDIO_PAGO, TIPO_DOCUMENTO, TIPO_DTE } from "../../lib/textos.ts";
import { useSesion } from "../../sesion/Sesion.tsx";
import css from "./MiCuenta.module.css";

export function MiCuenta() {
  const { sesion } = useSesion();
  if (sesion?.tipo !== "cliente") return null;
  const { cuenta } = sesion;
  const primerNombre = cuenta.nombre.split(" ")[0];

  return (
    <Pagina>
      <EncabezadoPagina
        titulo={`Hola, ${primerNombre}`}
        descripcion={
          <>
            RUT {formatearRut(cuenta.rut)} · <Etiqueta tono={ESTADO_CUENTA[cuenta.estado].tono}>{ESTADO_CUENTA[cuenta.estado].texto}</Etiqueta>
          </>
        }
      />
      {cuenta.estado === "VERIFICADA" ? <Verificada /> : <PorVerificar cuenta={cuenta} />}
    </Pagina>
  );
}

function PorVerificar({ cuenta }: { cuenta: CuentaYo }) {
  if (cuenta.estado === "RECHAZADA") {
    return (
      <Aviso tono="error" titulo="No pudimos verificar tu cuenta">
        {cuenta.motivoRechazo ?? "El carnet no coincidió con los datos registrados."} Si crees que es un error, acércate al local.
      </Aviso>
    );
  }
  const pasos = [
    { icono: IdCard, titulo: "Acércate al local con tu carnet", texto: "Cualquier día de atención, en Coyhaique." },
    { icono: ShieldCheck, titulo: "Un cajero confirma que el RUT es tuyo", texto: "Así nadie más puede ver tus operaciones." },
    { icono: Clock, titulo: "Tus operaciones aparecen aquí", texto: "Las compras y ventas que hiciste con nosotros." },
  ];
  return (
    <Tarjeta
      elevada
      titulo="Tu cuenta está pendiente de verificación"
      descripcion="Mientras tanto no mostramos datos: cualquiera podría registrarse con un RUT ajeno."
    >
      <ol className={css.pasos}>
        {pasos.map(({ icono: Icono, titulo, texto }, i) => (
          <li key={titulo} className={css.paso}>
            <span className={css.numeroPaso} aria-hidden>
              {i + 1}
            </span>
            <Icono size={20} aria-hidden className={css.iconoPaso} />
            <div>
              <p>{titulo}</p>
              <p className={css.textoPaso}>{texto}</p>
            </div>
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

function Verificada() {
  const operaciones = useMisOperaciones(true);
  const ficha = useMiFicha(true);
  const decimalesTasa = useDecimalesTasa();
  const monedaBase = useMonedaBase();

  return (
    <Columnas
      lateral={
        <Tarjeta titulo="Mis datos" descripcion="Si algo está mal, avísanos en el local.">
          <ConDatos consulta={ficha}>
            {(datos) => (
              <Datos
                filas={[
                  { etiqueta: "Nombre", valor: datos.nombre },
                  {
                    etiqueta: TIPO_DOCUMENTO[datos.tipoDocumento],
                    valor: datos.tipoDocumento === "RUT" ? formatearRut(datos.numeroDocumento) : datos.numeroDocumento,
                  },
                  { etiqueta: "Nacionalidad", valor: datos.nacionalidad ?? "—" },
                  { etiqueta: "Domicilio", valor: datos.domicilio ?? "—" },
                  { etiqueta: "Teléfono", valor: datos.telefono ?? "—" },
                  { etiqueta: "Correo", valor: datos.email ?? "—" },
                ]}
              />
            )}
          </ConDatos>
        </Tarjeta>
      }
    >
      <Tarjeta titulo="Mis operaciones" sinRelleno>
        <ConDatos consulta={operaciones}>
          {(lista) =>
            lista.length === 0 ? (
              <Vacio titulo="Todavía no hay operaciones">Cuando compres o vendas divisas con nosotros, aparecerán aquí.</Vacio>
            ) : (
              // Lista y no tabla: los clientes la revisan sobre todo desde el teléfono
              <ul className={css.operaciones}>
                {lista.map((o) => (
                  <li key={o.id} className={css.operacion}>
                    <IconoDivisa codigo={o.monedaCodigo} tamano={36} />
                    <div className={css.queHizo}>
                      <p>
                        {o.tipo === "VENTA" ? "Compraste" : "Vendiste"} <Monto valor={o.montoDivisa} moneda={o.monedaCodigo} />{" "}
                        {o.estado === "REVERSADA" && <Etiqueta tono="error">Anulada</Etiqueta>}
                      </p>
                      <p className={css.detalleOperacion}>
                        {formatearFechaHora(o.realizadaEn)} · Tasa <Tasa valorE6={o.tasaAplicadaE6} decimales={decimalesTasa(o.monedaCodigo)} /> ·{" "}
                        {MEDIO_PAGO[o.medioPago]}
                        {o.tipoDte ? ` · ${TIPO_DTE[o.tipoDte]} ${o.folioDte}` : ""}
                      </p>
                    </div>
                    <p className={css.pesos}>
                      <span className="solo-lectores">{o.tipo === "VENTA" ? "Pagaste" : "Recibiste"} </span>
                      <Monto valor={o.montoBase} moneda={monedaBase} />
                    </p>
                  </li>
                ))}
              </ul>
            )
          }
        </ConDatos>
      </Tarjeta>
    </Columnas>
  );
}
