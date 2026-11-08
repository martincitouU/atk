import { entradaInicializacion } from "@atk/shared";
import { describe, expect, it } from "vitest";
import { crearAuth } from "../../src/auth/auth.ts";
import { sesionDesdeCookie } from "../../src/auth/sesion.ts";
import { auditoria, caja, casaMoneda } from "../../src/db/esquema.ts";
import { migrar } from "../../src/db/migrar.ts";
import { crearContexto, ErrorNegocio } from "../../src/servicios/contexto.ts";
import { inicializar } from "../../src/servicios/inicializacion.ts";
import { construirServidor } from "../../src/servidor.ts";
import { baseTemporal } from "../ayuda.ts";
import { cookieDeRespuesta, ORIGEN } from "../rutas/login.ts";

const DATOS = entradaInicializacion.parse({
  casa: { rut: "76.123.456-0", razonSocial: "Cambios Coyhaique SpA" },
  divisas: ["USD", "ARS"],
  sucursal: { nombre: "Casa Matriz", comuna: "Coyhaique" },
  cajas: ["Caja 1", "Caja 2"],
  admin: { rut: "11.111.111-1", nombre: "Dueña", email: "duena@cambios.cl", contrasena: "clave inicial larga" },
});

/** Base de producción recién migrada: sin semilla. */
function baseNueva() {
  const conexion = baseTemporal();
  migrar(conexion.sqlite);
  const auth = crearAuth({ rutaBase: conexion.sqlite.name, secreto: "s".repeat(40), urlPublica: ORIGEN, inactividadMinutos: 15, limitarIntentos: false });
  return { ...conexion, auth, ctx: crearContexto(conexion.db) };
}

async function codigoDeErrorAsync(promesa: Promise<unknown>) {
  try {
    await promesa;
  } catch (error) {
    return error instanceof ErrorNegocio ? error.codigo : `OTRO: ${(error as Error).message}`;
  }
  return undefined;
}

describe("Configuración inicial", () => {
  it("crea la casa, sus divisas, la sucursal, las cajas y el admin, y lo audita", async () => {
    const { ctx, auth, db } = baseNueva();

    const resultado = await inicializar(ctx, auth, DATOS);

    expect(resultado).toMatchObject({ casa: { rut: "76123456-0", monedaBase: "CLP" }, divisas: ["USD", "ARS"] });
    expect(db.select().from(casaMoneda).all()).toMatchObject([
      { monedaCodigo: "USD", decimalesTasa: 2, ordenPizarra: 1 },
      { monedaCodigo: "ARS", decimalesTasa: 4, ordenPizarra: 2 },
    ]);
    expect(db.select().from(caja).all()).toHaveLength(2);
    expect(db.select().from(auditoria).all()).toMatchObject([{ tabla: "casa", accion: "CREAR", usuarioId: resultado.adminId }]);
  });

  it("el admin inicia sesión y publica la primera pizarra", async () => {
    const conexion = baseNueva();
    await inicializar(conexion.ctx, conexion.auth, DATOS);
    const app = construirServidor(conexion, { auth: conexion.auth, urlPublica: ORIGEN, obtenerSesion: sesionDesdeCookie(conexion.auth, conexion.db) });

    expect((await app.inject({ method: "GET", url: "/health" })).json()).toMatchObject({ configurada: true });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { origin: ORIGEN },
      payload: { email: "duena@cambios.cl", password: "clave inicial larga" },
    });
    const cookie = cookieDeRespuesta(login.headers["set-cookie"]);
    const publicar = await app.inject({
      method: "POST",
      url: "/api/cotizaciones",
      headers: { cookie, origin: ORIGEN },
      payload: { monedaCodigo: "USD", referenciaE6: "940000000", margenCompraE6: "1500000", margenVentaE6: "1500000" },
    });

    expect(publicar.statusCode).toBe(201);
    const pizarra = (await app.inject({ method: "GET", url: "/api/pizarra", headers: { cookie } })).json();
    expect(pizarra.find((f: { monedaCodigo: string }) => f.monedaCodigo === "USD")).toMatchObject({ vencida: false });
  });

  it("solo se hace una vez", async () => {
    const { ctx, auth } = baseNueva();
    await inicializar(ctx, auth, DATOS);

    expect(await codigoDeErrorAsync(inicializar(ctx, auth, { ...DATOS, admin: { ...DATOS.admin, email: "otra@cambios.cl" } }))).toBe("YA_INICIALIZADA");
  });

  it("la moneda base no se opera", async () => {
    const { ctx, auth } = baseNueva();
    expect(await codigoDeErrorAsync(inicializar(ctx, auth, { ...DATOS, divisas: ["USD", "CLP"] }))).toBe("MONEDA_INVALIDA");
  });

  it("si algo falla después de crear la cuenta del admin, no queda nada a medias", async () => {
    const { ctx, auth } = baseNueva();

    // Dos cajas con el mismo nombre en la sucursal: la base lo rechaza
    expect(await codigoDeErrorAsync(inicializar(ctx, auth, { ...DATOS, cajas: ["Caja 1", "Caja 1"] }))).toMatch(/^OTRO: .*UNIQUE/);

    // Se puede reintentar con el mismo correo: la cuenta se borró
    await expect(inicializar(ctx, auth, DATOS)).resolves.toMatchObject({ divisas: ["USD", "ARS"] });
  });
});
