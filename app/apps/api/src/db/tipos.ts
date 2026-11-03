// Tipos de columna para Drizzle sobre SQLite.
//
// La conexión activa safeIntegers: better-sqlite3 entrega TODO INTEGER
// como bigint. El integer() de Drizzle declara number pero entrega bigint
// (el tipo miente), así que NUNCA se usa: cada columna INTEGER usa uno de
// estos tipos, que convierten y validan en ambos sentidos.

import { customType } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

function comoBigint(valor: unknown): bigint {
  if (typeof valor !== "bigint") {
    throw new TypeError(`SQLite entregó ${typeof valor} y se esperaba bigint: ¿falta safeIntegers en la conexión?`);
  }
  return valor;
}

/** Montos (unidad mínima) y valores _e6. Siempre bigint: un number se rechaza. */
export const dinero = customType<{ data: bigint; driverData: bigint }>({
  dataType: () => "integer",
  toDriver(valor) {
    if (typeof valor !== "bigint") {
      throw new TypeError(`Un monto debe ser bigint, llegó ${typeof valor}`);
    }
    return valor;
  },
  fromDriver: comoBigint,
});

/** Ids, contadores y configuración numérica. number, siempre un entero exacto. */
export const entero = customType<{ data: number; driverData: bigint }>({
  dataType: () => "integer",
  toDriver(valor) {
    if (!Number.isSafeInteger(valor)) {
      throw new RangeError(`${valor} no es un entero exacto`);
    }
    return BigInt(valor);
  },
  fromDriver(valor) {
    const numero = Number(comoBigint(valor));
    if (!Number.isSafeInteger(numero)) {
      throw new RangeError(`${valor} no cabe exacto en un number: use dinero()`);
    }
    return numero;
  },
});

/** Fechas: milisegundos UTC en la base, Date en la app. */
export const fecha = customType<{ data: Date; driverData: bigint }>({
  dataType: () => "integer",
  toDriver(valor) {
    const ms = valor.getTime();
    if (Number.isNaN(ms)) {
      throw new RangeError("Fecha inválida");
    }
    return BigInt(ms);
  },
  fromDriver: (valor) => new Date(Number(comoBigint(valor))),
});

/** Booleanos: 0/1 en la base. */
export const booleano = customType<{ data: boolean; driverData: bigint }>({
  dataType: () => "integer",
  toDriver: (valor) => (valor ? 1n : 0n),
  fromDriver: (valor) => comoBigint(valor) === 1n,
});

// Drizzle con SQLite inserta NULL en toda columna que no reciba valor y no
// tenga default declarado aquí. Por eso las columnas con DEFAULT en el SQL
// repiten su default en el esquema; el test de esquema lo verifica.

/** El mismo DEFAULT de las fechas en el SQL. */
export const AHORA_MS = sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`;

/** INTEGER PRIMARY KEY: al insertar NULL, SQLite asigna el siguiente id. */
export const idAutomatico = (nombre = "id") => entero(nombre).primaryKey().default(sql`NULL`);
