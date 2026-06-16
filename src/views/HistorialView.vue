<script setup lang="ts">
/* =============================================================================
 * HistorialView.vue — Monthly history & exports / Historial mensual y exportación
 * -----------------------------------------------------------------------------
 * EN: "History" view: a table summarizing every recorded month (income, fixed
 *     and variable expenses, total expenses and available balance), accumulated
 *     totals in the footer, a per-merchant spending ranking, and buttons to
 *     export the whole history to Excel and PDF. If an export fails, a discreet
 *     red message appears under the buttons instead of failing silently.
 * ES: Vista "Historial": tabla con el resumen de cada mes registrado (ingresos,
 *     gastos fijos y variables, total de gastos y disponible), totales
 *     acumulados en el pie, ranking de gasto por comercio, y botones para
 *     exportar todo el historial a Excel y PDF. Si una exportación falla,
 *     aparece un mensaje rojo discreto bajo los botones en vez de fallar en
 *     silencio.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. Translations (i18n) / Traducciones (i18n)
 *   3. Month summary type / Tipo del resumen de mes
 *   4. Store & accumulated totals / Store y totales acumulados
 *   5. Merchant spending ranking / Ranking de gasto por comercio
 *   6. Export error feedback / Aviso de error de exportación
 *   7. Actions (select month, export) / Acciones (seleccionar mes, exportar)
 * ===========================================================================*/

// ── 1. Imports / Importaciones ────────────────────────────────────────────────
// EN: Vue's computed for derived reactive values.
// ES: computed de Vue para valores reactivos derivados.
import { computed, ref } from 'vue'
// EN: Finances store (Pinia): exposes the history and seleccionarMes().
// ES: Store de finanzas (Pinia): expone el historial y seleccionarMes().
import { useFinanzas } from '../stores/finanzas'
// EN: Formatting utils: euro() for amounts, mesLegible() for "June 2026".
// ES: Utilidades de formato: euro() para importes, mesLegible() para "Junio 2026".
import { euro, mesLegible } from '../utils/format'
// EN: Export functions (export.ts is created by another process in parallel).
// ES: Funciones de exportación (export.ts lo crea otro proceso en paralelo).
import { exportarHistorialXLSX, exportarHistorialPDF } from '../utils/export'
// EN: Yearly summary component (KPIs of the most recent year in the history).
// ES: Componente de resumen anual (KPIs del año más reciente del historial).
import ResumenAnual from '../components/ResumenAnual.vue'
// EN: Comparison component: selected month vs the previous one.
// ES: Componente de comparativa: mes seleccionado vs el mes anterior.
import ComparativaPeriodos from '../components/ComparativaPeriodos.vue'
// EN: Project's own translation system (reactive ES/EN by active language).
// ES: Sistema de traducción propio del proyecto (ES/EN reactivo según idioma activo).
import { crearT } from '../i18n'

// ── 2. Translations (i18n) / Traducciones (i18n) ──────────────────────────────
// EN: Component translation function (ES/EN) with every visible text in the view.
//     Short keys in camelCase; each one with its Spanish and English version.
// ES: Función de traducción del componente (ES/EN) con todos los textos visibles.
//     Claves cortas en camelCase; cada una con su versión española e inglesa.
const t = crearT({
  // Tarjeta "Dónde gastas"
  dondeGastas: { es: 'Dónde gastas (este mes)', en: 'Where you spend (this month)' },
  rankingVacio: {
    es: 'Añade el comercio a tus gastos para ver el ranking.',
    en: 'Add the merchant to your expenses to see the ranking.',
  },
  // Cabecera y botones de exportación
  historial: { es: 'Historial', en: 'History' },
  exportarExcel: { es: 'Exportar Excel', en: 'Export Excel' },
  exportarPDF: { es: 'Exportar PDF', en: 'Export PDF' },
  // EN: Visible message shown when an export (Excel/PDF) fails.
  // ES: Mensaje visible que se muestra cuando una exportación (Excel/PDF) falla.
  errorExportar: {
    es: 'No se pudo exportar el archivo.',
    en: 'Could not export the file.',
  },
  // Estado vacío del historial
  sinMeses: {
    es: 'Todavía no hay meses registrados en tu historial.',
    en: 'No months recorded in your history yet.',
  },
  sinMesesAyuda: {
    es: 'Cuando cierres tu primer mes, aparecerá aquí el resumen.',
    en: 'When you close your first month, the summary will appear here.',
  },
  // Encabezados de la tabla
  colMes: { es: 'Mes', en: 'Month' },
  colIngresos: { es: 'Ingresos', en: 'Income' },
  colGastosFijos: { es: 'Gastos fijos', en: 'Fixed expenses' },
  colGastosVariables: { es: 'Gastos variables', en: 'Variable expenses' },
  colTotalGastos: { es: 'Total gastos', en: 'Total expenses' },
  colDisponible: { es: 'Disponible', en: 'Available' },
  // Pie de tabla
  totales: { es: 'Totales', en: 'Totals' },
})

