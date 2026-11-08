import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditoria } from "../../src/db/esquema.ts";
import { crearBorrador } from "../../src/servicios/operaciones.ts";
import { abrirConFondos, CAJERO, operar } from "../servicios/escenario.ts";
import { conLogin, CONTRASENA, ORIGEN } from "./login.ts";

// En la semilla, el cliente 2 tiene ficha con RUT 12345678-5
const REGISTRO = { nombre: "Cliente Dos", rut: "12.345.678-5", email: "cliente2@correo.cl", contrasena: CONTRASENA };

async function portal() {
  const api = await conLogin();
  await api.darCuenta("cajero@demo.cl");
  const cajero = await api.cookieDe("cajero@demo.cl");

  const registrar = (cuerpo: object = REGISTRO, ip = "10.9.9.9") =>
    api.app.inject({ method: "POST", url: "/api/registro", headers: { origin: ORIGEN, "x-real-ip": ip }, payload: cuerpo });

  /** Registra, inicia sesión como cliente y devuelve su cookie y el id de su cuenta. */
  async function clienteRegistrado(cuerpo = REGISTRO) {
    expect((await registrar(cuerpo, `10.8.${Math.floor(Math.random() * 250)}.1`)).statusCode).toBe(201);
    const cookie = await api.cookieDe(cuerpo.email);
    const pendientes = (await api.como(cajero, "GET", "/api/cuentas-cliente?estado=PENDIENTE")).json();
    const id = pendientes.find((c: { nombre: string }) => c.nombre === cuerpo.nombre).id as number;
    return { cookie, id };
  }

  return { ...api, cajero, registrar, clienteRegistrado };
}

describe("Portal de clientes: registro", () => {
  it("crea una cuenta PENDIENTE con el RUT normalizado", async () => {
    const { registrar } = await portal();

    const respuesta = await registrar();

    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json()).toMatchObject({ nombre: "Cliente Dos", rut: "12345678-5", estado: "PENDIENTE" });
  });

  it("el cliente inicia sesión pero, pendiente, no ve datos", async () => {
    const { clienteRegistrado, como } = await portal();
    const { cookie } = await clienteRegistrado();

    expect((await como(cookie, "GET", "/api/yo")).json()).toMatchObject({ tipo: "cliente", cuenta: { estado: "PENDIENTE", rut: "12345678-5" } });

    const operaciones = await como(cookie, "GET", "/api/mi/operaciones");
    expect(operaciones.statusCode).toBe(403);
    expect(operaciones.json().error).toMatchObject({ codigo: "CUENTA_NO_VERIFICADA" });
  });

  it("un cliente no entra a las rutas del personal", async () => {
    const { clienteRegistrado, como } = await portal();
    const { cookie } = await clienteRegistrado();

    for (const url of ["/api/pizarra", "/api/operaciones", "/api/cuentas-cliente", "/api/usuarios"]) {
      expect((await como(cookie, "GET", url)).statusCode, url).toBe(403);
    }
  });

  it("y el personal no entra al portal", async () => {
    const { cajero, como } = await portal();
    expect((await como(cajero, "GET", "/api/mi/operaciones")).statusCode).toBe(403);
  });

  it("rechaza RUT inválido, contraseña corta y correo ya usado", async () => {
    const { registrar } = await portal();

    expect((await registrar({ ...REGISTRO, rut: "12345678-9" })).statusCode).toBe(400);
    expect((await registrar({ ...REGISTRO, contrasena: "corta" })).statusCode).toBe(400);
    expect((await registrar()).statusCode).toBe(201);
    const repetido = await registrar({ ...REGISTRO, nombre: "Otro" });
    expect(repetido.statusCode).toBe(409);
    expect(repetido.json().error.codigo).toBe("CORREO_EN_USO");
  });

  it("limita los registros por IP", async () => {
    const { registrar } = await portal();

    const estados = [];
    for (let i = 0; i < 6; i++) estados.push((await registrar({ ...REGISTRO, email: `c${i}@correo.cl` }, "10.7.7.7")).statusCode);

    expect(estados.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(estados[5]).toBe(429);
  });
});

