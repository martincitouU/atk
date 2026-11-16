import { CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ErrorNegocio } from "../api/cliente.ts";
import { useCuentasPendientes, useParametros, useRechazarCuenta, useVerificarCuenta } from "../api/consultas.ts";
import type { CuentaCliente } from "../api/esquemas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { Kbd } from "../componentes/Kbd.tsx";
import { Sep } from "../componentes/Sep.tsx";
import { diaLargo, fechaEn, hora, rutConPuntos, ZONA_CASA } from "../comun.ts";

/**
 * Las cuentas del portal que esperan la revisión del carnet en el local
 * (RF-18, docs/api.md «Cuentas de clientes»). Verificar enlaza la cuenta con la
 * ficha del mismo RUT; si no hay ficha, se ofrece crearla con el RUT escrito.
 * Sin cuentas por revisar, el panel no aparece.
 */
export function CuentasPendientes({ onCrearFicha }: { onCrearFicha: (cuenta: CuentaCliente) => void }) {
  const cuentas = useCuentasPendientes();
  const [hecho, setHecho] = useState<string | null>(null);
  const lista = cuentas.data ?? [];

  if (cuentas.isPending || (cuentas.isSuccess && lista.length === 0 && !hecho)) return null;

  return (
    <section className="panel cuentas" aria-labelledby="cuentas-titulo">
      <header>
        <h2 id="cuentas-titulo">Cuentas por verificar</h2>
        {lista.length > 0 && (
          <span className="hint">
            {lista.length} del portal
            <Sep />
            revise el carnet
          </span>
        )}
      </header>
      {cuentas.isError && (
        <div className="clientes-estado">
          <Aviso tono="error" rol="alert">
            <p>{cuentas.error instanceof ErrorNegocio ? cuentas.error.message : "No se pudieron cargar las cuentas del portal."}</p>
          </Aviso>
        </div>
      )}
      <p className="cuentas-hecho" aria-live="polite">
        {hecho && (
          <>
            <CheckCircleIcon size={16} weight="bold" aria-hidden="true" />
            {hecho}
          </>
        )}
      </p>
      {lista.length > 0 && (
        <ul className="cuentas-lista">
          {lista.map((c) => (
            <FilaCuenta key={c.id} cuenta={c} onHecho={setHecho} onCrearFicha={onCrearFicha} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaCuenta({
  cuenta,
  onHecho,
  onCrearFicha,
}: {
  cuenta: CuentaCliente;
  onHecho: (mensaje: string) => void;
  onCrearFicha: (cuenta: CuentaCliente) => void;
}) {
  const verificar = useVerificarCuenta();
  const zona = useParametros().data?.zonaHoraria ?? ZONA_CASA;
  const [fallo, setFallo] = useState<ErrorNegocio | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const creada = new Date(cuenta.creadaEn);
  const dia = fechaEn(creada, zona);

  async function alVerificar() {
    setFallo(null);
    try {
      await verificar.mutateAsync(cuenta.id);
      onHecho(`Cuenta de ${cuenta.nombre} verificada: ya puede ver sus operaciones en el portal.`);
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error : new ErrorNegocio("ERROR", "No se pudo verificar. Inténtelo de nuevo."));
    }
  }

  return (
    <li className="cuenta">
      <div className="cuenta-datos">
        <b>{cuenta.nombre}</b>
        <span>
          RUT <span className="num">{rutConPuntos(cuenta.rut)}</span>
          <Sep />
          se registró el {diaLargo(dia).toLowerCase()} a las {hora(cuenta.creadaEn, zona)}
        </span>
      </div>
      <div className="cuenta-acciones">
        <button type="button" className="btn prim" aria-label={`Verificar a ${cuenta.nombre}`} disabled={verificar.isPending} onClick={() => void alVerificar()}>
          {verificar.isPending ? "Verificando…" : "Verificar"}
        </button>
        <button type="button" className="btn" aria-label={`Rechazar a ${cuenta.nombre}`} aria-expanded={rechazando} onClick={() => setRechazando(true)}>
          Rechazar
        </button>
      </div>
      {fallo && (
        <div className="cuenta-fallo">
          <Aviso tono="error" rol="alert">
            <p>{fallo.message}</p>
            {fallo.codigo === "SIN_FICHA" && (
              <button type="button" className="enlace" onClick={() => onCrearFicha(cuenta)}>
                Crear la ficha con este RUT
              </button>
            )}
          </Aviso>
        </div>
      )}
      {rechazando && (
        <Rechazo
          cuenta={cuenta}
          onCerrar={(mensaje) => {
            setRechazando(false);
            if (mensaje) onHecho(mensaje);
          }}
        />
      )}
    </li>
  );
}

/** El rechazo pide un motivo: el cliente lo lee en el portal. */
function Rechazo({ cuenta, onCerrar }: { cuenta: CuentaCliente; onCerrar: (mensaje: string | null) => void }) {
  const rechazar = useRechazarCuenta();
  const [motivo, setMotivo] = useState("");
  const [fallo, setFallo] = useState<string | null>(null);
  const texto = useRef<HTMLTextAreaElement>(null);

  useEffect(() => texto.current?.focus(), []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpio = motivo.trim();
    if (!limpio || rechazar.isPending) return;
    setFallo(null);
    try {
      await rechazar.mutateAsync({ id: cuenta.id, motivo: limpio });
      onCerrar(`Cuenta de ${cuenta.nombre} rechazada. El motivo le aparece en el portal.`);
    } catch (error) {
      setFallo(error instanceof ErrorNegocio ? error.message : "No se pudo rechazar. Inténtelo de nuevo.");
    }
  }

  return (
    <form
      className="cuenta-rechazo"
      aria-label={`Rechazar la cuenta de ${cuenta.nombre}`}
      onSubmit={(e) => void enviar(e)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCerrar(null);
        }
      }}
    >
      <label>
        Motivo del rechazo
        <textarea
          ref={texto}
          required
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="El carnet no coincide con el RUT registrado…"
        />
      </label>
      {fallo && (
        <Aviso tono="error" rol="alert">
          <p>{fallo}</p>
        </Aviso>
      )}
      <div className="acciones">
        <button type="submit" className="btn peligro" disabled={!motivo.trim() || rechazar.isPending}>
          {rechazar.isPending ? "Rechazando…" : "Rechazar cuenta"}
        </button>
        <button type="button" className="btn" onClick={() => onCerrar(null)}>
          Cancelar <Kbd aria-hidden="true">Esc</Kbd>
        </button>
      </div>
    </form>
  );
}
