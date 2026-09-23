<script setup lang="ts">
/* =============================================================================
 * HistorialView.vue — Historial mensual y exportación / Monthly history & exports
 * -----------------------------------------------------------------------------
 * ES: Vista "Historial": tabla con el resumen de cada mes registrado (ingresos,
 *     gastos fijos y variables, total de gastos y disponible), totales
 *     acumulados en el pie, ranking de gasto por comercio, y botones para
 *     exportar todo el historial a Excel y PDF. Si una exportación falla,
 *     aparece un mensaje rojo discreto bajo los botones en vez de fallar en
 *     silencio.
 * EN: "History" view: a table summarizing every recorded month (income, fixed
 *     and variable expenses, total expenses and available balance), accumulated
 *     totals in the footer, a per-merchant spending ranking, and buttons to
 *     export the whole history to Excel and PDF. If an export fails, a discreet
 *     red message appears under the buttons instead of failing silently.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones / Imports
 *   2. Traducciones (i18n) / Translations (i18n)
 *   3. Tipo del resumen de mes / Month summary type
 *   4. Store y totales acumulados / Store & accumulated totals
 *   5. Ranking de gasto por comercio / Merchant spending ranking
 *   6. Aviso de error de exportación / Export error feedback
 *   7. Acciones (seleccionar mes, exportar) / Actions (select month, export)
 * ===========================================================================*/

// ── 1. Importaciones / Imports ────────────────────────────────────────────────
// ES: computed de Vue para valores reactivos derivados.
// EN: Vue's computed for derived reactive values.
import { computed, ref } from 'vue'
// ES: Store de finanzas (Pinia): expone el historial y seleccionarMes().
// EN: Finances store (Pinia): exposes the history and seleccionarMes().
import { useFinanzas } from '../stores/finanzas'
// ES: Utilidades de formato: euro() para importes, mesLegible() para "Junio 2026".
// EN: Formatting utils: euro() for amounts, mesLegible() for "June 2026".
import { euro, mesLegible } from '../utils/format'
// ES: Funciones de exportación (export.ts lo crea otro proceso en paralelo).
// EN: Export functions (export.ts is created by another process in parallel).
import { exportarHistorialXLSX, exportarHistorialPDF, exportarHistorialCSV } from '../utils/export'
// ES: Componente de resumen anual (KPIs del año más reciente del historial).
// EN: Yearly summary component (KPIs of the most recent year in the history).
import ResumenAnual from '../components/ResumenAnual.vue'
// ES: Componente de comparativa: mes seleccionado vs el mes anterior.
// EN: Comparison component: selected month vs the previous one.
import ComparativaPeriodos from '../components/ComparativaPeriodos.vue'
// ES: Sistema de traducción propio del proyecto (ES/EN reactivo según idioma activo).
// EN: Project's own translation system (reactive ES/EN by active language).
import { crearT } from '../i18n'

