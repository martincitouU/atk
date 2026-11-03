import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { abrirBase, type Conexion } from "../src/db/conexion.ts";

const abiertas: Conexion[] = [];
const carpetas: string[] = [];

afterEach(() => {
  for (const conexion of abiertas.splice(0)) conexion.sqlite.close();
  for (const carpeta of carpetas.splice(0)) rmSync(carpeta, { recursive: true, force: true });
});

/** Base en un archivo temporal (no :memory:, para probar WAL de verdad). Se borra sola. */
export function baseTemporal(): Conexion {
  const conexion = abrirBase(join(carpetaTemporal(), "prueba.db"));
  abiertas.push(conexion);
  return conexion;
}

/** Carpeta temporal (por ejemplo, para migraciones de prueba). Se borra sola. */
export function carpetaTemporal(): string {
  const carpeta = mkdtempSync(join(tmpdir(), "atk-test-"));
  carpetas.push(carpeta);
  return carpeta;
}
