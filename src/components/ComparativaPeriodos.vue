<script setup lang="ts">
/* =============================================================================
 * ComparativaPeriodos.vue — Tarjeta comparativa de periodos / Period comparison card
 * -----------------------------------------------------------------------------
 * ES: Compara el MES SELECCIONADO (store) con el mes ANTERIOR y muestra ingresos,
 *     gastos totales y disponible de ambos, junto con la variación (importe y %).
 *     Reglas de color:
 *       - Gasto:               sube = malo (rojo),  baja = bueno (verde).
 *       - Ingresos / disponible: sube = bueno (verde), baja = malo (rojo).
 * EN: Compares the SELECTED month (store) against the PREVIOUS month, showing
 *     income, total expenses and available for both, plus the variation (amount
 *     and %). Color rules:
 *       - Expense:           up = bad (red),   down = good (green).
 *       - Income / available: up = good (green), down = bad (red).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y textos i18n / Imports & i18n texts
 *   2. Store y meses comparados / Store & compared months
 *   3. Modelo de fila y constructores / Row model & builders
 *   4. Ayudantes de pintado (color, flecha, %) / Rendering helpers (color, arrow, %)
 * ===========================================================================*/

// ── 1. Imports y textos i18n / Imports & i18n texts ───────────────────────────
import { computed } from "vue";
// ES: Store de finanzas (Pinia): expone resumenDe(mes) y mesSeleccionado.
// EN: Finance store (Pinia): exposes resumenDe(mes) and mesSeleccionado.
import { useFinanzas } from "../stores/finanzas";
// ES: Utilidades de formato: euro(), mesLegible() y sumarMeses() para el mes previo.
// EN: Formatting utilities: euro(), mesLegible() and sumarMeses() for the previous month.
import { euro, mesLegible, sumarMeses } from "../utils/format";
// ES: Sistema de traducción propio (ES/EN): crea la función t() del componente.
// EN: Own translation system (ES/EN): builds the component's t() function.
import { crearT } from "../i18n";

// ES: Textos visibles del componente con sus traducciones ES/EN.
// EN: Component's visible texts with their ES/EN translations.
const t = crearT({
  titulo: { es: "Comparativa con el mes anterior", en: "Comparison with previous month" },
  frenteA: { es: "frente a", en: "vs" }, // ES: une los dos meses en el subtítulo / EN: joins both months in the subtitle
  ingresos: { es: "Ingresos", en: "Income" },
  gastosTotales: { es: "Gastos totales", en: "Total expenses" },
  disponible: { es: "Disponible", en: "Available" },
  antes: { es: "Antes:", en: "Before:" }, // ES: prefijo del valor del mes anterior / EN: prefix of the previous month's value
  noDisponible: { es: "n/d", en: "n/a" }, // ES: % sin base de comparación / EN: % with no comparison base
});

// ── 2. Store y meses comparados / Store & compared months ─────────────────────
// ES: Instancia reactiva de la store. / EN: Reactive instance of the store.
const finanzas = useFinanzas();

// ES: Mes actual seleccionado ("YYYY-MM") y el inmediatamente anterior.
// EN: Selected month ("YYYY-MM") and the immediately previous one.
const mesActualSel = computed<string>(() => finanzas.mesSeleccionado);
const mesAnterior = computed<string>(() => sumarMeses(mesActualSel.value, -1));

// ES: Resúmenes de KPIs de ambos meses (los calcula la store).
// EN: KPI summaries of both months (computed by the store).
const actual = computed(() => finanzas.resumenDe(mesActualSel.value));
const anterior = computed(() => finanzas.resumenDe(mesAnterior.value));

