// Un monto de la API, formateado con los decimales y el símbolo de su
// moneda (del catálogo). Siempre con cifras del mismo ancho.
//
//   <Monto valor="15025" moneda="USD" />   → US$ 150,25
//   <Monto valor="95410" moneda="CLP" />   → $ 95.410

import { useMonedas } from "../api/consultas.ts";
import { formatearConSimbolo, formatearMonto, formatearTasa } from "../lib/montos.ts";

export function Monto({ valor, moneda, sinSimbolo }: { valor: string; moneda: string; sinSimbolo?: boolean }) {
  const monedas = useMonedas();
  const info = monedas?.get(moneda);
  if (!info) return <span className="monto">…</span>;
  return <span className="monto">{sinSimbolo ? formatearMonto(valor, info.decimales) : formatearConSimbolo(valor, info.decimales, info.simbolo)}</span>;
}

/** Una tasa ×10^6 en pesos por unidad de divisa: "$ 954,10". */
export function Tasa({ valorE6, decimales }: { valorE6: string | null; decimales: number }) {
  if (valorE6 === null) return <span>—</span>;
  return <span className="monto">$ {formatearTasa(valorE6, decimales)}</span>;
}
