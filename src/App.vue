<script setup lang="ts">
/* ===========================================================================
   Pantalla principal de Bolsillo: dashboard de finanzas del mes.
   Cabecera + KPIs + reparto por categoría + lista de movimientos + alta.
   =========================================================================== */
import { ref } from "vue";
import { useFinanzas } from "./stores/finanzas";
import { euro, fechaLegible, mesLegible } from "./utils/format";
import { ETIQUETAS_TIPO, type Movimiento, type TipoMovimiento } from "./types";
import KpiCard from "./components/KpiCard.vue";
import ModalMovimiento from "./components/ModalMovimiento.vue";

const finanzas = useFinanzas();

// Control del modal de alta
const modalAbierto = ref(false);

// Color del puntito que marca el tipo de cada movimiento
const COLOR_TIPO: Record<TipoMovimiento, string> = {
  ingreso: "bg-ok",
  "gasto-fijo": "bg-warn",
  "gasto-variable": "bg-danger",
};

// Guarda un movimiento nuevo que llega del modal
function onGuardar(mov: Omit<Movimiento, "id">) {
  finanzas.agregar(mov);
  modalAbierto.value = false;
}

// % de una categoría respecto a la de mayor gasto (para la barra)
function porcentaje(total: number): number {
  const max = finanzas.gastoPorCategoria[0]?.total ?? 1;
  return Math.round((total / max) * 100);
}
</script>

<template>
  <main class="min-h-screen mx-auto max-w-6xl px-6 py-8">
    <!-- ── Cabecera ──────────────────────────────────────────────────── -->
    <header class="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <h1 class="font-display text-3xl font-extrabold tracking-tight">
          Bolsillo<span class="text-brand">.</span>
        </h1>
        <p class="text-muted text-sm mt-0.5">Gestor de gastos personales</p>
      </div>

      <div class="flex items-center gap-3">
        <!-- Selector de mes -->
        <select
          :value="finanzas.mesSeleccionado"
          @change="finanzas.seleccionarMes(($event.target as HTMLSelectElement).value)"
          class="rounded-lg bg-surface border border-border px-3 py-2 text-ink outline-none focus:border-brand no-select"
        >
          <option v-for="m in finanzas.mesesDisponibles" :key="m" :value="m">
            {{ mesLegible(m) }}
          </option>
        </select>

        <!-- Botón añadir -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors no-select"
          @click="modalAbierto = true"
        >
          + Añadir
        </button>
      </div>
    </header>

    <!-- ── KPIs ──────────────────────────────────────────────────────── -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <KpiCard etiqueta="Ingresos" :valor="euro(finanzas.ingresos)" color="text-ok" />
      <KpiCard etiqueta="Gastos totales" :valor="euro(finanzas.totalGastos)" color="text-danger" />
      <KpiCard
        etiqueta="Disponible"
        :valor="euro(finanzas.disponible)"
        :color="finanzas.disponible >= 0 ? 'text-brand' : 'text-danger'"
        :nota="finanzas.disponible >= 0 ? 'Te queda este mes' : 'Vas en negativo'"
      />
      <KpiCard
        etiqueta="Gastos fijos"
        :valor="euro(finanzas.gastosFijos)"
        color="text-cyan"
        :nota="`Variables: ${euro(finanzas.gastosVariables)}`"
      />
    </section>

    <!-- ── Cuerpo: lista + reparto ──────────────────────────────────── -->
    <section class="grid lg:grid-cols-3 gap-6">
      <!-- Lista de movimientos -->
      <div class="lg:col-span-2 rounded-2xl bg-surface border border-border">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-display font-bold">Movimientos</h2>
          <span class="text-faint text-sm">{{ finanzas.movimientosDelMes.length }} apuntes</span>
        </div>

        <!-- Vacío -->
        <div v-if="!finanzas.movimientosDelMes.length" class="px-5 py-12 text-center text-muted">
          No hay movimientos este mes. Pulsa <span class="text-brand">+ Añadir</span>.
        </div>

        <!-- Filas -->
        <ul v-else class="divide-y divide-border">
          <li
            v-for="m in finanzas.movimientosDelMes"
            :key="m.id"
            class="group flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors"
          >
            <!-- Punto de tipo -->
            <span class="size-2.5 rounded-full shrink-0" :class="COLOR_TIPO[m.tipo]" :title="ETIQUETAS_TIPO[m.tipo]" />

            <!-- Concepto + meta -->
            <div class="min-w-0 flex-1">
              <p class="truncate">{{ m.concepto }}</p>
              <p class="text-faint text-xs mt-0.5">
                <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ m.categoria }}</span>
                · {{ fechaLegible(m.fecha) }}
              </p>
            </div>

            <!-- Importe -->
            <span
              class="font-medium tabular-nums shrink-0"
              :class="m.tipo === 'ingreso' ? 'text-ok' : 'text-danger'"
            >
              {{ m.tipo === "ingreso" ? "+" : "−" }}{{ euro(m.importe) }}
            </span>

            <!-- Eliminar (aparece al pasar el ratón) -->
            <button
              class="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-all shrink-0"
              title="Eliminar"
              @click="finanzas.eliminar(m.id)"
            >
              ✕
            </button>
          </li>
        </ul>
      </div>

      <!-- Reparto por categoría -->
      <div class="rounded-2xl bg-surface border border-border p-5">
        <h2 class="font-display font-bold mb-4">Gasto por categoría</h2>

        <div v-if="!finanzas.gastoPorCategoria.length" class="text-muted text-sm">
          Sin gastos todavía.
        </div>

        <ul v-else class="space-y-3">
          <li v-for="c in finanzas.gastoPorCategoria" :key="c.categoria">
            <div class="flex justify-between text-sm mb-1">
              <span class="text-muted">{{ c.categoria }}</span>
              <span class="tabular-nums">{{ euro(c.total) }}</span>
            </div>
            <div class="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div class="h-full rounded-full bg-brand" :style="{ width: porcentaje(c.total) + '%' }" />
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- ── Modal de alta ────────────────────────────────────────────── -->
    <ModalMovimiento v-if="modalAbierto" @guardar="onGuardar" @cerrar="modalAbierto = false" />
  </main>
</template>
