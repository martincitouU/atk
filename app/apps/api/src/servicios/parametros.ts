// Parámetros del rubro (tabla parametro), leídos con su tipo. Un parámetro
// faltante o mal escrito es un error de configuración, no del usuario.

import { parametro } from "../db/esquema.ts";
import { leerDecimal } from "../dominio/dinero.ts";
import type { Datos } from "./contexto.ts";

export type Parametros = {
  zonaHoraria: string;
  /** En dólares enteros: 5000 = US$ 5.000 */
  umbralFichaClienteUsd: bigint;
  umbralRoeUsd: bigint;
  permitirSaldoNegativo: boolean;
  vigenciaCotizacionMinutos: number;
  reversoRequiereSupervisor: boolean;
  desviacionMaximaPreferencialPctE6: bigint;
  folioObligatorioAlConfirmar: boolean;
  sesionInactividadMinutos: number;
};

type TipoDato = (typeof parametro.$inferSelect)["tipoDato"];

export function leerParametros(datos: Datos): Parametros {
  const porClave = new Map(datos.select().from(parametro).all().map((fila) => [fila.clave, fila]));

  function valor(clave: string, tipo: TipoDato): string {
    const fila = porClave.get(clave);
    if (!fila) throw new Error(`Falta el parámetro "${clave}"`);
    if (fila.tipoDato !== tipo) throw new Error(`El parámetro "${clave}" debe ser ${tipo} y es ${fila.tipoDato}`);
    return fila.valor;
  }

  function entero(clave: string): bigint {
    const texto = valor(clave, "ENTERO");
    if (!/^-?\d+$/.test(texto)) throw new Error(`El parámetro "${clave}" no es un entero: "${texto}"`);
    return BigInt(texto);
  }

  function booleano(clave: string): boolean {
    const texto = valor(clave, "BOOLEANO");
    if (texto !== "true" && texto !== "false") throw new Error(`El parámetro "${clave}" no es true ni false: "${texto}"`);
    return texto === "true";
  }

  return {
    zonaHoraria: valor("zona_horaria", "TEXTO"),
    umbralFichaClienteUsd: entero("umbral_ficha_cliente_usd"),
    umbralRoeUsd: entero("umbral_roe_usd"),
    permitirSaldoNegativo: booleano("permitir_saldo_negativo"),
    vigenciaCotizacionMinutos: Number(entero("vigencia_cotizacion_minutos")),
    reversoRequiereSupervisor: booleano("reverso_requiere_supervisor"),
    desviacionMaximaPreferencialPctE6: leerDecimal(valor("desviacion_maxima_preferencial_pct", "DECIMAL")),
    folioObligatorioAlConfirmar: booleano("folio_obligatorio_al_confirmar"),
    sesionInactividadMinutos: Number(entero("sesion_inactividad_minutos")),
  };
}