// ── 3. Month summary type / Tipo del resumen de mes ───────────────────────────
// EN: Shape of each month's summary (mirror of what the store returns).
// ES: Forma del resumen de cada mes (espejo del que devuelve la store).
interface ResumenMes {
  mes: string // EN: "YYYY-MM" format. / ES: formato "YYYY-MM".
  ingresos: number
  gastosFijos: number
  gastosVariables: number
  totalGastos: number
  disponible: number
}

// ── 4. Store & accumulated totals / Store y totales acumulados ────────────────
// EN: Reactive instance of the finances store.
// ES: Instancia reactiva de la store de finanzas.
const finanzas = useFinanzas()

// EN: Whole-history accumulators (computed to stay reactive). Each one reduces
//     the history adding up one column.
// ES: Acumulados de todo el historial (computed para mantener reactividad). Cada
//     uno recorre el historial sumando una columna.

// EN: Total income across all months. / ES: Suma total de ingresos de todos los meses.
const totalIngresos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.ingresos, 0)
)

// EN: Total fixed expenses across all months. / ES: Suma total de gastos fijos de todos los meses.
const totalGastosFijos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosFijos, 0)
)

// EN: Total variable expenses across all months. / ES: Suma total de gastos variables de todos los meses.
const totalGastosVariables = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosVariables, 0)
)

// EN: Total of all expenses (fixed + variable) across all months.
// ES: Suma total de todos los gastos (fijos + variables) de todos los meses.
const totalGastosAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.totalGastos, 0)
)

// EN: Accumulated savings = sum of every month's available balance.
// ES: Ahorro acumulado = suma de los disponibles de todos los meses.
const ahorroAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.disponible, 0)
)

// EN: Whether there is any data in the history (drives the empty state).
// ES: Indica si hay datos en el historial (para mostrar el estado vacío).
const hayHistorial = computed<boolean>(() => finanzas.historial.length > 0)

// ── 5. Merchant spending ranking / Ranking de gasto por comercio ──────────────
// EN: Powers the "Where you spend" card.
// ES: Da vida a la tarjeta "Dónde gastas".

// EN: Are there merchants with spending this month? (for the ranking empty state).
// ES: ¿Hay comercios con gasto este mes? (para el estado vacío del ranking).
const hayGastoPorComercio = computed<boolean>(() => finanzas.gastoPorComercio.length > 0)

// EN: Spending of the top merchant (first one, already sorted desc). Used as the
//     100 % reference to compute each bar's width.
// ES: Gasto del comercio que más gasta (el primero, ya viene ordenado desc).
//     Sirve de referencia (100 %) para calcular el ancho de las barras.
const maxGastoComercio = computed<number>(() => finanzas.gastoPorComercio[0]?.total ?? 0)

// EN: Width of a merchant's bar in %, proportional to the highest spender.
// ES: Ancho de la barra de un comercio en %, proporcional al mayor gasto.
function anchoBarra(total: number): string {
  if (maxGastoComercio.value <= 0) return '0%'
  const pct = (total / maxGastoComercio.value) * 100
  return `${pct}%`
}

// ── 6. Export error feedback / Aviso de error de exportación ──────────────────
// EN: Visible export error message. Empty string = no error; a non-empty value
//     renders a discreet red text under the export buttons. Filled in the catch
//     of each export and cleared on every retry so the user always sees the
//     current state instead of a silent failure.
// ES: Mensaje visible de error de exportación. Cadena vacía = sin error; un valor
//     no vacío pinta un texto rojo discreto bajo los botones de exportar. Se
//     rellena en el catch de cada exportación y se limpia en cada reintento para
//     que el usuario vea siempre el estado actual en vez de un fallo silencioso.
const errorExportacion = ref<string>('')

// ── 7. Actions (select month, export) / Acciones (seleccionar mes, exportar) ──

// EN: Marks a month as selected in the store when clicked.
// ES: Marca un mes como seleccionado en la store al pulsar sobre él.
function alSeleccionarMes(mes: string): void {
  finanzas.seleccionarMes(mes)
}

