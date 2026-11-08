// Ficha de cliente con los datos que exige la UAF (RF-17) y su categoría de
// fidelización (RF-18).

import { and, asc, eq, like, or } from "drizzle-orm";
import { categoriaCliente, cliente, type Cliente, type TIPOS_DOCUMENTO } from "../db/esquema.ts";
import { auditar } from "./auditoria.ts";
import { enTransaccion, ErrorNegocio, exigir, exigirRol, limpiar, type Actor, type Contexto, type Datos } from "./contexto.ts";

export type EntradaCliente = {
  tipoDocumento: (typeof TIPOS_DOCUMENTO)[number];
  numeroDocumento: string;
  nombre: string;
  nacionalidad?: string | null;
  oficio?: string | null;
  paisResidencia?: string | null;
  domicilio?: string | null;
  telefono?: string | null;
  email?: string | null;
  relacionPermanente?: boolean;
  /** Categoría de fidelización (RF-18); null sin categoría */
  categoriaId?: number | null;
};

/** RUT chileno con dígito verificador correcto ("12.345.678-5" o "12345678-5"). */
export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/\./g, "").trim().toUpperCase();
  const partes = /^(\d{1,8})-([\dK])$/.exec(limpio);
  if (!partes) return false;
  const [, cuerpo = "", dv] = partes;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** Lo que le falta a una ficha para cumplir con la UAF; vacío si está completa. */
export function faltantesFicha(c: Cliente): string[] {
  const faltan: string[] = [];
  if (!c.nacionalidad) faltan.push("nacionalidad");
  if (!c.oficio) faltan.push("oficio o profesión");
  if (!c.paisResidencia) faltan.push("país de residencia");
  if (!c.domicilio) faltan.push("domicilio");
  if (!c.telefono && !c.email) faltan.push("contacto (teléfono o email)");
  return faltan;
}

function normalizar(entrada: EntradaCliente) {
  const nombre = limpiar(entrada.nombre);
  exigir(nombre, "DATO_FALTANTE", "Indique el nombre del cliente");
  let numeroDocumento = limpiar(entrada.numeroDocumento)?.toUpperCase();
  exigir(numeroDocumento, "DATO_FALTANTE", "Indique el número de documento");
  if (entrada.tipoDocumento === "RUT") {
    exigir(rutValido(numeroDocumento), "RUT_INVALIDO", `El RUT ${numeroDocumento} no es válido`);
    numeroDocumento = numeroDocumento.replace(/\./g, "");
  }

  const pais = (valor: string | null | undefined, campo: string) => {
    const codigo = limpiar(valor)?.toUpperCase() ?? null;
    exigir(codigo === null || /^[A-Z]{2}$/.test(codigo), "PAIS_INVALIDO", `${campo}: use el código ISO de 2 letras (por ejemplo CL, AR)`);
    return codigo;
  };

  return {
    tipoDocumento: entrada.tipoDocumento,
    numeroDocumento,
    nombre,
    nacionalidad: pais(entrada.nacionalidad, "Nacionalidad"),
    oficio: limpiar(entrada.oficio),
    paisResidencia: pais(entrada.paisResidencia, "País de residencia"),
    domicilio: limpiar(entrada.domicilio),
    telefono: limpiar(entrada.telefono),
    email: limpiar(entrada.email),
    relacionPermanente: entrada.relacionPermanente ?? false,
    categoriaId: entrada.categoriaId ?? null,
  };
}

function exigirCategoriaActiva(tx: Datos, categoriaId: number | null): void {
  if (categoriaId === null) return;
  const categoria = tx.select().from(categoriaCliente).where(eq(categoriaCliente.id, categoriaId)).get();
  exigir(categoria?.activa, "CATEGORIA_INVALIDA", "La categoría de cliente no existe o está inactiva");
}

function exigirDocumentoLibre(tx: Datos, tipo: Cliente["tipoDocumento"], numero: string, salvoId?: number) {
  const existente = tx
    .select({ id: cliente.id, nombre: cliente.nombre })
    .from(cliente)
    .where(and(eq(cliente.tipoDocumento, tipo), eq(cliente.numeroDocumento, numero)))
    .get();
  if (existente && existente.id !== salvoId) {
    throw new ErrorNegocio("CLIENTE_DUPLICADO", `Ya existe un cliente con ${tipo} ${numero}: ${existente.nombre}`);
  }
}

