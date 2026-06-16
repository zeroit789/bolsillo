/* ===========================================================================
   Tipos del dominio de Bolsillo.
   Un "Movimiento" es cualquier apunte: un ingreso o un gasto.
   El signo lo decide el `tipo`, por eso el importe se guarda siempre positivo.
   =========================================================================== */

// Tipo de apunte. Separamos gasto fijo (recurrente: alquiler, suscripciones)
// de gasto variable (puntual: súper, gasolina) para poder analizarlos aparte.
export type TipoMovimiento = "ingreso" | "gasto-fijo" | "gasto-variable";

// Categorías disponibles (lista cerrada para mantener consistencia en filtros
// y gráficas). Genéricas, sin nada personal.
export const CATEGORIAS = [
  "Nómina",
  "Alquiler",
  "Comida",
  "Transporte",
  "Internet",
  "Telefonía",
  "Suscripciones",
  "Ocio",
  "Compras",
  "Salud",
  "Ahorro",
  "Otros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

// Un apunte concreto del libro de cuentas.
export interface Movimiento {
  id: string; // identificador único
  concepto: string; // descripción libre ("Supermercado")
  importe: number; // SIEMPRE positivo (el tipo decide si suma o resta)
  tipo: TipoMovimiento;
  categoria: Categoria;
  fecha: string; // ISO corto: "YYYY-MM-DD"
}

// Etiquetas legibles para cada tipo (para pintar en la UI).
export const ETIQUETAS_TIPO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  "gasto-fijo": "Gasto fijo",
  "gasto-variable": "Gasto variable",
};

// Devuelve el mes ("YYYY-MM") al que pertenece una fecha ISO.
export function mesDe(fechaISO: string): string {
  return fechaISO.slice(0, 7);
}
