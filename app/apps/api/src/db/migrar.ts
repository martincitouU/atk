// Aplica db/migraciones/NNNN_nombre.sql en orden, cada una una sola vez.
//
// - Cada archivo aplicado queda en la tabla "migracion" con su hash.
// - Cada archivo corre en su propia transacción: si falla, no queda a medias.
// - Si un archivo ya aplicado cambió, se detiene: las migraciones aplicadas
//   no se editan, se escribe una nueva.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const DB_DIR = fileURLToPath(new URL("../../../../db/", import.meta.url));
export const CARPETA_MIGRACIONES = join(DB_DIR, "migraciones");
export const CARPETA_SEMILLAS = join(DB_DIR, "semillas");

const PATRON_MIGRACION = /^\d{4}_[a-z0-9_]+\.sql$/;

const hashDe = (contenido: string) => createHash("sha256").update(contenido).digest("hex");

/** Devuelve los nombres de las migraciones aplicadas en esta llamada. */
export function migrar(sqlite: Database.Database, carpeta = CARPETA_MIGRACIONES): string[] {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS migracion (
      nombre       TEXT    NOT NULL PRIMARY KEY,
      hash         TEXT    NOT NULL,
      aplicada_en  INTEGER NOT NULL
    ) STRICT`);

  const filas = sqlite.prepare("SELECT nombre, hash FROM migracion").all() as { nombre: string; hash: string }[];
  const aplicadas = new Map(filas.map((f) => [f.nombre, f.hash]));
  const archivos = readdirSync(carpeta).filter((a) => PATRON_MIGRACION.test(a)).sort();

  for (const nombre of aplicadas.keys()) {
    if (!archivos.includes(nombre)) {
      throw new Error(`La migración ${nombre} está aplicada pero su archivo ya no existe`);
    }
  }

  const registrar = sqlite.prepare("INSERT INTO migracion (nombre, hash, aplicada_en) VALUES (?, ?, ?)");
  const nuevas: string[] = [];

  for (const nombre of archivos) {
    const contenido = readFileSync(join(carpeta, nombre), "utf8");
    const hash = hashDe(contenido);
    const hashAplicado = aplicadas.get(nombre);

    if (hashAplicado !== undefined) {
      if (hashAplicado !== hash) {
        throw new Error(`La migración ${nombre} cambió después de aplicarse: escriba una migración nueva`);
      }
      continue;
    }

    sqlite
      .transaction(() => {
        sqlite.exec(contenido);
        registrar.run(nombre, hash, Date.now());
      })
      .immediate();
    nuevas.push(nombre);
  }

  return nuevas;
}

/** Carga db/semillas/<nombre>.sql. Solo desarrollo y tests: NUNCA en producción. */
export function cargarSemilla(sqlite: Database.Database, nombre: string, carpeta = CARPETA_SEMILLAS): void {
  const contenido = readFileSync(join(carpeta, `${nombre}.sql`), "utf8");
  sqlite.transaction(() => sqlite.exec(contenido)).immediate();
}