// ── 2. Traducciones (i18n) / Translations (i18n) ──────────────────────────────
// ES: Función de traducción del componente (ES/EN) con todos los textos visibles.
//     Claves cortas en camelCase; cada una con su versión española e inglesa.
// EN: Component translation function (ES/EN) with every visible text in the view.
//     Short keys in camelCase; each one with its Spanish and English version.
const t = crearT({
  // ES: Tarjeta "Dónde gastas"
  // EN: "Where you spend" card
  dondeGastas: { es: 'Dónde gastas (este mes)', en: 'Where you spend (this month)' },
  rankingVacio: {
    es: 'Añade el comercio a tus gastos para ver el ranking.',
    en: 'Add the merchant to your expenses to see the ranking.',
  },
  // ES: Cabecera y botones de exportación
  // EN: Header and export buttons
  historial: { es: 'Historial', en: 'History' },
  exportarExcel: { es: 'Exportar Excel', en: 'Export Excel' },
  exportarPDF: { es: 'Exportar PDF', en: 'Export PDF' },
  // ES: Etiqueta del botón de exportar CSV. / EN: Label of the CSV export button.
  exportarCSV: { es: 'CSV', en: 'CSV' },
  // ES: Mensaje visible que se muestra cuando una exportación (Excel/PDF) falla.
  // EN: Visible message shown when an export (Excel/PDF) fails.
  errorExportar: {
    es: 'No se pudo exportar el archivo.',
    en: 'Could not export the file.',
  },
  // ES: Estado vacío del historial
  // EN: Empty state of the history
  sinMeses: {
    es: 'Todavía no hay meses registrados en tu historial.',
    en: 'No months recorded in your history yet.',
  },
  sinMesesAyuda: {
    es: 'Cuando cierres tu primer mes, aparecerá aquí el resumen.',
    en: 'When you close your first month, the summary will appear here.',
  },
  // ES: Encabezados de la tabla
  // EN: Table headers
  colMes: { es: 'Mes', en: 'Month' },
  colIngresos: { es: 'Ingresos', en: 'Income' },
  colGastosFijos: { es: 'Gastos fijos', en: 'Fixed expenses' },
  colGastosVariables: { es: 'Gastos variables', en: 'Variable expenses' },
  colTotalGastos: { es: 'Total gastos', en: 'Total expenses' },
  colDisponible: { es: 'Disponible', en: 'Available' },
  // ES: Pie de tabla
  // EN: Table footer
  totales: { es: 'Totales', en: 'Totals' },
})

// ── 3. Tipo del resumen de mes / Month summary type ───────────────────────────
// ES: Forma del resumen de cada mes (espejo del que devuelve la store).
// EN: Shape of each month's summary (mirror of what the store returns).
interface ResumenMes {
  mes: string // ES: formato "YYYY-MM". / EN: "YYYY-MM" format.
  ingresos: number
  gastosFijos: number
  gastosVariables: number
  totalGastos: number
  disponible: number
}

// ── 4. Store y totales acumulados / Store & accumulated totals ────────────────
// ES: Instancia reactiva de la store de finanzas.
// EN: Reactive instance of the finances store.
const finanzas = useFinanzas()

// ES: Acumulados de todo el historial (computed para mantener reactividad). Cada
//     uno recorre el historial sumando una columna.
// EN: Whole-history accumulators (computed to stay reactive). Each one reduces
//     the history adding up one column.

// ES: Suma total de ingresos de todos los meses. / EN: Total income across all months.
const totalIngresos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.ingresos, 0)
)

// ES: Suma total de gastos fijos de todos los meses. / EN: Total fixed expenses across all months.
const totalGastosFijos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosFijos, 0)
)

// ES: Suma total de gastos variables de todos los meses. / EN: Total variable expenses across all months.
const totalGastosVariables = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosVariables, 0)
)

// ES: Suma total de todos los gastos (fijos + variables) de todos los meses.
// EN: Total of all expenses (fixed + variable) across all months.
const totalGastosAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.totalGastos, 0)
)

// ES: Ahorro acumulado = suma de los disponibles de todos los meses.
// EN: Accumulated savings = sum of every month's available balance.
const ahorroAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.disponible, 0)
)

// ES: Indica si hay datos en el historial (para mostrar el estado vacío).
// EN: Whether there is any data in the history (drives the empty state).
const hayHistorial = computed<boolean>(() => finanzas.historial.length > 0)

// ── 5. Ranking de gasto por comercio / Merchant spending ranking ──────────────
// ES: Da vida a la tarjeta "Dónde gastas".
// EN: Powers the "Where you spend" card.

// ES: ¿Hay comercios con gasto este mes? (para el estado vacío del ranking).
// EN: Are there merchants with spending this month? (for the ranking empty state).
const hayGastoPorComercio = computed<boolean>(() => finanzas.gastoPorComercio.length > 0)

// ES: Gasto del comercio que más gasta (el primero, ya viene ordenado desc).
//     Sirve de referencia (100 %) para calcular el ancho de las barras.
// EN: Spending of the top merchant (first one, already sorted desc). Used as the
//     100 % reference to compute each bar's width.
const maxGastoComercio = computed<number>(() => finanzas.gastoPorComercio[0]?.total ?? 0)

