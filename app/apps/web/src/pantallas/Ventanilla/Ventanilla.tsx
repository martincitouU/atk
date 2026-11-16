import {
  ArrowDownLeftIcon,
  ArrowsClockwiseIcon,
  ArrowsDownUpIcon,
  ArrowUpRightIcon,
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  EraserIcon,
  NotePencilIcon,
} from "@phosphor-icons/react";
import { useRef } from "react";
import { usePizarra } from "../../api/consultas.ts";
import { usePuede } from "../../api/permisos.ts";
import { useCinta, type GrupoCinta } from "../../componentes/Cinta.tsx";
import "../../estilos/ventanilla.css";
import { hora } from "./comun.ts";
import { Libro, type LibroApi } from "./Libro.tsx";
import { Pizarra, type PizarraApi } from "./Pizarra.tsx";
import { Registro, type RegistroApi } from "./Registro.tsx";

/**
 * La Ventanilla: la pizarra-letrero arriba; abajo, el registro y el libro del
 * día. Bajo 1200 px el registro y el libro se apilan; bajo 900 px, todo va en
 * una columna. La cinta hace lo mismo que las teclas.
 */
export function Ventanilla() {
  const registro = useRef<RegistroApi>(null);
  const libro = useRef<LibroApi>(null);
  const pizarra = useRef<PizarraApi>(null);
  const puede = usePuede();
  const { data: filas } = usePizarra();
  const ultima = (filas ?? []).reduce<string | null>((max, f) => (f.vigenteDesde && (!max || f.vigenteDesde > max) ? f.vigenteDesde : max), null);
  const tecla = (t: string) => () => registro.current?.tecla(t);

  const grupos: GrupoCinta[] = [
    {
      nombre: "Operación",
      comandos: [
        { id: "compra", etiqueta: "Compra", Icono: ArrowDownLeftIcon, tecla: "C", grande: true, alPulsar: tecla("c") },
        { id: "venta", etiqueta: "Venta", Icono: ArrowUpRightIcon, tecla: "V", grande: true, alPulsar: tecla("v") },
        { id: "borrador", etiqueta: "Borrador", Icono: NotePencilIcon, tecla: "B", alPulsar: tecla("b") },
        { id: "limpiar", etiqueta: "Limpiar", Icono: EraserIcon, tecla: "Esc", alPulsar: tecla("Escape") },
      ],
    },
    {
      nombre: "Libro del día",
      comandos: [
        { id: "confirmar", etiqueta: "Confirmar", Icono: CheckCircleIcon, tecla: "Enter", grande: true, tono: "verde", alPulsar: tecla("Enter") },
        ...(puede("reversar")
          ? [
              {
                id: "reversar",
                etiqueta: "Reversar",
                Icono: ArrowUUpLeftIcon,
                tecla: "R",
                tono: "peligro" as const,
                alPulsar: () => libro.current?.reversar(),
              },
            ]
          : []),
        { id: "elegir", etiqueta: "Elegir fila", Icono: ArrowsDownUpIcon, tecla: "↑↓", alPulsar: () => libro.current?.enfocar() },
      ],
    },
    {
      nombre: "Pizarra",
      comandos: puede("publicarPizarra")
        ? [
            {
              id: "actualizar",
              etiqueta: "Actualizar pizarra",
              Icono: ArrowsClockwiseIcon,
              grande: true,
              alPulsar: () => pizarra.current?.actualizar(),
            },
          ]
        : [],
      nota: [ultima ? `Vigente desde ${hora(ultima)}` : "Sin cotizaciones"],
    },
  ];
  useCinta(grupos);

  return (
    <div className="ventanilla">
      <h1 className="oculto">Ventanilla</h1>
      <Pizarra ref={pizarra} />
      <div className="trabajo">
        <Registro ref={registro} />
        <Libro ref={libro} onRetomar={(op) => registro.current?.retomar(op)} />
      </div>
    </div>
  );
}
