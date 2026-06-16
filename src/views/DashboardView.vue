<script setup lang="ts">
/* Vista Resumen: KPIs del mes, reparto de gasto por categoría y exportación. */
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible } from "../utils/format";
import { colorCategoria } from "../data/categorias";
import { TIPOS_DEUDA, type TipoDeuda } from "../types";
import { exportarMesXLSX, exportarMesPDF } from "../utils/export";
import KpiCard from "../components/KpiCard.vue";
import GraficaEvolucion from "../components/GraficaEvolucion.vue";

const f = useFinanzas();

// % de una categoría respecto a la de mayor gasto (para el ancho de la barra).
function pct(total: number): number {
  const max = f.gastoPorCategoria[0]?.total ?? 1;
  return Math.round((total / max) * 100);
}

// Icono del tipo de deuda (para las tarjetas de deuda del resumen).
function iconoDeuda(tipo: TipoDeuda): string {
  return TIPOS_DEUDA.find((t) => t.valor === tipo)?.icono ?? "📄";
}

// Exporta el mes actual a Excel o PDF (diálogo nativo). No rompe si falla.
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
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-display text-2xl font-bold">Resumen</h2>
      <div class="flex gap-2">
        <button
          class="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-ink transition-colors"
          @click="exportar('xlsx')"
        >
          Exportar Excel
        </button>
        <button
          class="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-ink transition-colors"
          @click="exportar('pdf')"
        >
          Exportar PDF
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <KpiCard etiqueta="Ingresos" :valor="euro(f.ingresos)" color="text-ok" />
      <KpiCard etiqueta="Gastos totales" :valor="euro(f.totalGastos)" color="text-danger" />
      <KpiCard
        etiqueta="Disponible"
        :valor="euro(f.disponible)"
        :color="f.disponible >= 0 ? 'text-brand' : 'text-danger'"
        :nota="f.disponible >= 0 ? 'Te queda este mes' : 'Vas en negativo'"
      />
      <KpiCard
        etiqueta="Gastos fijos"
        :valor="euro(f.gastosFijos)"
        color="text-cyan"
        :nota="`Variables: ${euro(f.gastosVariables)}`"
      />
    </section>

    <!-- Deudas activas: tarjetas bajo los KPIs con progreso, pagado y cuota -->
    <section v-if="f.estadosDeuda.length" class="mb-8">
      <h3 class="font-display font-bold mb-3">Deudas</h3>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="e in f.estadosDeuda"
          :key="e.deuda.id"
          class="rounded-2xl bg-surface border border-border p-4"
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-xl shrink-0">{{ iconoDeuda(e.deuda.tipo) }}</span>
            <p class="font-medium truncate">{{ e.deuda.concepto }}</p>
            <span v-if="e.terminada" class="ml-auto text-xs text-ok shrink-0">✓ Pagada</span>
          </div>
          <div class="h-2 rounded-full bg-surface-2 overflow-hidden mt-3">
            <div class="h-full rounded-full bg-brand transition-all" :style="{ width: e.progreso + '%' }" />
          </div>
          <p class="text-xs text-muted mt-2">
            Pagado {{ euro(e.pagado) }} de {{ euro(e.deuda.total) }} ({{ e.progreso }}%)
          </p>
          <div class="flex justify-between text-xs mt-1">
            <span class="text-danger">Pendiente {{ euro(e.pendiente) }}</span>
            <span class="text-muted">Cuota {{ euro(e.deuda.cuotaMensual) }}</span>
          </div>
          <p v-if="!e.terminada" class="text-xs text-faint mt-1">
            Te quedan {{ e.mesesRestantes }} {{ e.mesesRestantes === 1 ? "mes" : "meses" }}
          </p>
        </div>
      </div>
    </section>

    <!-- Reparto por categoría -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h3 class="font-display font-bold mb-4">Gasto por categoría</h3>
      <div v-if="!f.gastoPorCategoria.length" class="text-muted text-sm">Sin gastos este mes.</div>
      <ul v-else class="space-y-3">
        <li v-for="c in f.gastoPorCategoria" :key="c.categoria">
          <div class="flex justify-between text-sm mb-1">
            <span class="text-muted">{{ c.categoria }}</span>
            <span class="tabular-nums">{{ euro(c.total) }}</span>
          </div>
          <div class="h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              class="h-full rounded-full"
              :style="{ width: pct(c.total) + '%', backgroundColor: colorCategoria(c.categoria) }"
            />
          </div>
        </li>
      </ul>
    </section>

    <!-- Evolución mensual (ingresos vs gastos) -->
    <GraficaEvolucion :meses="f.historial" class="mt-8 block" />
  </div>
</template>
