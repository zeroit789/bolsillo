<script setup lang="ts">
/* Vista Resumen: KPIs del mes, reparto de gasto por categoría y exportación. */
import { computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible, mesActual } from "../utils/format";
import { colorCategoria } from "../data/categorias";
import { TIPOS_DEUDA, type TipoDeuda } from "../types";
import { exportarMesXLSX, exportarMesPDF } from "../utils/export";
import KpiCard from "../components/KpiCard.vue";
import GraficaEvolucion from "../components/GraficaEvolucion.vue";
import PrevisionCaja from "../components/PrevisionCaja.vue";

const f = useFinanzas();

/* ---------------------------------------------------------------------------
   Objetivo de gasto diario.
   Reparte lo disponible del mes entre los días que quedan, para no pasarse.
   Solo aplica al mes en curso (no tiene sentido en meses pasados/futuros).
   --------------------------------------------------------------------------- */

// ¿Estamos viendo el mes actual? La tarjeta solo se muestra en ese caso.
const esMesActual = computed<boolean>(() => f.mesSeleccionado === mesActual());

// Cadena "YYYY-MM-DD" del día de hoy (para comparar con la fecha de los puntuales).
const hoyISO = computed<string>(() => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0"); // mes 0-indexado → +1
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
});

// Días que quedan del mes contando hoy (hoy incluido).
const diasRestantes = computed<number>(() => {
  const d = new Date();
  const hoy = d.getDate(); // día del mes (1..31)
  // Día 0 del mes siguiente = último día del mes actual.
  const diasMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return diasMes - hoy + 1;
});

// Objetivo de gasto por día: lo disponible repartido entre los días que quedan.
const objetivoDiario = computed<number>(() =>
  f.disponible > 0 ? f.disponible / diasRestantes.value : 0
);

// Lo que ya se ha gastado hoy (suma de puntuales de tipo gasto con fecha = hoy).
const gastadoHoy = computed<number>(() =>
  f.puntuales
    .filter((p) => p.signo === "gasto" && p.fecha === hoyISO.value)
    .reduce((acc, p) => acc + p.importe, 0)
);

// Lo que queda de presupuesto para hoy (positivo = margen; negativo = pasado).
const restanteHoy = computed<number>(() => objetivoDiario.value - gastadoHoy.value);

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

    <!-- Objetivo de gasto diario: solo en el mes en curso -->
    <section v-if="esMesActual" class="rounded-2xl bg-surface border border-border p-5 mb-8">
      <h3 class="font-display font-bold mb-3">Objetivo diario</h3>
      <!-- Cifra grande con el objetivo de gasto por día -->
      <p class="text-brand">
        <span class="font-display text-3xl font-bold tabular-nums">{{ euro(objetivoDiario) }}</span>
        <span class="text-sm text-muted ml-1">/día</span>
      </p>
      <!-- Días que quedan y gasto acumulado de hoy -->
      <p class="text-sm text-muted mt-2">
        Te quedan {{ diasRestantes }} {{ diasRestantes === 1 ? "día" : "días" }}
        · Hoy llevas {{ euro(gastadoHoy) }}
      </p>
      <!-- Restante de hoy: verde si hay margen, rojo si se ha pasado -->
      <p v-if="restanteHoy >= 0" class="text-sm text-ok mt-1">
        Te queda hoy {{ euro(restanteHoy) }}
      </p>
      <p v-else class="text-sm text-danger mt-1">
        Te has pasado hoy {{ euro(restanteHoy) }}
      </p>
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

    <!-- Previsión de caja: saldo acumulado proyectado de los próximos meses -->
    <PrevisionCaja class="mt-8 block" />
  </div>
</template>
