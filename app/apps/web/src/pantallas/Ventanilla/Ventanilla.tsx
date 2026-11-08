import { useRef } from "react";
import "../../estilos/ventanilla.css";
import { Libro } from "./Libro.tsx";
import { Pizarra } from "./Pizarra.tsx";
import { Registro, type RegistroApi } from "./Registro.tsx";

/**
 * La Ventanilla: la pizarra-letrero arriba; abajo, el registro (420 px) y el
 * libro del día. Bajo 1200 px el registro y el libro se apilan; bajo 900 px,
 * todo va en una columna.
 */
export function Ventanilla() {
  const registro = useRef<RegistroApi>(null);
  return (
    <div className="ventanilla">
      <h1 className="oculto">Ventanilla</h1>
      <Pizarra />
      <div className="trabajo">
        <Registro ref={registro} />
        <Libro onRetomar={(op) => registro.current?.retomar(op)} />
      </div>
    </div>
  );
}
