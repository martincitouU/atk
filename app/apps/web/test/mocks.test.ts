import {
  aBigint,
  Catalogo,
  Cliente,
  FilaArqueo,
  FilaPizarra,
  Gasto,
  Operacion,
  Resumen,
  RUTAS,
  Turno,
  Vista,
  Yo,
} from "../src/api/esquemas.ts";
import { rangoDelDia } from "../src/api/consultas.ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { crearEstado } from "../src/mocks/estado.ts";
import { RELOJ_PRUEBA, usarEstado } from "./preparar.ts";

// Ayudantes: fetch contra el servidor MSW compartido. Si la respuesta no es
// `ok`, rechazan con el error ({ codigo, mensaje } de la API, o { code } de
// Better Auth) más el status.
const BASE = "http://localhost";

async function pedirJson(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
  const r = await fetch(BASE + ruta, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const datos: unknown = r.status === 204 ? null : await r.json();
  if (!r.ok) throw { status: r.status, ...((datos as { error?: object }).error ?? (datos as object)) };
  return datos;
}
const get = (ruta: string) => pedirJson("GET", ruta);
const post = (ruta: string, cuerpo: unknown = {}) => pedirJson("POST", ruta, cuerpo);
const patch = (ruta: string, cuerpo: unknown) => pedirJson("PATCH", ruta, cuerpo);
const borrar = (ruta: string) => pedirJson("DELETE", ruta);

const saldo = (resumen: unknown, codigo: string): bigint => {
  const fila = Resumen.parse(resumen).saldos.find((s) => s.monedaCodigo === codigo);
  if (!fila) throw new Error(`Sin saldo de ${codigo}`);
  return aBigint(fila.saldo);
};

const VENTA_USD_450 = { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: "45000", medioPago: "EFECTIVO", tipoDte: 41, folioDte: 18234 };

describe("mocks: la semilla del comp, según el contrato", () => {
  it("cada GET responde con su esquema y trae los datos del comp", async () => {
    const yo = Yo.parse(await get(RUTAS.yo));
    if (yo.tipo !== "personal") throw new Error("se esperaba personal");
    expect(yo.usuario).toMatchObject({ nombre: "Rolando del Río", rol: "ADMIN" });
    expect(yo.turnoAbierto).toMatchObject({ cajaId: 1, estado: "ABIERTO", abiertoEn: "2026-11-08T12:02:00.000Z" });

    const pizarra = z.array(FilaPizarra).parse(await get(RUTAS.pizarra));
    expect(pizarra.map((f) => f.monedaCodigo)).toEqual(["USD", "ARS", "EUR"]);
    expect(pizarra[0]).toMatchObject({ compraE6: "935000000", ventaE6: "952000000", ventaAnteriorE6: "949000000", vencida: false });
    // La regla de spread vigente, como en pizarra() del API: de ella parte «Actualizar pizarra»
    expect(pizarra[0]).toMatchObject({ referenciaE6: "943500000", tipoMargen: "MONTO_FIJO", margenCompraE6: "8500000", margenVentaE6: "8500000" });
    expect(pizarra[1]).toMatchObject({ decimales: 0, decimalesTasa: 4, compraE6: "620000", ventaE6: "710000" });
    expect(pizarra[2]).toMatchObject({ compraE6: "1018000000", ventaE6: "1046000000" });

    const { desde, hasta } = rangoDelDia("2026-11-08");
    const libro = z.array(Operacion).parse(await get(`${RUTAS.operaciones}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`));
    expect(libro.map((o) => [o.realizadaEn.slice(11, 16), o.estado])).toEqual([
      ["13:42", "CONFIRMADA"],
      ["13:31", "CONFIRMADA"],
      ["13:15", "CONFIRMADA"],
      ["12:58", "REVERSADA"],
      ["12:57", "CONFIRMADA"],
      ["12:40", "BORRADOR"],
    ]);
    expect(libro[3]?.motivoReverso).toBe("Monto mal digitado");

    const resumen = await get(RUTAS.resumen);
    expect(saldo(resumen, "CLP")).toBe(3_482_150n); // «Caja en pesos» del comp
    expect(Resumen.parse(resumen)).toMatchObject({ fecha: "2026-11-08", confirmadas: 4, reversadas: 1, borradoresPendientes: 1 });

    const catalogo = Catalogo.parse(await get(RUTAS.catalogo));
    expect(catalogo.monedaBase.codigo).toBe("CLP");
    expect(catalogo.denominaciones.USD).toEqual(["10000", "5000", "2000", "1000", "500", "100"]);

    expect(catalogo.parametros.folioObligatorioAlConfirmar).toBe(true);
    expect(catalogo.categoriasGasto.map((c) => c.nombre)).toContain("Insumos y oficina");

    await expect(get(RUTAS.clientes)).rejects.toMatchObject({ status: 400, codigo: "DATOS_INVALIDOS" });
    const clientes = z.array(Cliente).parse(await get(`${RUTAS.clientes}?q=e`));
    expect(clientes).toHaveLength(4);
    expect(clientes.filter((c) => c.faltantes.length > 0)).toHaveLength(1);

    z.array(Gasto).parse(await get(RUTAS.gastos));
  });
});

describe("mocks: las reglas de los servicios", () => {
  it("RF-01/07: borrador → confirmar mueve la caja; reversar exige motivo", async () => {
    const b = Operacion.parse(await post(RUTAS.operaciones, VENTA_USD_450));
    expect(b).toMatchObject({ id: 7, estado: "BORRADOR" });
    const antes = await get(RUTAS.resumen);

    const c = Operacion.parse(await post(RUTAS.confirmar(b.id)));
    expect(c.estado).toBe("CONFIRMADA");
    expect(aBigint(c.montoBase)).toBe(428400n); // 450,00 × 952,00
    expect(c.margenBruto).toBe("3825"); // contra la referencia, el punto medio 943,50
    const despues = await get(RUTAS.resumen);
    expect(saldo(despues, "USD") - saldo(antes, "USD")).toBe(-45000n);
    expect(saldo(despues, "CLP") - saldo(antes, "CLP")).toBe(428400n);

    await expect(post(RUTAS.reversar(c.id), { motivo: "  " })).rejects.toMatchObject({ status: 400, codigo: "DATOS_INVALIDOS" });
    const r = Operacion.parse(await post(RUTAS.reversar(c.id), { motivo: "Cliente se arrepintió" }));
    expect(r).toMatchObject({ estado: "REVERSADA", motivoReverso: "Cliente se arrepintió" });
    expect(saldo(await get(RUTAS.resumen), "USD")).toBe(saldo(antes, "USD"));
    await expect(post(RUTAS.reversar(c.id), { motivo: "otra vez" })).rejects.toMatchObject({ status: 409, codigo: "NO_REVERSABLE" });
  });

  it("PIZARRA_CAMBIO si la tasa cambió entre el borrador y la confirmación; editar recalcula", async () => {
    const b = Operacion.parse(await post(RUTAS.operaciones, VENTA_USD_450));
    await post(RUTAS.cotizaciones, {
        monedaCodigo: "USD",
        referenciaE6: "945000000",
        tipoMargen: "MONTO_FIJO",
        margenCompraE6: "8500000",
        margenVentaE6: "8500000",
    });
    const usd = z.array(FilaPizarra).parse(await get(RUTAS.pizarra))[0];
    expect(usd).toMatchObject({ compraE6: "936500000", ventaE6: "953500000" });

    await expect(post(RUTAS.confirmar(b.id))).rejects.toMatchObject({
      status: 409,
      codigo: "PIZARRA_CAMBIO",
      mensaje: "La pizarra de USD cambió desde que se registró el borrador (952,00 → 953,50): edítelo para recalcular",
    });
    const editado = Operacion.parse(await patch(RUTAS.operacion(b.id), {}));
    expect(editado.tasaAplicadaE6).toBe("953500000");
    expect(Operacion.parse(await post(RUTAS.confirmar(b.id))).estado).toBe("CONFIRMADA");
  });

  it("el folio es obligatorio al confirmar y un borrador no se reversa: se elimina", async () => {
    const b = Operacion.parse(await post(RUTAS.operaciones, { tipo: "COMPRA", monedaCodigo: "EUR", montoDivisa: "10000" }));
    await expect(post(RUTAS.confirmar(b.id))).rejects.toMatchObject({ status: 409, codigo: "FALTA_FOLIO" });
    await expect(post(RUTAS.reversar(b.id), { motivo: "error" })).rejects.toMatchObject({
      status: 409,
      codigo: "NO_REVERSABLE",
      mensaje: "Un borrador no se reversa: se elimina",
    });
    await expect(post(RUTAS.operaciones, { ...VENTA_USD_450, tipoDte: null })).rejects.toMatchObject({ codigo: "DTE_INCOMPLETO" });
    expect(await borrar(RUTAS.operacion(b.id))).toBeNull();
    await expect(post(RUTAS.confirmar(b.id))).rejects.toMatchObject({ status: 404, codigo: "OPERACION_NO_EXISTE" });
  });

  it("solo el efectivo mueve los pesos: una compra por transferencia mueve solo la divisa", async () => {
    const antes = await get(RUTAS.resumen);
    const b = Operacion.parse(
      await post(RUTAS.operaciones, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: "10000", medioPago: "TRANSFERENCIA", tipoDte: 41, folioDte: 18300 }),
    );
    await post(RUTAS.confirmar(b.id));
    const despues = await get(RUTAS.resumen);
    expect(saldo(despues, "USD") - saldo(antes, "USD")).toBe(10000n);
    expect(saldo(despues, "CLP")).toBe(saldo(antes, "CLP"));
  });

  it("RF-17: desde US$ 5.000 la vista previa pide ficha y confirmar exige el cliente", async () => {
    const entrada = { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: "500000", tipoDte: 41, folioDte: 18301 };
    const vista = Vista.parse(await post(RUTAS.previsualizar, entrada));
    expect(vista).toMatchObject({ requiereFicha: true, equivalenteUsd: "500000", montoBase: "4675000" });
    expect(Vista.parse(await post(RUTAS.previsualizar, { ...entrada, montoDivisa: "45000" })).requiereFicha).toBe(false);

    const b = Operacion.parse(await post(RUTAS.operaciones, entrada));
    await expect(post(RUTAS.confirmar(b.id))).rejects.toMatchObject({ codigo: "FALTA_CLIENTE" });
  });

  it("SIN_TURNO: cerrar exige borradores resueltos y todo contado; sin turno no se opera", async () => {
    await expect(post(RUTAS.cerrarTurno(1), { conteo: {} })).rejects.toMatchObject({ status: 409, codigo: "BORRADORES_PENDIENTES" });
    await borrar(RUTAS.operacion(1)); // el borrador de la semilla
    await expect(post(RUTAS.cerrarTurno(1), { conteo: { CLP: "3482150" } })).rejects.toMatchObject({
      status: 409,
      codigo: "FALTA_CONTEO",
      mensaje: "Falta el conteo de: ARS, EUR, USD",
    });

    const cierre = z
      .object({ turno: Turno, arqueo: z.array(FilaArqueo) })
      .parse(await post(RUTAS.cerrarTurno(1), { conteo: { CLP: "3482150", USD: "290000", ARS: "500000", EUR: "144000" } }));
    expect(cierre.turno.estado).toBe("CERRADO");
    expect(cierre.arqueo.find((a) => a.monedaCodigo === "EUR")).toMatchObject({ saldoSistema: "145000", diferencia: "-1000" });
    expect(z.array(FilaArqueo).parse(await get(RUTAS.arqueo(1)))).toHaveLength(4);

    expect(Yo.parse(await get(RUTAS.yo))).toMatchObject({ turnoAbierto: null });
    await expect(post(RUTAS.operaciones, VENTA_USD_450)).rejects.toMatchObject({
      status: 409,
      codigo: "SIN_TURNO",
      mensaje: "Abra un turno antes de registrar operaciones",
    });
    expect(Turno.parse(await post(RUTAS.turnos, { cajaId: 1 }))).toMatchObject({ id: 2, estado: "ABIERTO" });
  });

  it("la pizarra vence: pasada la vigencia no se cotiza", async () => {
    let ahora = RELOJ_PRUEBA;
    usarEstado(crearEstado(() => ahora));
    ahora = new Date(RELOJ_PRUEBA.getTime() + 13 * 60 * 60_000);
    const pizarra = z.array(FilaPizarra).parse(await get(RUTAS.pizarra));
    expect(pizarra.every((f) => f.vencida)).toBe(true);
    await expect(post(RUTAS.previsualizar, VENTA_USD_450)).rejects.toMatchObject({ status: 409, codigo: "COTIZACION_VENCIDA" });
  });

  it("la sesión: salir la cierra y entrar acepta solo a rolando@atk.cl / ventanilla", async () => {
    await post(RUTAS.salir);
    await expect(get(RUTAS.yo)).rejects.toMatchObject({ status: 401, codigo: "SIN_SESION" });
    await expect(get(RUTAS.pizarra)).rejects.toMatchObject({ status: 401 });
    await expect(post(RUTAS.entrar, { email: "rolando@atk.cl", password: "otra" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
    });
    await post(RUTAS.entrar, { email: "rolando@atk.cl", password: "ventanilla" });
    expect(Yo.parse(await get(RUTAS.yo))).toMatchObject({ usuario: { nombre: "Rolando del Río" } });
  });
});
