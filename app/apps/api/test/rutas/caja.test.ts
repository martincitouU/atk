import { describe, expect, it } from "vitest";
import { apiDePrueba } from "./api.ts";

/** El cajero abre turno en la caja 1 y ingresa fondos por HTTP. */
async function cajeroConTurno() {
  const api = apiDePrueba();
  const turno = (await api.pedir("CAJERO", "POST", "/api/turnos", { cajaId: 1 })).json();
  for (const [monedaCodigo, monto] of [["CLP", "1000000"], ["USD", "100000"]] as const) {
    await api.pedir("CAJERO", "POST", "/api/caja/movimientos", { tipo: "INGRESO", monedaCodigo, monto, motivo: "Fondo inicial" });
  }
  return { ...api, turnoId: turno.id as number };
}

describe("RF-04, RF-05, RF-06: turnos y caja por HTTP", () => {
  it("abre un turno (201) y no permite un segundo (409)", async () => {
    const { pedir } = apiDePrueba();

    const turno = await pedir("CAJERO", "POST", "/api/turnos", { cajaId: 1 });
    expect(turno.statusCode).toBe(201);
    expect(turno.json()).toMatchObject({ cajaId: 1, usuarioId: 3, estado: "ABIERTO" });

    expect((await pedir("CAJERO", "POST", "/api/turnos", { cajaId: 2 })).json().error.codigo).toBe("YA_TIENE_TURNO");
    expect((await pedir("SUPERVISOR", "GET", "/api/turnos/abiertos")).json()).toHaveLength(1);
  });

  it("RF-05: ingresa y retira con motivo; los saldos salen como texto", async () => {
    const { pedir } = await cajeroConTurno();

    const retiro = await pedir("CAJERO", "POST", "/api/caja/movimientos", { tipo: "RETIRO", monedaCodigo: "CLP", monto: "50000", motivo: "Depósito en banco" });
    expect(retiro.statusCode).toBe(201);

    const saldos = (await pedir("CAJERO", "GET", "/api/saldos?cajaId=1")).json();
    expect(saldos.find((s: { monedaCodigo: string }) => s.monedaCodigo === "CLP")).toMatchObject({ saldo: "950000" });
    expect((await pedir("CAJERO", "POST", "/api/caja/movimientos", { tipo: "RETIRO", monedaCodigo: "CLP", monto: "1" })).statusCode).toBe(400);
  });

  it("RF-06: cierra con el conteo y devuelve el arqueo con diferencias", async () => {
    const { pedir, turnoId } = await cajeroConTurno();

    const faltaConteo = await pedir("CAJERO", "POST", `/api/turnos/${turnoId}/cerrar`, { conteo: { CLP: "1000000" } });
    expect(faltaConteo.json().error.codigo).toBe("FALTA_CONTEO");

    const cierre = await pedir("CAJERO", "POST", `/api/turnos/${turnoId}/cerrar`, { conteo: { CLP: "999000", USD: "100000" } });
    expect(cierre.json().turno).toMatchObject({ estado: "CERRADO" });

    const arqueo = (await pedir("SUPERVISOR", "GET", `/api/turnos/${turnoId}/arqueo`)).json();
    expect(arqueo.find((a: { monedaCodigo: string }) => a.monedaCodigo === "CLP")).toMatchObject({ saldoSistema: "1000000", saldoContado: "999000", diferencia: "-1000" });
    expect((await pedir("SUPERVISOR", "GET", `/api/turnos/${turnoId}/movimientos`)).json()).toHaveLength(2);
  });

  it("RF-06: solo un supervisor ajusta la caja; el ajuste puede restar", async () => {
    const { pedir } = await cajeroConTurno();
    const ajuste = { cajaId: 1, monedaCodigo: "CLP", monto: "-1000", motivo: "Diferencia del arqueo" };

    expect((await pedir("CAJERO", "POST", "/api/caja/ajustes", ajuste)).statusCode).toBe(403);
    expect((await pedir("SUPERVISOR", "POST", "/api/caja/ajustes", ajuste)).json()).toMatchObject({ tipo: "AJUSTE", monto: "-1000", saldoPost: "999000" });
  });
});
