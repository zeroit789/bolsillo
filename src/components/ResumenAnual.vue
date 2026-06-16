<script setup lang="ts">
/* ===========================================================================
   Resumen anual.
   Recibe el historial de meses (prop `meses`, ordenado descendente por fecha)
   y muestra un resumen del AÑO MÁS RECIENTE presente: ingresos, gastos,
   ahorro, media mensual de gastos y mejor/peor mes por disponible.
   =========================================================================== */
import { computed } from "vue";
import { euro, mesLegible } from "../utils/format";
import { crearT } from "../i18n";

// Diccionario de textos visibles del componente (ES/EN).
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

// Tipo del resumen de cada mes (espejo del que devuelve la store).
interface ResumenMes {
  mes: string; // "YYYY-MM"
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  totalGastos: number;
  disponible: number;
}

// Prop: el historial completo de meses (viene ordenado desc por fecha).
const props = defineProps<{ meses: ResumenMes[] }>();

// Año más reciente: el del primer elemento del historial (orden desc).
// Si no hay meses, queda en cadena vacía y se muestra el estado vacío.
const año = computed<string>(() => {
  const primero = props.meses[0];
  return primero ? primero.mes.slice(0, 4) : "";
});

// Meses que pertenecen al año más reciente.
const mesesDelAño = computed<ResumenMes[]>(() =>
  props.meses.filter((m) => m.mes.slice(0, 4) === año.value)
);

// Hay datos que mostrar (al menos un mes en el año más reciente).
const hayDatos = computed<boolean>(() => mesesDelAño.value.length > 0);

// Total de ingresos del año.
const totalIngresos = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.ingresos, 0)
);

// Total de gastos del año (fijos + variables, ya sumados en totalGastos).
const totalGastos = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.totalGastos, 0)
);

// Ahorro del año = suma de los disponibles de cada mes.
const ahorro = computed<number>(() =>
  mesesDelAño.value.reduce((acc, m) => acc + m.disponible, 0)
);

// Media mensual de gastos del año (0 si no hay meses, para evitar división por 0).
const mediaGastos = computed<number>(() =>
  mesesDelAño.value.length > 0 ? totalGastos.value / mesesDelAño.value.length : 0
);

// Mejor mes por disponible (mayor disponible) dentro del año.
const mejorMes = computed<ResumenMes | null>(() => {
  if (!hayDatos.value) return null;
  return mesesDelAño.value.reduce((mejor, m) =>
    m.disponible > mejor.disponible ? m : mejor
  );
});

// Peor mes por disponible (menor disponible) dentro del año.
const peorMes = computed<ResumenMes | null>(() => {
  if (!hayDatos.value) return null;
  return mesesDelAño.value.reduce((peor, m) =>
    m.disponible < peor.disponible ? m : peor
  );
});
</script>

<template>
  <!-- Tarjeta del resumen anual -->
  <section class="rounded-2xl bg-surface border border-border p-5">
    <!-- Estado vacío: no hay ningún mes en el historial -->
    <div v-if="!hayDatos" class="text-center">
      <p class="font-display font-bold text-ink">{{ t("resumenAnual") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioMsg") }}
      </p>
    </div>

    <!-- Contenido con datos -->
    <div v-else>
      <!-- Título con el año más reciente -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t("resumen") }} {{ año }}</h2>

      <!-- KPIs principales: ingresos, gastos y ahorro del año -->
      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <!-- Ingresos del año -->
        <div>
          <p class="text-xs text-muted">{{ t("ingresos") }}</p>
          <p class="font-display font-bold text-ok">{{ euro(totalIngresos) }}</p>
        </div>
        <!-- Gastos del año -->
        <div>
          <p class="text-xs text-muted">{{ t("gastos") }}</p>
          <p class="font-display font-bold text-danger">{{ euro(totalGastos) }}</p>
        </div>
        <!-- Ahorro del año (verde si >= 0, rojo si < 0) -->
        <div>
          <p class="text-xs text-muted">{{ t("ahorro") }}</p>
          <p
            class="font-display font-bold"
            :class="ahorro >= 0 ? 'text-ok' : 'text-danger'"
          >
            {{ euro(ahorro) }}
          </p>
        </div>
        <!-- Media mensual de gastos -->
        <div>
          <p class="text-xs text-muted">{{ t("mediaGastosMes") }}</p>
          <p class="font-display font-bold text-ink">{{ euro(mediaGastos) }}</p>
        </div>
        <!-- Mejor mes por disponible -->
        <div>
          <p class="text-xs text-muted">{{ t("mejorMes") }}</p>
          <p class="font-display font-bold text-brand">
            {{ mejorMes ? mesLegible(mejorMes.mes) : "—" }}
          </p>
          <p v-if="mejorMes" class="text-xs text-faint">
            {{ euro(mejorMes.disponible) }}
          </p>
        </div>
        <!-- Peor mes por disponible -->
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
