<script setup lang="ts">
/* =============================================================================
 * DashboardView.vue — Vista de resumen mensual / Monthly summary view
 * -----------------------------------------------------------------------------
 * ES: Pantalla de resumen del mes seleccionado: tarjetas KPI, objetivo de gasto
 *     diario, deudas activas, reparto de gasto por categoría, la gráfica de
 *     ingresos-vs-gastos y la previsión de caja. Además ofrece exportar el mes a
 *     Excel/PDF. Todas las cifras vienen del store de finanzas (esta vista solo
 *     las formatea y maqueta); los textos de UI son bilingües (ES/EN) vía crearT.
 * EN: Summary screen of the selected month: KPI cards, daily-spend target,
 *     active debts, spending breakdown by category, the income-vs-expense chart
 *     and the cash forecast. Also offers Excel/PDF export of the month. All the
 *     numbers come straight from the finanzas store (this view only formats and
 *     lays them out); UI strings are bilingual (ES/EN) via crearT.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y store / Imports & store
 *   2. Traducciones de UI / UI translations
 *   3. Objetivo de gasto diario / Daily spend target
 *   4. Gasto de hoy / Today's spending
 *   5. Porcentaje de ancho de barra / Bar width percentage
 *   6. Icono de deuda / Debt icon
 *   7. Exportación del mes / Month export
 * ===========================================================================*/

// ── 1. Importaciones y store / Imports & store ────────────────────────────────
import { computed } from "vue";
import { crearT } from "../i18n";
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible, mesActual } from "../utils/format";
import { colorCategoria } from "../data/categorias";
import { TIPOS_DEUDA, type TipoDeuda } from "../types";
import { exportarMesXLSX, exportarMesPDF } from "../utils/export";
import KpiCard from "../components/KpiCard.vue";
import GraficaEvolucion from "../components/GraficaEvolucion.vue";
import PrevisionCaja from "../components/PrevisionCaja.vue";
// ES: Gráfica de dona del gasto por categoría (SVG puro, sin librerías).
// EN: Donut chart of spending by category (pure SVG, no libraries).
import GraficaDona from "../components/GraficaDona.vue";

// ES: Store de finanzas: única fuente de verdad de toda cifra mostrada aquí.
// EN: Finanzas store: single source of truth for every figure shown here.
const f = useFinanzas();

// ── 2. Traducciones de UI / UI translations ───────────────────────────────────
// ES: Diccionario de traducciones de esta vista (ES/EN). Solo textos de UI, no datos.
// EN: Translation dictionary for this view (ES/EN). UI strings only, never data.
const t = crearT({
  resumen: { es: "Resumen", en: "Summary" },
  exportarExcel: { es: "Exportar Excel", en: "Export Excel" },
  exportarPdf: { es: "Exportar PDF", en: "Export PDF" },
  ingresos: { es: "Ingresos", en: "Income" },
  gastosTotales: { es: "Gastos totales", en: "Total expenses" },
  disponible: { es: "Disponible", en: "Available" },
  teQueda: { es: "Te queda este mes", en: "Left this month" },
  enNegativo: { es: "Vas en negativo", en: "You're in the red" },
  gastosFijos: { es: "Gastos fijos", en: "Fixed expenses" },
  variables: { es: "Variables", en: "Variable" },
  objetivoDiario: { es: "Objetivo diario", en: "Daily target" },
  porDia: { es: "/día", en: "/day" },
  teQuedan: { es: "Te quedan", en: "You have" },
  dia: { es: "día", en: "day" },
  dias: { es: "días", en: "days" },
  hoyLlevas: { es: "Hoy llevas", en: "Spent today" },
  teQuedaHoy: { es: "Te queda hoy", en: "Left for today" },
  teHasPasadoHoy: { es: "Te has pasado hoy", en: "Over budget today" },
  deudas: { es: "Deudas", en: "Debts" },
  pagada: { es: "✓ Pagada", en: "✓ Paid off" },
  pagado: { es: "Pagado", en: "Paid" },
  de: { es: "de", en: "of" },
  pendiente: { es: "Pendiente", en: "Pending" },
  cuota: { es: "Cuota", en: "Payment" },
  teQuedanMeses: { es: "Te quedan", en: "Remaining" },
  mes: { es: "mes", en: "month" },
  meses: { es: "meses", en: "months" },
  gastoPorCategoria: { es: "Gasto por categoría", en: "Spending by category" },
  sinGastos: { es: "Sin gastos este mes.", en: "No expenses this month." },
});

