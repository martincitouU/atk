// SOLO DESARROLLO. Levanta la API en local con una base de demo, para
// probar el front contra la API real:
//
//   cd app && npm run dev:api        (y en otra terminal: npm run dev)
//
// Si la base no existe, la crea con la jornada de ejemplo del front (la del
// comp de diseño): la casa, la pizarra, un turno abierto con su fondo,
// operaciones, un gasto y cuatro clientes. Después arranca principal.ts.
// Login: rolando@atk.cl / ventanilla. Para empezar de cero, borre app/.dev/.
//
// Nunca corre en producción: ahí la casa se configura con cli/inicializar.ts.

import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { crearAuth } from "../auth/auth.ts";
import { abrirBase } from "../db/conexion.ts";
import { migrar } from "../db/migrar.ts";
import { registrarIngresoORetiro } from "../servicios/caja.ts";
import { crearCliente, type EntradaCliente } from "../servicios/clientes.ts";
import { crearContexto, type Actor } from "../servicios/contexto.ts";
import { publicarCotizacion } from "../servicios/cotizaciones.ts";
import { registrarGasto } from "../servicios/gastos.ts";
import { estaInicializada, inicializar } from "../servicios/inicializacion.ts";
import { confirmarOperacion, crearBorrador, reversarOperacion, type EntradaOperacion } from "../servicios/operaciones.ts";
import { leerParametros } from "../servicios/parametros.ts";
import { abrirTurno } from "../servicios/turnos.ts";

if (process.env.NODE_ENV === "production") {
  console.error("cli/demo.ts es solo para desarrollo. En producción se usa cli/inicializar.ts.");
  process.exit(1);
}

// Valores de desarrollo: nada de esto es secreto. El origen es el de Vite,
// que reenvía /api a esta API (vite.config.ts): así Origin y cookie calzan.
const carpeta = resolve(import.meta.dirname, "../../../../.dev");
mkdirSync(carpeta, { recursive: true });
process.env.DATABASE_PATH ??= join(carpeta, "demo.db");
process.env.BETTER_AUTH_SECRET ??= "solo-desarrollo-atk-demo-no-es-un-secreto-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:5173";
process.env.PORT ??= "3000";

const conexion = abrirBase(process.env.DATABASE_PATH);
migrar(conexion.sqlite);
if (!estaInicializada(crearContexto(conexion.db))) await sembrar();
conexion.sqlite.close();

await import("../principal.ts");

