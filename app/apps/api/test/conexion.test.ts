import { describe, expect, it } from "vitest";
import { baseTemporal } from "./ayuda.ts";

describe("abrirBase", () => {
  it("activa los PRAGMA obligatorios", () => {
    const { sqlite } = baseTemporal();
    const pragma = (nombre: string) => sqlite.pragma(nombre, { simple: true });

    expect(Number(pragma("foreign_keys"))).toBe(1);
    expect(pragma("journal_mode")).toBe("wal");
    expect(Number(pragma("busy_timeout"))).toBe(5000);
  });

  it("entrega los INTEGER como bigint, sin perder precisión", () => {
    const { sqlite } = baseTemporal();
    // 2^53 + 1 no cabe exacto en un number
    const fila = sqlite.prepare("SELECT 9007199254740993 AS n").get() as { n: unknown };

    expect(fila.n).toBe(9007199254740993n);
  });

  it("las transacciones IMMEDIATE confirman o deshacen completas", () => {
    const { sqlite } = baseTemporal();
    sqlite.exec("CREATE TABLE t (n INTEGER NOT NULL) STRICT");
    const insertar = sqlite.prepare("INSERT INTO t (n) VALUES (?)");
    const contar = () => (sqlite.prepare("SELECT count(*) AS c FROM t").get() as { c: bigint }).c;

    sqlite.transaction(() => insertar.run(1)).immediate();
    expect(contar()).toBe(1n);

    expect(() =>
      sqlite
        .transaction(() => {
          insertar.run(2);
          throw new Error("falla a la mitad");
        })
        .immediate(),
    ).toThrow("falla a la mitad");
    expect(contar()).toBe(1n);
  });
});