// ES: Ancho de la barra de un comercio en %, proporcional al mayor gasto.
// EN: Width of a merchant's bar in %, proportional to the highest spender.
function anchoBarra(total: number): string {
  if (maxGastoComercio.value <= 0) return '0%'
  const pct = (total / maxGastoComercio.value) * 100
  return `${pct}%`
}

// ── 6. Aviso de error de exportación / Export error feedback ──────────────────
// ES: Mensaje visible de error de exportación. Cadena vacía = sin error; un valor
//     no vacío pinta un texto rojo discreto bajo los botones de exportar. Se
//     rellena en el catch de cada exportación y se limpia en cada reintento para
//     que el usuario vea siempre el estado actual en vez de un fallo silencioso.
// EN: Visible export error message. Empty string = no error; a non-empty value
//     renders a discreet red text under the export buttons. Filled in the catch
//     of each export and cleared on every retry so the user always sees the
//     current state instead of a silent failure.
const errorExportacion = ref<string>('')

// ── 7. Acciones (seleccionar mes, exportar) / Actions (select month, export) ──

// ES: Marca un mes como seleccionado en la store al pulsar sobre él.
// EN: Marks a month as selected in the store when clicked.
function alSeleccionarMes(mes: string): void {
  finanzas.seleccionarMes(mes)
}

// ES: Exporta el historial completo a Excel (try/catch para no romper la UI).
//     Limpia el error antes de reintentar; si falla, lo registra Y muestra el
//     mensaje visible para que el usuario sepa que el archivo no se exportó.
// EN: Exports the whole history to Excel (try/catch so the UI never breaks).
//     Clears the error before retrying; on failure logs it AND shows the
//     visible message so the user is aware the file was not exported.
async function alExportarExcel(): Promise<void> {
  errorExportacion.value = '' // ES: limpia el error anterior. / EN: clear previous error.
  try {
    await exportarHistorialXLSX(finanzas.historial)
  } catch (error) {
    // ES: registramos para depurar y mostramos un mensaje visible al usuario.
    // EN: log for debugging and surface a visible message to the user.
    console.error('Error al exportar a Excel:', error)
    errorExportacion.value = t('errorExportar')
  }
}

// ES: Exporta el historial completo a PDF (try/catch para no romper la UI).
//     Mismo flujo de aviso que el de Excel: limpiar y, si falla, registrar + mostrar.
// EN: Exports the whole history to PDF (try/catch so the UI never breaks).
//     Same feedback flow as the Excel export: clear, then log + show on failure.
async function alExportarPDF(): Promise<void> {
  errorExportacion.value = '' // ES: limpia el error anterior. / EN: clear previous error.
  try {
    await exportarHistorialPDF(finanzas.historial)
  } catch (error) {
    // ES: registramos para depurar y mostramos un mensaje visible al usuario.
    // EN: log for debugging and surface a visible message to the user.
    console.error('Error al exportar a PDF:', error)
    errorExportacion.value = t('errorExportar')
  }
}

// ES: Exporta el historial completo a CSV (try/catch para no romper la UI).
//     Mismo flujo de aviso que Excel/PDF: limpiar y, si falla, registrar + mostrar.
// EN: Exports the whole history to CSV (try/catch so the UI never breaks).
//     Same feedback flow as Excel/PDF: clear first, then log + show on failure.
async function alExportarCSV(): Promise<void> {
  errorExportacion.value = '' // ES: limpia el error anterior. / EN: clear previous error.
  try {
    await exportarHistorialCSV(finanzas.historial)
  } catch (error) {
    // ES: registramos para depurar y mostramos un mensaje visible al usuario.
    // EN: log for debugging and surface a visible message to the user.
    console.error('Error al exportar a CSV:', error)
    errorExportacion.value = t('errorExportar')
  }
}
</script>

