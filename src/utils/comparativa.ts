/* =============================================================================
 * comparativa.ts — Comparativa entre dos meses / Two-month comparison
 * -----------------------------------------------------------------------------
 * ES: Lógica pura de la tarjeta ComparativaPeriodos: variación en importe y %,
 *     y el color y la flecha que le tocan según si subir es bueno o malo.
 *     Sale del componente para poder probarla con tests.
 * EN: Pure logic of the ComparativaPeriodos card: variation in amount and %,
 *     plus the colour and arrow it gets depending on whether going up is good
 *     or bad. Moved out of the component so it can be tested.
 * ===========================================================================*/

// ES: Estructura de una fila de comparación ya calculada para la plantilla.
// EN: Shape of a comparison row already computed for the template.
export interface FilaComparativa {
  // ES: clave i18n de la métrica (sirve de :key y de texto traducido).
  // EN: i18n key of the metric (used as :key and as translated text).
  clave: string;
  valorActual: number; // ES: importe del mes seleccionado / EN: amount of the selected month
  valorAnterior: number; // ES: importe del mes anterior / EN: amount of the previous month
  variacion: number; // ES: diferencia (actual - anterior) / EN: difference (current - previous)
  // ES: % de variación (null si no se puede calcular).
  // EN: variation % (null if it can't be calculated).
  porcentaje: number | null;
  // ES: true en ingresos/disponible, false en gasto.
  // EN: true for income/available, false for expense.
  subirEsBueno: boolean;
}

// ES: Calcula la variación en % protegiendo la división por cero.
//     Si el mes anterior es 0: devolvemos null (no hay base de comparación).
// EN: Computes the variation % guarding against division by zero.
//     If the previous month is 0: return null (no comparison base).
export function porcentajeVariacion(actualV: number, anteriorV: number): number | null {
  if (anteriorV === 0) return null;
  return ((actualV - anteriorV) / Math.abs(anteriorV)) * 100;
}

// ES: Construye una fila de comparación a partir de los dos valores y la regla de color.
// EN: Builds a comparison row from the two values and the color rule.
export function construirFila(
  clave: string,
  valorActual: number,
  valorAnterior: number,
  subirEsBueno: boolean
): FilaComparativa {
  return {
    clave,
    valorActual,
    valorAnterior,
    variacion: valorActual - valorAnterior,
    porcentaje: porcentajeVariacion(valorActual, valorAnterior),
    subirEsBueno,
  };
}

// ES: Devuelve la clase de color de la variación según la regla de cada métrica.
//     Sin cambio (variación 0) -> texto apagado.
// EN: Returns the color class of the variation per each metric's rule.
//     No change (variation 0) -> faint text.
export function claseVariacion(fila: FilaComparativa): string {
  if (fila.variacion === 0) return "text-faint";
  // ES: ¿La variación es "buena"? Depende de si subir es bueno o malo.
  // EN: Is the variation "good"? Depends on whether going up is good or bad.
  const esBuena = fila.subirEsBueno ? fila.variacion > 0 : fila.variacion < 0;
  return esBuena ? "text-ok" : "text-danger";
}

// ES: Flecha según el signo de la variación (▲ sube, ▼ baja, — sin cambio).
// EN: Arrow based on the sign of the variation (▲ up, ▼ down, — no change).
export function flecha(variacion: number): string {
  if (variacion > 0) return "▲";
  if (variacion < 0) return "▼";
  return "—";
}
