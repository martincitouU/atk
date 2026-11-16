import { ACCIONES_AUDITORIA } from "@atk/shared";
import { FunnelSimpleXIcon, GearIcon, LockSimpleIcon, UsersIcon } from "@phosphor-icons/react";
import { useNavigate, useSearchParams } from "react-router";
import { ErrorNegocio } from "../api/cliente.ts";
import { rangoDelDia, useAuditoria, useParametros, useUsuarios, type FiltrosAuditoria } from "../api/consultas.ts";
import type { RegistroAuditoria } from "../api/esquemas.ts";
import { Aviso } from "../componentes/Aviso.tsx";
import { useCinta } from "../componentes/Cinta.tsx";
import { Sep } from "../componentes/Sep.tsx";
import { diaLargo, fechaEn, hora, ZONA_CASA } from "../comun.ts";
import "../estilos/clientes.css";
import "../estilos/admin.css";

/** Las tablas que registran cambios, con el nombre que les da el local. */
const TABLAS: Record<string, string> = {
  operacion: "Operación",
  cotizacion: "Pizarra",
  turno: "Turno",
  movimiento_caja: "Caja",
  arqueo: "Arqueo",
  gasto: "Gasto",
  cliente: "Ficha de cliente",
  cuenta_cliente: "Cuenta del portal",
  usuario: "Usuario",
  casa: "Casa",
};