<template>
  <!-- ES: Contenedor general de la vista. / EN: General view container. -->
  <div class="space-y-5">
    <!-- ES: Resumen anual: KPIs del año más reciente, arriba del todo. -->
    <!-- EN: Yearly summary: KPIs of the most recent year, at the very top. -->
    <ResumenAnual :meses="finanzas.historial" class="mb-6 block" />

    <!-- ES: Comparativa del mes seleccionado con el mes anterior. -->
    <!-- EN: Comparison of the selected month with the previous one. -->
    <ComparativaPeriodos class="mb-6 block" />

    <!-- ES: "Dónde gastas" (este mes): ranking de gasto por comercio. -->
    <!-- EN: "Where you spend" (this month): per-merchant spending ranking. -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- ES: Título de la tarjeta. / EN: Card title. -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t('dondeGastas') }}</h2>

      <!-- ES: Estado vacío: no hay comercios con gasto registrado. -->
      <!-- EN: Empty state: no merchants with recorded spending. -->
      <p v-if="!hayGastoPorComercio" class="mt-3 text-sm text-muted">
        {{ t('rankingVacio') }}
      </p>

      <!-- ES: Lista de comercios con su total y barra proporcional al mayor. -->
      <!-- EN: Merchant list with total and a bar proportional to the top spender. -->
      <ul v-else class="mt-4 space-y-3">
        <li v-for="item in finanzas.gastoPorComercio" :key="item.comercio">
          <!-- ES: Fila: nombre del comercio + total gastado. / EN: Row: merchant name + total spent. -->
          <div class="flex items-center justify-between text-sm">
            <span class="text-ink">{{ item.comercio }}</span>
            <span class="font-medium text-danger">{{ euro(item.total) }}</span>
          </div>
          <!-- ES: Barra de progreso proporcional al comercio que más gasta. -->
          <!-- EN: Progress bar proportional to the top-spending merchant. -->
          <div class="mt-1 h-2 w-full rounded-full bg-surface-2">
            <div
              class="h-2 rounded-full bg-danger"
              :style="{ width: anchoBarra(item.total) }"
            ></div>
          </div>
        </li>
      </ul>
    </div>

    <!-- ES: Cabecera: título + botones de exportación. / EN: Header: title + export buttons. -->
    <div class="flex items-center justify-between">
      <h1 class="font-display font-bold text-2xl text-ink">{{ t('historial') }}</h1>

      <!-- ES: Botones de exportación a la derecha. / EN: Export buttons on the right. -->
      <div class="flex items-center gap-3">
        <!-- ES: Botón secundario: Exportar CSV. / EN: Secondary button: Export CSV. -->
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-muted hover:text-ink"
          @click="alExportarCSV"
        >
          {{ t('exportarCSV') }}
        </button>
        <!-- ES: Botón secundario: Exportar Excel. / EN: Secondary button: Export Excel. -->
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-muted hover:text-ink"
          @click="alExportarExcel"
        >
          {{ t('exportarExcel') }}
        </button>
        <!-- ES: Botón primario: Exportar PDF. / EN: Primary button: Export PDF. -->
        <button
          type="button"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
          @click="alExportarPDF"
        >
          {{ t('exportarPDF') }}
        </button>
      </div>
    </div>

    <!-- ES: Error de exportación visible: texto rojo discreto bajo los botones -->
    <!--     cuando una exportación falla; oculto mientras errorExportacion está vacío. -->
    <!-- EN: Visible export error: discreet red text shown under the buttons when -->
    <!--     an export fails; hidden while errorExportacion is empty. -->
    <p v-if="errorExportacion" class="text-right text-sm text-danger">
      {{ errorExportacion }}
    </p>

    <!-- ES: Estado vacío: cuando no hay ningún mes en el historial. -->
    <!-- EN: Empty state: when there is no month in the history. -->
    <div
      v-if="!hayHistorial"
      class="rounded-2xl bg-surface border border-border p-5 text-center"
    >
      <p class="text-muted">{{ t('sinMeses') }}</p>
      <p class="text-faint text-sm mt-1">
        {{ t('sinMesesAyuda') }}
      </p>
    </div>

    <!-- ES: Tarjeta con la tabla del historial (solo si hay datos). -->
    <!-- EN: Card with the history table (only when there is data). -->
    <div v-else class="rounded-2xl bg-surface border border-border p-5">
      <!-- ES: Contenedor con scroll horizontal para tablas anchas. -->
      <!-- EN: Horizontal-scroll container for wide tables. -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <!-- ES: Cabecera de tabla sticky. / EN: Sticky table header. -->
          <thead class="sticky top-0 bg-surface-2">
            <tr class="text-left text-muted">
              <th class="px-3 py-2 font-medium">{{ t('colMes') }}</th>
              <th class="px-3 py-2 font-medium text-right">{{ t('colIngresos') }}</th>
              <th class="px-3 py-2 font-medium text-right">{{ t('colGastosFijos') }}</th>
              <th class="px-3 py-2 font-medium text-right">{{ t('colGastosVariables') }}</th>
              <th class="px-3 py-2 font-medium text-right">{{ t('colTotalGastos') }}</th>
              <th class="px-3 py-2 font-medium text-right">{{ t('colDisponible') }}</th>
            </tr>
          </thead>

          <!-- ES: Cuerpo de tabla: una fila por mes, con divisores entre filas. -->
          <!-- EN: Table body: one row per month, with dividers between rows. -->
          <tbody class="divide-y divide-border">
            <tr
              v-for="fila in finanzas.historial"
              :key="fila.mes"
              class="hover:bg-surface-2"
            >
              <!-- ES: Mes (clicable: selecciona el mes en la store). -->
              <!-- EN: Month (clickable: selects the month in the store). -->
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="font-medium text-ink hover:text-brand"
                  @click="alSeleccionarMes(fila.mes)"
                >
                  {{ mesLegible(fila.mes) }}
                </button>
              </td>
              <!-- ES: Ingresos (verde). / EN: Income (green). -->
              <td class="px-3 py-2 text-right text-ok">{{ euro(fila.ingresos) }}</td>
              <!-- ES: Gastos fijos. / EN: Fixed expenses. -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosFijos) }}</td>
              <!-- ES: Gastos variables. / EN: Variable expenses. -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosVariables) }}</td>
              <!-- ES: Total gastos (rojo). / EN: Total expenses (red). -->
              <td class="px-3 py-2 text-right text-danger">{{ euro(fila.totalGastos) }}</td>
              <!-- ES: Disponible: verde si >= 0, rojo si < 0. -->
              <!-- EN: Available: green if >= 0, red if < 0. -->
              <td
                class="px-3 py-2 text-right"
                :class="fila.disponible >= 0 ? 'text-ok' : 'text-danger'"
              >
                {{ euro(fila.disponible) }}
              </td>
            </tr>
          </tbody>

          <!-- ES: Pie de tabla: totales acumulados de todo el historial. -->
          <!-- EN: Table footer: whole-history accumulated totals. -->
          <tfoot class="border-t-2 border-border">
            <tr class="font-display font-bold text-ink">
              <!-- ES: Etiqueta de la fila de totales. / EN: Totals row label. -->
              <td class="px-3 py-3">{{ t('totales') }}</td>
              <!-- ES: Total ingresos acumulado (verde). / EN: Accumulated total income (green). -->
              <td class="px-3 py-3 text-right text-ok">{{ euro(totalIngresos) }}</td>
              <!-- ES: Total gastos fijos acumulado. / EN: Accumulated fixed expenses. -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosFijos) }}</td>
              <!-- ES: Total gastos variables acumulado. / EN: Accumulated variable expenses. -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosVariables) }}</td>
              <!-- ES: Total gastos acumulado (rojo). / EN: Accumulated total expenses (red). -->
              <td class="px-3 py-3 text-right text-danger">{{ euro(totalGastosAcumulado) }}</td>
              <!-- ES: Ahorro acumulado: verde si >= 0, rojo si < 0. -->
              <!-- EN: Accumulated savings: green if >= 0, red if < 0. -->
              <td
                class="px-3 py-3 text-right"
                :class="ahorroAcumulado >= 0 ? 'text-ok' : 'text-danger'"
              >
                {{ euro(ahorroAcumulado) }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</template>
