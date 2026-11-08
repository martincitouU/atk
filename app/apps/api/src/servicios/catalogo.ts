// Consultas pequeñas que usan varios servicios: monedas, cajas y sucursales.

import { and, asc, eq } from "drizzle-orm";
import { caja, casa, casaMoneda, categoriaCliente, categoriaGasto, moneda, sucursal } from "../db/esquema.ts";
import { ErrorNegocio, exigir, type Datos } from "./contexto.ts";
import { leerParametros } from "./parametros.ts";

export type InfoMoneda = { codigo: string; decimales: number };

export function monedaBase(datos: Datos): InfoMoneda {
  const fila = datos
    .select({ codigo: moneda.codigo, decimales: moneda.decimales })
    .from(casa)
    .innerJoin(moneda, eq(moneda.codigo, casa.monedaBase))
    .where(eq(casa.id, 1))
    .get();
  if (!fila) throw new ErrorNegocio("SIN_CONFIGURACION", "La casa de cambio todavía no está configurada");
  return fila;
}

export function infoMoneda(datos: Datos, codigo: string): InfoMoneda {
  const fila = datos.select({ codigo: moneda.codigo, decimales: moneda.decimales }).from(moneda).where(eq(moneda.codigo, codigo)).get();
  exigir(fila, "MONEDA_DESCONOCIDA", `La moneda ${codigo} no existe en el catálogo`);
  return fila;
}

/** Una divisa que la casa opera y tiene activa. */
export function divisaHabilitada(datos: Datos, codigo: string) {
  const fila = datos
    .select()
    .from(casaMoneda)
    .where(and(eq(casaMoneda.monedaCodigo, codigo), eq(casaMoneda.activa, true)))
    .get();
  exigir(fila, "MONEDA_NO_HABILITADA", `La divisa ${codigo} no está habilitada en esta casa de cambio`);
  return fila;
}

export function sucursalDeCaja(datos: Datos, cajaId: number): number {
  const fila = datos.select({ sucursalId: caja.sucursalId }).from(caja).where(eq(caja.id, cajaId)).get();
  exigir(fila, "CAJA_NO_EXISTE", `La caja ${cajaId} no existe`);
  return fila.sucursalId;
}

/**
 * Todo lo fijo que el front necesita al cargar: la casa, sus divisas, las
 * sucursales y cajas, las categorías y los parámetros. Una sola consulta.
 */
export function catalogo(datos: Datos) {
  const laCasa = datos.select().from(casa).where(eq(casa.id, 1)).get() ?? null;
  const divisas = datos
    .select({
      codigo: moneda.codigo,
      nombre: moneda.nombre,
      simbolo: moneda.simbolo,
      decimales: moneda.decimales,
      decimalesTasa: casaMoneda.decimalesTasa,
      montoMinimo: casaMoneda.montoMinimo,
      ordenPizarra: casaMoneda.ordenPizarra,
    })
    .from(casaMoneda)
    .innerJoin(moneda, eq(moneda.codigo, casaMoneda.monedaCodigo))
    .where(eq(casaMoneda.activa, true))
    .orderBy(asc(casaMoneda.ordenPizarra))
    .all();
  return {
    casa: laCasa,
    monedaBase: laCasa ? infoMoneda(datos, laCasa.monedaBase) : null,
    divisas,
    sucursales: datos.select().from(sucursal).where(eq(sucursal.activa, true)).orderBy(asc(sucursal.nombre)).all(),
    cajas: datos.select().from(caja).where(eq(caja.activa, true)).orderBy(asc(caja.nombre)).all(),
    categoriasGasto: datos.select().from(categoriaGasto).where(eq(categoriaGasto.activa, true)).orderBy(asc(categoriaGasto.nombre)).all(),
    categoriasCliente: datos.select().from(categoriaCliente).where(eq(categoriaCliente.activa, true)).orderBy(asc(categoriaCliente.nombre)).all(),
    parametros: leerParametros(datos),
  };
}