/** La jornada del comp, armada hacia atrás desde ahora con las reglas reales de los servicios. */
async function sembrar() {
  const creacion = Date.now();
  let minutosAtras = 0;
  const ctx = crearContexto(conexion.db, () => new Date(creacion - minutosAtras * 60_000));
  /** Corre `accion` con el reloj `minutos` antes de ahora. */
  const hace = <T>(minutos: number, accion: () => T): T => {
    minutosAtras = minutos;
    try {
      return accion();
    } finally {
      minutosAtras = 0;
    }
  };

  const auth = crearAuth({
    rutaBase: process.env.DATABASE_PATH!,
    secreto: process.env.BETTER_AUTH_SECRET!,
    urlPublica: process.env.BETTER_AUTH_URL!,
    inactividadMinutos: leerParametros(conexion.db).sesionInactividadMinutos,
  });
  minutosAtras = 110;
  const { adminId, cajas } = await inicializar(ctx, auth, {
    casa: { rut: "76482913-1", razonSocial: "ATK Casa de Cambio SpA", nombreFantasia: "ATK" },
    divisas: ["USD", "ARS", "EUR"],
    sucursal: { nombre: "Casa Matriz", direccion: "21 de Mayo 417", comuna: "Coyhaique" },
    cajas: ["Caja 1"],
    admin: { rut: "12873465-1", nombre: "Rolando del Río", email: "rolando@atk.cl", contrasena: "ventanilla" },
  });
  minutosAtras = 0;
  const rolando: Actor = { id: adminId, rol: "ADMIN" };
  const E6 = 1_000_000n;

  // Referencia y margen fijo en pesos: compra = ref − m, venta = ref + m
  const publicar = (monedaCodigo: string, referenciaE6: bigint, margenE6: bigint) =>
    publicarCotizacion(ctx, rolando, { monedaCodigo, referenciaE6, tipoMargen: "MONTO_FIJO", margenCompraE6: margenE6, margenVentaE6: margenE6 });
  const operar = (entrada: EntradaOperacion) => confirmarOperacion(ctx, rolando, crearBorrador(ctx, rolando, entrada).id);

  hace(104, () => {
    publicar("USD", 942n * E6, 7n * E6); // 935,00 / 949,00
    publicar("ARS", 665_000n, 45_000n); // 0,6200 / 0,7100
    publicar("EUR", 1032n * E6, 14n * E6); // 1.018,00 / 1.046,00
  });
  hace(102, () => {
    abrirTurno(ctx, rolando, cajas[0]!.id);
    for (const [monedaCodigo, monto] of [["CLP", 4378240n], ["USD", 200000n], ["ARS", 35_000_000n], ["EUR", 150000n]] as const) {
      registrarIngresoORetiro(ctx, rolando, { tipo: "INGRESO", monedaCodigo, monto, motivo: "Fondo inicial" });
    }
  });
  hace(84, () =>
    registrarGasto(ctx, rolando, { categoriaId: 6, descripcion: "Resma de papel y tinta para la impresora de boletas", monto: 18990n, medioPago: "EFECTIVO" }),
  );
  hace(64, () => crearBorrador(ctx, rolando, { tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 8000n })); // queda en borrador
  hace(47, () => operar({ tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 5000n, tipoDte: 41, folioDte: 18230 }));
  const mal = hace(46, () => operar({ tipo: "VENTA", monedaCodigo: "EUR", montoDivisa: 50000n, tipoDte: 41, folioDte: 18229 }));
  hace(43, () => reversarOperacion(ctx, rolando, mal.id, "Monto mal digitado"));
  hace(29, () => operar({ tipo: "COMPRA", monedaCodigo: "USD", montoDivisa: 120000n, tipoDte: 41, folioDte: 18231 }));
  hace(13, () => operar({ tipo: "COMPRA", monedaCodigo: "ARS", montoDivisa: 15_000_000n, tipoDte: 41, folioDte: 18232 }));
  hace(2, () => {
    publicar("USD", 943_500_000n, 8_500_000n); // 935,00 / 952,00: cambió hace 2 min
    operar({ tipo: "VENTA", monedaCodigo: "USD", montoDivisa: 30000n, tipoDte: 41, folioDte: 18233 });
  });

  // Cuatro clientes; el último, con la ficha incompleta
  const vacia = { nacionalidad: null, oficio: null, paisResidencia: null, domicilio: null, telefono: null, email: null, relacionPermanente: false };
  for (const c of [
    { ...vacia, tipoDocumento: "RUT", numeroDocumento: "15209384-5", nombre: "Mariela Contreras Vidal", nacionalidad: "CL", oficio: "Comerciante", paisResidencia: "CL", domicilio: "Baquedano 512, Coyhaique", telefono: "+56 9 8123 4567", relacionPermanente: true },
    { ...vacia, tipoDocumento: "PASAPORTE", numeroDocumento: "AAB123456", nombre: "Julián Ferreyra", nacionalidad: "AR", oficio: "Guía de turismo", paisResidencia: "AR", domicilio: "Av. Rivadavia 1450, Comodoro Rivadavia", email: "jferreyra@ejemplo.com" },
    { ...vacia, tipoDocumento: "PASAPORTE", numeroDocumento: "C4R7T2K91", nombre: "Hannah Weber", nacionalidad: "DE", oficio: "Ingeniera", paisResidencia: "DE", domicilio: "Lindenstraße 8, Leipzig", email: "hannah.weber@ejemplo.com" },
    { ...vacia, tipoDocumento: "RUT", numeroDocumento: "9846217-1", nombre: "Pedro Soto Muñoz", nacionalidad: "CL" },
  ] satisfies EntradaCliente[]) {
    crearCliente(ctx, rolando, c);
  }
  console.log("Base de demo creada. Login: rolando@atk.cl / ventanilla");
}