// ── 3. Objetivo de gasto diario / Daily spend target ──────────────────────────
// ES: Objetivo de gasto diario. Reparte lo disponible del mes entre los días que
//     quedan, para no pasarse. Solo aplica al mes en curso (no tiene sentido en
//     meses pasados/futuros).
// EN: Daily spend target. Splits the month's available amount across the days
//     left so you don't overspend. Only applies to the current month (it makes
//     no sense for past/future months).

// ES: ¿Estamos viendo el mes actual? La tarjeta solo se muestra en ese caso.
// EN: Are we viewing the current month? The card only shows in that case.
const esMesActual = computed<boolean>(() => f.mesSeleccionado === mesActual());

// ES: Cadena "YYYY-MM-DD" del día de hoy (para comparar con la fecha de los puntuales).
// EN: Today's "YYYY-MM-DD" string (to compare against the one-off entries' date).
const hoyISO = computed<string>(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0"); // ES: mes 0-indexado → +1 / EN: 0-indexed month → +1
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
});

// ES: Días que quedan del mes contando hoy (hoy incluido).
// EN: Days left in the month counting today (today included).
const diasRestantes = computed<number>(() => {
  const d = new Date();
  const hoy = d.getDate(); // ES: día del mes (1..31) / EN: day of month (1..31)
  // ES: Día 0 del mes siguiente = último día del mes actual.
  // EN: Day 0 of next month = last day of the current month.
  const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return diasMes - hoy + 1;
});

// ES: Objetivo de gasto por día: lo disponible repartido entre los días que quedan.
// EN: Per-day spend target: the available amount split across the days left.
const objetivoDiario = computed<number>(() =>
  // ES: Protege también diasRestantes > 0, para no dividir por cero (→ Infinity).
  // EN: Guard diasRestantes > 0 too, so we never divide by zero (→ Infinity).
  f.disponible > 0 && diasRestantes.value > 0 ? f.disponible / diasRestantes.value : 0
);

// ── 4. Gasto de hoy / Today's spending ────────────────────────────────────────
// ES: Lo que ya se ha gastado hoy (suma de puntuales de tipo gasto con fecha = hoy).
// EN: How much has already been spent today (sum of one-off "gasto" entries dated today).
const gastadoHoy = computed<number>(() =>
  f.puntuales
    .filter((p) => p.signo === "gasto" && p.fecha === hoyISO.value)
    .reduce((acc, p) => acc + p.importe, 0)
);

// ES: Lo que queda de presupuesto para hoy (positivo = margen; negativo = pasado).
// EN: Budget left for today (positive = margin; negative = overspent).
const restanteHoy = computed<number>(() => objetivoDiario.value - gastadoHoy.value);

// ── 5. Porcentaje de ancho de barra / Bar width percentage ────────────────────
// ES: % de una categoría respecto a la de mayor gasto (el ancho de la barra). El
//     máximo se lee del primer elemento (el store ordena por total descendente).
//     Usar `|| 1` en vez de `?? 1` cubre también un máximo de 0: ?? solo sustituye
//     null/undefined, así que un 0 real pasaría y dividiría por cero -> NaN%. Con
//     `|| 1` cualquier máximo falsy (undefined, null O 0) cae a 1 y la barra nunca
//     se rompe.
// EN: % of a category relative to the highest-spend one (the bar width). The max
//     is read from the first item (the store sorts by total desc). Using `|| 1`
//     instead of `?? 1` also catches a max of 0: ?? only replaces null/undefined,
//     so a real 0 would slip through and divide by zero -> NaN%. With `|| 1` any
//     falsy max (undefined, null OR 0) falls back to 1, so the bar never breaks.
function pct(total: number): number {
  const max = f.gastoPorCategoria[0]?.total || 1;
  return Math.round((total / max) * 100);
}

