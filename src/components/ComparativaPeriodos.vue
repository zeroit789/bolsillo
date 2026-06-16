<script setup lang="ts">
/* =============================================================================
 * ComparativaPeriodos.vue — Period comparison card / Tarjeta comparativa de periodos
 * -----------------------------------------------------------------------------
 * EN: Compares the SELECTED month (store) against the PREVIOUS month, showing
 *     income, total expenses and available for both, plus the variation (amount
 *     and %). Color rules:
 *       - Expense:           up = bad (red),   down = good (green).
 *       - Income / available: up = good (green), down = bad (red).
 * ES: Compara el MES SELECCIONADO (store) con el mes ANTERIOR y muestra ingresos,
 *     gastos totales y disponible de ambos, junto con la variación (importe y %).
 *     Reglas de color:
 *       - Gasto:               sube = malo (rojo),  baja = bueno (verde).
 *       - Ingresos / disponible: sube = bueno (verde), baja = malo (rojo).
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & i18n texts / Imports y textos i18n
 *   2. Store & compared months / Store y meses comparados
 *   3. Row model & builders / Modelo de fila y constructores
 *   4. Rendering helpers (color, arrow, %) / Ayudantes de pintado (color, flecha, %)
 * ===========================================================================*/

// ── 1. Imports & i18n texts / Imports y textos i18n ───────────────────────────
import { computed } from "vue";
// EN: Finance store (Pinia): exposes resumenDe(mes) and mesSeleccionado.
// ES: Store de finanzas (Pinia): expone resumenDe(mes) y mesSeleccionado.
import { useFinanzas } from "../stores/finanzas";
// EN: Formatting utilities: euro(), mesLegible() and sumarMeses() for the previous month.
// ES: Utilidades de formato: euro(), mesLegible() y sumarMeses() para el mes previo.
import { euro, mesLegible, sumarMeses } from "../utils/format";
// EN: Own translation system (ES/EN): builds the component's t() function.
// ES: Sistema de traducción propio (ES/EN): crea la función t() del componente.
import { crearT } from "../i18n";

// EN: Component's visible texts with their ES/EN translations.
// ES: Textos visibles del componente con sus traducciones ES/EN.
const t = crearT({
  titulo: { es: "Comparativa con el mes anterior", en: "Comparison with previous month" },
  frenteA: { es: "frente a", en: "vs" }, // une los dos meses en el subtítulo
  ingresos: { es: "Ingresos", en: "Income" },
  gastosTotales: { es: "Gastos totales", en: "Total expenses" },
  disponible: { es: "Disponible", en: "Available" },
  antes: { es: "Antes:", en: "Before:" }, // prefijo del valor del mes anterior
  noDisponible: { es: "n/d", en: "n/a" }, // % sin base de comparación
});

// ── 2. Store & compared months / Store y meses comparados ─────────────────────
// EN: Reactive instance of the store. / ES: Instancia reactiva de la store.
const finanzas = useFinanzas();

// EN: Selected month ("YYYY-MM") and the immediately previous one.
// ES: Mes actual seleccionado ("YYYY-MM") y el inmediatamente anterior.
const mesActualSel = computed<string>(() => finanzas.mesSeleccionado);
const mesAnterior = computed<string>(() => sumarMeses(mesActualSel.value, -1));

// EN: KPI summaries of both months (computed by the store).
// ES: Resúmenes de KPIs de ambos meses (los calcula la store).
const actual = computed(() => finanzas.resumenDe(mesActualSel.value));
const anterior = computed(() => finanzas.resumenDe(mesAnterior.value));

// ── 3. Row model & builders / Modelo de fila y constructores ──────────────────
// EN: Shape of a comparison row already computed for the template.
// ES: Estructura de una fila de comparación ya calculada para la plantilla.
interface FilaComparativa {
  // EN: i18n key of the metric (used as :key and as translated text).
  // ES: clave i18n de la métrica (sirve de :key y de texto traducido).
  clave: string;
  valorActual: number; // EN: amount of the selected month / ES: importe del mes seleccionado
  valorAnterior: number; // EN: amount of the previous month / ES: importe del mes anterior
  variacion: number; // EN: difference (current - previous) / ES: diferencia (actual - anterior)
  // EN: variation % (null if it can't be calculated).
  // ES: % de variación (null si no se puede calcular).
  porcentaje: number | null;
  // EN: true for income/available, false for expense.
  // ES: true en ingresos/disponible, false en gasto.
  subirEsBueno: boolean;
}

// EN: Computes the variation % guarding against division by zero.
//     If the previous month is 0: return null (no comparison base).
// ES: Calcula la variación en % protegiendo la división por cero.
//     Si el mes anterior es 0: devolvemos null (no hay base de comparación).
function porcentajeVariacion(actualV: number, anteriorV: number): number | null {
  if (anteriorV === 0) return null;
  return ((actualV - anteriorV) / Math.abs(anteriorV)) * 100;
}

