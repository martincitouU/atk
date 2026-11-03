import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as esquema from "./esquema.ts";

/**
 * Abre la base con la configuración obligatoria del proyecto (CLAUDE.md).
 * Toda conexión pasa por aquí: los PRAGMA no se guardan en el archivo.
 */
export function abrirBase(ruta: string) {
  const sqlite = new Database(ruta);

  sqlite.pragma("foreign_keys = ON");
  // WAL: las lecturas no bloquean a las escrituras. En :memory: no aplica.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  // Si otra conexión está escribiendo, espera hasta 5 s en vez de fallar
  sqlite.pragma("busy_timeout = 5000");
  // Todo INTEGER llega como bigint; los tipos de tipos.ts lo convierten
  sqlite.defaultSafeIntegers(true);

  const db = drizzle({ client: sqlite, schema: esquema });
  return { sqlite, db };
}

export type Conexion = ReturnType<typeof abrirBase>;
export type Db = Conexion["db"];
