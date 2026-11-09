// La jornada de ejemplo de npm run dev pasa por los servicios: si una regla
// nueva la rechaza, este test lo avisa antes que el próximo que borre app/.dev.

import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { prepararBaseDeDesarrollo } from "../../src/cli/base-desarrollo.ts";
import { abrirBase } from "../../src/db/conexion.ts";
import { cuentaCliente, gasto, operacion, turno, usuario } from "../../src/db/esquema.ts";
import { operacionesDeCuenta } from "../../src/servicios/cuentas.ts";
import { carpetaTemporal } from "../ayuda.ts";

describe("Base de desarrollo (npm run dev)", () => {
  it("crea las cuentas y una jornada que cumple las reglas de los servicios", async () => {
    const rutaBase = join(carpetaTemporal(), "atk.db");

    await prepararBaseDeDesarrollo({
      rutaBase,
      secreto: "s".repeat(40),
      urlPublica: "http://localhost:5173",
      contrasena: "una clave larga de prueba",
    });

    const { sqlite, db } = abrirBase(rutaBase);
    try {
      const estados = db.select({ estado: operacion.estado }).from(operacion).all().map((o) => o.estado);
      expect(estados.filter((e) => e === "CONFIRMADA")).toHaveLength(8);
      expect(estados.filter((e) => e === "REVERSADA")).toHaveLength(1);
      expect(estados.filter((e) => e === "BORRADOR")).toHaveLength(1);
      expect(db.select({ estado: turno.estado }).from(turno).all()).toEqual([{ estado: "ABIERTO" }, { estado: "ABIERTO" }]);
      expect(db.select().from(gasto).all()).toHaveLength(1);

      // Todo el personal puede iniciar sesión
      expect(db.select().from(usuario).all().every((u) => u.authUserId !== null)).toBe(true);

      // El cliente verificado ve su operación en el portal; la pendiente, nada
      const verificada = db.select().from(cuentaCliente).where(eq(cuentaCliente.estado, "VERIFICADA")).get();
      expect(verificada).toBeDefined();
      if (verificada) expect(operacionesDeCuenta(db, verificada)).toHaveLength(1);
      expect(db.select().from(cuentaCliente).where(eq(cuentaCliente.estado, "PENDIENTE")).all()).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
});
