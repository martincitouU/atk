// Lo que todo servicio recibe: la base, el reloj y quién actúa.

import type Database from "better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { Db } from "../db/conexion.ts";
import type * as esquema from "../db/esquema.ts";
import type { Rol } from "../db/esquema.ts";

/** Una conexión o una transacción abierta: las consultas funcionan igual en ambas. */
export type Datos = BaseSQLiteDatabase<"sync", Database.RunResult, typeof esquema>;

export type Contexto = {
  db: Db;
  /** Reloj inyectable: los tests lo controlan para probar vencimientos y registros diferidos. */
  ahora: () => Date;
};

/** Quién ejecuta la acción. El rol es el de la tabla usuario. */
export type Actor = { id: number; rol: Rol };

export function crearContexto(db: Db, ahora: () => Date = () => new Date()): Contexto {
  return { db, ahora };
}

/**
 * Error esperable del negocio (falta un dato, no hay saldo, no tiene
 * permiso...). La API lo convierte en una respuesta 4xx con su mensaje,
 * que está escrito para mostrarlo tal cual al usuario.
 */
export class ErrorNegocio extends Error {
  readonly codigo: string;

  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorNegocio";
    this.codigo = codigo;
  }
}

export function exigir(condicion: unknown, codigo: string, mensaje: string): asserts condicion {
  if (!condicion) throw new ErrorNegocio(codigo, mensaje);
}

export const esSupervisor = (actor: Actor): boolean => actor.rol === "SUPERVISOR" || actor.rol === "ADMIN";

export function exigirRol(actor: Actor, roles: readonly Rol[], accion: string): void {
  if (!roles.includes(actor.rol)) {
    throw new ErrorNegocio("SIN_PERMISO", `${accion} requiere rol ${roles.join(" o ")}`);
  }
}

/** Corre `trabajo` en una transacción IMMEDIATE: se guarda todo o nada. */
export function enTransaccion<T>(ctx: Contexto, trabajo: (tx: Datos) => T): T {
  return ctx.db.transaction((tx) => trabajo(tx), { behavior: "immediate" });
}

/** Texto opcional: sin espacios en los bordes, y vacío pasa a null. */
export function limpiar(texto: string | null | undefined): string | null {
  const limpio = texto?.trim() ?? "";
  return limpio === "" ? null : limpio;
}