// EN: Exports the whole history to Excel (try/catch so the UI never breaks).
//     Clears the error before retrying; on failure logs it AND shows the
//     visible message so the user is aware the file was not exported.
// ES: Exporta el historial completo a Excel (try/catch para no romper la UI).
//     Limpia el error antes de reintentar; si falla, lo registra Y muestra el
//     mensaje visible para que el usuario sepa que el archivo no se exportó.
async function alExportarExcel(): Promise<void> {
  errorExportacion.value = '' // EN: clear previous error. / ES: limpia el error anterior.
  try {
    await exportarHistorialXLSX(finanzas.historial)
  } catch (error) {
    // EN: log for debugging and surface a visible message to the user.
    // ES: registramos para depurar y mostramos un mensaje visible al usuario.
    console.error('Error al exportar a Excel:', error)
    errorExportacion.value = t('errorExportar')
  }
}

// EN: Exports the whole history to PDF (try/catch so the UI never breaks).
//     Same feedback flow as the Excel export: clear, then log + show on failure.
// ES: Exporta el historial completo a PDF (try/catch para no romper la UI).
//     Mismo flujo de aviso que el de Excel: limpiar y, si falla, registrar + mostrar.
async function alExportarPDF(): Promise<void> {
  errorExportacion.value = '' // EN: clear previous error. / ES: limpia el error anterior.
  try {
    await exportarHistorialPDF(finanzas.historial)
  } catch (error) {
    // EN: log for debugging and surface a visible message to the user.
    // ES: registramos para depurar y mostramos un mensaje visible al usuario.
    console.error('Error al exportar a PDF:', error)
    errorExportacion.value = t('errorExportar')
  }
}
</script>