// ── 6. Icono de deuda / Debt icon ─────────────────────────────────────────────
// ES: Icono del tipo de deuda (para las tarjetas de deuda del resumen). Cae a 📄.
// EN: Icon for a debt type (used by the resumen's debt cards). Falls back to 📄.
function iconoDeuda(tipo: TipoDeuda): string {
  return TIPOS_DEUDA.find((t) => t.valor === tipo)?.icono ?? "📄";
}

// ── 7. Exportación del mes / Month export ─────────────────────────────────────
// ES: Exporta el mes seleccionado a Excel o PDF (diálogo nativo). No rompe: si
//     falla, se registra el error en vez de propagarlo, y la UI sigue funcionando.
// EN: Exports the selected month to Excel or PDF (native dialog). Never throws:
//     a failure is logged, not propagated, so the UI keeps working.
async function exportar(tipo: "xlsx" | "pdf") {
  const label = mesLegible(f.mesSeleccionado);
  try {
    if (tipo === "xlsx") await exportarMesXLSX(label, f.lineasDelMes, f.resumen, f.estadosDeuda, f.planes);
    else await exportarMesPDF(label, f.lineasDelMes, f.resumen, f.estadosDeuda, f.planes);
  } catch (e) {
    console.error("Error exportando:", e);
  }
}
</script>