// EN: Builds a comparison row from the two values and the color rule.
// ES: Construye una fila de comparación a partir de los dos valores y la regla de color.
function construirFila(
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

// EN: The three rows shown: income, total expenses and available.
// ES: Las tres filas que se muestran: ingresos, gastos totales y disponible.
const filas = computed<FilaComparativa[]>(() => [
  // EN: Income: going up is good (green). / ES: Ingresos: subir es bueno (verde).
  construirFila("ingresos", actual.value.ingresos, anterior.value.ingresos, true),
  // EN: Total expenses: going up is bad (red). / ES: Gastos totales: subir es malo (rojo).
  construirFila("gastosTotales", actual.value.totalGastos, anterior.value.totalGastos, false),
  // EN: Available: going up is good (green). / ES: Disponible: subir es bueno (verde).
  construirFila("disponible", actual.value.disponible, anterior.value.disponible, true),
]);

// ── 4. Rendering helpers (color, arrow, %) / Ayudantes de pintado (color, flecha, %) ──
// EN: Returns the color class of the variation per each metric's rule.
//     No change (variation 0) -> faint text.
// ES: Devuelve la clase de color de la variación según la regla de cada métrica.
//     Sin cambio (variación 0) -> texto apagado.
function claseVariacion(fila: FilaComparativa): string {
  if (fila.variacion === 0) return "text-faint";
  // EN: Is the variation "good"? Depends on whether going up is good or bad.
  // ES: ¿La variación es "buena"? Depende de si subir es bueno o malo.
  const esBuena = fila.subirEsBueno ? fila.variacion > 0 : fila.variacion < 0;
  return esBuena ? "text-ok" : "text-danger";
}

// EN: Arrow based on the sign of the variation (▲ up, ▼ down, — no change).
// ES: Flecha según el signo de la variación (▲ sube, ▼ baja, — sin cambio).
function flecha(variacion: number): string {
  if (variacion > 0) return "▲";
  if (variacion < 0) return "▼";
  return "—";
}

// EN: Percentage text formatted with sign, or "n/a" if there is no calc base.
// ES: Texto del porcentaje formateado con signo, o "n/d" si no hay base de cálculo.
function textoPorcentaje(porcentaje: number | null): string {
  if (porcentaje === null) return t("noDisponible");
  // EN: negatives already carry their sign. / ES: los negativos ya llevan su signo.
  const signo = porcentaje > 0 ? "+" : "";
  return `${signo}${porcentaje.toFixed(1)} %`;
}
</script>

<template>
  <!-- EN: Comparison card against the previous month -->
  <!-- ES: Tarjeta de comparativa con el mes anterior -->
  <section class="rounded-2xl bg-surface border border-border p-5">
    <!-- EN: Title and subtitle with the two compared months -->
    <!-- ES: Título y subtítulo con los dos meses comparados -->
    <h2 class="font-display font-bold text-lg text-ink">{{ t("titulo") }}</h2>
    <p class="mt-1 text-sm text-muted">
      {{ mesLegible(mesActualSel) }} {{ t("frenteA") }} {{ mesLegible(mesAnterior) }}
    </p>

    <!-- EN: One row per metric: income, total expenses and available -->
    <!-- ES: Una fila por métrica: ingresos, gastos totales y disponible -->
    <div class="mt-4 space-y-4">
      <div
        v-for="fila in filas"
        :key="fila.clave"
        class="grid grid-cols-3 items-center gap-3"
      >
        <!-- EN: Column 1: metric name + previous month value -->
        <!-- ES: Columna 1: nombre de la métrica + valor del mes anterior -->
        <div>
          <p class="text-sm text-ink">{{ t(fila.clave) }}</p>
          <p class="text-xs text-faint">{{ t("antes") }} {{ euro(fila.valorAnterior) }}</p>
        </div>

        <!-- EN: Column 2: selected month value (the highlighted one) -->
        <!-- ES: Columna 2: valor del mes seleccionado (el destacado) -->
        <div class="text-right">
          <p class="font-display font-bold text-ink">{{ euro(fila.valorActual) }}</p>
        </div>

        <!-- EN: Column 3: variation (arrow + amount + %) colored by rule.
                 The amount is shown ABSOLUTE: arrow and color already convey the
                 sign, so euro(Math.abs(...)) avoids a double negative ("▼ -50 €"). -->
        <!-- ES: Columna 3: variación (flecha + importe + %) con color según regla.
                 El importe se muestra en ABSOLUTO: flecha y color ya comunican el
                 signo, así euro(Math.abs(...)) evita el doble negativo ("▼ -50 €"). -->
        <div class="text-right" :class="claseVariacion(fila)">
          <p class="font-medium">
            {{ flecha(fila.variacion) }} {{ euro(Math.abs(fila.variacion)) }}
          </p>
          <p class="text-xs">{{ textoPorcentaje(fila.porcentaje) }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
