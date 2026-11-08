import { WarningIcon, WarningOctagonIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * Un aviso con su ícono: «advertencia» es el amarillo de faena (cambios,
 * ficha de la UAF), «error» el rojo PARE (lo que el servidor rechazó). El
 * mensaje de un ErrorNegocio va tal cual en `children`.
 */
export function Aviso({
  tono,
  rol,
  className,
  children,
}: {
  tono: "advertencia" | "error";
  /** "alert" para lo que interrumpe (un rechazo), "status" para lo que acompaña. */
  rol?: "alert" | "status";
  className?: string;
  children: ReactNode;
}) {
  const Icono = tono === "error" ? WarningOctagonIcon : WarningIcon;
  return (
    <div className={["aviso", tono === "error" ? "error" : "", className ?? ""].filter(Boolean).join(" ")} role={rol}>
      <Icono size={18} weight="bold" aria-hidden="true" />
      <div className="aviso-cuerpo">{children}</div>
    </div>
  );
}
