// Campos de formulario con su etiqueta, ayuda y error, ya conectados para
// lectores de pantalla (aria-describedby, aria-invalid).
//
//   <Entrada etiqueta="Correo" type="email" />
//   <Seleccion etiqueta="Caja">{opciones}</Seleccion>
//   <AreaTexto etiqueta="Observación" />
//
// Aceptan `ref` como cualquier prop (React 19), así sirven con react-hook-form.

import { CircleAlert } from "lucide-react";
import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import css from "./Campo.module.css";

type Comunes = {
  etiqueta: ReactNode;
  /** Texto de ayuda bajo el campo */
  ayuda?: ReactNode;
  /** Mensaje de error: marca el campo en rojo */
  error?: string;
  /** Algo a la derecha del campo: un símbolo de moneda, una unidad */
  sufijo?: ReactNode;
};

/** Lo que el envoltorio le pasa al control para conectarlo con su etiqueta y mensajes. */
type Atributos = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

/** Arma el envoltorio común y le pasa al control los atributos de accesibilidad. */
function Envoltorio({
  etiqueta,
  ayuda,
  error,
  sufijo,
  id,
  className,
  children,
}: Comunes & { id?: string; className?: string; children: (atributos: Atributos) => ReactNode }) {
  const automatico = useId();
  const idCampo = id ?? automatico;
  const idAyuda = `${idCampo}-ayuda`;
  const idError = `${idCampo}-error`;
  const describe = [ayuda && idAyuda, error && idError].filter(Boolean).join(" ") || undefined;

  return (
    <div className={[css.campo, className].filter(Boolean).join(" ")}>
      <label htmlFor={idCampo} className={css.etiqueta}>
        {etiqueta}
      </label>
      <div className={css.control} data-error={error ? "" : undefined}>
        {children({ id: idCampo, "aria-describedby": describe, "aria-invalid": error ? true : undefined })}
        {sufijo && <span className={css.sufijo}>{sufijo}</span>}
      </div>
      {ayuda && (
        <p id={idAyuda} className={css.ayuda}>
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className={css.error}>
          <CircleAlert size={14} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function Entrada({
  etiqueta,
  ayuda,
  error,
  sufijo,
  id,
  className,
  ref,
  ...props
}: Comunes & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <Envoltorio {...{ etiqueta, ayuda, error, sufijo, id, className }}>
      {(atributos) => <input ref={ref} className={css.entrada} {...atributos} {...props} />}
    </Envoltorio>
  );
}

export function Seleccion({
  etiqueta,
  ayuda,
  error,
  id,
  className,
  ref,
  children,
  ...props
}: Comunes & SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> }) {
  return (
    <Envoltorio {...{ etiqueta, ayuda, error, id, className }}>
      {(atributos) => (
        <select ref={ref} className={`${css.entrada} ${css.seleccion}`} {...atributos} {...props}>
          {children}
        </select>
      )}
    </Envoltorio>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  error,
  id,
  className,
  ref,
  ...props
}: Comunes & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return (
    <Envoltorio {...{ etiqueta, ayuda, error, id, className }}>
      {(atributos) => <textarea ref={ref} className={`${css.entrada} ${css.area}`} rows={3} {...atributos} {...props} />}
    </Envoltorio>
  );
}

/** Varios campos en fila que bajan a columna en pantallas angostas. */
export function FilaCampos({ children }: { children: ReactNode }) {
  return <div className={css.fila}>{children}</div>;
}
