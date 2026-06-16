<script setup lang="ts">
// Vista "Historial" — tabla con el resumen de todos los meses.
// Muestra ingresos, gastos y disponible por mes, totales acumulados,
// y botones para exportar a Excel y PDF.

import { computed } from 'vue'
// Store de finanzas (Pinia): expone historial y seleccionarMes
import { useFinanzas } from '../stores/finanzas'
// Utilidades de formato: euro() para importes, mesLegible() para "Junio 2026"
import { euro, mesLegible } from '../utils/format'
// Funciones de exportación (el archivo export.ts lo crea otro proceso en paralelo)
import { exportarHistorialXLSX, exportarHistorialPDF } from '../utils/export'
// Componente de resumen anual (KPIs del año más reciente del historial)
import ResumenAnual from '../components/ResumenAnual.vue'
// Componente de comparativa: mes seleccionado vs mes anterior
import ComparativaPeriodos from '../components/ComparativaPeriodos.vue'
// Sistema de traducción propio del proyecto (ES/EN reactivo según idioma activo)
import { crearT } from '../i18n'

// Función de traducción del componente (ES/EN) con todos los textos visibles de la vista.
// Claves cortas en camelCase; cada una con su versión española e inglesa.
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

// Tipo del resumen de cada mes (espejo del que devuelve la store)
interface ResumenMes {
  mes: string // formato "YYYY-MM"
  ingresos: number
  gastosFijos: number
  gastosVariables: number
  totalGastos: number
  disponible: number
}

// Instancia reactiva de la store de finanzas
const finanzas = useFinanzas()

// --- Acumulados de todo el historial (computed para mantener reactividad) ---

// Suma total de ingresos de todos los meses
const totalIngresos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.ingresos, 0)
)

// Suma total de gastos fijos de todos los meses
const totalGastosFijos = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosFijos, 0)
)

// Suma total de gastos variables de todos los meses
const totalGastosVariables = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.gastosVariables, 0)
)

// Suma total de todos los gastos (fijos + variables) de todos los meses
const totalGastosAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.totalGastos, 0)
)

// Ahorro acumulado = suma de los disponibles de todos los meses
const ahorroAcumulado = computed<number>(() =>
  finanzas.historial.reduce((acc: number, fila: ResumenMes) => acc + fila.disponible, 0)
)

// Indica si hay datos en el historial (para mostrar estado vacío)
const hayHistorial = computed<boolean>(() => finanzas.historial.length > 0)

// --- Ranking de gasto por comercio (tarjeta "Dónde gastas") ---

// ¿Hay comercios con gasto este mes? (para el estado vacío del ranking)
const hayGastoPorComercio = computed<boolean>(() => finanzas.gastoPorComercio.length > 0)

// Gasto del comercio que más gasta (el primero, ya viene ordenado desc).
// Sirve de referencia (100 %) para calcular el ancho de las barras.
const maxGastoComercio = computed<number>(() => finanzas.gastoPorComercio[0]?.total ?? 0)

// Ancho de la barra de un comercio en %, proporcional al mayor gasto.
function anchoBarra(total: number): string {
  if (maxGastoComercio.value <= 0) return '0%'
  const pct = (total / maxGastoComercio.value) * 100
  return `${pct}%`
}

// --- Acciones ---

// Marca un mes como seleccionado en la store al pulsar sobre él
function alSeleccionarMes(mes: string): void {
  finanzas.seleccionarMes(mes)
}

// Exporta el historial completo a Excel (envuelto en try/catch para no romper la UI)
async function alExportarExcel(): Promise<void> {
  try {
    await exportarHistorialXLSX(finanzas.historial)
  } catch (error) {
    // Si falla la exportación, lo registramos pero no rompemos la vista
    console.error('Error al exportar a Excel:', error)
  }
}

// Exporta el historial completo a PDF (envuelto en try/catch para no romper la UI)
async function alExportarPDF(): Promise<void> {
  try {
    await exportarHistorialPDF(finanzas.historial)
  } catch (error) {
    // Si falla la exportación, lo registramos pero no rompemos la vista
    console.error('Error al exportar a PDF:', error)
  }
}
</script>

