import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditoria } from "../../src/db/esquema.ts";
import { conLogin, CONTRASENA } from "./login.ts";

const NUEVO = { rut: "15.555.567-K", nombre: "Cajera Nueva", email: "Nueva@Demo.cl", rol: "CAJERO", sucursalId: 1, contrasena: CONTRASENA };

async function conAdmin() {
  const api = await conLogin();
  await api.darCuenta("admin@demo.cl");
  const admin = await api.cookieDe("admin@demo.cl");
  return { ...api, admin };
}

describe("RF-14: el administrador gestiona el personal", () => {
  it("crea un usuario que puede iniciar sesión con su rol", async () => {
    const { admin, como, cookieDe } = await conAdmin();

    const creado = await como(admin, "POST", "/api/usuarios", NUEVO);

    expect(creado.statusCode).toBe(201);
    expect(creado.json()).toMatchObject({ rut: "15555567-K", email: "nueva@demo.cl", rol: "CAJERO", activo: true, tieneCuenta: true });
    expect(creado.json()).not.toHaveProperty("authUserId");

    const nueva = await cookieDe("nueva@demo.cl");
    expect((await como(nueva, "GET", "/api/yo")).json()).toMatchObject({ tipo: "personal", usuario: { rol: "CAJERO" } });
  });

  it("la creación queda auditada, sin la contraseña", async () => {
    const { admin, como, db } = await conAdmin();
    const { id } = (await como(admin, "POST", "/api/usuarios", NUEVO)).json();

    const registro = db.select().from(auditoria).where(eq(auditoria.tabla, "usuario")).get();

    expect(registro).toMatchObject({ accion: "CREAR", usuarioId: 1, registroId: String(id) });
    expect(JSON.stringify(registro)).not.toContain(CONTRASENA);
  });

  it("un cajero no puede crear usuarios", async () => {
    const { como, darCuenta, cookieDe } = await conAdmin();
    await darCuenta("cajero@demo.cl");
    const cajero = await cookieDe("cajero@demo.cl");

    expect((await como(cajero, "POST", "/api/usuarios", NUEVO)).statusCode).toBe(403);
    expect((await como(cajero, "GET", "/api/usuarios")).statusCode).toBe(403);
  });

  it("no repite RUT ni correo; si falla, no deja una cuenta a medias", async () => {
    const { admin, como, iniciarSesion } = await conAdmin();

    const rutRepetido = await como(admin, "POST", "/api/usuarios", { ...NUEVO, rut: "33.333.333-3" }); // RUT del cajero de la semilla
    expect(rutRepetido.json().error.codigo).toBe("USUARIO_DUPLICADO");

    const sinSucursal = await como(admin, "POST", "/api/usuarios", { ...NUEVO, sucursalId: 99 });
    expect(sinSucursal.statusCode).toBe(404);
    expect((await iniciarSesion("nueva@demo.cl")).statusCode).toBe(401); // no se creó la cuenta
  });

  it("al desactivar a alguien se cierran sus sesiones", async () => {
    const { admin, como, cookieDe } = await conAdmin();
    const { id } = (await como(admin, "POST", "/api/usuarios", NUEVO)).json();
    const nueva = await cookieDe("nueva@demo.cl");

    expect((await como(admin, "PATCH", `/api/usuarios/${id}`, { activo: false })).json()).toMatchObject({ activo: false });

    expect((await como(nueva, "GET", "/api/yo")).statusCode).toBe(401);
  });

  it("el admin no puede desactivarse ni quitarse el rol", async () => {
    const { admin, como } = await conAdmin();

    expect((await como(admin, "PATCH", "/api/usuarios/1", { activo: false })).statusCode).toBe(403);
    expect((await como(admin, "PATCH", "/api/usuarios/1", { rol: "CAJERO" })).statusCode).toBe(403);
    expect((await como(admin, "PATCH", "/api/usuarios/1", { nombre: "Admin Principal" })).json()).toMatchObject({ nombre: "Admin Principal" });
  });

  it("restablecer la contraseña cierra las sesiones y solo vale la nueva", async () => {
    const { admin, como, cookieDe, iniciarSesion } = await conAdmin();
    const { id } = (await como(admin, "POST", "/api/usuarios", NUEVO)).json();
    const sesionVieja = await cookieDe("nueva@demo.cl");

    expect((await como(admin, "POST", `/api/usuarios/${id}/contrasena`, { contrasena: "otra clave bien larga" })).statusCode).toBe(204);

    expect((await como(sesionVieja, "GET", "/api/yo")).statusCode).toBe(401);
    expect((await iniciarSesion("nueva@demo.cl")).statusCode).toBe(401);
    expect((await iniciarSesion("nueva@demo.cl", "otra clave bien larga")).statusCode).toBe(200);
  });
});