<template>
  <!-- EN: General view container. / ES: Contenedor general de la vista. -->
  <div class="space-y-5">
    <!-- EN: Yearly summary: KPIs of the most recent year, at the very top. -->
    <!-- ES: Resumen anual: KPIs del año más reciente, arriba del todo. -->
    <ResumenAnual :meses="finanzas.historial" class="mb-6 block" />

    <!-- EN: Comparison of the selected month with the previous one. -->
    <!-- ES: Comparativa del mes seleccionado con el mes anterior. -->
    <ComparativaPeriodos class="mb-6 block" />

    <!-- EN: "Where you spend" (this month): per-merchant spending ranking. -->
    <!-- ES: "Dónde gastas" (este mes): ranking de gasto por comercio. -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- EN: Card title. / ES: Título de la tarjeta. -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t('dondeGastas') }}</h2>

      <!-- EN: Empty state: no merchants with recorded spending. -->
      <!-- ES: Estado vacío: no hay comercios con gasto registrado. -->
      <p v-if="!hayGastoPorComercio" class="mt-3 text-sm text-muted">
        {{ t('rankingVacio') }}
      </p>

      <!-- EN: Merchant list with total and a bar proportional to the top spender. -->
      <!-- ES: Lista de comercios con su total y barra proporcional al mayor. -->
      <ul v-else class="mt-4 space-y-3">
        <li v-for="item in finanzas.gastoPorComercio" :key="item.comercio">
          <!-- EN: Row: merchant name + total spent. / ES: Fila: nombre del comercio + total gastado. -->
          <div class="flex items-center justify-between text-sm">
            <span class="text-ink">{{ item.comercio }}</span>
            <span class="font-medium text-danger">{{ euro(item.total) }}</span>
          </div>
          <!-- EN: Progress bar proportional to the top-spending merchant. -->
          <!-- ES: Barra de progreso proporcional al comercio que más gasta. -->
          <div class="mt-1 h-2 w-full rounded-full bg-surface-2">
            <div
              class="h-2 rounded-full bg-danger"
              :style="{ width: anchoBarra(item.total) }"
            ></div>
          </div>
        </li>
      </ul>
    </div>

    <!-- EN: Header: title + export buttons. / ES: Cabecera: título + botones de exportación. -->
    <div class="flex items-center justify-between">
      <h1 class="font-display font-bold text-2xl text-ink">{{ t('historial') }}</h1>

      <!-- EN: Export buttons on the right. / ES: Botones de exportación a la derecha. -->
      <div class="flex items-center gap-3">
        <!-- EN: Secondary button: Export Excel. / ES: Botón secundario: Exportar Excel. -->
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-muted hover:text-ink"
          @click="alExportarExcel"
        >
          {{ t('exportarExcel') }}
        </button>
        <!-- EN: Primary button: Export PDF. / ES: Botón primario: Exportar PDF. -->
        <button
          type="button"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
          @click="alExportarPDF"
        >
          {{ t('exportarPDF') }}
        </button>
      </div>
    </div>

    <!-- EN: Visible export error: discreet red text shown under the buttons when -->
    <!--     an export fails; hidden while errorExportacion is empty. -->
    <!-- ES: Error de exportación visible: texto rojo discreto bajo los botones -->
    <!--     cuando una exportación falla; oculto mientras errorExportacion está vacío. -->
    <p v-if="errorExportacion" class="text-right text-sm text-danger">
      {{ errorExportacion }}
    </p>

    <!-- EN: Empty state: when there is no month in the history. -->
    <!-- ES: Estado vacío: cuando no hay ningún mes en el historial. -->
    <div
      v-if="!hayHistorial"
      class="rounded-2xl bg-surface border border-border p-5 text-center"
    >
      <p class="text-muted">{{ t('sinMeses') }}</p>
      <p class="text-faint text-sm mt-1">
        {{ t('sinMesesAyuda') }}
      </p>
    </div>

    <!-- EN: Card with the history table (only when there is data). -->
    <!-- ES: Tarjeta con la tabla del historial (solo si hay datos). -->
    <div v-else class="rounded-2xl bg-surface border border-border p-5">
      <!-- EN: Horizontal-scroll container for wide tables. -->
      <!-- ES: Contenedor con scroll horizontal para tablas anchas. -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <!-- EN: Sticky table header. / ES: Cabecera de tabla sticky. -->
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

          <!-- EN: Table body: one row per month, with dividers between rows. -->
          <!-- ES: Cuerpo de tabla: una fila por mes, con divisores entre filas. -->
          <tbody class="divide-y divide-border">
            <tr
              v-for="fila in finanzas.historial"
              :key="fila.mes"
              class="hover:bg-surface-2"
            >
              <!-- EN: Month (clickable: selects the month in the store). -->
              <!-- ES: Mes (clicable: selecciona el mes en la store). -->
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="font-medium text-ink hover:text-brand"
                  @click="alSeleccionarMes(fila.mes)"
                >
                  {{ mesLegible(fila.mes) }}
                </button>
              </td>
              <!-- EN: Income (green). / ES: Ingresos (verde). -->
              <td class="px-3 py-2 text-right text-ok">{{ euro(fila.ingresos) }}</td>
              <!-- EN: Fixed expenses. / ES: Gastos fijos. -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosFijos) }}</td>
              <!-- EN: Variable expenses. / ES: Gastos variables. -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosVariables) }}</td>
              <!-- EN: Total expenses (red). / ES: Total gastos (rojo). -->
              <td class="px-3 py-2 text-right text-danger">{{ euro(fila.totalGastos) }}</td>
              <!-- EN: Available: green if >= 0, red if < 0. -->
              <!-- ES: Disponible: verde si >= 0, rojo si < 0. -->
              <td
                class="px-3 py-2 text-right"
                :class="fila.disponible >= 0 ? 'text-ok' : 'text-danger'"
              >
                {{ euro(fila.disponible) }}
              </td>
            </tr>
          </tbody>

          <!-- EN: Table footer: whole-history accumulated totals. -->
          <!-- ES: Pie de tabla: totales acumulados de todo el historial. -->
          <tfoot class="border-t-2 border-border">
            <tr class="font-display font-bold text-ink">
              <!-- EN: Totals row label. / ES: Etiqueta de la fila de totales. -->
              <td class="px-3 py-3">{{ t('totales') }}</td>
              <!-- EN: Accumulated total income (green). / ES: Total ingresos acumulado (verde). -->
              <td class="px-3 py-3 text-right text-ok">{{ euro(totalIngresos) }}</td>
              <!-- EN: Accumulated fixed expenses. / ES: Total gastos fijos acumulado. -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosFijos) }}</td>
              <!-- EN: Accumulated variable expenses. / ES: Total gastos variables acumulado. -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosVariables) }}</td>
              <!-- EN: Accumulated total expenses (red). / ES: Total gastos acumulado (rojo). -->
              <td class="px-3 py-3 text-right text-danger">{{ euro(totalGastosAcumulado) }}</td>
              <!-- EN: Accumulated savings: green if >= 0, red if < 0. -->
              <!-- ES: Ahorro acumulado: verde si >= 0, rojo si < 0. -->
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
