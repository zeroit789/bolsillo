<script setup lang="ts">
/* =============================================================================
 * ResumenAnual.vue — Tarjeta de resumen anual / Yearly summary card
 * -----------------------------------------------------------------------------
 * ES: Recibe el historial de meses (prop `meses`, ordenado ASCENDENTE por fecha)
 *     y muestra un resumen del AÑO MÁS RECIENTE presente: ingresos, gastos, ahorro,
 *     media mensual de gastos y mejor/peor mes por disponible.
 * EN: Receives the month history (prop `meses`, ordered ASCENDING by date) and
 *     shows a summary of the MOST RECENT year present: income, expenses, savings,
 *     monthly average expenses and best/worst month by leftover (disponible).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y textos i18n / Imports & i18n texts
 *   2. Tipo del resumen de mes / Month summary type
 *   3. Props y año más reciente / Props & most recent year
 *   4. Agregados del año (KPIs) / Year aggregates (KPIs)
 *   5. Mejor y peor mes / Best & worst month
 *   6. Plantilla / Template
 * ===========================================================================*/

// ── 1. Imports y textos i18n / Imports & i18n texts ───────────────────────────
import { computed } from "vue";
import { euro, mesLegible } from "../utils/format";
import { crearT } from "../i18n";

// ES: Diccionario de textos visibles del componente (ES/EN).
// EN: Dictionary of the component's visible texts (ES/EN).
const t = crearT({
  resumenAnual: { es: "Resumen anual", en: "Yearly summary" },
  vacioMsg: {
    es: "Cuando cierres tu primer mes, aquí verás el resumen del año.",
    en: "Once you close your first month, you'll see the year's summary here.",
  },
  resumen: { es: "Resumen", en: "Summary" },
  ingresos: { es: "Ingresos", en: "Income" },
  gastos: { es: "Gastos", en: "Expenses" },
  ahorro: { es: "Ahorro", en: "Savings" },
  mediaGastosMes: { es: "Media gastos/mes", en: "Avg. expenses/month" },
  mejorMes: { es: "Mejor mes", en: "Best month" },
  peorMes: { es: "Peor mes", en: "Worst month" },
});

// ── 2. Tipo del resumen de mes / Month summary type ───────────────────────────
// ES: Tipo del resumen de cada mes (espejo del que devuelve la store).
// EN: Type of each month's summary (mirror of the one returned by the store).
interface ResumenMes {
  mes: string; // "YYYY-MM"
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  totalGastos: number;
  disponible: number;
}

// ── 3. Props y año más reciente / Props & most recent year ────────────────────
// ES: Prop: el historial completo de meses (viene ordenado ASCENDENTE: el último
//     elemento es el mes más reciente).
// EN: Prop: the full month history (comes ordered ASCENDING: the last element is
//     the most recent month).
const props = defineProps<{ meses: ResumenMes[] }>();

// ES: Año más reciente: el del ÚLTIMO elemento del historial (orden ascendente).
//     Si no hay meses, queda en cadena vacía y se muestra el estado vacío.
// EN: Most recent year: the one of the LAST element of the history (ascending
//     order). With no months it stays an empty string and the empty state shows.
const año = computed<string>(() => {
  const reciente = props.meses[props.meses.length - 1];
  return reciente ? reciente.mes.slice(0, 4) : "";
});

// ES: Meses que pertenecen al año más reciente.
// EN: Months belonging to the most recent year.
const mesesDelAño = computed<ResumenMes[]>(() =>
  props.meses.filter((m) => m.mes.slice(0, 4) === año.value)
);

// ES: Hay datos que mostrar (al menos un mes en el año más reciente).
// EN: There is data to show (at least one month in the most recent year).
const hayDatos = computed<boolean>(() => mesesDelAño.value.length > 0);

// ── 4. Agregados del año (KPIs) / Year aggregates (KPIs) ──────────────────────
// ES: Total de ingresos del año.
// EN: Year total income.
const totalIngresos = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.ingresos, 0)
);

// ES: Total de gastos del año (fijos + variables, ya sumados en totalGastos).
// EN: Year total expenses (fixed + variable, already summed in totalGastos).
const totalGastos = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.totalGastos, 0)
);

