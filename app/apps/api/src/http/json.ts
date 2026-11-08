// JSON.stringify falla con bigint ("Do not know how to serialize a BigInt").
// Los montos y tasas viajan como texto de dígitos: "15025", nunca 15025,
// para que el front no los convierta en number y pierda precisión.
// Las fechas (Date) salen en ISO 8601 por su toJSON, como siempre.

export function aJson(valor: unknown): string {
  return JSON.stringify(valor, (_clave, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}