const ACCIONES: Record<string, string> = {
  CREAR: "Creó",
  EDITAR: "Editó",
  ELIMINAR: "Eliminó",
  CONFIRMAR: "Confirmó",
  REVERSAR: "Reversó",
  AUTORIZAR: "Autorizó",
  PUBLICAR: "Publicó",
  ABRIR: "Abrió",
  CERRAR: "Cerró",
  GENERAR: "Generó",
  EXPORTAR: "Exportó",
  IMPORTAR: "Importó",
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * La auditoría (RF-15, solo ADMIN): quién hizo qué y cuándo, con el antes y el
 * después de cada cambio. Solo lectura: la tabla rechaza UPDATE y DELETE. Los
 * filtros viven en la URL, así una consulta se puede volver a abrir.
 */
export function Auditoria() {
  const [params, setParams] = useSearchParams();
  const zona = useParametros().data?.zonaHoraria ?? ZONA_CASA;
  const usuarios = useUsuarios();
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  const filtros: FiltrosAuditoria = {
    ...(FECHA.test(desde) ? { desde: rangoDelDia(desde, zona).desde } : {}),
    ...(FECHA.test(hasta) ? { hasta: rangoDelDia(hasta, zona).hasta } : {}),
    ...(params.get("tabla") ? { tabla: params.get("tabla") ?? "" } : {}),
    ...(params.get("accion") ? { accion: params.get("accion") ?? "" } : {}),
    ...(params.get("usuario") ? { usuarioId: params.get("usuario") ?? "" } : {}),
  };
  const registros = useAuditoria(filtros);
  const nombreDe = new Map((usuarios.data ?? []).map((u) => [u.id, u.nombre]));
  const lista = registros.data ?? [];
  const hayFiltros = [...params.keys()].length > 0;

  function cambiar(clave: string, valor: string) {
    const nuevos = new URLSearchParams(params);
    if (valor) nuevos.set(clave, valor);
    else nuevos.delete(clave);
    setParams(nuevos, { replace: true });
  }

  const navegar = useNavigate();
  useCinta([
    {
      nombre: "Filtros",
      comandos: [
        {
          id: "quitar",
          etiqueta: "Quitar filtros",
          Icono: FunnelSimpleXIcon,
          grande: true,
          deshabilitado: !hayFiltros,
          alPulsar: () => setParams({}, { replace: true }),
        },
      ],
      nota: registros.isSuccess ? [`${lista.length} ${lista.length === 1 ? "cambio" : "cambios"}`, "El más reciente arriba"] : undefined,
    },
    {
      nombre: "Ir a",
      comandos: [
        { id: "usuarios", etiqueta: "Usuarios", Icono: UsersIcon, grande: true, alPulsar: () => void navegar("/usuarios") },
        { id: "config", etiqueta: "Configuración", Icono: GearIcon, tecla: "F5", grande: true, alPulsar: () => void navegar("/configuracion") },
      ],
    },
  ]);

  return (
    <div className="config admin">
      <header className="cartel-seccion gris">
        <div className="cartel-seccion-in">
          <div className="cartel-titulo">
            <h1>Auditoría</h1>
            <p>Quién hizo qué y cuándo</p>
          </div>
          <p className="config-lectura">
            <LockSimpleIcon size={16} weight="bold" aria-hidden="true" />
            Solo lectura
          </p>
        </div>
      </header>

      <section className="panel" aria-labelledby="auditoria-titulo">
        <header>
          <h2 id="auditoria-titulo">Registro de cambios</h2>
          {registros.isSuccess && (
            <p className="hint">
              {lista.length === 200 ? "Los últimos 200" : `${lista.length} ${lista.length === 1 ? "cambio" : "cambios"}`}
              <Sep />
              el más reciente arriba
            </p>
          )}
        </header>

        <form className="admin-filtros" role="search" aria-label="Filtrar la auditoría" onSubmit={(e) => e.preventDefault()}>
          <label>
            Desde
            <input type="date" value={desde} onChange={(e) => cambiar("desde", e.target.value)} />
          </label>
          <label>
            Hasta
            <input type="date" value={hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
          </label>
          <label>
            Qué
            <select value={params.get("tabla") ?? ""} onChange={(e) => cambiar("tabla", e.target.value)}>
              <option value="">Todo</option>
              {Object.entries(TABLAS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </label>
          <label>
            Acción
            <select value={params.get("accion") ?? ""} onChange={(e) => cambiar("accion", e.target.value)}>
              <option value="">Todas</option>
              {ACCIONES_AUDITORIA.map((a) => (
                <option key={a} value={a}>
                  {ACCIONES[a] ?? a}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quién
            <select value={params.get("usuario") ?? ""} onChange={(e) => cambiar("usuario", e.target.value)}>
              <option value="">Todos</option>
              {(usuarios.data ?? []).map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          {hayFiltros && (
            <button type="button" className="enlace" onClick={() => setParams({}, { replace: true })}>
              Quitar filtros
            </button>
          )}
        </form>

        {registros.isError ? (
          <div className="clientes-estado">
            <Aviso tono="error" rol="alert">
              <p>{registros.error instanceof ErrorNegocio ? registros.error.message : "No se pudo leer la auditoría."}</p>
            </Aviso>
          </div>
        ) : registros.isSuccess && lista.length === 0 ? (
          <p className="admin-vacio">{hayFiltros ? "Ningún cambio con esos filtros." : "Todavía no hay cambios registrados."}</p>
        ) : (
          <div className="admin-tabla">
            <table aria-labelledby="auditoria-titulo" aria-busy={registros.isFetching || undefined}>
              <thead>
                <tr>
                  <th scope="col">Cuándo</th>
                  <th scope="col">Quién</th>
                  <th scope="col">Qué</th>
                  <th scope="col">Motivo y detalle</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <Fila
                    key={r.id}
                    registro={r}
                    quien={r.usuarioId === null ? "El sistema" : (nombreDe.get(r.usuarioId) ?? `Usuario ${r.usuarioId}`)}
                    zona={zona}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** El JSON guardado, legible: sangrado y sin comillas en las claves. */
const legible = (datos: unknown) => JSON.stringify(datos, null, 2).replace(/"([^"]+)":/g, "$1:");

function Fila({ registro: r, quien, zona }: { registro: RegistroAuditoria; quien: string; zona: string }) {
  const hayDatos = r.datosAntes != null || r.datosDespues != null;
  return (
    <tr>
      <td className="admin-cuando">
        <span className="num">{hora(r.registradoEn, zona)}</span>
        <span>{diaLargo(fechaEn(new Date(r.registradoEn), zona))}</span>
      </td>
      <td>{quien}</td>
      <td>
        <b>{ACCIONES[r.accion] ?? r.accion}</b> {(TABLAS[r.tabla] ?? r.tabla).toLowerCase()} <span className="num">#{r.registroId}</span>
      </td>
      <td>
        {r.motivo && <p className="admin-motivo">{r.motivo}</p>}
        {hayDatos && (
          <details className="admin-detalle">
            <summary>Antes y después</summary>
            <div className="admin-datos">
              <div>
                <h3>Antes</h3>
                <pre>{r.datosAntes == null ? "—" : legible(r.datosAntes)}</pre>
              </div>
              <div>
                <h3>Después</h3>
                <pre>{r.datosDespues == null ? "—" : legible(r.datosDespues)}</pre>
              </div>
            </div>
          </details>
        )}
      </td>
    </tr>
  );
}
