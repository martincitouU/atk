// Estados de espera, vacíos y de error, iguales en todas las vistas.

import type { UseQueryResult } from "@tanstack/react-query";
import { Inbox, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { mensajeDe } from "../api/cliente.ts";
import { Aviso } from "./Aviso.tsx";
import { Boton } from "./Boton.tsx";
import css from "./Estados.module.css";

/** Mientras llega la respuesta de la API. */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className={css.cargando} role="status">
      <LoaderCircle className={css.girando} size={20} aria-hidden />
      {texto}
    </div>
  );
}

/** Una lista sin resultados: qué pasa y, si se puede, qué hacer. */
export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className={css.vacio}>
      <span className={css.iconoVacio}>
        <Inbox size={22} aria-hidden />
      </span>
      <p className={css.tituloVacio}>{titulo}</p>
      {children && <p className={css.textoVacio}>{children}</p>}
      {accion}
    </div>
  );
}

/**
 * Una lectura que falló: el mensaje de la API, tal cual, y un botón para
 * volver a pedirla. Nunca una tabla vacía, que haría creer que no hay datos.
 */
export function ErrorDeCarga({ error, alReintentar, titulo = "No se pudo cargar" }: { error: unknown; alReintentar?: () => void; titulo?: string }) {
  return (
    <Aviso
      tono="error"
      titulo={titulo}
      acciones={
        alReintentar && (
          <Boton tamano="chico" icono={<RotateCw size={16} aria-hidden />} onClick={alReintentar}>
            Reintentar
          </Boton>
        )
      }
    >
      {mensajeDe(error)}
    </Aviso>
  );
}

/**
 * Lo que trae una consulta a la API: "Cargando…" mientras llega, el error
 * con "Reintentar" si falló, o el contenido armado con los datos.
 *
 *   <ConDatos consulta={useOperaciones()}>{(operaciones) => <Tabla>…</Tabla>}</ConDatos>
 */
export function ConDatos<T>({ consulta, cargando, children }: { consulta: UseQueryResult<T>; cargando?: string; children: (datos: T) => ReactNode }) {
  if (consulta.isPending) return <Cargando texto={cargando} />;
  if (consulta.isError) {
    return (
      <div className={css.conError}>
        <ErrorDeCarga error={consulta.error} alReintentar={() => void consulta.refetch()} />
      </div>
    );
  }
  return children(consulta.data);
}