describe("Portal de clientes: verificación en el local", () => {
  it("el cajero verifica: se enlaza la ficha del mismo RUT y queda auditado", async () => {
    const { cajero, clienteRegistrado, como, db } = await portal();
    const { cookie, id } = await clienteRegistrado();

    const verificada = await como(cajero, "POST", `/api/cuentas-cliente/${id}/verificar`);

    expect(verificada.json()).toMatchObject({ estado: "VERIFICADA", clienteId: 2, revisadaPor: 3 });
    expect((await como(cookie, "GET", "/api/yo")).json().cuenta.estado).toBe("VERIFICADA");
    const registro = db.select().from(auditoria).where(eq(auditoria.tabla, "cuenta_cliente")).get();
    expect(registro).toMatchObject({ accion: "AUTORIZAR", usuarioId: 3, registroId: String(id) });
  });

  it("verificada, ve solo sus operaciones confirmadas y sin datos internos", async () => {
    const { cajero, clienteRegistrado, como, ctx, folio } = await portal();
    abrirConFondos(ctx, CAJERO, 1, { CLP: 1_000_000n, USD: 100_000n });
    const suya = operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 10_000n, clienteId: 2 }, folio());
    operar(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 5_000n, clienteId: 1 }, folio()); // de otro cliente
    crearBorrador(ctx, CAJERO, { tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 2_000n, clienteId: 2 }); // borrador
    const { cookie, id } = await clienteRegistrado();
    await como(cajero, "POST", `/api/cuentas-cliente/${id}/verificar`);

    const operaciones = (await como(cookie, "GET", "/api/mi/operaciones")).json();

    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]).toMatchObject({ id: suya.id, estado: "CONFIRMADA", montoDivisa: "10000", montoBase: "95410" });
    expect(operaciones[0]).not.toHaveProperty("margenBruto");
    expect(operaciones[0]).not.toHaveProperty("usuarioId");

    expect((await como(cookie, "GET", "/api/mi/ficha")).json()).toMatchObject({ numeroDocumento: "12345678-5" });
  });

  it("sin ficha con ese RUT no se puede verificar", async () => {
    const { cajero, clienteRegistrado, como } = await portal();
    const { id } = await clienteRegistrado({ ...REGISTRO, rut: "11.111.111-1", email: "otro@correo.cl" });

    const respuesta = await como(cajero, "POST", `/api/cuentas-cliente/${id}/verificar`);

    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().error.codigo).toBe("SIN_FICHA");
  });

  it("si dos personas declaran el mismo RUT, solo una cuenta queda verificada", async () => {
    const { cajero, clienteRegistrado, como } = await portal();
    const primera = await clienteRegistrado();
    const segunda = await clienteRegistrado({ ...REGISTRO, nombre: "Impostor", email: "impostor@correo.cl" });

    expect((await como(cajero, "POST", `/api/cuentas-cliente/${primera.id}/verificar`)).statusCode).toBe(200);
    const otra = await como(cajero, "POST", `/api/cuentas-cliente/${segunda.id}/verificar`);
    expect(otra.statusCode).toBe(409);
    expect(otra.json().error.codigo).toBe("FICHA_CON_CUENTA");
  });

  it("el cajero rechaza con motivo; la decisión no cambia después", async () => {
    const { cajero, clienteRegistrado, como } = await portal();
    const { cookie, id } = await clienteRegistrado();

    expect((await como(cajero, "POST", `/api/cuentas-cliente/${id}/rechazar`, { motivo: " " })).statusCode).toBe(400);
    const rechazada = await como(cajero, "POST", `/api/cuentas-cliente/${id}/rechazar`, { motivo: "El carnet no coincide" });
    expect(rechazada.json()).toMatchObject({ estado: "RECHAZADA", motivoRechazo: "El carnet no coincide" });

    expect((await como(cajero, "POST", `/api/cuentas-cliente/${id}/verificar`)).json().error.codigo).toBe("CUENTA_YA_REVISADA");
    expect((await como(cookie, "GET", "/api/mi/operaciones")).json().error.mensaje).toContain("rechazada");
  });
});
