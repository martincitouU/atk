import type { Icon } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { Kbd } from "./Kbd.tsx";

/**
 * La cinta: los comandos de la pantalla abierta, agrupados y rotulados, bajo
 * las pestañas (como la cinta de Office). Cada pantalla declara los suyos con
 * useCinta(); el marco los dibuja. Un comando hace lo mismo que su tecla: la
 * pantalla le pasa la misma función que usa su atajo.
 */
export type Comando = {
  id: string;
  etiqueta: string;
  Icono: Icon;
  /** La tecla que hace lo mismo, tal como se ve en el kbd. */
  tecla?: string;
  /** Botón grande (ícono arriba), para lo principal del grupo. */
  grande?: boolean;
  tono?: "verde" | "peligro";
  deshabilitado?: boolean;
  alPulsar: () => void;
};

export type GrupoCinta = {
  nombre: string;
  comandos: Comando[];
  /** Un dato corto al lado de los botones («Vigente desde 21:45»). */
  nota?: string[];
};

// Un almacén mínimo: la pantalla escribe, la cinta lee.
let actual: readonly GrupoCinta[] = [];
const oyentes = new Set<() => void>();
function fijar(grupos: readonly GrupoCinta[]) {
  actual = grupos;
  for (const oyente of oyentes) oyente();
}
function suscribir(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Declara los comandos de la pantalla. Se vuelven a publicar solo si cambia lo
 * que se ve (rótulos, teclas, estados); las funciones se leen siempre en su
 * última versión.
 */
export function useCinta(grupos: GrupoCinta[]) {
  const ref = useRef(grupos);
  useLayoutEffect(() => {
    ref.current = grupos;
  });
  const firma = JSON.stringify(grupos.map((g) => ({ ...g, comandos: g.comandos.map(({ alPulsar: _a, Icono: _i, ...visible }) => visible) })));
  useEffect(() => {
    fijar(
      ref.current.map((g, i) => ({
        ...g,
        comandos: g.comandos.map((c, j) => ({ ...c, alPulsar: () => ref.current[i]?.comandos[j]?.alPulsar() })),
      })),
    );
    return () => fijar([]);
  }, [firma]);
}

export function Cinta() {
  const grupos = useSyncExternalStore(suscribir, () => actual);
  if (grupos.length === 0) return <div className="cinta vacia" />;
  return (
    <div className="cinta" role="toolbar" aria-label="Comandos">
      {grupos.map((g) => (
        <div key={g.nombre} className="cinta-grupo" role="group" aria-label={g.nombre}>
          <div className="cinta-botones">
            {g.comandos.some((c) => c.grande) && (
              <div className="cinta-grandes">
                {g.comandos
                  .filter((c) => c.grande)
                  .map((c) => (
                    <Boton key={c.id} comando={c} />
                  ))}
              </div>
            )}
            {g.comandos.some((c) => !c.grande) && (
              <div className="cinta-pila">
                {g.comandos
                  .filter((c) => !c.grande)
                  .map((c) => (
                    <Boton key={c.id} comando={c} />
                  ))}
              </div>
            )}
            {g.nota && (
              <p className="cinta-nota">
                {g.nota.map((linea) => (
                  <span key={linea}>{linea}</span>
                ))}
              </p>
            )}
          </div>
          <div className="cinta-rotulo" aria-hidden="true">
            {g.nombre}
          </div>
        </div>
      ))}
    </div>
  );
}

/** El kbd («Esc», «C», «Enter») como lo pide aria-keyshortcuts; lo demás («↑↓»), sin atributo. */
function atajoAria(tecla: string | undefined): string | undefined {
  if (tecla === "Esc") return "Escape";
  return tecla && /^([A-Z0-9]|Enter|F\d{1,2})$/.test(tecla) ? tecla : undefined;
}

function Boton({ comando: c }: { comando: Comando }) {
  const { Icono } = c;
  return (
    <button
      type="button"
      className={`cinta-btn${c.grande ? " grande" : ""}${c.tono ? ` ${c.tono}` : ""}`}
      disabled={c.deshabilitado}
      onClick={c.alPulsar}
      aria-keyshortcuts={atajoAria(c.tecla)}
      // El foco vuelve a la pantalla: la cinta no se queda con el teclado
      onMouseDown={(e) => e.preventDefault()}
    >
      <Icono size={c.grande ? 22 : 18} weight="bold" aria-hidden="true" />
      <span className="cinta-etiqueta">
        {c.etiqueta}
        {c.tecla && <Kbd>{c.tecla}</Kbd>}
      </span>
    </button>
  );
}