<template>
  <!-- Contenedor general de la vista -->
  <div class="space-y-5">
    <!-- Resumen anual: KPIs del año más reciente, arriba del todo -->
    <ResumenAnual :meses="finanzas.historial" class="mb-6 block" />

    <!-- Comparativa del mes seleccionado con el mes anterior -->
    <ComparativaPeriodos class="mb-6 block" />

    <!-- Dónde gastas (este mes): ranking de gasto por comercio -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- Título de la tarjeta -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t('dondeGastas') }}</h2>

      <!-- Estado vacío: no hay comercios con gasto registrado -->
      <p v-if="!hayGastoPorComercio" class="mt-3 text-sm text-muted">
        {{ t('rankingVacio') }}
      </p>

      <!-- Lista de comercios con su total y barra proporcional al mayor -->
      <ul v-else class="mt-4 space-y-3">
        <li v-for="item in finanzas.gastoPorComercio" :key="item.comercio">
          <!-- Fila: nombre del comercio + total gastado -->
          <div class="flex items-center justify-between text-sm">
            <span class="text-ink">{{ item.comercio }}</span>
            <span class="font-medium text-danger">{{ euro(item.total) }}</span>
          </div>
          <!-- Barra de progreso proporcional al comercio que más gasta -->
          <div class="mt-1 h-2 w-full rounded-full bg-surface-2">
            <div
              class="h-2 rounded-full bg-danger"
              :style="{ width: anchoBarra(item.total) }"
            ></div>
          </div>
        </li>
      </ul>
    </div>

    <!-- Cabecera: título + botones de exportación -->
    <div class="flex items-center justify-between">
      <h1 class="font-display font-bold text-2xl text-ink">{{ t('historial') }}</h1>

      <!-- Botones de exportación a la derecha -->
      <div class="flex items-center gap-3">
        <!-- Botón secundario: Exportar Excel -->
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-muted hover:text-ink"
          @click="alExportarExcel"
        >
          {{ t('exportarExcel') }}
        </button>
        <!-- Botón primario: Exportar PDF -->
        <button
          type="button"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
          @click="alExportarPDF"
        >
          {{ t('exportarPDF') }}
        </button>
      </div>
    </div>

    <!-- Estado vacío: cuando no hay ningún mes en el historial -->
    <div
      v-if="!hayHistorial"
      class="rounded-2xl bg-surface border border-border p-5 text-center"
    >
      <p class="text-muted">{{ t('sinMeses') }}</p>
      <p class="text-faint text-sm mt-1">
        {{ t('sinMesesAyuda') }}
      </p>
    </div>

    <!-- Tarjeta con la tabla del historial (solo si hay datos) -->
    <div v-else class="rounded-2xl bg-surface border border-border p-5">
      <!-- Contenedor con scroll horizontal para tablas anchas -->
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <!-- Cabecera de tabla sticky -->
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

          <!-- Cuerpo de tabla: una fila por mes, con divisores entre filas -->
          <tbody class="divide-y divide-border">
            <tr
              v-for="fila in finanzas.historial"
              :key="fila.mes"
              class="hover:bg-surface-2"
            >
              <!-- Mes (clicable: selecciona el mes en la store) -->
              <td class="px-3 py-2">
                <button
                  type="button"
                  class="font-medium text-ink hover:text-brand"
                  @click="alSeleccionarMes(fila.mes)"
                >
                  {{ mesLegible(fila.mes) }}
                </button>
              </td>
              <!-- Ingresos (verde) -->
              <td class="px-3 py-2 text-right text-ok">{{ euro(fila.ingresos) }}</td>
              <!-- Gastos fijos -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosFijos) }}</td>
              <!-- Gastos variables -->
              <td class="px-3 py-2 text-right text-ink">{{ euro(fila.gastosVariables) }}</td>
              <!-- Total gastos (rojo) -->
              <td class="px-3 py-2 text-right text-danger">{{ euro(fila.totalGastos) }}</td>
              <!-- Disponible: verde si >= 0, rojo si < 0 -->
              <td
                class="px-3 py-2 text-right"
                :class="fila.disponible >= 0 ? 'text-ok' : 'text-danger'"
              >
                {{ euro(fila.disponible) }}
              </td>
            </tr>
          </tbody>

          <!-- Pie de tabla: totales acumulados de todo el historial -->
          <tfoot class="border-t-2 border-border">
            <tr class="font-display font-bold text-ink">
              <!-- Etiqueta de la fila de totales -->
              <td class="px-3 py-3">{{ t('totales') }}</td>
              <!-- Total ingresos acumulado (verde) -->
              <td class="px-3 py-3 text-right text-ok">{{ euro(totalIngresos) }}</td>
              <!-- Total gastos fijos acumulado -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosFijos) }}</td>
              <!-- Total gastos variables acumulado -->
              <td class="px-3 py-3 text-right text-ink">{{ euro(totalGastosVariables) }}</td>
              <!-- Total gastos acumulado (rojo) -->
              <td class="px-3 py-3 text-right text-danger">{{ euro(totalGastosAcumulado) }}</td>
              <!-- Ahorro acumulado: verde si >= 0, rojo si < 0 -->
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
