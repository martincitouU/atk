import { CheckIcon, ExclamationMarkIcon, IdentificationCardIcon, ReceiptIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { Fragment, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useNavigate, useOutletContext } from "react-router";
import { ErrorNegocio } from "../../api/cliente.ts";
import { useMiFicha, useMisOperaciones, useSalir, useYo } from "../../api/consultas.ts";
import { aBigint, type CuentaDelCliente, type OperacionCliente } from "../../api/esquemas.ts";
import { Aviso } from "../../componentes/Aviso.tsx";
import { EsqueletoEntrar } from "../../componentes/Esqueleto.tsx";
import { Sep } from "../../componentes/Sep.tsx";
import { conSimbolo, diaLargo, fechaEn, hora, pesos, rutConPuntos, tasa } from "../../comun.ts";
import "../../estilos/portal.css";

// ---------------------------------------------------------------------------
// Piezas que comparten las pantallas del portal

/** El letrero verde de la casa, más bajo que la pizarra y sin cifras. */
export function LetreroPortal() {
  return (
    <header className="portal-letrero">
      <p className="portal-marca">
        ATK<span>Casa de cambio</span>
      </p>
      <p className="portal-lugar">Coyhaique</p>
    </header>
  );
}

type Paso = "hecho" | "aqui" | "pendiente";

/** Los tres pasos como hitos kilométricos de la carretera: crear, carnet, ver. */
export function Hitos({ pasos }: { pasos: [Paso, Paso, Paso] }) {
  const textos = ["Cree su cuenta", "Muestre su carnet en el local", "Vea sus operaciones"];
  return (
    <ol className="hitos" aria-label="Los tres pasos">
      {textos.map((texto, i) => (
        <li key={texto} className={`hito ${pasos[i]}`} aria-current={pasos[i] === "aqui" ? "step" : undefined}>
          <span className="poste" aria-hidden="true">
            {pasos[i] === "hecho" ? <CheckIcon size={16} weight="bold" /> : i + 1}
          </span>
          {texto}
          {pasos[i] === "hecho" && <span className="oculto"> (listo)</span>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// El marco: la guarda de la cuenta, el letrero y la barra de abajo

/**
 * El portal de clientes (/mi): solo lee lo propio (docs/api.md §4). Sin
 * sesión, al ingreso del portal; con una sesión del personal, a la
 * Ventanilla. La barra de abajo tiene dos destinos y «Salir».
 */
export function Portal() {
  const yo = useYo();
  const salir = useSalir();
  const navegar = useNavigate();

  if (yo.isPending) return <EsqueletoEntrar />;
  if (yo.isError) {
    if (yo.error instanceof ErrorNegocio && yo.error.codigo === "SIN_SESION") return <Navigate to="/mi/entrar" replace />;
    return (
      <div className="portal">
        <LetreroPortal />
        <main className="portal-cuerpo" id="contenido">
          <Aviso tono="error" rol="alert">
            <p>{yo.error instanceof ErrorNegocio ? yo.error.message : "No se pudo abrir su cuenta. Inténtelo de nuevo."}</p>
          </Aviso>
        </main>
      </div>
    );
  }
  if (yo.data.tipo === "personal") return <Navigate to="/ventanilla" replace />;

  const cuenta = yo.data.cuenta;
  const verificada = cuenta.estado === "VERIFICADA";

  return (
    <div className="portal">
      <LetreroPortal />
      <main className="portal-cuerpo" id="contenido">
        <Outlet context={cuenta} />
      </main>
      <nav className="portal-barra" aria-label="Portal">
        <NavLink to="/mi" end>
          {verificada ? <ReceiptIcon size={22} weight="bold" aria-hidden="true" /> : <UserCircleIcon size={22} weight="bold" aria-hidden="true" />}
          {verificada ? "Operaciones" : "Mi cuenta"}
        </NavLink>
        <NavLink to="/mi/ficha">
          <IdentificationCardIcon size={22} weight="bold" aria-hidden="true" />
          Mi ficha
        </NavLink>
        <button
          type="button"
          className="portal-salir"
          disabled={salir.isPending}
          onClick={() => salir.mutate(undefined, { onSettled: () => void navegar("/mi/entrar", { replace: true }) })}
        >
          <SignOutIcon size={22} weight="bold" aria-hidden="true" />
          Salir
        </button>
      </nav>
    </div>
  );
}

const usarCuenta = () => useOutletContext<CuentaDelCliente>();
const nombreDePila = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

// ---------------------------------------------------------------------------
// La cuenta sin verificar: el paso que falta, con el mensaje de la API

/**
 * PENDIENTE o RECHAZADA: /api/mi/* responde CUENTA_NO_VERIFICADA con el qué
 * hacer, y ese mensaje se muestra tal cual. Mientras llega, el mismo texto de
 * la API como respaldo, para que la pantalla no quede vacía.
 */
function EstadoCuenta({ cuenta, error }: { cuenta: CuentaDelCliente; error: unknown }) {
  const rechazada = cuenta.estado === "RECHAZADA";
  const mensaje =
    error instanceof ErrorNegocio
      ? error.message
      : rechazada
        ? "Su cuenta fue rechazada. Acérquese al local si cree que es un error."
        : "Su cuenta aún no está verificada. Acérquese al local con su carnet para activarla.";

  return (
    <>
      <div className="portal-titulo">
        <h1>Hola, {nombreDePila(cuenta.nombre)}</h1>
        <p>{rechazada ? "Revisamos su cuenta en el local." : "Su cuenta está creada. Falta un paso."}</p>
      </div>
      {!rechazada && <Hitos pasos={["hecho", "aqui", "pendiente"]} />}
      <div className={`portal-aviso${rechazada ? " rechazada" : ""}`} role="status">
        <span className="senal" aria-hidden="true">
          <ExclamationMarkIcon size={18} weight="bold" />
        </span>
        <div>
          <p>{mensaje}</p>
          {rechazada && cuenta.motivoRechazo && <p className="motivo">Motivo: {cuenta.motivoRechazo}</p>}
          <p className="dato">
            Registrada con el RUT <span className="num">{rutConPuntos(cuenta.rut)}</span>.
          </p>
        </div>
      </div>
      {!rechazada && (
        <ul className="portal-lleve">
          <li>Su carnet de identidad, el mismo RUT de la cuenta.</li>
          <li>No hace falta comprar ni vender: basta con mostrarlo.</li>
          <li>Desde ese momento, aquí aparece todo lo que haga en ATK.</li>
        </ul>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mis operaciones

/** El portal no recibe el catálogo: los decimales salen de ISO 4217 (Intl) y el símbolo, de esta lista. */
const SIMBOLOS: Record<string, string> = { USD: "US$", EUR: "€", ARS: "AR$", BRL: "R$" };
// ponytail: /api/mi/operaciones no trae decimales ni símbolo; pedirle a Martín que los mande
const decimalesDe = (codigo: string) => {
  try {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: codigo }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
};

const MEDIO: Record<OperacionCliente["medioPago"], string> = { EFECTIVO: "en efectivo", TRANSFERENCIA: "por transferencia", TARJETA: "con tarjeta" };
const DTE: Record<number, string> = { 41: "boleta", 34: "factura" };
const COLOR: Record<string, string> = { USD: "var(--usd)", ARS: "var(--ars)", EUR: "var(--eur)" };

/** Desde el lado del cliente: una VENTA de la casa es que él compró. */
function Operacion({ op }: { op: OperacionCliente }) {
  const compro = op.tipo === "VENTA";
  const anulada = op.estado === "REVERSADA";
  const monto = conSimbolo(aBigint(op.montoDivisa), { simbolo: SIMBOLOS[op.monedaCodigo] ?? op.monedaCodigo, decimales: decimalesDe(op.monedaCodigo) });
  const doc = op.folioDte === null ? null : `${DTE[op.tipoDte ?? 41] ?? "documento"} ${op.folioDte}`;
  return (
    <li className={anulada ? "op anulada" : "op"}>
      <p className="op-que">
        <span className="punto" style={{ background: COLOR[op.monedaCodigo] ?? "var(--neutro)" }} aria-hidden="true" />
        <span className="op-texto">
          {compro ? "Compró" : "Vendió"} {monto}
        </span>
        {anulada && <span className="est rev">Anulada</span>}
      </p>
      <p className="op-pesos num">{pesos(aBigint(op.montoBase))}</p>
      <p className="op-det">
        {anulada ? (
          "Anulada en el local: no cuenta."
        ) : (
          <>
            {compro ? "Pagó" : "Recibió"} {MEDIO[op.medioPago]} a ${tasa(op.tasaAplicadaE6, 2)}
            {doc && (
              <>
                <Sep />
                {doc}
              </>
            )}
            <Sep />
            {hora(op.realizadaEn)}
          </>
        )}
      </p>
    </li>
  );
}

export function MisOperaciones() {
  const cuenta = usarCuenta();
  const verificada = cuenta.estado === "VERIFICADA";
  const operaciones = useMisOperaciones(true);

  if (!verificada || (operaciones.error instanceof ErrorNegocio && operaciones.error.codigo === "CUENTA_NO_VERIFICADA")) {
    return <EstadoCuenta cuenta={cuenta} error={operaciones.error} />;
  }

  const lista = operaciones.data ?? [];
  const hoy = fechaEn(new Date());
  const dias = new Map<string, OperacionCliente[]>();
  for (const op of lista) {
    const dia = fechaEn(new Date(op.realizadaEn));
    dias.set(dia, [...(dias.get(dia) ?? []), op]);
  }

  return (
    <>
      <div className="portal-titulo fila">
        <h1>Hola, {nombreDePila(cuenta.nombre)}</h1>
        {operaciones.isSuccess && (
          <p>
            {lista.length} {lista.length === 1 ? "operación" : "operaciones"}
          </p>
        )}
      </div>
      {operaciones.isError ? (
        <Aviso tono="error" rol="alert">
          <p>{operaciones.error instanceof ErrorNegocio ? operaciones.error.message : "No se pudieron leer sus operaciones."}</p>
        </Aviso>
      ) : operaciones.isPending ? (
        <div className="portal-espera" aria-busy="true">
          <span className="oculto">Cargando sus operaciones…</span>
          <span className="esqueleto" aria-hidden="true" />
          <span className="esqueleto" aria-hidden="true" />
        </div>
      ) : lista.length === 0 ? (
        <p className="portal-vacio">Todavía no hay operaciones con su RUT. Aparecen aquí apenas compre o venda en el local.</p>
      ) : (
        <div className="portal-ops">
          {[...dias].map(([dia, ops]) => (
            <Fragment key={dia}>
              <h2 className="portal-dia">
                {dia === hoy && (
                  <>
                    Hoy
                    <Sep />
                  </>
                )}
                {diaLargo(dia)}
              </h2>
              <ul>
                {ops.map((op) => (
                  <Operacion key={op.id} op={op} />
                ))}
              </ul>
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mi ficha

const TIPO_DOC: Record<string, string> = { RUT: "RUT", PASAPORTE: "Pasaporte", DNI: "DNI", OTRO: "Documento" };

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div>
      <dt>{nombre}</dt>
      <dd>{children ?? <span className="falta">Sin dato</span>}</dd>
    </div>
  );
}

export function MiFicha() {
  const cuenta = usarCuenta();
  const ficha = useMiFicha(true);

  if (cuenta.estado !== "VERIFICADA" || (ficha.error instanceof ErrorNegocio && ficha.error.codigo === "CUENTA_NO_VERIFICADA")) {
    return <EstadoCuenta cuenta={cuenta} error={ficha.error} />;
  }

  const f = ficha.data;
  return (
    <>
      <div className="portal-titulo">
        <h1>Mi ficha</h1>
        <p>Los datos que la casa guarda para la UAF.</p>
      </div>
      {ficha.isError ? (
        <Aviso tono="error" rol="alert">
          <p>{ficha.error instanceof ErrorNegocio ? ficha.error.message : "No se pudo leer su ficha."}</p>
        </Aviso>
      ) : !f ? (
        <div className="portal-espera" aria-busy="true">
          <span className="oculto">Cargando su ficha…</span>
          <span className="esqueleto" aria-hidden="true" />
        </div>
      ) : (
        <>
          <dl className="portal-ficha">
            <Dato nombre="Nombre">{f.nombre}</Dato>
            <Dato nombre={TIPO_DOC[f.tipoDocumento] ?? "Documento"}>
              <span className="num">{f.tipoDocumento === "RUT" ? rutConPuntos(f.numeroDocumento) : f.numeroDocumento}</span>
            </Dato>
            <Dato nombre="Nacionalidad">{f.nacionalidad}</Dato>
            <Dato nombre="País de residencia">{f.paisResidencia}</Dato>
            <Dato nombre="Oficio o profesión">{f.oficio}</Dato>
            <Dato nombre="Domicilio">{f.domicilio}</Dato>
            <Dato nombre="Teléfono">{f.telefono}</Dato>
            <Dato nombre="Correo">{f.email}</Dato>
          </dl>
          <p className="portal-nota">Si algo no calza, avíselo en el local: la ficha se corrige con su carnet a la vista.</p>
        </>
      )}
    </>
  );
}