<template>
  <div>
    <!-- ES: Cabecera: título de la vista + botones de exportar a Excel/PDF. -->
    <!-- EN: Header: view title + Excel/PDF export buttons. -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-display text-2xl font-bold">{{ t("resumen") }}</h2>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-ink transition-colors"
          @click="exportar('xlsx')"
        >
          {{ t("exportarExcel") }}
        </button>
        <button
          class="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-ink transition-colors"
          @click="exportar('pdf')"
        >
          {{ t("exportarPdf") }}
        </button>
      </div>
    </div>

    <!-- ES: Tarjetas KPI: ingresos, gastos totales, disponible y gastos fijos. -->
    <!-- EN: KPI cards: income, total expenses, available and fixed expenses. -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <KpiCard :etiqueta="t('ingresos')" :valor="euro(f.ingresos)" color="text-ok" />
      <KpiCard :etiqueta="t('gastosTotales')" :valor="euro(f.totalGastos)" color="text-danger" />
      <KpiCard
        :etiqueta="t('disponible')"
        :valor="euro(f.disponible)"
        :color="f.disponible >= 0 ? 'text-brand' : 'text-danger'"
        :nota="f.disponible >= 0 ? t('teQueda') : t('enNegativo')"
      />
      <KpiCard
        :etiqueta="t('gastosFijos')"
        :valor="euro(f.gastosFijos)"
        color="text-cyan"
        :nota="`${t('variables')}: ${euro(f.gastosVariables)}`"
      />
    </section>

    <!-- ES: Objetivo de gasto diario: solo en el mes en curso. -->
    <!-- EN: Daily spend target: only for the current month. -->
    <section v-if="esMesActual" class="rounded-2xl bg-surface border border-border p-5 mb-8">
      <h3 class="font-display font-bold mb-3">{{ t("objetivoDiario") }}</h3>
      <!-- ES: Cifra grande con el objetivo de gasto por día. -->
      <!-- EN: Big figure with the per-day spend target. -->
      <p class="text-brand">
        <span class="font-display text-3xl font-bold tabular-nums">{{ euro(objetivoDiario) }}</span>
        <span class="text-sm text-muted ml-1">{{ t("porDia") }}</span>
      </p>
      <!-- ES: Días que quedan y gasto acumulado de hoy. -->
      <!-- EN: Days left and today's accumulated spending. -->
      <p class="text-sm text-muted mt-2">
        {{ t("teQuedan") }} {{ diasRestantes }} {{ diasRestantes === 1 ? t("dia") : t("dias") }}
        · {{ t("hoyLlevas") }} {{ euro(gastadoHoy) }}
      </p>
      <!-- ES: Restante de hoy: verde si hay margen, rojo si se ha pasado. -->
      <!-- EN: Today's remainder: green if there's margin, red if overspent. -->
      <p v-if="restanteHoy >= 0" class="text-sm text-ok mt-1">
        {{ t("teQuedaHoy") }} {{ euro(restanteHoy) }}
      </p>
      <p v-else class="text-sm text-danger mt-1">
        {{ t("teHasPasadoHoy") }} {{ euro(restanteHoy) }}
      </p>
    </section>

    <!-- ES: Deudas activas: tarjetas bajo los KPIs con progreso, pagado y cuota. -->
    <!-- EN: Active debts: cards below the KPIs with progress, paid and payment. -->
    <section v-if="f.estadosDeuda.length" class="mb-8">
      <h3 class="font-display font-bold mb-3">{{ t("deudas") }}</h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="e in f.estadosDeuda"
          :key="e.deuda.id"
          class="rounded-2xl bg-surface border border-border p-4"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0">{{ iconoDeuda(e.deuda.tipo) }}</span>
            <p class="font-medium truncate">{{ e.deuda.concepto }}</p>
            <span v-if="e.terminada" class="ml-auto text-xs text-ok shrink-0">{{ t("pagada") }}</span>
          </div>
          <div class="h-2 rounded-full bg-surface-2 overflow-hidden mt-3">
            <div class="h-full rounded-full bg-brand transition-all" :style="{ width: e.progreso + '%' }" />
          </div>
          <p class="text-xs text-muted mt-2">
            {{ t("pagado") }} {{ euro(e.pagado) }} {{ t("de") }} {{ euro(e.deuda.total) }} ({{ e.progreso }}%)
          </p>
          <div class="flex justify-between text-xs mt-1">
            <span class="text-danger">{{ t("pendiente") }} {{ euro(e.pendiente) }}</span>
            <span class="text-muted">{{ t("cuota") }} {{ euro(e.deuda.cuotaMensual) }}</span>
          </div>
          <p v-if="!e.terminada" class="text-xs text-faint mt-1">
            {{ t("teQuedanMeses") }} {{ e.mesesRestantes }} {{ e.mesesRestantes === 1 ? t("mes") : t("meses") }}
          </p>
        </div>
      </div>
    </section>

    <!-- ES: Reparto de gasto por categoría: una barra por categoría cuyo ancho es
             su proporción respecto a la de mayor gasto (ver pct()). -->
    <!-- EN: Spending breakdown by category: a bar per category whose width is its
             share of the highest-spend one (see pct()). -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h3 class="font-display font-bold mb-4">{{ t("gastoPorCategoria") }}</h3>
      <!-- ES: Estado vacío cuando no hay gastos este mes. -->
      <!-- EN: Empty state when there are no expenses this month. -->
      <div v-if="!f.gastoPorCategoria.length" class="text-muted text-sm">{{ t("sinGastos") }}</div>
      <template v-else>
        <!-- ES: Gráfica de dona arriba: reparto visual con leyenda (color/nombre/importe/%). -->
        <!-- EN: Donut chart on top: visual split with legend (color/name/amount/%). -->
        <GraficaDona :datos="f.gastoPorCategoria" class="mb-6 block" />
        <!-- ES: Barras proporcionales debajo de la dona, como desglose detallado. -->
        <!-- EN: Proportional bars below the donut, kept as a detailed breakdown. -->
        <ul class="space-y-3">
        <li v-for="c in f.gastoPorCategoria" :key="c.categoria">
          <!-- ES: Cabecera de fila: nombre de la categoría + su total. -->
          <!-- EN: Row header: category name + its total amount. -->
          <div class="flex justify-between text-sm mb-1">
            <span class="text-muted">{{ c.categoria }}</span>
            <span class="tabular-nums">{{ euro(c.total) }}</span>
          </div>
          <!-- ES: Barra proporcional; ancho desde pct(), color desde la categoría. -->
          <!-- EN: Proportional bar; width from pct(), color from the category. -->
          <div class="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              class="h-full rounded-full"
              :style="{ width: pct(c.total) + '%', backgroundColor: colorCategoria(c.categoria) }"
            />
          </div>
        </li>
        </ul>
      </template>
    </section>

    <!-- ES: Evolución mensual (ingresos vs gastos). -->
    <!-- EN: Monthly evolution chart (income vs expenses). -->
    <GraficaEvolucion :meses="f.historial" class="mt-8 block" />

    <!-- ES: Previsión de caja: saldo acumulado proyectado de los próximos meses. -->
    <!-- EN: Cash forecast: projected accumulated balance for the coming months. -->
    <PrevisionCaja class="mt-8 block" />
  </div>
</template>
