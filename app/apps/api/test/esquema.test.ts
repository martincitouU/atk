import { eq, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as esquema from "../src/db/esquema.ts";
import { cargarSemilla, migrar } from "../src/db/migrar.ts";
import { baseTemporal } from "./ayuda.ts";

type ColumnaSqlite = { name: string; type: string; notnull: bigint; dflt_value: string | null; pk: bigint; hidden: bigint };

const tablasDrizzle = Object.values(esquema).filter((x) => is(x, SQLiteTable)).map((t) => getTableConfig(t));

function baseMigrada() {
  const conexion = baseTemporal();
  migrar(conexion.sqlite);
  return conexion;
}

describe("esquema.ts es espejo de las migraciones", () => {
  it("tiene exactamente las mismas tablas", () => {
    const { sqlite } = baseMigrada();
    // Fuera del espejo: la tabla de migraciones y las de Better Auth
    const enLaBase = sqlite
      .prepare(
        `SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           AND name NOT IN ('migracion', 'user', 'session', 'account', 'verification')`,
      )
      .pluck()
      .all() as string[];

    expect(tablasDrizzle.map((t) => t.name).sort()).toEqual(enLaBase.sort());
  });

  it.each(tablasDrizzle.map((t) => [t.name, t] as const))("%s: columnas, tipos, NOT NULL, claves y defaults", (_, tabla) => {
    const { sqlite } = baseMigrada();
    const columnasBase = sqlite.prepare(`SELECT * FROM pragma_table_xinfo('${tabla.name}')`).all() as ColumnaSqlite[];
    const clavePrimaria = new Set([
      ...tabla.columns.filter((c) => c.primary).map((c) => c.name),
      ...tabla.primaryKeys.flatMap((pk) => pk.columns.map((c) => c.name)),
    ]);

    const enLaBase = columnasBase.map((c) => ({
      nombre: c.name,
      tipo: c.type.toLowerCase(),
      notNull: c.notnull === 1n || c.pk > 0n,
      clave: c.pk > 0n,
      generada: c.hidden > 0n,
      // Sin default propio, la clave primaria lo recibe de SQLite (rowid)
      conDefault: c.dflt_value !== null,
    }));
    const enDrizzle = tabla.columns.map((c) => ({
      nombre: c.name,
      tipo: c.getSQLType().toLowerCase(),
      notNull: c.notNull || clavePrimaria.has(c.name),
      clave: clavePrimaria.has(c.name),
      generada: c.generated !== undefined,
      conDefault: c.hasDefault && !(c.primary && c.getSQLType() === "integer"),
    }));

    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre);
    expect(enDrizzle.sort(porNombre)).toEqual(enLaBase.sort(porNombre));
  });
});

describe("tipos de columna con datos reales", () => {
  it("lee la semilla con los tipos correctos", () => {
    const { sqlite, db } = baseMigrada();
    cargarSemilla(sqlite, "ejemplo");

    const usd = db.select().from(esquema.cotizacion).where(eq(esquema.cotizacion.monedaCodigo, "USD")).get();
    expect(usd?.precioVentaE6).toBe(954100000n); // dinero → bigint
    expect(usd?.id).toBe(1); // entero → number
    expect(usd?.vigenteDesde).toBeInstanceOf(Date); // fecha → Date
    expect(usd?.vigenteHasta).toBeNull();

    const caja = db.select().from(esquema.caja).where(eq(esquema.caja.id, 1)).get();
    expect(caja?.activa).toBe(true); // booleano → boolean
  });

  it("inserta usando los defaults de la base: id, fechas y valores por defecto", () => {
    const { sqlite, db } = baseMigrada();
    cargarSemilla(sqlite, "ejemplo");

    const turno = db.insert(esquema.turno).values({ cajaId: 1, usuarioId: 3 }).returning().get();

    expect(turno.id).toBe(1);
    expect(turno.estado).toBe("ABIERTO");
    expect(Math.abs(turno.abiertoEn.getTime() - Date.now())).toBeLessThan(5000);
  });

  it("guarda montos grandes sin perder precisión", () => {
    const { sqlite, db } = baseMigrada();
    cargarSemilla(sqlite, "ejemplo");
    const grande = 9007199254740993n; // 2^53 + 1

    db.insert(esquema.saldoCaja).values({ cajaId: 1, monedaCodigo: "CLP", saldo: grande }).run();
    const fila = db.select().from(esquema.saldoCaja).get();

    expect(fila?.saldo).toBe(grande);
  });

  it("rechaza un number donde va dinero, en TypeScript y al ejecutar", () => {
    const { sqlite, db } = baseMigrada();
    cargarSemilla(sqlite, "ejemplo");

    expect(() =>
      db
        .insert(esquema.saldoCaja)
        // @ts-expect-error: saldo es bigint; TypeScript no debe aceptar un number
        .values({ cajaId: 1, monedaCodigo: "CLP", saldo: 100 })
        .run(),
    ).toThrow("Un monto debe ser bigint");
  });

  it("calcula la columna generada del arqueo", () => {
    const { sqlite, db } = baseMigrada();
    cargarSemilla(sqlite, "ejemplo");
    db.insert(esquema.turno).values({ cajaId: 1, usuarioId: 3 }).run();

    const arqueo = db
      .insert(esquema.arqueo)
      .values({ turnoId: 1, monedaCodigo: "USD", saldoSistema: 10000n, saldoContado: 9900n })
      .returning()
      .get();

    expect(arqueo.diferencia).toBe(-100n);
  });
});
