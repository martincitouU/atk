import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrar } from "../src/db/migrar.ts";
import { baseTemporal, carpetaTemporal } from "./ayuda.ts";

const existeTabla = (sqlite: ReturnType<typeof baseTemporal>["sqlite"], nombre: string) =>
  sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(nombre) !== undefined;

describe("migrar con las migraciones reales", () => {
  it("aplica el esquema completo en una base nueva", () => {
    const { sqlite } = baseTemporal();

    expect(migrar(sqlite)).toEqual(["0001_esquema.sql", "0002_cuenta_cliente.sql"]);
    expect(existeTabla(sqlite, "operacion")).toBe(true);
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("no repite migraciones ya aplicadas", () => {
    const { sqlite } = baseTemporal();
    migrar(sqlite);

    expect(migrar(sqlite)).toEqual([]);
  });
});

describe("migrar con migraciones de prueba", () => {
  it("aplica en orden numérico e ignora archivos que no son migraciones", () => {
    const carpeta = carpetaTemporal();
    writeFileSync(join(carpeta, "0002_b.sql"), "CREATE TABLE b (a_id INTEGER REFERENCES a(id)) STRICT;");
    writeFileSync(join(carpeta, "0001_a.sql"), "CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;");
    writeFileSync(join(carpeta, "notas.txt"), "no soy SQL");
    const { sqlite } = baseTemporal();

    expect(migrar(sqlite, carpeta)).toEqual(["0001_a.sql", "0002_b.sql"]);
  });

  it("si una migración falla, no deja nada a medias", () => {
    const carpeta = carpetaTemporal();
    writeFileSync(join(carpeta, "0001_ok.sql"), "CREATE TABLE ok (n INTEGER) STRICT;");
    writeFileSync(
      join(carpeta, "0002_rota.sql"),
      "CREATE TABLE a_medias (n INTEGER) STRICT; CREATE TABLE esto_no_es_sql;",
    );
    const { sqlite } = baseTemporal();

    expect(() => migrar(sqlite, carpeta)).toThrow();
    expect(existeTabla(sqlite, "ok")).toBe(true);
    expect(existeTabla(sqlite, "a_medias")).toBe(false);
    const registradas = sqlite.prepare("SELECT nombre FROM migracion").pluck().all();
    expect(registradas).toEqual(["0001_ok.sql"]);
  });

  it("se detiene si una migración aplicada fue editada", () => {
    const carpeta = carpetaTemporal();
    const archivo = join(carpeta, "0001_a.sql");
    writeFileSync(archivo, "CREATE TABLE a (n INTEGER) STRICT;");
    const { sqlite } = baseTemporal();
    migrar(sqlite, carpeta);

    writeFileSync(archivo, "CREATE TABLE a (n INTEGER, m INTEGER) STRICT;");

    expect(() => migrar(sqlite, carpeta)).toThrow("cambió después de aplicarse");
  });

  it("se detiene si falta el archivo de una migración aplicada", () => {
    const carpeta = carpetaTemporal();
    const archivo = join(carpeta, "0001_a.sql");
    writeFileSync(archivo, "CREATE TABLE a (n INTEGER) STRICT;");
    const { sqlite } = baseTemporal();
    migrar(sqlite, carpeta);

    unlinkSync(archivo);

    expect(() => migrar(sqlite, carpeta)).toThrow("ya no existe");
  });
});