// ── 3. Modelo de fila y constructores / Row model & builders ──────────────────
// ES: Estructura de una fila de comparación ya calculada para la plantilla.
// EN: Shape of a comparison row already computed for the template.
interface FilaComparativa {
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
function porcentajeVariacion(actualV: number, anteriorV: number): number | null {
  if (anteriorV === 0) return null;
  return ((actualV - anteriorV) / Math.abs(anteriorV)) * 100;
}

// ES: Construye una fila de comparación a partir de los dos valores y la regla de color.
// EN: Builds a comparison row from the two values and the color rule.
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

// ES: Las tres filas que se muestran: ingresos, gastos totales y disponible.
// EN: The three rows shown: income, total expenses and available.
const filas = computed<FilaComparativa[]>(() => [
  // ES: Ingresos: subir es bueno (verde). / EN: Income: going up is good (green).
  construirFila("ingresos", actual.value.ingresos, anterior.value.ingresos, true),
  // ES: Gastos totales: subir es malo (rojo). / EN: Total expenses: going up is bad (red).
  construirFila("gastosTotales", actual.value.totalGastos, anterior.value.totalGastos, false),
  // ES: Disponible: subir es bueno (verde). / EN: Available: going up is good (green).
  construirFila("disponible", actual.value.disponible, anterior.value.disponible, true),
]);

// ── 4. Ayudantes de pintado (color, flecha, %) / Rendering helpers (color, arrow, %) ──
// ES: Devuelve la clase de color de la variación según la regla de cada métrica.
//     Sin cambio (variación 0) -> texto apagado.
// EN: Returns the color class of the variation per each metric's rule.
//     No change (variation 0) -> faint text.
function claseVariacion(fila: FilaComparativa): string {
  if (fila.variacion === 0) return "text-faint";
  // ES: ¿La variación es "buena"? Depende de si subir es bueno o malo.
  // EN: Is the variation "good"? Depends on whether going up is good or bad.
  const esBuena = fila.subirEsBueno ? fila.variacion > 0 : fila.variacion < 0;
  return esBuena ? "text-ok" : "text-danger";
}

// ES: Flecha según el signo de la variación (▲ sube, ▼ baja, — sin cambio).
// EN: Arrow based on the sign of the variation (▲ up, ▼ down, — no change).
function flecha(variacion: number): string {
  if (variacion > 0) return "▲";
  if (variacion < 0) return "▼";
  return "—";
}

// ES: Texto del porcentaje formateado con signo, o "n/d" si no hay base de cálculo.
// EN: Percentage text formatted with sign, or "n/a" if there is no calc base.
function textoPorcentaje(porcentaje: number | null): string {
  if (porcentaje === null) return t("noDisponible");
  // ES: los negativos ya llevan su signo. / EN: negatives already carry their sign.
  const signo = porcentaje > 0 ? "+" : "";
  return `${signo}${porcentaje.toFixed(1)} %`;
}
</script>

<template>
  <!-- ES: Tarjeta de comparativa con el mes anterior -->
  <!-- EN: Comparison card against the previous month -->
  <section class="rounded-2xl bg-surface border border-border p-5">
    <!-- ES: Título y subtítulo con los dos meses comparados -->
    <!-- EN: Title and subtitle with the two compared months -->
    <h2 class="font-display font-bold text-lg text-ink">{{ t("titulo") }}</h2>
    <p class="mt-1 text-sm text-muted">
      {{ mesLegible(mesActualSel) }} {{ t("frenteA") }} {{ mesLegible(mesAnterior) }}
    </p>

    <!-- ES: Una fila por métrica: ingresos, gastos totales y disponible -->
    <!-- EN: One row per metric: income, total expenses and available -->
    <div class="mt-4 space-y-4">
      <div
        v-for="fila in filas"
        :key="fila.clave"
        class="grid grid-cols-3 items-center gap-3"
      >
        <!-- ES: Columna 1: nombre de la métrica + valor del mes anterior -->
        <!-- EN: Column 1: metric name + previous month value -->
        <div>
          <p class="text-sm text-ink">{{ t(fila.clave) }}</p>
          <p class="text-xs text-faint">{{ t("antes") }} {{ euro(fila.valorAnterior) }}</p>
        </div>

        <!-- ES: Columna 2: valor del mes seleccionado (el destacado) -->
        <!-- EN: Column 2: selected month value (the highlighted one) -->
        <div class="text-right">
          <p class="font-display font-bold text-ink">{{ euro(fila.valorActual) }}</p>
        </div>

        <!-- ES: Columna 3: variación (flecha + importe + %) con color según regla.
                 El importe se muestra en ABSOLUTO: flecha y color ya comunican el
                 signo, así euro(Math.abs(...)) evita el doble negativo ("▼ -50 €"). -->
        <!-- EN: Column 3: variation (arrow + amount + %) colored by rule.
                 The amount is shown ABSOLUTE: arrow and color already convey the
                 sign, so euro(Math.abs(...)) avoids a double negative ("▼ -50 €"). -->
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