export function crearCliente(ctx: Contexto, actor: Actor, entrada: EntradaCliente): Cliente {
  return enTransaccion(ctx, (tx) => {
    const datos = normalizar(entrada);
    exigirDocumentoLibre(tx, datos.tipoDocumento, datos.numeroDocumento);
    exigirCategoriaActiva(tx, datos.categoriaId);
    const ahora = ctx.ahora();
    const nuevo = tx.insert(cliente).values({ ...datos, creadoEn: ahora, actualizadoEn: ahora }).returning().get();
    auditar(tx, ctx, { tabla: "cliente", registroId: nuevo.id, accion: "CREAR", usuarioId: actor.id, despues: nuevo });
    return nuevo;
  });
}

export function editarCliente(ctx: Contexto, actor: Actor, id: number, cambios: Partial<EntradaCliente>): Cliente {
  return enTransaccion(ctx, (tx) => {
    const actual = tx.select().from(cliente).where(eq(cliente.id, id)).get();
    exigir(actual, "CLIENTE_NO_EXISTE", `El cliente ${id} no existe`);
    const datos = normalizar({ ...actual, ...cambios });
    exigirDocumentoLibre(tx, datos.tipoDocumento, datos.numeroDocumento, id);
    if (datos.categoriaId !== actual.categoriaId) exigirCategoriaActiva(tx, datos.categoriaId);
    const editado = tx
      .update(cliente)
      .set({ ...datos, actualizadoEn: ctx.ahora() })
      .where(eq(cliente.id, id))
      .returning()
      .get();
    auditar(tx, ctx, { tabla: "cliente", registroId: id, accion: "EDITAR", usuarioId: actor.id, antes: actual, despues: editado });
    return editado;
  });
}

export function obtenerCliente(datos: Datos, id: number): Cliente | null {
  return datos.select().from(cliente).where(eq(cliente.id, id)).get() ?? null;
}

/** Busca por nombre o documento (sin distinguir mayúsculas). */
export function buscarClientes(datos: Datos, texto: string, limite = 20): Cliente[] {
  const patron = `%${texto.trim().replace(/[%_]/g, "")}%`;
  return datos
    .select()
    .from(cliente)
    .where(or(like(cliente.nombre, patron), like(cliente.numeroDocumento, patron)))
    .orderBy(asc(cliente.nombre))
    .limit(limite)
    .all();
}

/** Categorías de fidelización activas (RF-18). */
export function categoriasDeCliente(datos: Datos) {
  return datos.select().from(categoriaCliente).where(eq(categoriaCliente.activa, true)).orderBy(asc(categoriaCliente.nombre)).all();
}

/** Crea una categoría de fidelización: cuánto se reduce el margen a sus clientes. */
export function crearCategoriaCliente(ctx: Contexto, actor: Actor, entrada: { nombre: string; descuentoMargenPctE6: bigint }) {
  exigirRol(actor, ["ADMIN"], "Crear categorías de cliente");
  return enTransaccion(ctx, (tx) => {
    const nombre = limpiar(entrada.nombre);
    exigir(nombre, "DATO_FALTANTE", "Indique el nombre de la categoría");
    exigir(
      entrada.descuentoMargenPctE6 > 0n && entrada.descuentoMargenPctE6 <= 100_000_000n,
      "DESCUENTO_INVALIDO",
      "El descuento del margen debe estar entre 0 % y 100 %",
    );
    const existente = tx.select({ id: categoriaCliente.id }).from(categoriaCliente).where(eq(categoriaCliente.nombre, nombre)).get();
    exigir(!existente, "CATEGORIA_DUPLICADA", `Ya existe la categoría ${nombre}`);
    const nueva = tx.insert(categoriaCliente).values({ nombre, descuentoMargenPctE6: entrada.descuentoMargenPctE6 }).returning().get();
    auditar(tx, ctx, { tabla: "categoria_cliente", registroId: nueva.id, accion: "CREAR", usuarioId: actor.id, despues: nueva });
    return nueva;
  });
}
