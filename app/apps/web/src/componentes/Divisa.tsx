// Divisas como en DESIGN.md (Token Selector Pill): un ícono redondo con su
// color y el código, en una pastilla. El color es solo decoración (paleta de
// los orbes): el código siempre va escrito al lado.
//
//   <IconoDivisa codigo="USD" />           el círculo solo
//   <DivisaCompacta codigo="USD" />        círculo + código, sin borde (tablas)
//   <PastillaDivisa codigo="USD" />        círculo + código en pastilla
//   <SelectorDivisa ... />                 pastilla que abre la lista para elegir

import { Check, ChevronDown } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Dialogo } from "./Dialogo.tsx";
import css from "./Divisa.module.css";

const ESTILO: Record<string, { glifo: string; color: string }> = {
  CLP: { glifo: "$", color: "var(--color-hot-pink)" },
  USD: { glifo: "$", color: "var(--color-mint-teal)" },
  EUR: { glifo: "€", color: "var(--color-electric-violet)" },
  BRL: { glifo: "R$", color: "var(--color-ember-orange)" },
  ARS: { glifo: "$", color: "var(--color-sky-cyan)" },
};

export function IconoDivisa({ codigo, tamano = 24 }: { codigo: string; tamano?: number }) {
  const estilo = ESTILO[codigo] ?? { glifo: codigo.charAt(0), color: "var(--color-charcoal)" };
  return (
    <span
      className={css.icono}
      // Variables CSS por divisa: color y tamaño
      style={{ "--color-divisa": estilo.color, "--tamano-icono": `${tamano}px` } as CSSProperties}
      aria-hidden
    >
      {estilo.glifo}
    </span>
  );
}

/** Ícono + código sin borde: para tablas, donde la pastilla pesa demasiado. */
export function DivisaCompacta({ codigo }: { codigo: string }) {
  return (
    <span className={css.compacta}>
      <IconoDivisa codigo={codigo} tamano={20} />
      {codigo}
    </span>
  );
}

export function PastillaDivisa({ codigo }: { codigo: string }) {
  return (
    <span className={css.pastilla}>
      <IconoDivisa codigo={codigo} />
      <span className={css.codigo}>{codigo}</span>
    </span>
  );
}

type Opcion = { codigo: string; nombre: string };

/** Pastilla que abre un diálogo con las divisas de la casa para elegir una. */
export function SelectorDivisa({ opciones, valor, alCambiar }: { opciones: Opcion[]; valor: string; alCambiar: (codigo: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className={`${css.pastilla} ${css.boton}`} onClick={() => setAbierto(true)} aria-label={`Divisa: ${valor}. Cambiar`}>
        <IconoDivisa codigo={valor} />
        <span className={css.codigo}>{valor}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      <Dialogo abierto={abierto} alCerrar={() => setAbierto(false)} titulo="Elige la divisa">
        <ul className={css.lista}>
          {opciones.map((o) => (
            <li key={o.codigo}>
              <button
                type="button"
                className={css.opcion}
                aria-current={o.codigo === valor || undefined}
                onClick={() => {
                  alCambiar(o.codigo);
                  setAbierto(false);
                }}
              >
                <IconoDivisa codigo={o.codigo} tamano={36} />
                <span className={css.nombres}>
                  <span className={css.codigo}>{o.codigo}</span>
                  <span className={css.nombre}>{o.nombre}</span>
                </span>
                {o.codigo === valor && <Check size={18} aria-hidden className={css.marca} />}
              </button>
            </li>
          ))}
        </ul>
      </Dialogo>
    </>
  );
}