// ES: Ahorro del año = suma de los disponibles de cada mes.
// EN: Year savings = sum of each month's leftover (disponible).
const ahorro = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.disponible, 0)
);

// ES: Media mensual de gastos del año (0 si no hay meses, para evitar división por 0).
// EN: Year monthly average expenses (0 if no months, to avoid division by zero).
const mediaGastos = computed<number>(() =>
  mesesDelAño.value.length > 0 ? totalGastos.value / mesesDelAño.value.length : 0
);

// ── 5. Mejor y peor mes / Best & worst month ──────────────────────────────────
// ES: Mejor mes por disponible (mayor disponible) dentro del año.
// EN: Best month by leftover (highest disponible) within the year.
const mejorMes = computed<ResumenMes | null>(() => {
  if (!hayDatos.value) return null;
  return mesesDelAño.value.reduce((mejor, m) =>
    m.disponible > mejor.disponible ? m : mejor
  );
});

// ES: Peor mes por disponible (menor disponible) dentro del año.
// EN: Worst month by leftover (lowest disponible) within the year.
const peorMes = computed<ResumenMes | null>(() => {
  if (!hayDatos.value) return null;
  return mesesDelAño.value.reduce((peor, m) =>
    m.disponible < peor.disponible ? m : peor
  );
});
</script>

<!-- ── 6. Template / Plantilla ─────────────────────────────────────────────── -->
<template>
  <!-- ES: Tarjeta del resumen anual / EN: Yearly summary card -->
  <section class="rounded-2xl bg-surface border border-border p-5">
    <!-- ES: Estado vacío: no hay ningún mes en el historial / EN: Empty state: no month in the history -->
    <div v-if="!hayDatos" class="text-center">
      <p class="font-display font-bold text-ink">{{ t("resumenAnual") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioMsg") }}
      </p>
    </div>

    <!-- ES: Contenido con datos / EN: Content with data -->
    <div v-else>
      <!-- ES: Título con el año más reciente / EN: Title with the most recent year -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t("resumen") }} {{ año }}</h2>

      <!-- ES: KPIs principales: ingresos, gastos y ahorro del año / EN: Main KPIs: year income, expenses and savings -->
      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <!-- ES: Ingresos del año / EN: Year income -->
        <div>
          <p class="text-xs text-muted">{{ t("ingresos") }}</p>
          <p class="font-display font-bold text-ok">{{ euro(totalIngresos) }}</p>
        </div>
        <!-- ES: Gastos del año / EN: Year expenses -->
        <div>
          <p class="text-xs text-muted">{{ t("gastos") }}</p>
          <p class="font-display font-bold text-danger">{{ euro(totalGastos) }}</p>
        </div>
        <!-- ES: Ahorro del año (verde si >= 0, rojo si < 0) / EN: Year savings (green if >= 0, red if < 0) -->
        <div>
          <p class="text-xs text-muted">{{ t("ahorro") }}</p>
          <p
            class="font-display font-bold"
            :class="ahorro >= 0 ? 'text-ok' : 'text-danger'"
          >
            {{ euro(ahorro) }}
          </p>
        </div>
        <!-- ES: Media mensual de gastos / EN: Monthly average expenses -->
        <div>
          <p class="text-xs text-muted">{{ t("mediaGastosMes") }}</p>
          <p class="font-display font-bold text-ink">{{ euro(mediaGastos) }}</p>
        </div>
        <!-- ES: Mejor mes por disponible / EN: Best month by leftover -->
        <div>
          <p class="text-xs text-muted">{{ t("mejorMes") }}</p>
          <p class="font-display font-bold text-brand">
            {{ mejorMes ? mesLegible(mejorMes.mes) : "—" }}
          </p>
          <p v-if="mejorMes" class="text-xs text-faint">
            {{ euro(mejorMes.disponible) }}
          </p>
        </div>
        <!-- ES: Peor mes por disponible / EN: Worst month by leftover -->
        <div>
          <p class="text-xs text-muted">{{ t("peorMes") }}</p>
          <p class="font-display font-bold text-brand">
            {{ peorMes ? mesLegible(peorMes.mes) : "—" }}
          </p>
          <p v-if="peorMes" class="text-xs text-faint">
            {{ euro(peorMes.disponible) }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
